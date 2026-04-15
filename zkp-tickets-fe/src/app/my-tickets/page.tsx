"use client";

import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { TicketCard } from "@/components/TicketCard";
import { MATCH_TICKETS_ABI, TICKET_FACTORY_ABI } from "@/config/abis";
import { FACTORY_ADDRESS } from "@/config/wagmi";

interface Ticket {
  id: bigint;
  buyer: `0x${string}`;
  holderName: string;
  cnicHash: `0x${string}`;
  category: number;
  seat: string;
  used: boolean;
}

export default function MyTicketsPage() {
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-col items-center justify-center min-h-[60vh] gap-6">

        {/* Hexagon lock icon — violet themed */}
        <div className="relative mb-2">
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
            <polygon
              points="36,4 62,19 62,53 36,68 10,53 10,19"
              fill="none"
              stroke="url(#ticket-grad)"
              strokeWidth="1.5"
              opacity="0.6"
            />
            <polygon
              points="36,14 54,24.5 54,47.5 36,58 18,47.5 18,24.5"
              fill="url(#ticket-grad)"
              fillOpacity="0.06"
            />
            {/* Lock body */}
            <rect x="27" y="34" width="18" height="14" rx="2"
              fill="none" stroke="url(#ticket-grad)" strokeWidth="1.5" />
            {/* Lock shackle */}
            <path d="M30 34v-4a6 6 0 0 1 12 0v4"
              fill="none" stroke="url(#ticket-grad)" strokeWidth="1.5"
              strokeLinecap="round" />
            {/* Keyhole */}
            <circle cx="36" cy="41" r="2" fill="url(#ticket-grad)" opacity="0.7" />
            <defs>
              <linearGradient id="ticket-grad" x1="10" y1="10" x2="62" y2="62" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7C5CFC" />
                <stop offset="1" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1 className="font-display font-bold text-2xl text-white tracking-wide">
          CONNECT WALLET
        </h1>
        <p className="font-body text-center max-w-sm" style={{ color: "var(--muted)" }}>
          Connect your wallet to view purchased tickets and generate QR codes.
        </p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          {/* Violet → cyan gradient bar */}
          <div
            className="w-1 h-6 rounded-full"
            style={{ background: "linear-gradient(180deg, #7C5CFC, #22D3EE)" }}
          />
          <h1 className="font-display font-bold text-xl tracking-widest text-white">
            MY TICKETS
          </h1>
        </div>
        <p className="font-mono text-xs ml-4" style={{ color: "var(--muted)" }}>
          {address?.slice(0, 10)}…{address?.slice(-8)}
        </p>
      </div>

      <AllMatchTickets buyerAddress={address!} />
    </div>
  );
}

function AllMatchTickets({ buyerAddress }: { buyerAddress: `0x${string}` }) {
  const { data: addresses, isLoading } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: TICKET_FACTORY_ABI,
    functionName: "getAllMatches",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 gap-4">
        <div className="spinner" style={{ width: 36, height: 36 }} />
        <span
          className="font-condensed text-xs tracking-widest"
          style={{ color: "#A78BFA", animation: "pulseGlow 2s ease-in-out infinite" }}
        >
          LOADING…
        </span>
      </div>
    );
  }

  if (!addresses || (addresses as unknown[]).length === 0) {
    return <EmptyState message="No matches exist yet." />;
  }

  return (
    <div className="space-y-10">
      {(addresses as `0x${string}`[]).map(addr => (
        <MatchTicketSection key={addr} matchAddr={addr} buyerAddress={buyerAddress} />
      ))}
    </div>
  );
}

function MatchTicketSection({
  matchAddr,
  buyerAddress,
}: {
  matchAddr: `0x${string}`;
  buyerAddress: `0x${string}`;
}) {
  const mc = { address: matchAddr, abi: MATCH_TICKETS_ABI } as const;

  const { data: matchName } = useReadContract({ ...mc, functionName: "matchName"  });
  const { data: venue }     = useReadContract({ ...mc, functionName: "venue"      });
  const { data: datStr }    = useReadContract({ ...mc, functionName: "dateString" });
  const { data: tickets, isLoading } = useReadContract({
    ...mc,
    functionName: "getPurchaserTickets",
    args: [buyerAddress],
  });

  if (!isLoading && (!tickets || (tickets as Ticket[]).length === 0)) return null;

  const typedTickets = tickets as Ticket[] | undefined;
  const validCount = typedTickets?.filter(t => !t.used).length ?? 0;
  const usedCount  = typedTickets?.filter(t =>  t.used).length ?? 0;

  return (
    <section>
      <div
        className="flex items-center justify-between mb-4 pb-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <h2 className="font-display font-bold text-base text-white tracking-wide">
            {matchName as string | undefined ?? matchAddr.slice(0, 10) + "…"}
          </h2>
          <p className="font-body text-sm" style={{ color: "var(--muted)" }}>
            {venue as string | undefined}
            {datStr ? ` · ${datStr as string}` : ""}
          </p>
        </div>
        {typedTickets && (
          <div className="flex items-center gap-3">
            {validCount > 0 && <span className="badge-valid">{validCount} VALID</span>}
            {usedCount  > 0 && <span className="badge-used">{usedCount} USED</span>}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 py-8">
          <div className="spinner" />
          <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
            Loading tickets…
          </span>
        </div>
      )}

      {typedTickets && typedTickets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {typedTickets.map(ticket => (
            <TicketCard
              key={ticket.id.toString()}
              ticket={ticket}
              matchAddr={matchAddr}
              matchName={matchName as string | undefined}
              venue={venue as string | undefined}
              dateString={datStr as string | undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center py-24 gap-4">
      <div
        className="w-16 h-16 rounded-lg flex items-center justify-center"
        style={{ border: "1px dashed var(--border)" }}
      >
        <span className="text-2xl">🎟</span>
      </div>
      <p
        className="font-condensed text-sm tracking-widest"
        style={{ color: "var(--muted)" }}
      >
        NO TICKETS FOUND
      </p>
      <p className="font-body text-sm" style={{ color: "var(--muted)" }}>{message}</p>
      <a href="/" className="btn-outline mt-2">BROWSE MATCHES →</a>
    </div>
  );
}
