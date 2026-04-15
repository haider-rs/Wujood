"use client";

import { useState, useEffect, useMemo } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { REWARDS_POOL_ABI } from "@/config/abis";
import { TICKET_FACTORY_ABI, MATCH_TICKETS_ABI } from "@/config/abis";
import { FACTORY_ADDRESS } from "@/config/wagmi";
import { CONTRACT_ADDRESSES } from "@/config/contracts";
import { useRole } from "@/context/RoleContext";
import { showToast } from "@/components/Toast";

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

// ── Confetti ──────────────────────────────────────────────────────────────────

function Confetti() {
  const particles = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 3,
      duration: 2 + Math.random() * 3,
      color: ["#7C5CFC", "#00C9FF", "#F5A623", "#00E87A", "#FF4757"][Math.floor(Math.random() * 5)],
      size: 4 + Math.random() * 8,
    })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.left}%`, top: "-20px",
          width: p.size, height: p.size, background: p.color,
          borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
        }} />
      ))}
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface BuyerEntry { address: string; tickets: number; pct: number; }

export default function RewardsPage() {
  const { address } = useAccount();
  const { isOwner } = useRole();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const REWARDS_ADDR = CONTRACT_ADDRESSES.rewardsPool;

  // ── Contract reads ────────────────────────────────────────────────────────

  const { data: drawn, refetch: refetchDrawn } = useReadContract({
    address: REWARDS_ADDR, abi: REWARDS_POOL_ABI, functionName: "drawn",
  });

  const { data: winners, refetch: refetchWinners } = useReadContract({
    address: REWARDS_ADDR, abi: REWARDS_POOL_ABI, functionName: "getWinners",
  });

  const { data: allBuyers, refetch: refetchBuyers } = useReadContract({
    address: REWARDS_ADDR, abi: REWARDS_POOL_ABI, functionName: "getAllBuyers",
  });

  const { data: registeredMatches, refetch: refetchRegistered } = useReadContract({
    address: REWARDS_ADDR, abi: REWARDS_POOL_ABI, functionName: "getRegisteredMatches",
  });

  const { data: allMatches, refetch: refetchMatches } = useReadContract({
    address: FACTORY_ADDRESS, abi: TICKET_FACTORY_ABI, functionName: "getAllMatches",
  });

  // ── Local state ───────────────────────────────────────────────────────────

  const [leaderboard, setLeaderboard] = useState<BuyerEntry[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [seed, setSeed] = useState("");
  const [txBusy, setTxBusy] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // ── Build leaderboard (callable manually) ────────────────────────────────

  async function loadLeaderboard(buyers: string[], matches: string[]) {
    if (!buyers.length || !matches.length || !publicClient) return;
    setLoadingBoard(true);
    try {
      const counts: Record<string, number> = {};
      for (const b of buyers) counts[b.toLowerCase()] = 0;
      for (const match of matches) {
        for (const buyer of buyers) {
          try {
            const tix = await publicClient.readContract({
              address: match as `0x${string}`, abi: MATCH_TICKETS_ABI,
              functionName: "getPurchaserTickets", args: [buyer as `0x${string}`],
            }) as any[];
            counts[buyer.toLowerCase()] += tix.length;
          } catch { /* skip */ }
        }
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      setLeaderboard(
        buyers.map(b => ({
          address: b,
          tickets: counts[b.toLowerCase()] ?? 0,
          pct: total > 0 ? ((counts[b.toLowerCase()] ?? 0) / total) * 100 : 0,
        })).sort((a, b) => b.tickets - a.tickets)
      );
    } catch { /* silent */ }
    finally { setLoadingBoard(false); }
  }

  async function handleRefetch() {
    const [b, m] = await Promise.all([refetchBuyers(), refetchMatches()]);
    await loadLeaderboard(
      (b.data as string[] | undefined) ?? [],
      (m.data as string[] | undefined) ?? [],
    );
  }

  useEffect(() => {
    const buyers = allBuyers as string[] | undefined;
    const matches = allMatches as string[] | undefined;
    if (buyers && matches) loadLeaderboard(buyers, matches);
  }, [allBuyers, allMatches]);

  // ── Draw ──────────────────────────────────────────────────────────────────

  async function handleDraw() {
    const parsedSeed = seed.trim() ? BigInt(seed.trim()) : BigInt(Date.now());
    setTxBusy(true);
    try {
      await writeContractAsync({
        address: REWARDS_ADDR, abi: REWARDS_POOL_ABI,
        functionName: "drawWinners", args: [parsedSeed],
      });
      showToast("🎉 Winners drawn!", "success");
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 6000);
      refetchDrawn(); refetchWinners();
    } catch (e: any) {
      showToast(e?.shortMessage ?? "Failed", "error");
    } finally { setTxBusy(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const winnerList = winners as `0x${string}`[] | undefined;
  const uniqueCount = (allBuyers as any[] | undefined)?.length ?? 0;
  const matchCount  = (allMatches as any[] | undefined)?.length ?? 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {showConfetti && <Confetti />}

      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-5"
          style={{ borderColor: "rgba(245,166,35,0.30)", background: "rgba(245,166,35,0.06)" }}>
          <span>🏆</span>
          <span className="font-condensed text-xs tracking-[0.2em]" style={{ color: "#F5A623" }}>SEASONAL REWARDS</span>
        </div>
        <h1 className="font-condensed font-black tracking-wider text-white mb-3 leading-tight"
          style={{ fontSize: "clamp(2rem, 6vw, 3.8rem)" }}>
          REWARD POOL
        </h1>
        <p className="font-body text-sm max-w-xl mx-auto" style={{ color: "var(--muted)" }}>
          3 random ticket holders selected at season end. More tickets = more chances.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-10">
        {[
          { label: "MATCHES",       value: matchCount  },
          { label: "UNIQUE BUYERS", value: uniqueCount },
          { label: "STATUS",        value: drawn ? "DRAWN" : "OPEN"  },
        ].map(({ label, value }) => (
          <div key={label} className="card-glass rounded-xl p-4 text-center"
            style={{ borderColor: "rgba(124,92,252,0.20)" }}>
            <div className="font-display font-bold text-2xl"
              style={{ color: label === "STATUS" ? (drawn ? "#00E87A" : "#F5A623") : "#fff" }}>
              {value}
            </div>
            <div className="font-condensed text-[10px] tracking-widest mt-1" style={{ color: "var(--muted)" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Winners */}
      {drawn && winnerList && (
        <div className="mb-10 p-6 rounded-xl text-center"
          style={{ background: "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.25)" }}>
          <div className="font-condensed text-xs tracking-widest mb-5" style={{ color: "#F5A623" }}>
            🏆 SEASON WINNERS
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {winnerList.map((w, i) => {
              const isYou = address?.toLowerCase() === w.toLowerCase();
              return (
                <div key={i} className="flex-1 p-4 rounded-xl"
                  style={{
                    background: isYou ? "rgba(124,92,252,0.12)" : "rgba(0,0,0,0.3)",
                    border: `1px solid ${isYou ? "#7C5CFC" : "rgba(245,166,35,0.20)"}`,
                  }}>
                  <div className="text-2xl mb-2">{["🥇","🥈","🥉"][i]}</div>
                  <div className="font-mono text-xs break-all"
                    style={{ color: isYou ? "#A78BFA" : "var(--text)" }}>{w}</div>
                  {isYou && (
                    <div className="font-condensed text-[10px] tracking-widest mt-2" style={{ color: "#7C5CFC" }}>
                      THAT'S YOU! 🎉
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin draw panel */}
      {isOwner && !drawn && (
        <div className="mb-10 p-5 rounded-xl"
          style={{ background: "rgba(245,166,35,0.04)", border: "1px solid rgba(245,166,35,0.20)" }}>
          <div className="font-condensed text-xs tracking-widest mb-4" style={{ color: "#F5A623" }}>
            ADMIN — DRAW WINNERS
          </div>

          <>
              <p className="font-body text-sm mb-4" style={{ color: "var(--muted)" }}>
                <strong style={{ color: "#fff" }}>{uniqueCount} unique buyers</strong> across{" "}
                <strong style={{ color: "#fff" }}>{matchCount} matches</strong>. Ready to draw.
              </p>

              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="font-mono text-[10px] mb-1 block" style={{ color: "var(--muted)" }}>
                    SEED (optional — leave blank to use timestamp)
                  </label>
                  <input
                    className="input-field text-xs font-mono"
                    placeholder="e.g. 42"
                    value={seed}
                    onChange={e => setSeed(e.target.value)}
                  />
                </div>
                <button className="btn-primary shrink-0" onClick={handleDraw} disabled={txBusy}>
                  {txBusy
                    ? <><div className="spinner" style={{ width: 14, height: 14 }} /> DRAWING…</>
                    : "🎲 DRAW WINNERS"}
                </button>
              </div>

              <p className="font-mono text-[10px] mt-3" style={{ color: "var(--muted)" }}>
                Randomness mixed with prevrandao + block data on-chain. One-time only — cannot be redrawn.
              </p>
            </>
        </div>
      )}

      {/* Pending draw state (public) */}
      {!drawn && !isOwner && (
        <div className="mb-10 p-6 rounded-xl text-center"
          style={{ background: "rgba(124,92,252,0.04)", border: "1px solid rgba(124,92,252,0.15)" }}>
          <div className="text-3xl mb-3">⏳</div>
          <div className="font-condensed text-xs tracking-widest" style={{ color: "#A78BFA" }}>
            DRAW PENDING
          </div>
          <p className="font-body text-sm mt-2" style={{ color: "var(--muted)" }}>
            Winners will be drawn by the admin at season end.
          </p>
        </div>
      )}

      {/* Leaderboard */}
      <div className="card-glass rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 rounded-full"
              style={{ background: "linear-gradient(180deg, #7C5CFC, #22D3EE)" }} />
            <h2 className="font-display font-bold text-sm tracking-widest text-white">
              PARTICIPANT LEADERBOARD
            </h2>
          </div>
          <button onClick={handleRefetch} disabled={loadingBoard}
            className="flex items-center gap-1.5 btn-outline py-1 px-3 text-xs">
            {loadingBoard
              ? <><div className="spinner" style={{ width: 10, height: 10 }} /> LOADING</>
              : <>↻ REFRESH</>}
          </button>
        </div>

        {loadingBoard && (
          <div className="flex items-center justify-center gap-3 py-12">
            <div className="spinner" />
            <span className="font-mono text-xs animate-pulse" style={{ color: "#A78BFA" }}>LOADING…</span>
          </div>
        )}

        {!loadingBoard && leaderboard.length === 0 && (
          <div className="py-12 text-center">
            <p className="font-condensed text-xs tracking-widest" style={{ color: "var(--muted)" }}>
              NO PARTICIPANTS YET
            </p>
          </div>
        )}

        {!loadingBoard && leaderboard.length > 0 && (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {leaderboard.map((entry, i) => {
              const isYou = address?.toLowerCase() === entry.address.toLowerCase();
              const winnerIdx = winnerList?.findIndex(w => w.toLowerCase() === entry.address.toLowerCase()) ?? -1;
              return (
                <div key={entry.address} className="flex items-center gap-4 px-5 py-3"
                  style={{
                    background: isYou ? "rgba(124,92,252,0.05)" : "transparent",
                    borderLeft: isYou ? "2px solid #7C5CFC" : "2px solid transparent",
                  }}>
                  <span className="font-mono text-xs w-6 text-right shrink-0"
                    style={{ color: winnerIdx >= 0 ? "#F5A623" : "var(--muted)" }}>
                    {winnerIdx >= 0 ? ["🥇","🥈","🥉"][winnerIdx] : `#${i+1}`}
                  </span>
                  <span className="font-mono text-xs flex-1"
                    style={{ color: isYou ? "#A78BFA" : "var(--text)" }}>
                    {shortAddr(entry.address)}
                    {isYou && <span className="ml-2 font-condensed text-[9px]" style={{ color: "#7C5CFC" }}>YOU</span>}
                  </span>
                  <span className="font-mono text-xs shrink-0" style={{ color: "#00C9FF" }}>
                    {entry.tickets}t
                  </span>
                  <div className="flex items-center gap-2 shrink-0 w-28">
                    <div className="flex-1 h-1 rounded-full overflow-hidden"
                      style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full"
                        style={{
                          width: `${Math.min(entry.pct, 100)}%`,
                          background: isYou
                            ? "linear-gradient(90deg, #7C5CFC, #00C9FF)"
                            : "linear-gradient(90deg, #4A5880, #7C5CFC44)",
                        }} />
                    </div>
                    <span className="font-mono text-[10px] w-10 text-right tabular-nums"
                      style={{ color: "var(--muted)" }}>
                      {entry.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="px-5 py-3" style={{ borderTop: "1px solid var(--border)", background: "rgba(0,0,0,0.2)" }}>
          <p className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>
            Randomness: seed + prevrandao + block data. More tickets = higher chance. Verifiable on-chain.
          </p>
        </div>
      </div>
    </div>
  );
}
