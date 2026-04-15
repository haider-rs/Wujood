// src/app/mods/page.tsx
"use client";

import { useState, useCallback } from "react";
import {
  useAccount, useWriteContract, usePublicClient, useReadContract,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { keccak256, toBytes } from "viem";
import { QRScanner } from "@/components/QRScanner";
import { MATCH_TICKETS_ABI, TICKET_FACTORY_ABI } from "@/config/abis";
import { useRole } from "@/context/RoleContext";
import { FACTORY_ADDRESS } from "@/config/wagmi";
import { showToast } from "@/components/Toast";
import { categoryLabel } from "@/lib/categories";
import { isZKPQR } from "@/lib/zkp";

const STALE = { query: { staleTime: 30_000 } } as const;

// ── Types ─────────────────────────────────────────────────────────────────────
type VerifyMode = "cnic" | "quick" | "zkp";

type VerifyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "match_found"; holderName: string; category: string; seat: string; matchName: string; ticketId: bigint; matchAddr: `0x${string}`; cnicHash: `0x${string}` }
  | { status: "hash_match" | "hash_mismatch"; holderName: string; category: string; seat: string; matchName: string; ticketId: bigint; matchAddr: `0x${string}`; cnicHash: `0x${string}` }
  | { status: "already_used"; holderName: string; category: string; seat: string }
  | { status: "tx_pending" }
  | { status: "approved"; holderName: string; category: string; seat: string; txHash: string; isZkp?: boolean }
  | { status: "error"; reason: string };

const MODE_CONFIG: { mode: VerifyMode; label: string; desc: string; color: string }[] = [
  { mode: "cnic",  label: "CNIC VERIFY", desc: "Scan QR + match CNIC hash", color: "#0EA5E9" },
  { mode: "quick", label: "QUICK SCAN",  desc: "Auto-approve on scan",      color: "#00E87A" },
  { mode: "zkp",   label: "ZKP VERIFY",  desc: "Zero-knowledge proof",      color: "#7C5CFC" },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ModsPage() {
  const { address, isConnected } = useAccount();
  const { isOwner: isAdmin, isMod, isLoading: accessLoading } = useRole();

  const [selectedMatch, setSelectedMatch] = useState("");
  const [scanActive, setScanActive] = useState(false);
  const [cnic, setCnic] = useState("");
  const [state, setState] = useState<VerifyState>({ status: "idle" });
  const [sessionCount, setSessionCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [verifyMode, setVerifyMode] = useState<VerifyMode>("cnic");

  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const { data: matchAddresses, isLoading: matchesLoading } = useReadContract({
    address: FACTORY_ADDRESS, abi: TICKET_FACTORY_ABI, functionName: "getAllMatches", ...STALE,
  });

  // ── ZKP scan handler ──────────────────────────────────────────────────────
  const handleZKPScan = useCallback(async (raw: string) => {
    if (!isZKPQR(raw)) {
      setState({ status: "error", reason: "Not a ZK ticket QR. Switch to CNIC or Quick mode for standard tickets." });
      return;
    }

    if (raw.startsWith("zkp:")) {
      setState({ status: "error", reason: "This QR is from the buy page. Go to /my-tickets → tap 🔑 GET ENTRY QR to generate an encrypted entry QR." });
      return;
    }

    try {
      setState({ status: "loading" });

      // 1. Extract secret from QR
      const { decodeSecretQR, secretToLookupKey, decryptProof, proofFromHex } = await import("@/lib/zkp");
      const secretHex = decodeSecretQR(raw);
      const lookupKey = await secretToLookupKey(secretHex);

      // 2. Fetch encrypted blob from server (server cannot decrypt this)
      const res = await fetch(`/api/zkproof?key=${lookupKey}`);
      if (res.status === 404) throw new Error("QR expired or already used. Ask fan to generate a new one.");
      if (!res.ok) throw new Error("Failed to fetch proof from server.");
      const { encryptedBlob } = await res.json();

      // 3. Decrypt proof in browser using secret from QR
      const payload = await decryptProof(encryptedBlob, secretHex);
      const { pA, pB, pC } = proofFromHex(payload.proofHex);

      // 4. Submit verifyAndEnter on-chain
      setState({ status: "tx_pending" });
      const txHash = await writeContractAsync({
        address: payload.matchAddr as `0x${string}`,
        abi: MATCH_TICKETS_ABI,
        functionName: "verifyAndEnter",
        args: [pA, pB, pC, payload.commitment as `0x${string}`, payload.nullifierHash as `0x${string}`],
      });

      // 5. Delete used entry from server
      fetch(`/api/zkproof?key=${lookupKey}`, { method: "DELETE" });

      setSessionCount(c => c + 1);
      setState({ status: "approved", holderName: "ZKP VERIFIED", category: "HIDDEN", seat: "HIDDEN", txHash, isZkp: true });

    } catch (e) {
      const msg = e instanceof Error ? e.message : "ZKP verification failed";
      if (msg.includes("Nullifier already used"))  setState({ status: "error", reason: "Nullifier already used — this proof was already consumed." });
      else if (msg.includes("Unknown commitment")) setState({ status: "error", reason: "Unknown commitment — ticket was not purchased with ZKP." });
      else if (msg.includes("Invalid ZK proof"))   setState({ status: "error", reason: "Invalid ZK proof — cryptographic verification failed." });
      else setState({ status: "error", reason: msg });
      showToast(msg);
    }
  }, [writeContractAsync]);

  // ── Standard scan handler (CNIC + Quick) ─────────────────────────────────
  const handleStandardScan = useCallback(async (raw: string) => {
    if (isZKPQR(raw)) {
      setState({ status: "error", reason: "This is a ZKP QR code. Switch to ZKP Verify mode." });
      return;
    }

    try {
      const parts = raw.trim().split(":");
      if (parts.length < 2) throw new Error("Invalid QR format");
      const ticketId = BigInt(parts[0]);
      const matchAddr = parts.slice(1).join(":") as `0x${string}`;

      if (selectedMatch && matchAddr.toLowerCase() !== selectedMatch.toLowerCase()) {
        setState({ status: "error", reason: "Ticket is for a different match." });
        return;
      }

      const [ticketData, matchName] = await Promise.all([
        publicClient!.readContract({ address: matchAddr, abi: MATCH_TICKETS_ABI, functionName: "tickets", args: [ticketId] }),
        publicClient!.readContract({ address: matchAddr, abi: MATCH_TICKETS_ABI, functionName: "matchName" }),
      ]);

      // tickets() returns positional array (not named object) — destructure by index
      const ticketArr = ticketData as readonly [bigint, `0x${string}`, string, `0x${string}`, number, string, boolean];
      const holderName = ticketArr[2];
      const cnicHash   = ticketArr[3] as `0x${string}`;
      const category   = String(ticketArr[4]);
      const seat       = ticketArr[5];
      const used       = ticketArr[6];

      if (used) {
        setState({ status: "already_used", holderName, category, seat });
        return;
      }

      if (verifyMode === "quick") {
        setState({ status: "tx_pending" });
        const txHash = await writeContractAsync({
          address: matchAddr, abi: MATCH_TICKETS_ABI, functionName: "useTicket", args: [ticketId],
        });
        setSessionCount(c => c + 1);
        setState({ status: "approved", holderName, category, seat, txHash });
      } else {
        // CNIC mode: show ticket details, wait for CNIC input
        setState({
          status: "match_found",
          holderName, category, seat,
          matchName: matchName as string, ticketId, matchAddr, cnicHash,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setState({ status: "error", reason: msg });
      showToast(msg);
    }
  }, [selectedMatch, publicClient, writeContractAsync, verifyMode]);

  // ── Unified scan router ───────────────────────────────────────────────────
  const handleScan = useCallback(async (raw: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setScanActive(false);
    setState({ status: "loading" });
    setCnic("");

    if (verifyMode === "zkp") {
      await handleZKPScan(raw);
    } else {
      await handleStandardScan(raw);
    }
  }, [isProcessing, verifyMode, handleZKPScan, handleStandardScan]);

  // ── CNIC comparison ───────────────────────────────────────────────────────
  function handleCnicChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 13);
    let formatted = digits;
    if (digits.length > 5) formatted = `${digits.slice(0, 5)}-${digits.slice(5)}`;
    if (digits.length > 12) formatted = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
    setCnic(formatted);

    if (state.status !== "match_found" && state.status !== "hash_match" && state.status !== "hash_mismatch") return;
    if (digits.length < 13) {
      if (state.status !== "match_found") setState({ ...state, status: "match_found" });
      return;
    }
    // Check both formats: digits-only AND formatted (12345-6789012-3)
    // Purchase page may hash either format — this handles both
    const hashDigits    = keccak256(toBytes(digits));
    const hashFormatted = keccak256(toBytes(formatted));
    const matches = hashDigits === state.cnicHash || hashFormatted === state.cnicHash;
    setState({ ...state, status: matches ? "hash_match" : "hash_mismatch" });
  }

  // ── Approve entry (CNIC mode) ─────────────────────────────────────────────
  async function handleApprove() {
    if (state.status !== "hash_match") return;
    const { ticketId, matchAddr, holderName, category, seat } = state;
    setState({ status: "tx_pending" });
    try {
      const txHash = await writeContractAsync({
        address: matchAddr, abi: MATCH_TICKETS_ABI, functionName: "useTicket", args: [ticketId],
      });
      setSessionCount(c => c + 1);
      setState({ status: "approved", holderName, category, seat, txHash });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "TX failed";
      setState({ status: "error", reason: msg });
      showToast(msg);
    }
  }

  function reset() {
    setState({ status: "idle" });
    setCnic("");
    setIsProcessing(false);
    setScanActive(true);
  }

  function switchMode(mode: VerifyMode) {
    setVerifyMode(mode);
    setState({ status: "idle" });
    setCnic("");
    setIsProcessing(false);
    setScanActive(false);
  }

  // ── Access gates ──────────────────────────────────────────────────────────
  if (!isConnected) return (
    <div className="max-w-lg mx-auto px-4 py-20 flex flex-col items-center gap-6">
      <h1 className="font-display font-bold text-xl tracking-widest text-white">MOD PORTAL</h1>
      <ConnectButton />
    </div>
  );

  if (accessLoading) return (
    <div className="max-w-lg mx-auto px-4 py-20 flex flex-col items-center gap-4">
      <div className="spinner" />
      <p className="font-mono text-xs text-muted tracking-widest animate-pulse">CHECKING ACCESS…</p>
    </div>
  );

  if (!isMod && !isAdmin) return (
    <div className="max-w-lg mx-auto px-4 py-20 flex flex-col items-center gap-4">
      <div className="w-16 h-16 border border-red/30 rounded flex items-center justify-center text-2xl">✗</div>
      <h1 className="font-display font-bold text-xl tracking-widest text-red">ACCESS DENIED</h1>
      <p className="font-mono text-xs text-muted text-center">
        Your wallet ({address?.slice(0, 6)}…{address?.slice(-4)}) is not authorised as a mod.
      </p>
    </div>
  );

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-6 bg-blue rounded-full" />
            <h1 className="font-display font-bold text-xl tracking-widest text-white">MOD PORTAL</h1>
          </div>
          <p className="font-body text-sm text-muted ml-4">
            {isAdmin ? "Admin" : "Mod"} · {address?.slice(0, 6)}…{address?.slice(-4)}
          </p>
        </div>
        {sessionCount > 0 && (
          <div className="text-right">
            <div className="font-display font-bold text-2xl text-green">{sessionCount}</div>
            <div className="font-mono text-xs text-muted">verified</div>
          </div>
        )}
      </div>

      {/* Match selector */}
      <div className="card-glass rounded p-5 mb-4">
        <p className="font-display text-xs text-muted tracking-widest mb-3">SELECT MATCH</p>
        {matchesLoading && <div className="spinner mx-auto" />}
        <div className="space-y-2">
          {(matchAddresses as `0x${string}`[] | undefined)?.map(addr => (
            <MatchOption key={addr} addr={addr} selected={selectedMatch === addr}
              onSelect={a => { setSelectedMatch(a); setState({ status: "idle" }); setScanActive(false); setIsProcessing(false); }} />
          ))}
          {!matchesLoading && (!matchAddresses || (matchAddresses as `0x${string}`[]).length === 0) && (
            <p className="font-mono text-xs text-muted">No matches available.</p>
          )}
        </div>
      </div>

      {/* Mode tabs + scanner */}
      {selectedMatch ? (
        <div className="card-glass rounded overflow-hidden mb-4">

          {/* Mode tabs */}
          <div className="flex border-b border-border">
            {MODE_CONFIG.map(({ mode, label, desc, color }) => {
              const active = verifyMode === mode;
              return (
                <button key={mode} onClick={() => switchMode(mode)}
                  className="flex-1 py-3 px-3 text-left transition-all"
                  style={{
                    borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
                    background: active ? color + "10" : "transparent",
                  }}
                >
                  <div className="font-display text-[10px] sm:text-xs font-bold tracking-widest"
                    style={{ color: active ? color : "#4A6080" }}>
                    {label}
                  </div>
                  <div className="font-mono text-[8px] sm:text-[9px] text-muted mt-0.5 hidden sm:block">{desc}</div>
                </button>
              );
            })}
          </div>

          <div className="p-6">

            {/* ZKP mode hint */}
            {verifyMode === "zkp" && state.status === "idle" && (
              <div className="mb-4 p-3 rounded border flex items-start gap-2"
                style={{ borderColor: "#7C5CFC33", background: "#7C5CFC08" }}>
                <span style={{ color: "#7C5CFC" }} className="text-sm mt-0.5">🔐</span>
                <div>
                  <p className="font-display text-xs font-bold tracking-widest" style={{ color: "#7C5CFC" }}>ZERO-KNOWLEDGE MODE</p>
                  <p className="font-mono text-[10px] text-muted mt-1">
                    Scans ZKP QR codes only. No ticket ID, seat, or identity is revealed.
                    Proof is verified on-chain via Groth16 verifier contract.
                  </p>
                </div>
              </div>
            )}

            {/* Scanner controls */}
            <div className="flex items-center justify-between mb-4">
              <span className="font-display text-sm text-white tracking-widest">SCAN FAN QR</span>
              {state.status === "idle" && (
                <button onClick={() => setScanActive(v => !v)} className={scanActive ? "btn-outline" : "btn-primary"}>
                  {scanActive ? "STOP" : "START SCANNER"}
                </button>
              )}
            </div>

            {scanActive && state.status === "idle" && <QRScanner onScan={handleScan} active={scanActive} />}

            {!scanActive && state.status === "idle" && (
              <div className="flex items-center justify-center h-40 border border-dashed border-border rounded">
                <p className="font-mono text-xs text-muted">Camera inactive — press Start Scanner</p>
              </div>
            )}

            {/* Loading */}
            {state.status === "loading" && (
              <div className="flex items-center gap-3 py-6">
                <div className="spinner" />
                <span className="font-display text-xs tracking-widest animate-pulse"
                  style={{ color: MODE_CONFIG.find(m => m.mode === verifyMode)?.color }}>
                  {verifyMode === "zkp" ? "VERIFYING ZK PROOF…" : verifyMode === "quick" ? "PROCESSING ENTRY…" : "FETCHING TICKET…"}
                </span>
              </div>
            )}

            {/* TX pending */}
            {state.status === "tx_pending" && (
              <div className="flex items-center gap-3 py-6">
                <div className="spinner" />
                <span className="font-display text-xs text-blue tracking-widest animate-pulse">SUBMITTING ON-CHAIN…</span>
              </div>
            )}

            {/* Already used */}
            {state.status === "already_used" && (
              <ResultPanel color="red" icon="✗" title="ALREADY USED" onNext={reset}>
                <InfoRow label="HOLDER" value={state.holderName} />
                <InfoRow label="SEAT" value={state.seat} />
              </ResultPanel>
            )}

            {/* Error */}
            {state.status === "error" && (
              <ResultPanel color="red" icon="✗" title="ERROR" onNext={reset}>
                <p className="font-mono text-xs text-muted break-all col-span-2">{state.reason}</p>
              </ResultPanel>
            )}

            {/* Approved */}
            {state.status === "approved" && (
              <ResultPanel
                color="green" icon="✓"
                title={state.isZkp ? "ZKP ENTRY VERIFIED" : "ENTRY APPROVED"}
                onNext={reset} nextLabel="SCAN NEXT →"
              >
                <InfoRow label="HOLDER" value={state.holderName} />
                <InfoRow label="SEAT" value={state.seat} />
                {!state.isZkp && (
                  <InfoRow label="CATEGORY" value={typeof state.category === "number" ? categoryLabel(state.category) : state.category} />
                )}
                {state.isZkp && (
                  <div className="p-2 rounded border flex items-center gap-2 col-span-2"
                    style={{ borderColor: "#7C5CFC33", background: "#7C5CFC08" }}>
                    <span style={{ color: "#7C5CFC" }}>🔐</span>
                    <span className="font-mono text-[10px]" style={{ color: "#7C5CFC" }}>
                      PRIVACY PRESERVED — no identity data revealed
                    </span>
                  </div>
                )}
                {state.txHash && (
                  <a
                    href={`${process.env.NEXT_PUBLIC_BLOCK_EXPLORER}/tx/${state.txHash}`}
                    target="_blank" rel="noopener noreferrer"
                    className="col-span-2 font-mono text-xs text-muted hover:text-green transition-colors p-2 rounded bg-surface border border-border block"
                  >
                    TX: {state.txHash.slice(0, 22)}… ↗
                  </a>
                )}
              </ResultPanel>
            )}

            {/* CNIC mode — ticket found, waiting for CNIC */}
            {(state.status === "match_found" || state.status === "hash_match" || state.status === "hash_mismatch") && (
              <div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <InfoRow label="HOLDER" value={state.holderName} />
                  <InfoRow label="CATEGORY" value={typeof state.category === "number" ? categoryLabel(state.category) : state.category} />
                  <InfoRow label="SEAT" value={state.seat} />
                  <InfoRow label="MATCH" value={state.matchName} />
                </div>

                <div className="mb-3">
                  <label className="block font-mono text-xs text-muted mb-1.5 tracking-wider uppercase">
                    Enter Fan CNIC
                  </label>
                  <input
                    className="input-field"
                    placeholder="12345-6789012-3"
                    value={cnic}
                    inputMode="numeric"
                    onChange={e => handleCnicChange(e.target.value)}
                    autoFocus
                  />
                </div>

                {state.status === "hash_match" && (
                  <div className="mb-4 p-3 rounded border border-green/30 bg-green/5 flex items-center gap-2">
                    <span className="text-green">✓</span>
                    <span className="font-display text-xs text-green tracking-widest">IDENTITY VERIFIED</span>
                  </div>
                )}
                {state.status === "hash_mismatch" && (
                  <div className="mb-4 p-3 rounded border border-red/30 bg-red/5 flex items-center gap-2">
                    <span className="text-red">✗</span>
                    <span className="font-display text-xs text-red tracking-widest">IDENTITY MISMATCH — DENY ENTRY</span>
                  </div>
                )}

                <div className="flex gap-3">
                  {state.status === "hash_match" && (
                    <button onClick={handleApprove} className="btn-primary flex-1 justify-center">
                      ✓ APPROVE ENTRY
                    </button>
                  )}
                  <button onClick={reset} className="btn-outline flex-1 justify-center">CANCEL</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card-glass rounded p-8 flex flex-col items-center gap-3 text-center">
          <span className="text-4xl opacity-30">🛡</span>
          <p className="font-display text-xs text-muted tracking-widest">SELECT A MATCH TO BEGIN</p>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function MatchOption({ addr, selected, onSelect }: { addr: `0x${string}`; selected: boolean; onSelect: (a: string) => void }) {
  const { data: matchName } = useReadContract({ address: addr, abi: MATCH_TICKETS_ABI, functionName: "matchName", query: { staleTime: 60_000 } });
  const { data: dateString } = useReadContract({ address: addr, abi: MATCH_TICKETS_ABI, functionName: "dateString", query: { staleTime: 60_000 } });
  return (
    <button onClick={() => onSelect(addr)} className="w-full text-left p-3 rounded border transition-all"
      style={selected
        ? { borderColor: "#0EA5E966", background: "#0EA5E90D", color: "#0EA5E9" }
        : { borderColor: "#1E3A6A", background: "transparent", color: "#4A6080" }}>
      <div className="font-display text-sm font-bold">{matchName as string ?? addr.slice(0, 14) + "…"}</div>
      {dateString && <div className="font-mono text-xs opacity-60 mt-0.5">{dateString as string}</div>}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded bg-surface border border-border">
      <div className="font-mono text-xs text-muted mb-0.5 tracking-widest">{label}</div>
      <div className="font-body text-sm text-white font-medium truncate">{value || "—"}</div>
    </div>
  );
}

function ResultPanel({ color, icon, title, children, onNext, nextLabel = "SCAN NEXT →" }: {
  color: "green" | "red"; icon: string; title: string;
  children?: React.ReactNode; onNext: () => void; nextLabel?: string;
}) {
  const c = color === "green"
    ? { border: "border-green/30", bg: "bg-green/5", text: "text-green" }
    : { border: "border-red/30", bg: "bg-red/5", text: "text-red" };
  return (
    <div className={`rounded border ${c.border} ${c.bg} p-5`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-full ${c.bg} border ${c.border} flex items-center justify-center text-xl`}>{icon}</div>
        <div className={`font-display font-bold tracking-widest ${c.text}`}>{title}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">{children}</div>
      <button onClick={onNext} className={color === "green" ? "btn-primary w-full justify-center" : "btn-outline w-full justify-center"}>
        {nextLabel}
      </button>
    </div>
  );
}
