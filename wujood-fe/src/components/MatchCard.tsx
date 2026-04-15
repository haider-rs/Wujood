"use client";

import Link from "next/link";
import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { MATCH_TICKETS_ABI } from "@/config/abis";

interface MatchInfo {
  name: string;
  venue: string;
  dateString: string;
  totalTickets: bigint;
  generalPrice:   bigint;
  enclosurePrice: bigint;
  vipPrice:       bigint;
  contractAddr: `0x${string}`;
  active: boolean;
}

interface Props {
  info: MatchInfo;
  index: number;
}

// Wujood / WireFluid palette — violet primary, cyan secondary, gold, red
const ACCENT_PAIRS = [
  { accent: "#7C5CFC", secondary: "#00C9FF" },
  { accent: "#00C9FF", secondary: "#7C5CFC" },
  { accent: "#F5A623", secondary: "#7C5CFC" },
  { accent: "#A78BFA", secondary: "#00C9FF" },
];

export function MatchCard({ info, index }: Props) {
  const pair = ACCENT_PAIRS[index % ACCENT_PAIRS.length];

  const { data: remaining } = useReadContract({
    address: info.contractAddr,
    abi: MATCH_TICKETS_ABI,
    functionName: "ticketsRemaining",
  });

  const sold      = Number(info.totalTickets) - Number(remaining ?? info.totalTickets);
  const pct       = info.totalTickets > 0n ? (sold / Number(info.totalTickets)) * 100 : 0;
  const isSoldOut = remaining === 0n;

  return (
    <div
      className="relative card-glass rounded-xl overflow-hidden group transition-all duration-300 hover:-translate-y-1"
      style={{
        borderColor: pair.accent + "28",
        animationDelay: `${index * 80}ms`,
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = pair.accent + "50"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = pair.accent + "28"}
    >
      {/* Top gradient accent bar */}
      <div
        className="h-[2px] w-full"
        style={{ background: `linear-gradient(90deg, ${pair.accent}, ${pair.secondary})` }}
      />

      {/* Diagonal stripe texture */}
      <div className="absolute inset-0 ticket-stripe opacity-70 pointer-events-none" />

      {/* Corner radial glow */}
      <div
        className="absolute top-0 right-0 w-24 h-24 pointer-events-none opacity-15"
        style={{ background: `radial-gradient(circle at top right, ${pair.accent}, transparent 70%)` }}
      />

      <div className="relative p-5">
        {/* Status row */}
        <div className="flex items-center justify-between mb-3">
          {info.active
            ? <span className="badge-live">LIVE</span>
            : <span className="badge-used">INACTIVE</span>
          }
          {isSoldOut && (
            <span className="font-condensed text-xs font-bold tracking-widest" style={{ color: "#FF4757" }}>
              SOLD OUT
            </span>
          )}
        </div>

        {/* Match name */}
        <h2
          className="font-display font-extrabold text-lg leading-tight mb-2 tracking-wide"
          style={{ color: pair.accent }}
        >
          {info.name}
        </h2>

        {/* Venue + Date */}
        <div className="flex flex-col gap-1 mb-4">
          <div className="flex items-center gap-2">
            <LocationIcon />
            <span className="font-body text-sm" style={{ color: "rgba(200,210,232,0.70)" }}>{info.venue}</span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarIcon />
            <span className="font-body text-sm" style={{ color: "rgba(200,210,232,0.70)" }}>{info.dateString}</span>
          </div>
        </div>

        {/* Ticket tier prices */}
        <div className="mb-4">
          <div
            className="font-condensed text-xs tracking-wider mb-2"
            style={{ color: "var(--muted)", letterSpacing: "0.15em" }}
          >
            TICKET PRICES
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { label: "General",   price: info.generalPrice   },
                { label: "Enclosure", price: info.enclosurePrice },
                { label: "VIP",       price: info.vipPrice       },
              ] as const
            ).map(({ label, price }) => (
              <div
                key={label}
                className="flex flex-col items-center p-2 rounded-lg"
                style={{ border: "1px solid var(--border)", background: "rgba(124,92,252,0.04)" }}
              >
                <span
                  className="font-condensed text-[10px] tracking-widest uppercase mb-0.5"
                  style={{ color: "var(--muted)" }}
                >
                  {label}
                </span>
                <span className="font-display font-bold text-xs" style={{ color: pair.accent }}>
                  {formatEther(price)}
                </span>
                <span className="font-mono text-[9px]" style={{ color: "var(--muted)" }}>WIRE</span>
              </div>
            ))}
          </div>
        </div>

        {/* Remaining count */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-condensed text-xs tracking-widest mb-0.5" style={{ color: "var(--muted)" }}>
              REMAINING
            </div>
            <div className="font-display font-bold text-lg" style={{ color: "#fff" }}>
              {remaining !== undefined
                ? `${remaining.toString()} / ${info.totalTickets.toString()}`
                : "—"
              }
            </div>
          </div>
        </div>

        {/* Capacity bar */}
        <div className="mb-4">
          <div
            className="h-1 w-full rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: pct > 80
                  ? "linear-gradient(90deg, #F5A623, #FF4757)"
                  : `linear-gradient(90deg, ${pair.accent}, ${pair.secondary})`,
                boxShadow: `0 0 8px ${pair.accent}55`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>{pct.toFixed(0)}% sold</span>
          </div>
        </div>

        {/* Contract address */}
        <div
          className="address truncate mb-4 px-2 py-1 rounded"
          style={{ border: "1px solid var(--border)" }}
        >
          {info.contractAddr}
        </div>

        {/* CTA */}
        {info.active && !isSoldOut ? (
          <Link href={`/match/${info.contractAddr}`}>
            <button
              className="w-full justify-center font-condensed font-bold text-xs tracking-widest uppercase py-3 rounded-lg transition-all"
              style={{
                background: `linear-gradient(135deg, ${pair.accent}, ${pair.secondary})`,
                color: "#fff",
                border: "none",
                cursor: "pointer",
                boxShadow: `0 0 20px ${pair.accent}30`,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.88"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1";    (e.currentTarget as HTMLElement).style.transform = ""; }}
            >
              BUY TICKETS →
            </button>
          </Link>
        ) : (
          <button
            disabled
            className="w-full py-3 rounded-lg font-condensed font-bold text-xs tracking-widest uppercase opacity-25 cursor-not-allowed"
            style={{ background: "var(--border)", color: "var(--muted)" }}
          >
            {isSoldOut ? "SOLD OUT" : "INACTIVE"}
          </button>
        )}
      </div>
    </div>
  );
}

function LocationIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
