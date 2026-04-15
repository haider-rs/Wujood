"use client";

import { useReadContract } from "wagmi";
import { TICKET_FACTORY_ABI } from "@/config/abis";
import { FACTORY_ADDRESS } from "@/config/wagmi";
import { MatchCard } from "@/components/MatchCard";

const ROTATING_WORDS = ["Seconds.", "Seconds.", "Seconds."];

export default function HomePage() {
  const { data: addresses, isLoading, error } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: TICKET_FACTORY_ABI,
    functionName: "getAllMatches",
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="mb-14 text-center relative">

        {/* Network badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6"
          style={{ borderColor: "rgba(124,92,252,0.30)", background: "rgba(124,92,252,0.06)" }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: "#7C5CFC",
              boxShadow: "0 0 6px rgba(124,92,252,0.9)",
              animation: "pulseGlow 2.2s ease-in-out infinite",
            }}
          />
          <span
            className="font-condensed text-xs tracking-[0.2em]"
            style={{ color: "#A78BFA", letterSpacing: "0.2em" }}
          >
            WIREFLUID TESTNET
          </span>
        </div>

        {/* Headline — fixed stretch */}
        <h1
          className="font-condensed font-black tracking-wider text-white mb-4 leading-tight"
          style={{ fontSize: "clamp(2.4rem, 7vw, 5rem)" }}
        >
          PRIVACY-PRESERVING
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #7C5CFC 0%, #22D3EE 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            TICKETING
          </span>
        </h1>

        <p className="font-body text-lg max-w-2xl mx-auto" style={{ color: "var(--muted)" }}>
          Buy event tickets with on-chain ownership and verify your identity at the gate — without ever revealing who you are.
        </p>

        {/* Stats row — with staggered fade-in */}
        <div className="flex items-center justify-center gap-8 mt-8 flex-wrap">
          {[
            { label: "PRIVACY", value: "On-Chain" },
            { label: "CHAIN", value: "WireFluid" },
            { label: "ZKP PROTOCOL", value: "Groth16" },
            { label: "IDENTITY", value: "NEVER On-Chain" },
          ].map(({ label, value }, i) => (
            <div
              key={value}
              className="flex flex-col items-center gap-1"
              style={{ animation: `heroFadeUp 0.5s ease ${i * 0.08}s both` }}
            >
              <span className="font-display font-bold text-lg text-white">{label}</span>
              <span className="font-mono text-xs tracking-widest" style={{ color: "var(--muted)" }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Active matches header ─────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-1 h-6 rounded-full"
            style={{ background: "linear-gradient(180deg, #7C5CFC, #22D3EE)" }}
          />
          <h2 className="font-display font-bold text-base tracking-widest text-white">
            ACTIVE MATCHES
          </h2>
        </div>
        {addresses && (
          <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
            {(addresses as unknown[]).length}{" "}
            {(addresses as unknown[]).length === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      {/* ── Loading ───────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="spinner" style={{ width: 40, height: 40 }} />
          <p
            className="font-condensed text-xs tracking-widest"
            style={{ color: "#A78BFA", animation: "pulseGlow 2s ease-in-out infinite" }}
          >
            FETCHING MATCHES…
          </p>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────── */}
      {error && (
        <div
          className="p-6 rounded-xl border text-center"
          style={{ borderColor: "rgba(255,71,87,0.25)", background: "rgba(255,71,87,0.05)" }}
        >
          <p className="font-condensed text-sm tracking-widest mb-2" style={{ color: "#FF4757" }}>
            CONTRACT ERROR
          </p>
          <p className="font-mono text-xs" style={{ color: "var(--muted)" }}>{error.message}</p>
          <p className="font-body text-sm mt-3" style={{ color: "var(--muted)" }}>
            Check that{" "}
            <code style={{ color: "#A78BFA" }}>NEXT_PUBLIC_FACTORY_ADDRESS</code> is set in{" "}
            <code style={{ color: "#A78BFA" }}>.env.local</code> and WireFluid RPC is reachable.
          </p>
        </div>
      )}

      {/* ── Empty ────────────────────────────────────────────── */}
      {!isLoading && !error && (addresses as unknown[] | undefined)?.length === 0 && (
        <div className="flex flex-col items-center py-24 gap-4">
          <div
            className="w-16 h-16 rounded-lg flex items-center justify-center"
            style={{ border: "1px dashed var(--border)" }}
          >
            <span className="font-display text-2xl" style={{ color: "var(--muted)" }}>?</span>
          </div>
          <p className="font-condensed text-sm tracking-widest" style={{ color: "var(--muted)" }}>
            NO MATCHES FOUND
          </p>
          <p className="font-body text-sm" style={{ color: "var(--muted)" }}>
            No matches have been created yet.
          </p>
        </div>
      )}

      {/* ── Match grid ───────────────────────────────────────── */}
      {!isLoading && addresses && (addresses as unknown[]).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(addresses as `0x${string}`[]).map((addr, i) => (
            <MatchInfoLoader key={addr} address={addr} index={i} />
          ))}
        </div>
      )}

      {/* ── How It Works ─────────────────────────────────────── */}
      <div className="mt-20 pt-10" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-1 h-6 rounded-full"
            style={{ background: "linear-gradient(180deg, #22D3EE, #7C5CFC)" }}
          />
          <h2 className="font-display font-bold text-base tracking-widest text-white">
            HOW IT WORKS
          </h2>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-3 rounded-xl overflow-hidden"
          style={{ gap: "1px", background: "var(--border)" }}
        >
          {[
            {
              step: "01", title: "BUY",
              color: "#7C5CFC",
              desc: "Purchase tickets on-chain. Your CNIC is hashed client-side — raw identity never leaves your device.",
            },
            {
              step: "02", title: "PROVE",
              color: "#22D3EE",
              desc: "A zero knowledge proof is generated in your browser. The QR code encodes the proof — not your ticket ID.",
            },
            {
              step: "03", title: "ENTER",
              color: "#F5A623",
              desc: "The venue scanner verifies the proof on-chain. Your nullifier is consumed — no re-entry, no identity exposed.",
            },
          ].map(({ step, title, color, desc }, i) => (
            <div
              key={step}
              className="relative overflow-hidden p-6"
              style={{
                background: "var(--surface)",
                animation: `heroFadeUp 0.5s ease ${0.2 + i * 0.1}s both`,
              }}
            >
              <div
                className="font-display font-black text-7xl leading-none absolute -top-2 -right-2 select-none pointer-events-none"
                style={{ color, opacity: 0.05 }}
              >
                {step}
              </div>

              <div
                className="font-condensed font-bold text-xs mb-3 tracking-[0.2em]"
                style={{ color }}
              >
                STEP {step}
              </div>
              <div
                className="font-display font-bold text-xl mb-2"
                style={{ color }}
              >
                {title}
              </div>
              <p className="font-body text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Keyframe injection ──────────────────────────────── */}
      <style>{`
        @keyframes heroFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}

/* ── Loads MatchInfo then renders MatchCard ──────────────────── */
function MatchInfoLoader({ address, index }: { address: `0x${string}`; index: number }) {
  const { data: info, isLoading } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: TICKET_FACTORY_ABI,
    functionName: "getMatchInfo",
    args: [address],
  });

  if (isLoading) {
    return (
      <div className="card-glass rounded-xl p-5 h-64 flex items-center justify-center animate-shimmer">
        <div className="spinner" />
      </div>
    );
  }

  if (!info) return null;

  return (
    <MatchCard
      info={{
        name: (info as any).name,
        venue: (info as any).venue,
        dateString: (info as any).dateString,
        totalTickets: (info as any).totalTickets,
        generalPrice: (info as any).generalPrice,
        enclosurePrice: (info as any).enclosurePrice,
        vipPrice: (info as any).vipPrice,
        contractAddr: (info as any).contractAddr as `0x${string}`,
        active: (info as any).active,
      }}
      index={index}
    />
  );
}
