"use client";

import { useState, useEffect, useMemo } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
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

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

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

// ── Step indicator ────────────────────────────────────────────────────────────

function StepBadge({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div style={{
        width: 24, height: 24, borderRadius: "50%", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 11,
        fontFamily: "monospace", fontWeight: 700, flexShrink: 0,
        background: done ? "#00E87A" : active ? "#F5A623" : "rgba(255,255,255,0.08)",
        color: done || active ? "#000" : "var(--muted)",
      }}>
        {done ? "✓" : n}
      </div>
      <span className="font-condensed text-xs tracking-widest"
        style={{ color: done ? "#00E87A" : active ? "#F5A623" : "var(--muted)" }}>
        {label}
      </span>
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

  // ── Commit-reveal state reads ─────────────────────────────────────────────

  const { data: pendingCommit, refetch: refetchCommit } = useReadContract({
    address: REWARDS_ADDR, abi: REWARDS_POOL_ABI, functionName: "pendingCommit",
  });

  const { data: commitBlock } = useReadContract({
    address: REWARDS_ADDR, abi: REWARDS_POOL_ABI, functionName: "commitBlock",
  });

  const { data: snapshotTaken, refetch: refetchSnapshotTaken } = useReadContract({
    address: REWARDS_ADDR, abi: REWARDS_POOL_ABI, functionName: "snapshotTaken",
  });

  // ── Local state ───────────────────────────────────────────────────────────

  const [leaderboard, setLeaderboard] = useState<BuyerEntry[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [seed, setSeed] = useState<string>("");
  const [txBusy, setTxBusy] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<bigint>(0n);

  // ── Track current block number ────────────────────────────────────────────

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      const n = await publicClient!.getBlockNumber();
      if (!cancelled) setCurrentBlock(n);
      setTimeout(poll, 6000); // ~1 block on most EVM chains
    }
    poll();
    return () => { cancelled = true; };
  }, [publicClient]);

  // ── Derived commit-reveal state ───────────────────────────────────────────

  const hasCommit = !!(pendingCommit && pendingCommit !== ZERO_HASH);
  const blocksRemaining = hasCommit && commitBlock
    ? Math.max(0, Number((commitBlock as bigint) + 5n - currentBlock))
    : 0;
  const delayPassed = hasCommit && blocksRemaining === 0;

  // Which step are we on?
  // step 1 = no commit yet
  // step 2 = committed, not snapshotted
  // step 3 = snapshotted, not drawn
  const drawStep = !hasCommit ? 1 : !snapshotTaken ? 2 : 3;

  // ── Build leaderboard ─────────────────────────────────────────────────────

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

  // ── Step 1: Commit ────────────────────────────────────────────────────────

  async function handleCommit() {
    if (!seed.trim()) return showToast("Enter a secret seed first", "error");
    const secret = BigInt(seed.trim());
    // Hash must match what the contract checks: keccak256(abi.encode(seed))
    const hash = keccak256(encodeAbiParameters(parseAbiParameters("uint256"), [secret]));
    setTxBusy(true);
    try {
      await writeContractAsync({
        address: REWARDS_ADDR, abi: REWARDS_POOL_ABI,
        functionName: "commitDraw", args: [hash],
      });
      showToast("✅ Committed! Wait 5 blocks, then take snapshot.", "success");
      await refetchCommit();
    } catch (e: any) {
      showToast(e?.shortMessage ?? "Commit failed", "error");
    } finally { setTxBusy(false); }
  }

  // ── Step 2: Snapshot ──────────────────────────────────────────────────────

  async function handleSnapshot() {
    setTxBusy(true);
    try {
      await writeContractAsync({
        address: REWARDS_ADDR, abi: REWARDS_POOL_ABI,
        functionName: "takeSnapshot", args: [],
      });
      showToast("📸 Snapshot taken! Now draw winners.", "success");
      await refetchSnapshotTaken();
    } catch (e: any) {
      showToast(e?.shortMessage ?? "Snapshot failed", "error");
    } finally { setTxBusy(false); }
  }

  // ── Step 3: Draw ──────────────────────────────────────────────────────────

  async function handleDraw() {
    if (!seed.trim()) return showToast("Enter the same secret seed you committed", "error");
    const parsedSeed = BigInt(seed.trim());
    setTxBusy(true);
    try {
      await writeContractAsync({
        address: REWARDS_ADDR, abi: REWARDS_POOL_ABI,
        functionName: "drawWinners", args: [parsedSeed],
      });
      showToast("🎉 Winners drawn!", "success");
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 6000);
      // Await both refetches so winners render immediately
      await Promise.all([refetchDrawn(), refetchWinners()]);
    } catch (e: any) {
      showToast(e?.shortMessage ?? "Draw failed", "error");
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

          {/* Header + step progress */}
          <div className="flex items-center justify-between mb-5">
            <div className="font-condensed text-xs tracking-widest" style={{ color: "#F5A623" }}>
              ADMIN — DRAW WINNERS
            </div>
            <div className="flex items-center gap-4">
              <StepBadge n={1} label="COMMIT"   active={drawStep === 1} done={drawStep > 1} />
              <div style={{ width: 16, height: 1, background: "rgba(255,255,255,0.12)" }} />
              <StepBadge n={2} label="SNAPSHOT" active={drawStep === 2} done={drawStep > 2} />
              <div style={{ width: 16, height: 1, background: "rgba(255,255,255,0.12)" }} />
              <StepBadge n={3} label="DRAW"     active={drawStep === 3} done={!!drawn} />
            </div>
          </div>

          <p className="font-body text-sm mb-5" style={{ color: "var(--muted)" }}>
            <strong style={{ color: "#fff" }}>{uniqueCount} unique buyers</strong> across{" "}
            <strong style={{ color: "#fff" }}>{matchCount} matches</strong>.
          </p>

          {/* Seed input — shown on step 1 and step 3 */}
          {(drawStep === 1 || drawStep === 3) && (
            <div className="mb-4">
              <label className="font-mono text-[10px] mb-1 block" style={{ color: "var(--muted)" }}>
                {drawStep === 1
                  ? "SECRET SEED — remember this, you'll need it again for step 3"
                  : "SECRET SEED — must be the same number you committed in step 1"}
              </label>
              <input
                className="input-field text-xs font-mono w-full"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 42069"
                value={seed}
                onChange={e => setSeed(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={e => ["e","E","+","-","."].includes(e.key) && e.preventDefault()}
              />
            </div>
          )}

          {/* Step 1: Commit */}
          {drawStep === 1 && (
            <>
              <button className="btn-primary w-full" onClick={handleCommit} disabled={txBusy || !seed.trim()}>
                {txBusy
                  ? <><div className="spinner" style={{ width: 14, height: 14 }} /> COMMITTING…</>
                  : "🔒 STEP 1 — COMMIT SECRET"}
              </button>
              <p className="font-mono text-[10px] mt-3" style={{ color: "var(--muted)" }}>
                Hashes your seed on-chain. After this, wait 5 blocks before taking a snapshot.
              </p>
            </>
          )}

          {/* Step 2: Snapshot */}
          {drawStep === 2 && (
            <>
              {!delayPassed && (
                <div className="mb-3 px-3 py-2 rounded-lg flex items-center gap-2"
                  style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.20)" }}>
                  <span>⏳</span>
                  <span className="font-mono text-xs" style={{ color: "#F5A623" }}>
                    Waiting for commit delay — {blocksRemaining} block{blocksRemaining !== 1 ? "s" : ""} remaining
                  </span>
                </div>
              )}
              <button
                className="btn-primary w-full"
                onClick={handleSnapshot}
                disabled={txBusy || !delayPassed}
              >
                {txBusy
                  ? <><div className="spinner" style={{ width: 14, height: 14 }} /> SNAPSHOTTING…</>
                  : "📸 STEP 2 — TAKE SNAPSHOT"}
              </button>
              <p className="font-mono text-[10px] mt-3" style={{ color: "var(--muted)" }}>
                Freezes the current ticket pool into contract storage so the draw uses no external calls.
              </p>
            </>
          )}

          {/* Step 3: Draw */}
          {drawStep === 3 && (
            <>
              <button className="btn-primary w-full" onClick={handleDraw} disabled={txBusy || !seed.trim()}>
                {txBusy
                  ? <><div className="spinner" style={{ width: 14, height: 14 }} /> DRAWING…</>
                  : "🎲 STEP 3 — DRAW WINNERS"}
              </button>
              <p className="font-mono text-[10px] mt-3" style={{ color: "var(--muted)" }}>
                Reveals your secret on-chain. Mixed with prevrandao + block data. One-time only — cannot be redrawn.
              </p>
            </>
          )}
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
