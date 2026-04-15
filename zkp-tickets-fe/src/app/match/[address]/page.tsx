"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, keccak256, toBytes, parseEventLogs } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { QRCodeSVG } from "qrcode.react";
import { MATCH_TICKETS_ABI } from "@/config/abis";
import { SeatPicker } from "@/components/SeatPicker";
import { categoryLabel } from "@/lib/categories";
import {
  randomBigInt31, bigintToBytes32, computeCommitment, computeNullifierHash,
  saveZKTicket, generateProof, proofToHex, generateQRSecret, encryptProof,
  secretToLookupKey, encodeSecretQR,
} from "@/lib/zkp";

type Tab = "standard" | "zk";

interface TicketForm {
  name: string;
  cnic: string;
  category: number;
  seat: string;
}

function emptyForm(): TicketForm {
  return { name: "", cnic: "", category: 0, seat: "" };
}

const STALE = { query: { staleTime: 60_000 } } as const;

const CAT_COLOR: Record<number, string> = {
  0: "#00E87A",
  1: "#F5A623",
  2: "#FF3B5C",
};

const SEAT_PREFIX_TO_CAT: Record<string, number> = { VIP: 2, ENC: 1, GEN: 0 };

// ── Standard Done Panel ───────────────────────────────────────────────────────
// Parses the purchase receipt to extract on-chain ticket IDs, then renders the
// exact same QR format as TicketCard ("ticketId:matchAddr", level="L").
// Falls back to a /my-tickets link if the ABI has no ticketId event arg.
function StandardDonePanel({
  tickets,
  txHash,
  matchAddr,
  priceMap,
  receipt,
  onReset,
}: {
  tickets: TicketForm[];
  txHash: `0x${string}` | undefined;
  matchAddr: string;
  priceMap: Record<number, bigint>;
  receipt: any;
  onReset: () => void;
}) {
  const totalCost = tickets.reduce((s, t) => s + (priceMap[t.category] ?? 0n), 0n);
  const qrRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Decode all known events from the receipt; pick those with a ticketId arg.
  const ticketIds: (bigint | null)[] = (() => {
    if (!receipt?.logs) return tickets.map(() => null);
    try {
      const events = parseEventLogs({ abi: MATCH_TICKETS_ABI, logs: receipt.logs });
      const ids = (events as any[])
        .filter(e => e.args && "ticketId" in e.args)
        .map(e => e.args.ticketId as bigint);
      return tickets.map((_, i) => ids[i] ?? null);
    } catch {
      return tickets.map(() => null);
    }
  })();

  function handleDownload(i: number) {
    const svg = qrRefs.current[i]?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `ticket-${tickets[i].seat}.svg`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Confirmed banner ── */}
      <div className="flex items-center gap-4 p-5 rounded-xl"
        style={{ background: "rgba(0,232,122,0.07)", border: "1px solid rgba(0,232,122,0.30)" }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "rgba(0,232,122,0.15)", border: "1px solid rgba(0,232,122,0.40)" }}>
          <span className="text-green text-xl">✓</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-green text-sm tracking-widest mb-0.5">
            PURCHASE CONFIRMED
          </p>
          {txHash && (
            <a href={`${process.env.NEXT_PUBLIC_BLOCK_EXPLORER}/tx/${txHash}`}
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs text-muted hover:text-green truncate block">
              {txHash.slice(0, 24)}… ↗
            </a>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-display font-bold text-white text-base">{formatEther(totalCost)}</p>
          <p className="font-mono text-xs text-muted">WIRE</p>
        </div>
      </div>

      {/* ── One card + QR per ticket ── */}
      {tickets.map((ticket, i) => {
        const catColor = CAT_COLOR[ticket.category] ?? "#00E87A";
        const id = ticketIds[i];
        // Identical format to TicketCard: short payload → low-density QR
        const qr = id !== null ? `${id.toString()}:${matchAddr}` : null;

        return (
          <div key={i} className="card-glass rounded-xl overflow-hidden"
            style={{ border: `1px solid ${catColor}30` }}>
            {/* Top colour strip — mirrors TicketCard */}
            <div className="h-[2px] w-full"
              style={{ background: `linear-gradient(90deg, ${catColor}, #7C5CFC)` }} />

            <div className="p-4 flex flex-col gap-3">
              {/* Meta row */}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display font-bold text-white text-sm truncate">{ticket.name}</p>
                  <p className="font-mono text-xs text-muted mt-0.5">
                    <span style={{ color: catColor }}>{categoryLabel(ticket.category)}</span>
                    {" · "}{ticket.seat}
                    {id !== null && <span className="opacity-40 ml-1">#{id.toString()}</span>}
                  </p>
                </div>
                <span className="font-display font-bold text-sm shrink-0" style={{ color: catColor }}>
                  {priceMap[ticket.category] ? formatEther(priceMap[ticket.category]) : "—"} WIRE
                </span>
              </div>

              {/* QR */}
              {qr ? (
                <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-white"
                  style={{ border: `1px solid ${catColor}22` }}>
                  <div ref={(el) => { qrRefs.current[i] = el; }}>
                    <QRCodeSVG value={qr} size={200} level="L" bgColor="#ffffff" fgColor="#050810" />
                  </div>
                  <p className="font-mono text-xs text-gray-400 text-center">
                    #{id!.toString()} · {ticket.seat} · Show at gate
                  </p>
                  <button onClick={() => handleDownload(i)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono w-full justify-center"
                    style={{ border: "1px solid #e5e7eb", background: "#f9fafb", color: "#6b7280" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    SAVE QR
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-lg"
                  style={{ background: "rgba(124,92,252,0.07)", border: "1px solid rgba(124,92,252,0.20)" }}>
                  <span className="text-sm shrink-0">🎟</span>
                  <p className="font-body text-xs" style={{ color: "var(--muted)" }}>
                    QR available on{" "}
                    <a href="/my-tickets" className="text-white underline underline-offset-2">My Tickets</a>
                    {" "}once indexed (~10 s).
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <button onClick={onReset} className="btn-outline w-full justify-center">
        BUY MORE TICKETS
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BuyTicketsPage() {
  const { address: matchAddr } = useParams<{ address: string }>();
  const { address, isConnected } = useAccount();
  const addr = matchAddr as `0x${string}`;

  const [tab, setTab] = useState<Tab>("standard");

  // Standard form state
  const [tickets, setTickets]             = useState<TicketForm[]>([emptyForm()]);
  const [txStatus, setTxStatus]           = useState<"idle" | "pending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg]           = useState("");
  const [pickerForTicket, setPickerForTicket] = useState<number | null>(0);
  const [pickerCategory, setPickerCategory]   = useState<number>(0);
  // Snapshot of purchased tickets — used in the done panel
  const [purchasedTickets, setPurchasedTickets] = useState<TicketForm[]>([]);

  // ── Contract reads ──────────────────────────────────────────────────────────
  const { data: matchName }  = useReadContract({ address: addr, abi: MATCH_TICKETS_ABI, functionName: "matchName",       ...STALE });
  const { data: venue }      = useReadContract({ address: addr, abi: MATCH_TICKETS_ABI, functionName: "venue",           ...STALE });
  const { data: dateString } = useReadContract({ address: addr, abi: MATCH_TICKETS_ABI, functionName: "dateString",      ...STALE });
  const { data: remaining }  = useReadContract({ address: addr, abi: MATCH_TICKETS_ABI, functionName: "ticketsRemaining"          });

  const { data: rawGeneral }   = useReadContract({ address: addr, abi: MATCH_TICKETS_ABI, functionName: "getCategoryPrice", args: [0], ...STALE });
  const { data: rawEnclosure } = useReadContract({ address: addr, abi: MATCH_TICKETS_ABI, functionName: "getCategoryPrice", args: [1], ...STALE });
  const { data: rawVip }       = useReadContract({ address: addr, abi: MATCH_TICKETS_ABI, functionName: "getCategoryPrice", args: [2], ...STALE });

  const gPrice = (rawGeneral   as bigint | undefined) ?? 0n;
  const ePrice = (rawEnclosure as bigint | undefined) ?? 0n;
  const vPrice = (rawVip       as bigint | undefined) ?? 0n;
  const pricesLoaded = gPrice > 0n || ePrice > 0n || vPrice > 0n;
  const priceMap: Record<number, bigint> = { 0: gPrice, 1: ePrice, 2: vPrice };

  // ── Write ───────────────────────────────────────────────────────────────────
  const { writeContractAsync, data: txHash } = useWriteContract();
  const { isLoading: txPending, isSuccess: txConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash: txHash });

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function validateCnic(c: string) { return /^\d{5}-\d{7}-\d$/.test(c); }
  function formatCnic(raw: string) {
    const d = raw.replace(/\D/g, "").slice(0, 13);
    if (d.length <= 5) return d;
    if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
  }
  function hashCnic(formatted: string): `0x${string}` {
    return keccak256(toBytes(formatted.replace(/-/g, ""))) as `0x${string}`;
  }
  function updateTicket(i: number, patch: Partial<TicketForm>) {
    setTickets(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  }

  const totalCost = tickets.reduce((s, t) => s + (priceMap[t.category] ?? 0n), 0n);
  const isValid   = tickets.every(t => t.name.trim() && validateCnic(t.cnic) && t.seat) && pricesLoaded;

  function cartSeatsFor(i: number) {
    return tickets.filter((_, idx) => idx !== i).map(t => t.seat).filter(Boolean);
  }

  async function handleBuy() {
    if (!isConnected || !pricesLoaded) return;
    if (tickets.some(t => !t.name.trim() || !validateCnic(t.cnic) || !t.seat)) return;
    setTxStatus("pending");
    setErrorMsg("");
    try {
      // Snapshot tickets BEFORE clearing form
      const snapshot = tickets.map(t => ({ ...t }));
      await writeContractAsync({
        address: addr,
        abi: MATCH_TICKETS_ABI,
        functionName: "buyTickets",
        args: [
          tickets.map(t => t.name.trim()),
          tickets.map(t => hashCnic(t.cnic)),
          tickets.map(t => t.category),
          tickets.map(t => t.seat),
        ],
        value: totalCost,
      });
      setPurchasedTickets(snapshot);
      setTxStatus("success");
      setPickerForTicket(null);
    } catch (e) {
      setTxStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Transaction failed");
    }
  }

  function resetStandard() {
    setTickets([emptyForm()]);
    setTxStatus("idle");
    setErrorMsg("");
    setPurchasedTickets([]);
    setPickerForTicket(0);
    setPickerCategory(0);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <a href="/" className="inline-flex items-center gap-2 font-display text-xs text-muted hover:text-green transition-colors tracking-widest mb-8">
        ← BACK TO MATCHES
      </a>

      {/* ── Match header ─────────────────────────────────────────────────── */}
      <div className="card-glass rounded p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 ticket-stripe opacity-50" />
        <div className="relative">
          <div className="font-mono text-xs text-muted mb-2 truncate">{matchAddr}</div>
          <h1 className="font-display font-black text-2xl sm:text-3xl text-white mb-3 tracking-wide">
            {matchName as string ?? "Loading…"}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-muted font-body">
            {venue      && <span>📍 {venue as string}</span>}
            {dateString && <span>📅 {dateString as string}</span>}
            {remaining !== undefined && (
              <span className="text-green font-medium">🎟 {(remaining as bigint).toString()} remaining</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Price legend ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {([
          { label: "General",   price: gPrice, color: "#00E87A" },
          { label: "Enclosure", price: ePrice, color: "#F5A623" },
          { label: "VIP",       price: vPrice, color: "#FF3B5C" },
        ] as const).map(({ label, price, color }) => (
          <div key={label} className="card-glass rounded p-3 text-center border" style={{ borderColor: color + "33" }}>
            <div className="font-display text-xs tracking-widest mb-1" style={{ color }}>{label.toUpperCase()}</div>
            <div className="font-display font-bold text-white text-sm">
              {pricesLoaded ? formatEther(price) : "…"} WIRE
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex mb-6 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        {([
          { key: "standard", label: "🎫  STANDARD TICKET",    color: "#7C5CFC" },
          { key: "zk",       label: "🔐  ZK PRIVATE TICKET",  color: "#22D3EE" },
        ] as const).map(({ key, label, color }) => {
          const active = tab === key;
          return (
            <button key={key} onClick={() => { setTab(key); setPickerForTicket(null); }}
              className="flex-1 py-3 font-condensed text-xs tracking-widest transition-all"
              style={{
                background: active ? color + "18" : "transparent",
                color: active ? color : "var(--muted)",
                borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
              }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STANDARD TAB                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "standard" && (
        <>
          {/* ── Done panel: show QR codes after confirmed purchase ────────── */}
          {txStatus === "success" && txConfirmed && purchasedTickets.length > 0 ? (
            <StandardDonePanel
              tickets={purchasedTickets}
              txHash={txHash}
              matchAddr={addr}
              priceMap={priceMap}
              receipt={receipt}
              onReset={resetStandard}
            />
          ) : (
            <>
              {/* Seat picker */}
              {pickerForTicket !== null && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="w-1 h-4 rounded-full" style={{ background: CAT_COLOR[pickerCategory] ?? "#00E87A" }} />
                    <span className="font-display text-xs text-muted tracking-widest">
                      SELECTING SEAT FOR TICKET #{pickerForTicket + 1}
                    </span>
                  </div>
                  <SeatPicker
                    matchAddr={addr}
                    activeCategory={pickerCategory}
                    onCategoryChange={setPickerCategory}
                    selectedSeat={tickets[pickerForTicket]?.seat ?? null}
                    cartSeats={cartSeatsFor(pickerForTicket)}
                    onSelect={(label, category) => {
                      updateTicket(pickerForTicket, { seat: label, category });
                      setPickerForTicket(null);
                    }}
                  />
                </div>
              )}

              <div className="space-y-4 mb-4">
                {tickets.map((ticket, i) => {
                  const isPickingForThis = pickerForTicket === i;
                  const catColor = CAT_COLOR[ticket.category] ?? "#00E87A";
                  return (
                    <div key={i} className="card-glass rounded p-5 transition-colors"
                      style={{ borderColor: isPickingForThis ? catColor + "55" : "#1E3A6A" }}>

                      <div className="flex items-center justify-between mb-4">
                        <span className="font-display text-sm text-white tracking-widest">TICKET #{i + 1}</span>
                        {tickets.length > 1 && (
                          <button
                            onClick={() => {
                              setTickets(p => p.filter((_, idx) => idx !== i));
                              if (pickerForTicket === i) setPickerForTicket(null);
                              else if (pickerForTicket !== null && pickerForTicket > i)
                                setPickerForTicket(pickerForTicket - 1);
                            }}
                            className="font-mono text-xs text-red/60 hover:text-red"
                          >REMOVE</button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block font-mono text-xs text-muted mb-1.5 uppercase tracking-wider">Holder Name</label>
                          <input className="input-field" placeholder="Muhammad Ali" value={ticket.name}
                            onChange={e => updateTicket(i, { name: e.target.value })} />
                        </div>
                        <div>
                          <label className="block font-mono text-xs text-muted mb-1.5 uppercase tracking-wider">CNIC</label>
                          <input
                            className={`input-field ${ticket.cnic && !validateCnic(ticket.cnic) ? "border-red/50" : ""}`}
                            placeholder="12345-6789012-3" value={ticket.cnic} inputMode="numeric"
                            onChange={e => updateTicket(i, { cnic: formatCnic(e.target.value) })}
                          />
                          {ticket.cnic && !validateCnic(ticket.cnic) && (
                            <p className="font-mono text-[10px] text-red/70 mt-1">Format: 12345-6789012-3</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          {ticket.seat ? (
                            <div className="flex items-center gap-2 px-3 py-2 rounded border"
                              style={{ borderColor: catColor + "44", background: catColor + "0A" }}>
                              <span style={{ color: catColor }} className="text-xs shrink-0">✓</span>
                              <span className="font-display font-bold text-sm tracking-wider truncate" style={{ color: catColor }}>
                                {ticket.seat}
                              </span>
                              <span className="font-mono text-[10px] text-muted ml-auto shrink-0">
                                {categoryLabel(ticket.category)} · {priceMap[ticket.category] ? formatEther(priceMap[ticket.category]) : "—"} WIRE
                              </span>
                            </div>
                          ) : (
                            <div className="px-3 py-2 rounded border border-yellow-400/20 bg-yellow-400/5">
                              <span className="font-mono text-xs text-yellow-400/70">⚠ No seat selected</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (isPickingForThis) { setPickerForTicket(null); }
                            else { setPickerForTicket(i); setPickerCategory(ticket.category); }
                          }}
                          className={`text-xs shrink-0 ${isPickingForThis ? "btn-outline" : "btn-primary"}`}
                        >
                          {isPickingForThis ? "CLOSE MAP" : ticket.seat ? "CHANGE →" : "PICK SEAT →"}
                        </button>
                      </div>

                      <div className="mt-3 flex items-start gap-2 p-2 rounded bg-green/5 border border-green/10">
                        <span className="text-green text-xs mt-0.5">🔒</span>
                        <p className="font-mono text-xs text-muted/80">CNIC hashed locally — never leaves your browser.</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => {
                  const newIdx = tickets.length;
                  setTickets(p => [...p, emptyForm()]);
                  setPickerForTicket(newIdx);
                  setPickerCategory(0);
                }}
                disabled={remaining !== undefined && BigInt(tickets.length) >= (remaining as bigint)}
                className="btn-outline w-full justify-center mb-8"
              >+ ADD ANOTHER TICKET</button>

              {/* Order summary */}
              <div className="card-glass rounded p-6" style={{ borderColor: "#1E3A6A" }}>
                <h3 className="font-display font-bold text-sm tracking-widest text-white mb-4">ORDER SUMMARY</h3>
                <div className="space-y-2 mb-4">
                  {tickets.map((t, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="font-body text-muted">
                        Ticket #{i + 1} — <span style={{ color: CAT_COLOR[t.category] }}>{categoryLabel(t.category)}</span>
                        {t.seat && <span className="ml-2 text-xs opacity-60">{t.seat}</span>}
                      </span>
                      <span className="font-mono text-white">
                        {priceMap[t.category] ? formatEther(priceMap[t.category]) : "—"} WIRE
                      </span>
                    </div>
                  ))}
                  <div className="h-px bg-border my-2" />
                  <div className="flex justify-between">
                    <span className="font-display text-sm text-white tracking-widest">TOTAL</span>
                    <span className="font-display font-bold text-lg text-green">{formatEther(totalCost)} WIRE</span>
                  </div>
                </div>

                {txStatus === "error" && (
                  <div className="mb-4 p-3 rounded border border-red/30 bg-red/5">
                    <p className="font-display text-xs text-red tracking-widest mb-1">TRANSACTION FAILED</p>
                    <p className="font-mono text-xs text-muted break-all">{errorMsg}</p>
                  </div>
                )}

                {!isConnected
                  ? <div className="flex justify-center"><ConnectButton /></div>
                  : (
                    <button onClick={handleBuy} disabled={!isValid || txPending || txStatus === "pending"}
                      className="btn-primary w-full justify-center" style={{ opacity: !isValid ? 0.4 : 1 }}>
                      {txPending || txStatus === "pending"
                        ? <><div className="spinner" /> CONFIRMING…</>
                        : `BUY ${tickets.length} TICKET${tickets.length > 1 ? "S" : ""} — ${formatEther(totalCost)} WIRE`
                      }
                    </button>
                  )
                }
                {isConnected && (
                  <p className="font-mono text-xs text-muted text-center mt-2">
                    Connected: {address?.slice(0, 8)}…{address?.slice(-6)}
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ZK TAB                                                            */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "zk" && (
        <ZKBuyForm
          matchAddr={addr}
          matchName={matchName as string ?? ""}
          priceMap={priceMap}
          pricesLoaded={pricesLoaded}
          isConnected={isConnected}
          validateCnic={validateCnic}
          formatCnic={formatCnic}
          hashCnic={hashCnic}
          writeContractAsync={writeContractAsync}
        />
      )}
    </div>
  );
}

// ── ZK Buy Form ───────────────────────────────────────────────────────────────
function ZKBuyForm({
  matchAddr, matchName, priceMap, pricesLoaded, isConnected,
  validateCnic, formatCnic, hashCnic, writeContractAsync,
}: {
  matchAddr: `0x${string}`; matchName: string;
  priceMap: Record<number, bigint>; pricesLoaded: boolean;
  isConnected: boolean;
  validateCnic: (c: string) => boolean;
  formatCnic: (r: string) => string;
  hashCnic: (f: string) => `0x${string}`;
  writeContractAsync: any;
}) {
  const [name, setName]             = useState("");
  const [cnic, setCnic]             = useState("");
  const [seat, setSeat]             = useState<string | null>(null);
  const [pickerCat, setPickerCat]   = useState(0);
  const [showPicker, setShowPicker] = useState(true);
  const [status, setStatus]         = useState("");
  const [step, setStep]             = useState<"form" | "generating" | "done">("form");
  const [zkQR, setZkQR]             = useState<string | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);

  const category = seat ? ({ VIP: 2, ENC: 1, GEN: 0 }[seat.split("-")[0]] ?? 0) : 0;
  const price    = seat ? (priceMap[category] ?? 0n) : 0n;

  function reset() {
    setStep("form"); setSeat(null); setName(""); setCnic("");
    setZkQR(null); setCommitment(null); setStatus(""); setShowPicker(true);
  }

  async function handleBuyZK() {
    if (!seat || !name || !validateCnic(cnic) || !isConnected || !pricesLoaded) return;
    try {
      setStatus("Generating ZK commitment…");
      setStep("generating");

      const secret    = randomBigInt31();
      const nullifier = randomBigInt31();

      const commitmentBig    = await computeCommitment(secret, nullifier);
      const nullifierHashBig = await computeNullifierHash(nullifier);
      const commitmentHex    = bigintToBytes32(commitmentBig);
      const nullifierHashHex = bigintToBytes32(nullifierHashBig);
      const cnicHash         = hashCnic(cnic);

      setStatus("Sending transaction…");
      await writeContractAsync({
        address: matchAddr,
        abi: MATCH_TICKETS_ABI,
        functionName: "buyTicketZK",
        args: [commitmentHex, name, cnicHash, category, seat],
        value: price,
      });

      saveZKTicket(commitmentHex, {
        secret: secret.toString(), nullifier: nullifier.toString(),
        commitment: commitmentHex, nullifierHash: nullifierHashHex,
        seatLabel: seat, matchAddr, matchName, purchasedAt: Date.now(),
      });

      setCommitment(commitmentHex);
      setStep("done");
      setStatus("");
    } catch (e: any) {
      setStatus("❌ " + (e?.shortMessage ?? e?.message ?? "Error"));
      setStep("form");
    }
  }

  if (step === "done") {
    return (
      <ZKDonePanel
        matchAddr={matchAddr}
        matchName={matchName}
        seat={seat}
        commitment={commitment}
        onReset={reset}
      />
    );
  }

  if (step === "generating") {
    return (
      <div className="card-glass rounded-xl p-8 text-center" style={{ border: "1px solid rgba(34,211,238,0.15)" }}>
        <div className="spinner mx-auto mb-4" style={{ width: 40, height: 40 }} />
        <p className="font-condensed text-sm tracking-widest mb-2" style={{ color: "#22D3EE" }}>{status}</p>
        <p className="font-mono text-xs" style={{ color: "var(--muted)" }}>
          Groth16 proof runs in your browser. Do not close this tab.
        </p>
      </div>
    );
  }

  const canSubmit = !!seat && !!name && validateCnic(cnic) && isConnected && pricesLoaded;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 p-3 rounded-lg"
        style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)" }}>
        <span className="text-sm">🔐</span>
        <div>
          <p className="font-condensed text-xs font-bold tracking-widest mb-0.5" style={{ color: "#22D3EE" }}>
            PRIVACY-PRESERVING TICKET
          </p>
          <p className="font-body text-xs" style={{ color: "var(--muted)" }}>
            A Groth16 ZK proof is generated in your browser. Only a cryptographic commitment is stored on-chain — no identity revealed.
          </p>
        </div>
      </div>

      {showPicker && (
        <SeatPicker
          matchAddr={matchAddr}
          activeCategory={pickerCat}
          onCategoryChange={setPickerCat}
          selectedSeat={seat}
          onSelect={(label, cat) => { setSeat(label); setPickerCat(cat); setShowPicker(false); }}
        />
      )}

      {seat && !showPicker && (
        <div className="flex items-center gap-3 px-3 py-2 rounded border"
          style={{ borderColor: "#22D3EE33", background: "#22D3EE08" }}>
          <span className="font-display font-bold text-sm" style={{ color: "#22D3EE" }}>{seat}</span>
          <span className="font-mono text-xs text-muted">
            {categoryLabel(category)} · {price ? formatEther(price) : "—"} WIRE
          </span>
          <button onClick={() => setShowPicker(true)} className="ml-auto font-mono text-xs text-muted hover:text-white">
            CHANGE
          </button>
        </div>
      )}

      <div className="card-glass rounded-xl p-5" style={{ border: "1px solid rgba(34,211,238,0.15)" }}>
        <div className="flex flex-col gap-3 mb-4">
          <div>
            <label className="block font-mono text-xs text-muted mb-1.5 uppercase tracking-wider">Full Name</label>
            <input className="input-field" placeholder="Muhammad Ali" value={name}
              onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="block font-mono text-xs text-muted mb-1.5 uppercase tracking-wider">CNIC</label>
            <input
              className={`input-field ${cnic && !validateCnic(cnic) ? "border-red/50" : ""}`}
              placeholder="12345-6789012-3" value={cnic} inputMode="numeric"
              onChange={e => setCnic(formatCnic(e.target.value))}
            />
            {cnic && !validateCnic(cnic) && (
              <p className="font-mono text-[10px] text-red/70 mt-1">Format: 12345-6789012-3</p>
            )}
          </div>
        </div>

        <button
          onClick={handleBuyZK}
          disabled={!canSubmit}
          className="w-full font-condensed font-bold text-xs tracking-widest py-3 rounded-lg transition-all"
          style={{
            background: canSubmit ? "linear-gradient(135deg, #22D3EE, #7C5CFC)" : "rgba(34,211,238,0.08)",
            color: "#fff",
            opacity: canSubmit ? 1 : 0.4,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {`BUY ZK TICKET${seat && price ? ` · ${formatEther(price)} WIRE` : ""}`}
        </button>

        {!isConnected && (
          <p className="font-mono text-xs mt-2 text-center" style={{ color: "#F5A623" }}>Connect wallet first</p>
        )}
        {status && (
          <p className="font-mono text-xs mt-2 text-center" style={{ color: "var(--muted)" }}>{status}</p>
        )}
      </div>
    </div>
  );
}

// ── ZKDonePanel ───────────────────────────────────────────────────────────────
function ZKDonePanel({ matchAddr, matchName, seat, commitment, onReset }: {
  matchAddr: `0x${string}`; matchName: string;
  seat: string | null; commitment: string | null; onReset: () => void;
}) {
  const [step, setStep]       = useState<"generating" | "ready" | "error">("generating");
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [errMsg,  setErrMsg]  = useState("");
  const qrRef = useRef<HTMLDivElement>(null);

  useState(() => {
    (async () => {
      try {
        let zkData: any = null;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key?.startsWith("zkticket_")) continue;
          try {
            const d = JSON.parse(localStorage.getItem(key)!);
            if (d.matchAddr?.toLowerCase() === matchAddr.toLowerCase() && d.seatLabel === seat) {
              zkData = d; break;
            }
          } catch { /* skip */ }
        }
        if (!zkData) throw new Error("ZK ticket data not found in localStorage");

        const secretHex = generateQRSecret();
        const { proof } = await generateProof(BigInt(zkData.secret), BigInt(zkData.nullifier));

        const payload = {
          matchAddr,
          commitment:    zkData.commitment as string,
          nullifierHash: zkData.nullifierHash as string,
          proofHex:      proofToHex(proof),
        };

        const encryptedBlob = await encryptProof(payload, secretHex);
        const lookupKey     = await secretToLookupKey(secretHex);

        const res = await fetch("/api/zkproof", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lookupKey, encryptedBlob }),
        });
        if (!res.ok) throw new Error("Upload failed");

        setQrValue(encodeSecretQR(secretHex));
        setStep("ready");
      } catch (e: any) {
        setErrMsg(e?.message ?? "Failed to generate QR");
        setStep("error");
      }
    })();
  });

  function handleDownload() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob), download: `zk-entry-${seat}.svg`,
    });
    a.click(); URL.revokeObjectURL(a.href);
  }

  if (step === "generating") {
    return (
      <div className="card-glass rounded-xl p-8 text-center" style={{ border: "1px solid rgba(34,211,238,0.15)" }}>
        <div className="spinner mx-auto mb-4" style={{ width: 40, height: 40 }} />
        <p className="font-condensed text-sm tracking-widest mb-1" style={{ color: "#22D3EE" }}>
          GENERATING ENCRYPTED ENTRY QR…
        </p>
        <p className="font-mono text-xs" style={{ color: "var(--muted)" }}>
          Groth16 proof generating in your browser. Do not close this tab.
        </p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="card-glass rounded-xl p-5 text-center">
        <p className="font-mono text-xs text-red mb-3">{errMsg}</p>
        <p className="font-mono text-xs mb-3" style={{ color: "var(--muted)" }}>
          Your ticket was purchased. Go to /my-tickets to generate the entry QR.
        </p>
        <a href="/my-tickets" className="btn-primary text-xs">GO TO MY TICKETS →</a>
      </div>
    );
  }

  return (
    <div className="card-glass rounded-xl p-5 text-center" style={{ border: "1px solid rgba(34,211,238,0.20)" }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-3"
        style={{ background: "rgba(34,211,238,0.15)", border: "1px solid #22D3EE40" }}>
        <span>🔐</span>
      </div>
      <h2 className="font-display font-bold text-white mb-1">ZK Ticket Purchased</h2>
      <p className="font-mono text-xs mb-4" style={{ color: "var(--muted)" }}>
        Seat: {seat} · Show this QR at the gate
      </p>

      <div className="inline-block p-4 rounded-xl bg-white mb-3" ref={qrRef}>
        {qrValue && <QRCodeSVG value={qrValue} size={220} level="M" bgColor="#ffffff" fgColor="#050810" />}
      </div>

      <p className="font-mono text-xs mb-1" style={{ color: "#22D3EE" }}>🔑 ENCRYPTED ENTRY QR</p>
      <p className="font-body text-xs mb-4" style={{ color: "var(--muted)" }}>
        This QR is your decryption key. Valid 30 minutes.{" "}
        <strong style={{ color: "white" }}>Save a screenshot.</strong>
      </p>

      <div className="flex gap-2">
        <button onClick={handleDownload} className="btn-outline flex-1 justify-center text-xs">
          SAVE QR
        </button>
        <button onClick={onReset} className="btn-outline flex-1 justify-center text-xs">
          BUY ANOTHER
        </button>
      </div>
    </div>
  );
}
