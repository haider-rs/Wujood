// src/app/admin/page.tsx
"use client";

import { useState } from "react";
import {
  useAccount, useReadContract, useWriteContract, usePublicClient,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import { TICKET_FACTORY_ABI, MATCH_TICKETS_ABI } from "@/config/abis";
import { useRole } from "@/context/RoleContext";
import { FACTORY_ADDRESS } from "@/config/wagmi";
import { showToast } from "@/components/Toast";

import { TICKET_CATEGORIES, CATEGORY_INDEX, categoryLabel } from "@/config/tickets";
import type { TicketCategoryLabel } from "@/config/tickets";

// Format YYYY-MM-DD → "April 15, 2026"
function formatDateDisplay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const { isOwner } = useRole();

  if (!isConnected) return <AccessDenied message="Connect your wallet to access the admin portal." />;
  if (!isOwner) return <AccessDenied message={`Only the contract owner can access this page. Connected: ${address}`} />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-1 h-6 bg-yellow-500 rounded-full" />
        <h1 className="font-display font-bold text-xl tracking-widest text-white">ADMIN PORTAL</h1>
        <span className="badge-valid ml-2">OWNER</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <CreateMatchPanel />
          <ModManagementPanel />
        </div>
        <MatchListPanel />
      </div>
    </div>
  );
}

// ── Create Match ──────────────────────────────────────────────────────────────
type CreateForm = {
  name: string; venue: string; dateIso: string;
  tickets: string; generalPrice: string; enclosurePrice: string; vipPrice: string;
};

const EMPTY_FORM: CreateForm = {
  name: "", venue: "", dateIso: "", tickets: "100",
  generalPrice: "0.001", enclosurePrice: "0.005", vipPrice: "0.01",
};

function CreateMatchPanel() {
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success">("idle");
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  function set(key: keyof CreateForm) {
    return (v: string) => setForm(p => ({ ...p, [key]: v }));
  }

  async function handleCreate() {
    if (!publicClient) return;
    setTxStatus("pending");
    try {
      const hash = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: TICKET_FACTORY_ABI,
        functionName: "createMatch",
        args: [
          form.name, form.venue,
          formatDateDisplay(form.dateIso),   // store human-readable on-chain
          BigInt(form.tickets),
          parseEther(form.generalPrice),
          parseEther(form.enclosurePrice),
          parseEther(form.vipPrice),
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setTxStatus("success");
      setForm(EMPTY_FORM);
      setTimeout(() => setTxStatus("idle"), 3000);
    } catch (e) {
      setTxStatus("idle");
      showToast(e instanceof Error ? e.message : "Transaction failed");
    }
  }

  const canSubmit =
    !!form.name && !!form.venue && !!form.dateIso && !!form.tickets &&
    !!form.generalPrice && !!form.enclosurePrice && !!form.vipPrice &&
    txStatus !== "pending";

  return (
    <div className="card-glass rounded p-6">
      <h2 className="font-display font-bold text-sm tracking-widest text-white mb-5">CREATE MATCH</h2>
      <div className="space-y-3">
        <Field label="Match Name" value={form.name} onChange={set("name")} placeholder="LQ vs KK — Gaddafi Stadium" />
        <Field label="Venue" value={form.venue} onChange={set("venue")} placeholder="Gaddafi Stadium, Lahore" />

        {/* Date picker */}
        <div>
          <label className="block font-mono text-xs text-muted mb-1 tracking-wider uppercase">Date</label>
          <input
            type="date"
            className="input-field"
            value={form.dateIso}
            onChange={e => set("dateIso")(e.target.value)}
            min={(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; })()}
            style={{ colorScheme: "dark" }}
          />
          {form.dateIso && (
            <p className="font-mono text-[10px] text-green mt-1">{formatDateDisplay(form.dateIso)}</p>
          )}
        </div>

        <Field label="Total Tickets" value={form.tickets} onChange={set("tickets")} placeholder="780" />

        <div>
          <label className="block font-mono text-xs text-muted mb-2 tracking-wider uppercase">
            Ticket Prices (WIRE)
          </label>
          <div className="space-y-2">
            {([
              { label: "General", key: "generalPrice", hint: "Main stands" },
              { label: "Enclosure", key: "enclosurePrice", hint: "Covered seating" },
              { label: "VIP", key: "vipPrice", hint: "Premium lounge" },
            ] as { label: string; key: keyof CreateForm; hint: string }[]).map(({ label, key, hint }) => (
              <div key={key} className="flex items-center gap-3 p-3 rounded bg-surface border border-border">
                <div className="flex-1 min-w-0">
                  <div className="font-display text-xs text-white font-bold">{label}</div>
                  <div className="font-mono text-[10px] text-muted">{hint}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    className="input-field w-24 text-xs text-right"
                    value={form[key]}
                    onChange={e => set(key)(e.target.value)}
                    placeholder="0.001"
                  />
                  <span className="font-mono text-[10px] text-muted">WIRE</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {txStatus === "pending" && (
          <div className="p-2 rounded border border-yellow-500/30 bg-yellow-500/5 flex items-center gap-2">
            <div className="spinner shrink-0" />
            <p className="font-display text-xs text-yellow-400 tracking-widest">CREATING MATCH…</p>
          </div>
        )}
        {txStatus === "success" && (
          <div className="p-2 rounded border border-green/30 bg-green/5">
            <p className="font-display text-xs text-green tracking-widest">✓ MATCH CREATED</p>
          </div>
        )}

        <button onClick={handleCreate} disabled={!canSubmit} className="btn-primary w-full justify-center">
          {txStatus === "pending" ? <><div className="spinner" /> CREATING…</> : "CREATE MATCH →"}
        </button>
      </div>
    </div>
  );
}

// ── Global Mod Management ─────────────────────────────────────────────────────
function ModManagementPanel() {
  const [modInput, setModInput] = useState("");
  const [addStatus, setAddStatus] = useState<"idle" | "pending" | "success">("idle");
  const [removing, setRemoving] = useState<Record<string, boolean>>({});
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const fc = { address: FACTORY_ADDRESS, abi: TICKET_FACTORY_ABI } as const;
  const { data: modsList, refetch: refetchMods } = useReadContract({
    ...fc, functionName: "getMods",
    query: { staleTime: Infinity, gcTime: Infinity },
  });
  const isValidAddress = modInput.startsWith("0x") && modInput.length === 42;

  async function handleAddMod() {
    if (!isValidAddress || !publicClient) return;
    setAddStatus("pending");
    try {
      const hash = await writeContractAsync({ ...fc, functionName: "addMod", args: [modInput as `0x${string}`] });
      await publicClient.waitForTransactionReceipt({ hash });
      setAddStatus("success");
      setModInput("");
      await refetchMods();
      setTimeout(() => setAddStatus("idle"), 2500);
    } catch (e) {
      setAddStatus("idle");
      showToast(e instanceof Error ? e.message : "Failed to add mod");
    }
  }

  async function handleRemoveMod(mod: `0x${string}`) {
    if (!publicClient) return;
    setRemoving(prev => ({ ...prev, [mod]: true }));
    try {
      const hash = await writeContractAsync({ ...fc, functionName: "removeMod", args: [mod] });
      await publicClient.waitForTransactionReceipt({ hash });
      await refetchMods();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to remove mod");
    } finally {
      setRemoving(prev => { const n = { ...prev }; delete n[mod]; return n; });
    }
  }

  return (
    <div className="card-glass rounded p-6">
      <h2 className="font-display font-bold text-sm tracking-widest text-white mb-5">GLOBAL MODS</h2>
      <p className="font-mono text-xs text-muted mb-4">Mods added here have access to all matches.</p>
      <div className="flex gap-2 mb-1">
        <input
          className="input-field flex-1 text-xs"
          placeholder="0x… wallet address"
          value={modInput}
          onChange={e => setModInput(e.target.value)}
          disabled={addStatus === "pending"}
        />
        <button onClick={handleAddMod} disabled={!isValidAddress || addStatus === "pending"} className="btn-primary text-xs px-4 shrink-0">
          {addStatus === "pending" ? <><div className="spinner" /> ADDING…</> : "ADD"}
        </button>
      </div>
      {addStatus === "success" && (
        <p className="font-display text-[10px] text-green tracking-widest mb-2">✓ MOD ADDED</p>
      )}
      <div className="space-y-2 mt-3">
        {(modsList as `0x${string}`[] | undefined)?.map(mod => (
          <div key={mod} className="flex items-center justify-between p-2 rounded bg-surface border border-border">
            <span className="font-mono text-xs text-white truncate flex-1">{mod}</span>
            <button onClick={() => handleRemoveMod(mod)} disabled={removing[mod]}
              className="font-mono text-[10px] text-red/60 hover:text-red ml-2 shrink-0 disabled:opacity-40 transition-colors">
              {removing[mod] ? "REMOVING…" : "REMOVE"}
            </button>
          </div>
        ))}
        {(!modsList || (modsList as `0x${string}`[]).length === 0) && (
          <p className="font-mono text-xs text-muted">No mods assigned yet.</p>
        )}
      </div>
    </div>
  );
}

// ── Match List ────────────────────────────────────────────────────────────────
function MatchListPanel() {
  const { data: addresses, isLoading } = useReadContract({
    address: FACTORY_ADDRESS, abi: TICKET_FACTORY_ABI, functionName: "getAllMatches",
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  return (
    <div className="space-y-4">
      <h2 className="font-display font-bold text-sm tracking-widest text-white">MATCHES</h2>
      {isLoading && <div className="spinner mx-auto" />}
      {(addresses as `0x${string}`[] | undefined)?.map(addr => (
        <MatchAdminCard key={addr} matchAddr={addr} />
      ))}
      {!isLoading && (!addresses || (addresses as `0x${string}`[]).length === 0) && (
        <p className="font-mono text-xs text-muted">No matches created yet.</p>
      )}
    </div>
  );
}

function MatchAdminCard({ matchAddr }: { matchAddr: `0x${string}` }) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [withdrawStatus, setWithdrawStatus] = useState<"idle" | "pending" | "done">("idle");
  const [withdrawTx, setWithdrawTx] = useState("");

  const mc = { address: matchAddr, abi: MATCH_TICKETS_ABI } as const;
  const fc = { address: FACTORY_ADDRESS, abi: TICKET_FACTORY_ABI } as const;

  const { data: matchName } = useReadContract({ ...mc, functionName: "matchName", query: { staleTime: Infinity, gcTime: Infinity } });
  const { data: ticketsSold } = useReadContract({ ...mc, functionName: "ticketsSold", query: { staleTime: Infinity, gcTime: Infinity } });
  const { data: totalTickets } = useReadContract({ ...mc, functionName: "totalTickets", query: { staleTime: Infinity, gcTime: Infinity } });
  const { data: allPrices } = useReadContract({ ...mc, functionName: "getAllPrices", query: { staleTime: Infinity, gcTime: Infinity } });
  const { data: info } = useReadContract({ ...fc, functionName: "getMatchInfo", args: [matchAddr], query: { staleTime: Infinity, gcTime: Infinity } });

  const prices = allPrices as [bigint, bigint, bigint] | undefined;
  const isActive = (info as any)?.active ?? true;

  async function handleToggle() {
    if (!publicClient) return;
    try {
      const hash = await writeContractAsync({ ...fc, functionName: "toggleMatchActive", args: [matchAddr] });
      await publicClient.waitForTransactionReceipt({ hash });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Toggle failed");
    }
  }

  async function handleWithdraw() {
    if (!publicClient) return;
    setWithdrawStatus("pending");
    setWithdrawTx("");
    try {
      const hash = await writeContractAsync({ ...mc, functionName: "withdrawFunds" });
      await publicClient.waitForTransactionReceipt({ hash });
      setWithdrawTx(hash);
      setWithdrawStatus("done");
      showToast("Funds withdrawn successfully", "success");
    } catch (e) {
      setWithdrawStatus("idle");
      showToast(e instanceof Error ? e.message : "Withdraw failed");
    }
  }

  return (
    <div className="card-glass rounded p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-bold text-sm text-white">{matchName as string ?? "…"}</h3>
        <div className="flex items-center gap-2">
          {isActive ? <span className="badge-valid">LIVE</span> : <span className="badge-used">OFF</span>}
          <button onClick={handleToggle} className="font-mono text-[10px] text-muted hover:text-white transition-colors">
            TOGGLE
          </button>
        </div>
      </div>

      <p className="font-mono text-xs text-muted mb-2">
        {ticketsSold?.toString() ?? "0"} / {totalTickets?.toString() ?? "?"} sold
        &nbsp;·&nbsp;
        <span className="text-white/40">{matchAddr.slice(0, 10)}…</span>
      </p>

      {prices && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {TICKET_CATEGORIES.map((cat, i) => (
            <span key={cat} className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface border border-border text-muted">
              {cat}: <span className="text-white">{formatWire(prices[i])} WIRE</span>
            </span>
          ))}
        </div>
      )}

      <button
        onClick={handleWithdraw}
        disabled={withdrawStatus === "pending"}
        className="btn-outline text-xs w-full justify-center"
      >
        {withdrawStatus === "pending"
          ? <><div className="spinner" /> WITHDRAWING…</>
          : "WITHDRAW FUNDS"
        }
      </button>

      {withdrawStatus === "done" && withdrawTx && (
        <a
          href={`${process.env.NEXT_PUBLIC_BLOCK_EXPLORER}/tx/${withdrawTx}`}
          target="_blank" rel="noopener noreferrer"
          className="block mt-2 font-mono text-[10px] text-green hover:underline truncate"
        >
          ✓ TX: {withdrawTx.slice(0, 22)}… ↗
        </a>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function formatWire(wei: bigint): string {
  return (Number(wei) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div>
      <label className="block font-mono text-xs text-muted mb-1 tracking-wider uppercase">{label}</label>
      <input className="input-field" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function AccessDenied({ message }: { message: string }) {
  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="w-16 h-16 mx-auto mb-6 border border-red/30 rounded flex items-center justify-center">
        <span className="text-3xl">🔒</span>
      </div>
      <h1 className="font-display font-bold text-xl text-red tracking-widest mb-3">ACCESS DENIED</h1>
      <p className="font-body text-sm text-muted">{message}</p>
    </div>
  );
}
