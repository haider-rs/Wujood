"use client";

// components/ZKVerifySection.tsx
// Drop this as a new tab in your existing /mods page.
// It scans a ZKP QR, parses the proof, and calls verifyAndEnter() on-chain.

import { useState } from "react";
import { useWriteContract } from "wagmi";
import { MATCH_TICKETS_ABI } from "@/config/abis";
import { QRScanner } from "@/components/QRScanner";
import { parseZKQR, proofToCalldata } from "@/lib/zkp";
import type { ParsedZKQR } from "@/lib/zkp";

type Stage = "scan" | "confirm" | "submitting" | "success" | "error";

export function ZKVerifySection() {
  const [stage, setStage] = useState<Stage>("scan");
  const [parsed, setParsed] = useState<ParsedZKQR | null>(null);
  const [scannerActive, setScannerActive] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const { writeContractAsync } = useWriteContract();

  function handleScan(data: string) {
    const result = parseZKQR(data);
    if (!result) {
      setErrorMsg("Not a valid ZK ticket QR. Format must start with zkp:");
      return;
    }
    setScannerActive(false);
    setParsed(result);
    setStage("confirm");
  }

  async function handleVerify() {
    if (!parsed) return;
    setStage("submitting");
    try {
      const { pA, pB, pC } = proofToCalldata(parsed.proof);
      await writeContractAsync({
        address: parsed.matchAddr,
        abi: MATCH_TICKETS_ABI,
        functionName: "verifyAndEnter",
        args: [pA, pB, pC, parsed.commitment, parsed.nullifierHash],
      });
      setStage("success");
    } catch (e: any) {
      setErrorMsg(e?.shortMessage ?? e?.message ?? "Transaction failed");
      setStage("error");
    }
  }

  function reset() {
    setStage("scan");
    setParsed(null);
    setScannerActive(true);
    setErrorMsg("");
  }

  // ── Scan ─────────────────────────────────────────────────────────────────
  if (stage === "scan") {
    return (
      <div className="flex flex-col gap-4">
        <ZKInfoBanner />
        <QRScanner onScan={handleScan} active={scannerActive} />
        {errorMsg && (
          <p className="font-mono text-xs text-center" style={{ color: "#FF4757" }}>{errorMsg}</p>
        )}
      </div>
    );
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (stage === "confirm" && parsed) {
    return (
      <div className="flex flex-col gap-4">
        <ZKInfoBanner />
        <div className="card-glass rounded-xl p-5">
          <h3 className="font-display font-bold text-white mb-3">ZK Proof Decoded</h3>

          <div className="flex flex-col gap-2 mb-5">
            <DataRow label="MATCH CONTRACT" value={parsed.matchAddr} mono />
            <DataRow label="COMMITMENT"     value={parsed.commitment.slice(0, 18) + "…"} mono />
            <DataRow label="NULLIFIER HASH" value={parsed.nullifierHash.slice(0, 18) + "…"} mono />
            <div className="flex items-center justify-between p-2 rounded" style={{ background: "rgba(0,232,122,0.06)", border: "1px solid rgba(0,232,122,0.15)" }}>
              <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>PROOF</span>
              <span className="font-mono text-xs" style={{ color: "#00E87A" }}>✓ Loaded (Groth16)</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="btn-outline flex-1 justify-center text-xs">
              RESCAN
            </button>
            <button
              onClick={handleVerify}
              className="flex-1 py-2.5 rounded-lg font-condensed font-bold text-xs tracking-widest text-white transition-all"
              style={{ background: "linear-gradient(135deg, #22D3EE, #7C5CFC)" }}
            >
              VERIFY &amp; APPROVE ENTRY
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Submitting ────────────────────────────────────────────────────────────
  if (stage === "submitting") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="spinner" style={{ width: 40, height: 40 }} />
        <p className="font-condensed text-sm tracking-widest" style={{ color: "#22D3EE" }}>
          SUBMITTING ON-CHAIN…
        </p>
        <p className="font-mono text-xs" style={{ color: "var(--muted)" }}>
          Calling verifyAndEnter() · Nullifier will be consumed
        </p>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (stage === "success") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "rgba(0,232,122,0.12)", border: "2px solid rgba(0,232,122,0.40)" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00E87A" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="font-display font-bold text-xl" style={{ color: "#00E87A" }}>ENTRY APPROVED</p>
        <p className="font-mono text-xs text-center" style={{ color: "var(--muted)" }}>
          ZK proof verified on-chain.<br/>Nullifier consumed — re-entry blocked.
        </p>
        <button onClick={reset} className="btn-outline text-xs mt-2">
          SCAN NEXT
        </button>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: "rgba(255,71,87,0.10)", border: "2px solid rgba(255,71,87,0.30)" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF4757" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>
      <p className="font-display font-bold text-lg" style={{ color: "#FF4757" }}>VERIFICATION FAILED</p>
      <p className="font-mono text-xs text-center max-w-xs" style={{ color: "var(--muted)" }}>{errorMsg}</p>
      <button onClick={reset} className="btn-outline text-xs mt-2">TRY AGAIN</button>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function ZKInfoBanner() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)" }}>
      <span>🔐</span>
      <p className="font-body text-xs" style={{ color: "var(--muted)" }}>
        Scan the fan's <strong style={{ color: "#22D3EE" }}>ZK Proof QR</strong>. The proof is verified on-chain via Groth16. No identity is revealed.
      </p>
    </div>
  );
}

function DataRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 rounded" style={{ border: "1px solid var(--border)" }}>
      <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>{label}</span>
      <span className={`text-xs text-white truncate max-w-[60%] text-right ${mono ? "font-mono" : "font-body"}`}>{value}</span>
    </div>
  );
}
