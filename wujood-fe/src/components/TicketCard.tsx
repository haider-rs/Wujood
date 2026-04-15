"use client";

import { useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useWriteContract } from "wagmi";
import { categoryLabel } from "@/lib/categories";
import { MATCH_TICKETS_ABI } from "@/config/abis";
import {
  generateProof, proofToCalldata, proofToHex,
  generateQRSecret, encryptProof, secretToLookupKey, encodeSecretQR,
} from "@/lib/zkp";

interface Ticket {
  id: bigint;
  buyer: `0x${string}`;
  holderName: string;
  cnicHash: `0x${string}`;
  category: number;
  seat: string;
  used: boolean;
}

interface Props {
  ticket: Ticket;
  matchAddr: string;
  matchName?: string;
  venue?: string;
  dateString?: string;
}

const SEAT_COLORS: Record<string, string> = { GEN: "#7C5CFC", ENC: "#F5A623", VIP: "#FF4757" };
const getSeatColor = (seat: string) => SEAT_COLORS[seat?.split("-")[0] ?? ""] ?? "#7C5CFC";

export function TicketCard({ ticket, matchAddr, matchName, venue, dateString }: Props) {
  const [showQR, setShowQR] = useState(false);
  const [proveStep, setProveStep] = useState<"idle" | "proving" | "submitting" | "done" | "error">("idle");
  const [qrStep, setQrStep] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const qrRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState(false);

  function showNotice() {
    setNotice(true);
    setTimeout(() => setNotice(false), 7000);
  }

  const ticketIdStr = ticket.id.toString();
  const seatColor = getSeatColor(ticket.seat);

  // Find ZK data in localStorage for this ticket
  const zkData = (() => {
    if (typeof window === "undefined") return null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("zkticket_")) continue;
      try {
        const d = JSON.parse(localStorage.getItem(key)!);
        if (d.matchAddr?.toLowerCase() === matchAddr.toLowerCase() && d.seatLabel === ticket.seat)
          return d;
      } catch { /* skip */ }
    }
    return null;
  })();

  const isZkTicket = !!zkData;
  const { writeContractAsync } = useWriteContract();

  // ── Same-device prove ──────────────────────────────────────────────────────
  async function handleProveEntry() {
    if (!zkData) return;
    try {
      setProveStep("proving");
      setMsg("Generating Groth16 proof… (~15s)");
      const { proof } = await generateProof(BigInt(zkData.secret), BigInt(zkData.nullifier));
      const { pA, pB, pC } = proofToCalldata(proof);

      setProveStep("submitting");
      setMsg("Submitting on-chain…");
      await writeContractAsync({
        address: matchAddr as `0x${string}`,
        abi: MATCH_TICKETS_ABI,
        functionName: "verifyAndEnter",
        args: [pA, pB, pC, zkData.commitment as `0x${string}`, zkData.nullifierHash as `0x${string}`],
      });
      setProveStep("done");
      setMsg("✓ Entry verified on-chain. Nullifier consumed.");
    } catch (e: any) {
      setProveStep("error");
      const raw = e?.shortMessage ?? e?.message ?? "Error";
      if (raw.includes("Nullifier already used")) setMsg("Already used.");
      else if (raw.includes("Not owner or mod")) setMsg("Wallet is not a mod. Add via /admin.");
      else setMsg(raw);
    }
  }

  // ── Generate encrypted QR ──────────────────────────────────────────────────
  async function handleGenerateQR() {
    if (!zkData) return;
    try {
      setQrStep("generating");
      setMsg("Generating proof & encrypting…");

      const secretHex = generateQRSecret();
      const { proof } = await generateProof(BigInt(zkData.secret), BigInt(zkData.nullifier));

      const payload = {
        matchAddr,
        commitment: zkData.commitment as string,
        nullifierHash: zkData.nullifierHash as string,
        proofHex: proofToHex(proof),
      };

      const encryptedBlob = await encryptProof(payload, secretHex);
      const lookupKey = await secretToLookupKey(secretHex);

      setMsg("Uploading encrypted proof…");
      const res = await fetch("/api/zkproof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookupKey, encryptedBlob }),
      });
      if (!res.ok) throw new Error("Upload failed");

      setQrValue(encodeSecretQR(secretHex));
      setQrStep("ready");
      setMsg("");
    } catch (e: any) {
      setQrStep("error");
      setMsg(e?.message ?? "Failed");
    }
  }

  function handleDownload() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob), download: `ticket-${ticketIdStr}.svg`,
    });
    a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <>
      {/* ── Coming Soon toast ── */}
      {notice && (
        <div
          className="fixed top-20 right-5 z-[9999] w-80 rounded-xl shadow-2xl"   // ← changed here
          style={{
            background: "rgba(9,14,28,0.97)",
            border: "1px solid rgba(124,92,252,0.45)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            animation: "slideInRight 0.22s ease both",
          }}
        >
          {/* Progress bar */}
          <div className="h-[2px] w-full rounded-t-xl overflow-hidden">
            <div
              style={{
                height: "100%",
                background: "linear-gradient(90deg, #7C5CFC, #22D3EE)",
                animation: "shrinkBar 7s linear forwards",
              }}
            />
          </div>
          <div className="p-4 flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(124,92,252,0.15)", border: "1px solid #7C5CFC44" }}
            >
              <span style={{ fontSize: 15 }}>🔐</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-condensed font-bold text-xs tracking-widest mb-1" style={{ color: "#A78BFA" }}>
                COMING SOON
              </p>
              <p className="font-body text-xs leading-relaxed" style={{ color: "var(--text)" }}>
                ZKP QR codes are{" "}
                <span style={{ color: "#fff", fontWeight: 600 }}>one-time only</span>{" "}
                — displayed at the moment of purchase and not stored.
              </p>
            </div>
            <button
              onClick={() => setNotice(false)}
              className="shrink-0 font-mono text-xs leading-none hover:opacity-100 transition-opacity"
              style={{ color: "var(--muted)", opacity: 0.6, marginTop: 1 }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shrinkBar {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>

      <div
        className={`relative card-glass rounded-xl overflow-hidden transition-all duration-300 ${ticket.used ? "opacity-45 grayscale" : "hover:-translate-y-0.5"
          }`}
        style={{ borderColor: ticket.used ? "var(--border)" : seatColor + "30" }}
      >
        <div className="h-[2px] w-full" style={{
          background: ticket.used
            ? "linear-gradient(90deg, var(--border), transparent)"
            : `linear-gradient(90deg, ${seatColor}, #7C5CFC)`,
        }} />

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>#{ticketIdStr}</span>
                {ticket.used ? <span className="badge-used">USED</span> : <span className="badge-valid">VALID</span>}
                <span className="badge-category">{categoryLabel(ticket.category).toUpperCase()}</span>
                {isZkTicket && (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(124,92,252,0.15)", color: "#A78BFA", border: "1px solid #7C5CFC33" }}>
                    ZK
                  </span>
                )}
              </div>
              <div className="font-display font-bold text-white text-base truncate">{ticket.holderName || "—"}</div>
            </div>
            {ticket.seat && (
              <div className="px-3 py-2 rounded-lg text-center shrink-0"
                style={{ border: `1px solid ${seatColor}35`, background: seatColor + "0E" }}>
                <div className="font-condensed text-[10px] tracking-widest uppercase" style={{ color: "var(--muted)" }}>SEAT</div>
                <div className="font-display font-bold text-sm tracking-wider mt-0.5" style={{ color: seatColor }}>{ticket.seat}</div>
              </div>
            )}
          </div>

          {/* Match info */}
          {(matchName || venue || dateString) && (
            <div className="flex flex-col gap-1 mb-3 p-2.5 rounded-lg"
              style={{ border: "1px solid var(--border)", background: "rgba(0,0,0,0.25)" }}>
              {matchName && <div className="font-body font-semibold text-sm" style={{ color: "rgba(200,210,232,0.90)" }}>{matchName}</div>}
              <div className="flex gap-3 flex-wrap">
                {venue && <div className="font-body text-xs" style={{ color: "var(--muted)" }}>{venue}</div>}
                {dateString && <div className="font-body text-xs" style={{ color: "var(--muted)" }}>{dateString}</div>}
              </div>
            </div>
          )}

          {!ticket.used && (
            <>
              {/* ZK actions */}
              {isZkTicket && (
                <div className="mb-2 flex flex-col gap-2">

                  {proveStep === "idle" && qrStep !== "ready" && (
                    <button onClick={showNotice}
                      className="btn-outline w-full justify-center text-xs mb-2">
                      SHOW ZK ENTRY QR
                    </button>
                  )}

                  {/* Prove status */}
                  {(proveStep === "proving" || proveStep === "submitting") && (
                    <div className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ background: "rgba(124,92,252,0.08)", border: "1px solid #7C5CFC33" }}>
                      <div className="spinner shrink-0" style={{ width: 16, height: 16 }} />
                      <span className="font-mono text-xs" style={{ color: "#A78BFA" }}>{msg}</span>
                    </div>
                  )}
                  {proveStep === "done" && (
                    <div className="p-3 rounded-lg border border-green/30 bg-green/5">
                      <p className="font-mono text-xs text-green">{msg}</p>
                    </div>
                  )}
                  {proveStep === "error" && (
                    <div className="p-3 rounded-lg border border-red/30 bg-red/5">
                      <p className="font-mono text-xs text-red break-all">{msg}</p>
                      <button onClick={() => { setProveStep("idle"); setMsg(""); }}
                        className="font-mono text-xs text-muted mt-1 underline">Try again</button>
                    </div>
                  )}

                  {/* Encrypted QR */}
                  {qrStep === "ready" && qrValue && (
                    <div className="flex flex-col items-center gap-3 p-4 rounded-xl"
                      style={{ background: "#ffffff", border: "2px solid #7C5CFC44" }}>
                      <div ref={qrRef}>
                        <QRCodeSVG value={qrValue} size={200} level="M" bgColor="#ffffff" fgColor="#050810" />
                      </div>
                      <div className="text-center">
                        <p className="font-mono text-xs font-bold" style={{ color: "#7C5CFC" }}>
                          🔑 ENCRYPTED ENTRY QR
                        </p>
                        <p className="font-mono text-[10px] mt-1" style={{ color: "#6b7280" }}>
                          This QR is your decryption key.<br />
                          Verifier scans it on /verify → proof decrypted → entry approved.
                        </p>
                        <p className="font-mono text-[10px] mt-1" style={{ color: "#9ca3af" }}>
                          Valid 30 minutes
                        </p>
                      </div>
                      <div className="flex gap-2 w-full">
                        <button onClick={handleDownload}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-mono"
                          style={{ border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          SAVE
                        </button>
                        <button onClick={() => { setQrStep("idle"); setQrValue(null); }}
                          className="flex-1 py-2 rounded-lg text-xs font-mono btn-outline">
                          NEW QR
                        </button>
                      </div>
                    </div>
                  )}

                  {qrStep === "error" && (
                    <div className="p-3 rounded-lg border border-red/30 bg-red/5">
                      <p className="font-mono text-xs text-red">{msg}</p>
                      <button onClick={() => { setQrStep("idle"); setMsg(""); }}
                        className="font-mono text-xs text-muted mt-1 underline">Try again</button>
                    </div>
                  )}
                </div>
              )}

              {/* Standard QR (non-ZK tickets) */}
              {!isZkTicket && (
                <button onClick={() => setShowQR(v => !v)} className="btn-outline w-full justify-center text-xs mb-2">
                  {showQR ? "HIDE QR CODE" : "SHOW QR CODE"}
                </button>
              )}
            </>
          )}

          {/* Standard QR panel */}
          {showQR && !ticket.used && !isZkTicket && (
            <div className="mt-2 flex flex-col items-center gap-3 p-4 rounded-xl"
              style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}>
              <div ref={qrRef}>
                <QRCodeSVG value={`${ticketIdStr}:${matchAddr}`} size={200} level="L" bgColor="#ffffff" fgColor="#050810" />
              </div>
              <p className="font-mono text-xs text-gray-400 text-center">#{ticketIdStr} · {ticket.seat}</p>
              <button onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono"
                style={{ border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                DOWNLOAD QR
              </button>
            </div>
          )}
        </div>

        {ticket.used && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="font-display font-black text-5xl tracking-widest select-none"
              style={{ color: "#FF4757", opacity: 0.12, transform: "rotate(-22deg)" }}>USED</div>
          </div>
        )}
      </div>
    </>
  );
}
