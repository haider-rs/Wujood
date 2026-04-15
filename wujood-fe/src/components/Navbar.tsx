"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";
import { useRole } from "@/context/RoleContext";

function WalletButton({ openConnectModal }: { openConnectModal: () => void }) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!isConnected || !address) {
    return (
      <button onClick={openConnectModal} className="btn-primary" style={{ padding: "8px 18px", fontSize: 12 }}>
        CONNECT WALLET
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-md transition-all"
        style={{ border: "1px solid rgba(124,92,252,0.30)", background: "rgba(124,92,252,0.06)" }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(124,92,252,0.60)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(124,92,252,0.30)")}
      >
        <div className="w-2 h-2 rounded-full" style={{ background: "#00E87A", boxShadow: "0 0 6px #00E87A" }} />
        <span className="font-mono text-xs" style={{ color: "rgba(200,210,232,0.85)" }}>
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ color: "var(--muted)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "" }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-lg overflow-hidden z-50"
          style={{ border: "1px solid var(--border)", background: "var(--card)", boxShadow: "0 16px 48px rgba(0,0,0,0.7)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="font-mono text-xs mb-1" style={{ color: "var(--muted)" }}>CONNECTED</p>
            <p className="font-mono text-xs break-all" style={{ color: "var(--text)" }}>{address}</p>
          </div>
          <button
            onClick={() => { disconnect(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
            style={{ color: "rgba(255,71,87,0.70)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,71,87,0.08)"; (e.currentTarget as HTMLElement).style.color = "#FF4757"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "rgba(255,71,87,0.70)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="font-condensed text-xs tracking-widest">DISCONNECT</span>
          </button>
        </div>
      )}
    </div>
  );
}

const BASE_LINKS = [
  { href: "/",           label: "MATCHES",      color: undefined   },
  { href: "/my-tickets", label: "MY TICKETS",   color: undefined   },
  { href: "/rewards",    label: "REWARDS",      color: "#F5A623"   },
];

export function Navbar() {
  const pathname = usePathname();
  const { isOwner, isMod, isLoading } = useRole();

  const roleLinks = isLoading ? [] : isOwner
    ? [
        { href: "/mods",  label: "VERIFY",       color: "#00C9FF" },
        { href: "/admin", label: "ADMIN PORTAL",  color: "#F5A623" },
      ]
    : isMod
      ? [{ href: "/mods", label: "VERIFY", color: "#00C9FF" }]
      : [];

  const allLinks = [...BASE_LINKS, ...roleLinks];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-40 h-16 flex items-center px-6"
      style={{
        borderBottom: "1px solid var(--border)",
        background: "rgba(5,8,16,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 mr-10 select-none">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="shrink-0">
          <polygon points="14,2 24.4,8 24.4,20 14,26 3.6,20 3.6,8" fill="none" stroke="url(#wg)" strokeWidth="1.5" />
          <polygon points="14,7 20,10.5 20,17.5 14,21 8,17.5 8,10.5" fill="url(#wg)" fillOpacity="0.20" />
          <circle cx="14" cy="14" r="3" fill="url(#wg)" />
          <defs>
            <linearGradient id="wg" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7C5CFC" /><stop offset="1" stopColor="#00C9FF" />
            </linearGradient>
          </defs>
        </svg>
        <div className="flex flex-col leading-none">
          <span className="font-display font-extrabold tracking-widest text-sm"
            style={{ background: "linear-gradient(90deg, #A78BFA, #7C5CFC)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "0.18em" }}>
            WUJOOD
          </span>
          <span className="font-mono text-[9px] tracking-[0.22em]" style={{ color: "var(--muted)" }}>PSL · WIREFLUID</span>
        </div>
      </Link>

      {/* Links */}
      <div className="hidden md:flex items-center gap-1 flex-1">
        {allLinks.map(({ href, label, color }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          const c = color ?? "#7C5CFC";
          return (
            <Link key={href} href={href}
              className="flex items-center gap-1.5 px-4 py-2 font-condensed text-xs tracking-widest rounded-md transition-all"
              style={{
                color: active ? c : "var(--muted)",
                background: active ? c + "12" : "transparent",
                borderBottom: active ? `2px solid ${c}` : "2px solid transparent",
                paddingBottom: active ? "6px" : "8px",
                fontWeight: active ? 700 : 600,
                letterSpacing: "0.10em",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(200,210,232,0.80)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--muted)"; }}
            >
              {label}
              {/* Pulsing dot on REWARDS to draw attention */}
              {label === "REWARDS" && !active && (
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "#F5A623", boxShadow: "0 0 5px #F5A623", animation: "pulseGlow 2s infinite" }} />
              )}
            </Link>
          );
        })}
      </div>

      {/* Wallet */}
      <div className="ml-auto">
        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => mounted ? <WalletButton openConnectModal={openConnectModal} /> : null}
        </ConnectButton.Custom>
      </div>
    </nav>
  );
}
