"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { MATCH_TICKETS_ABI } from "@/config/abis";

// ── Enum alignment ────────────────────────────────────────────────────────────
// Mirrors MatchTickets.TicketCategory: General=0, Enclosure=1, VIP=2
//
// Proportional split (makes sense for a PSL-style stadium):
//   VIP       →  10%  premium seating, closest to pitch, 15 seats/row
//   Enclosure →  30%  covered mid-tier seating,          20 seats/row
//   General   →  60%  open stands, largest section,      25 seats/row
const SECTIONS = [
  { category: 2, label: "VIP", prefix: "VIP", color: "#FF3B5C", tier: "Premium", pct: 0.10, seatsPerRow: 15 },
  { category: 1, label: "Enclosure", prefix: "ENC", color: "#F5A623", tier: "Standard", pct: 0.30, seatsPerRow: 20 },
  { category: 0, label: "General", prefix: "GEN", color: "#00E87A", tier: "Economy", pct: 0.60, seatsPerRow: 25 },
] as const;

// ── Row labels ────────────────────────────────────────────────────────────────
// 0→A, 1→B, … 25→Z, 26→AA, 27→AB …
function rowLabel(i: number): string {
  const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return i < 26 ? L[i] : L[Math.floor(i / 26) - 1] + L[i % 26];
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  matchAddr: `0x${string}`;
  activeCategory: number;              // which section tab is visible
  onCategoryChange: (c: number) => void;
  selectedSeat: string | null;
  cartSeats?: string[];                // seats already in cart (other tickets)
  onSelect: (seatLabel: string, category: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function SeatPicker({
  matchAddr,
  activeCategory,
  onCategoryChange,
  selectedSeat,
  cartSeats = [],
  onSelect,
}: Props) {
  const section = SECTIONS.find(s => s.category === activeCategory) ?? SECTIONS[0];

  // Read total tickets once (stale forever — it never changes post-deploy)
  const { data: totalTicketsRaw } = useReadContract({
    address: matchAddr,
    abi: MATCH_TICKETS_ABI,
    functionName: "totalTickets",
    query: { staleTime: Infinity, gcTime: Infinity },
  });
  const totalTickets = totalTicketsRaw !== undefined ? Number(totalTicketsRaw) : null;

  // ── DEBUG ─────────────────────────────────────────────────────────────────
  console.log("[SeatPicker] matchAddr:", matchAddr);
  console.log("[SeatPicker] totalTicketsRaw:", totalTicketsRaw, "→ parsed:", totalTickets);

  // ── Per-section seat allocation ───────────────────────────────────────────
  const allocation = useMemo(() => {
    if (!totalTickets) return { 2: 0, 1: 0, 0: 0 } as Record<number, number>;
    const vip = Math.ceil(totalTickets * 0.10);
    const enc = Math.ceil(totalTickets * 0.30);
    const gen = Math.max(0, totalTickets - vip - enc);
    return { 2: vip, 1: enc, 0: gen } as Record<number, number>;
  }, [totalTickets]);

  // Rows and total for the active section
  const sectionTotal = allocation[activeCategory] ?? 0;
  const rowCount = (totalTickets && sectionTotal > 0) ? Math.ceil(sectionTotal / section.seatsPerRow) : 0;
  const rows = useMemo(() => Array.from({ length: rowCount }, (_, i) => rowLabel(i)), [rowCount]);

  // All seat labels for the active section (to batch-query availability)
  const seatLabels = useMemo(() => {
    const labels: string[] = [];
    for (let r = 0; r < rows.length; r++) {
      const seatsThisRow = r < rows.length - 1
        ? section.seatsPerRow
        : sectionTotal - r * section.seatsPerRow;   // last row may be partial
      for (let s = 1; s <= seatsThisRow; s++) {
        labels.push(`${section.prefix}-${rows[r]}-${s}`);
      }
    }
    return labels;
  }, [rows, section.prefix, section.seatsPerRow, sectionTotal]);

  // Batch availability fetch
  const { data: statuses, isLoading, isError: isSeatsError } = useReadContract({
    address: matchAddr,
    abi: MATCH_TICKETS_ABI,
    functionName: "getSeatsStatus",
    args: [seatLabels],
    query: { enabled: seatLabels.length > 0, staleTime: 30_000 },
  });

  console.log("[SeatPicker] seatLabels.length:", seatLabels.length, "isLoading:", isLoading, "isSeatsError:", isSeatsError);
  console.log("[SeatPicker] statuses:", statuses);

  const takenSet = useMemo(() => {
    const s = new Set<string>(cartSeats);
    if (statuses) {
      (statuses as boolean[]).forEach((taken, i) => { if (taken) s.add(seatLabels[i]); });
    }
    return s;
  }, [statuses, seatLabels, cartSeats]);

  const availableCount = seatLabels.filter(l => !takenSet.has(l)).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="card-glass rounded overflow-hidden">

      {/* ── Section tabs ───────────────────────────────────────────────────── */}
      <div className="flex border-b border-border">
        {SECTIONS.map(s => {
          const count = allocation[s.category] ?? 0;
          const isActive = s.category === activeCategory;
          return (
            <button
              key={s.category}
              onClick={() => onCategoryChange(s.category)}
              className="flex-1 py-3 px-2 text-center transition-all"
              style={{
                borderBottom: isActive ? `2px solid ${s.color}` : "2px solid transparent",
                background: isActive ? s.color + "12" : "transparent",
              }}
            >
              <div
                className="font-display text-xs font-bold tracking-widest"
                style={{ color: isActive ? s.color : "#4A6080" }}
              >
                {s.label.toUpperCase()}
              </div>
              <div className="font-mono text-[9px] text-muted mt-0.5 tabular-nums">
                {count > 0 ? `${count} seats` : "—"} · {s.tier}
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-4">

        {/* ── Pitch indicator ─────────────────────────────────────────────── */}
        <div className="flex justify-center mb-5">
          <div
            className="relative flex items-center justify-center"
            style={{ width: 160, height: 28 }}
          >
            {/* curved pitch shape */}
            <div
              className="absolute inset-0 rounded-b-[80px] border-b-2 border-x-2"
              style={{ borderColor: section.color + "40" }}
            />
            <span
              className="font-display text-[9px] tracking-[0.25em] font-bold relative z-10"
              style={{ color: section.color + "80" }}
            >
              ⬆ PITCH
            </span>
          </div>
        </div>

        {/* ── Section header ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: section.color }} />
            <span
              className="font-display text-xs font-bold tracking-widest"
              style={{ color: section.color }}
            >
              {section.label.toUpperCase()} STAND
            </span>
          </div>
          <span className="font-mono text-[10px] text-muted tabular-nums">
            {availableCount} available · {sectionTotal} total
          </span>
        </div>

        {/* ── Seat grid ────────────────────────────────────────────────────── */}
        {totalTickets === null ? (
          <div className="flex items-center justify-center py-12 gap-3">
            <div className="spinner" />
            <span className="font-mono text-xs text-muted animate-pulse">Loading seat map…</span>
          </div>
        ) : totalTickets === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="font-mono text-xs" style={{ color: "#FF4757" }}>
              totalTickets = 0 — match may have been created with 0 tickets
            </span>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12 gap-3">
            <div className="spinner" />
            <span className="font-mono text-xs text-muted animate-pulse">Checking availability…</span>
          </div>
        ) : (
          <div className="overflow-x-auto pb-1">
            {/* min-width keeps the grid from wrapping on small screens */}
            <div style={{ minWidth: section.seatsPerRow * 16 + 36 }}>

              {rows.map((row, rowIdx) => {
                const seatsThisRow = rowIdx < rows.length - 1
                  ? section.seatsPerRow
                  : sectionTotal - rowIdx * section.seatsPerRow;

                return (
                  <div key={row} className="flex items-center gap-0.5 mb-[3px]">
                    {/* Row label */}
                    <span className="w-6 shrink-0 text-center font-mono text-[10px] text-muted/50 select-none">
                      {row}
                    </span>

                    {/* Seat buttons */}
                    {Array.from({ length: seatsThisRow }, (_, si) => {
                      const seatNum = si + 1;
                      const label = `${section.prefix}-${row}-${seatNum}`;
                      const isTaken = takenSet.has(label);
                      const isSelected = selectedSeat === label;

                      return (
                        <button
                          key={seatNum}
                          disabled={isTaken}
                          onClick={() => onSelect(label, section.category)}
                          title={isTaken ? `${label} — Taken` : label}
                          style={{
                            width: 14, height: 14, flexShrink: 0,
                            borderRadius: 2,
                            background: isSelected
                              ? section.color
                              : isTaken
                                ? "#111827"
                                : section.color + "25",
                            border: `1px solid ${isSelected ? section.color
                                : isTaken ? "#1f2937"
                                  : section.color + "50"
                              }`,
                            cursor: isTaken ? "not-allowed" : "pointer",
                            transform: isSelected ? "scale(1.45)" : "scale(1)",
                            boxShadow: isSelected ? `0 0 6px ${section.color}90` : "none",
                            transition: "transform 100ms, box-shadow 100ms, background 100ms",
                            position: "relative",
                            zIndex: isSelected ? 2 : 1,
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}

              {/* ── Seat number ruler ──────────────────────────────────────── */}
              <div className="flex items-center gap-0.5 mt-2">
                {/* spacer for row label column */}
                <div className="w-6 shrink-0" />
                {Array.from({ length: section.seatsPerRow }, (_, si) => {
                  const n = si + 1;
                  const show = n === 1 || n % 5 === 0;
                  return (
                    <div
                      key={n}
                      style={{ width: 14, flexShrink: 0, textAlign: "center" }}
                      className={show ? "font-mono text-[7px] text-muted/40 select-none" : ""}
                    >
                      {show ? n : ""}
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        )}

        {/* ── Legend ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-border">
          <LegendDot color={section.color + "25"} border={section.color + "50"} label="Available" />
          <LegendDot color="#111827" border="#1f2937" label="Taken" />
          <LegendDot color={section.color} border={section.color} label="Selected" />
        </div>

        {/* ── Selected seat callout ─────────────────────────────────────────── */}
        {selectedSeat && selectedSeat.startsWith(section.prefix) && (
          <div
            className="mt-3 p-2.5 rounded border text-center"
            style={{ borderColor: section.color + "44", background: section.color + "08" }}
          >
            <span className="font-mono text-[10px] text-muted">SELECTED  </span>
            <span
              className="font-display font-bold text-sm tracking-widest"
              style={{ color: section.color }}
            >
              {selectedSeat}
            </span>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Legend dot ────────────────────────────────────────────────────────────────
function LegendDot({ color, border, label }: { color: string; border: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-3 h-3 rounded-sm" style={{ background: color, border: `1px solid ${border}` }} />
      <span className="font-mono text-[10px] text-muted">{label}</span>
    </div>
  );
}

// ── Helpers (exported for parent usage) ──────────────────────────────────────

/** Seat prefix → category enum index */
export function seatPrefixToCategory(prefix: string): number {
  return { VIP: 2, ENC: 1, GEN: 0 }[prefix] ?? 0;
}

/** Extract prefix from seat label (e.g. "ENC-A-5" → "ENC") */
export function seatLabelPrefix(label: string): string {
  return label.split("-")[0] ?? "";
}
