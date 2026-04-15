"use client";
import { useEffect, useState } from "react";

type ToastType = "error" | "success" | "info";
interface Toast { id: number; message: string; type: ToastType }
type Listener = (t: Toast) => void;

let listeners: Listener[] = [];
let nextId = 0;

export function showToast(message: string, type: ToastType = "error") {
  const t = { id: nextId++, message, type };
  listeners.forEach(l => l(t));
}

const STYLES: Record<ToastType, { border: string; icon: string; color: string }> = {
  error:   { border: "rgba(255,71,87,0.35)",  icon: "✗", color: "#FF4757" },
  success: { border: "rgba(0,232,122,0.35)",  icon: "✓", color: "#00E87A" },
  info:    { border: "rgba(0,201,255,0.35)",  icon: "ℹ", color: "#00C9FF" },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: Listener = (t) => {
      setToasts(p => [...p, t]);
      setTimeout(() => setToasts(p => p.filter(x => x.id !== t.id)), 9000);
    };
    listeners.push(listener);
    return () => { listeners = listeners.filter(l => l !== listener); };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => {
        const s = STYLES[t.type];
        return (
          <div
            key={t.id}
            className="flex items-start gap-3 px-4 py-3 rounded-lg pointer-events-auto"
            style={{
              border: `1px solid ${s.border}`,
              background: "rgba(9,14,28,0.96)",
              backdropFilter: "blur(20px)",
              boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${s.border}`,
              animation: "slideInRight 0.22s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <span className="text-sm shrink-0 mt-0.5 font-bold" style={{ color: s.color }}>{s.icon}</span>
            <p className="font-mono text-xs leading-relaxed flex-1 break-all" style={{ color: "var(--text)" }}>
              {t.message}
            </p>
            <button
              onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}
              className="shrink-0 text-lg leading-none transition-colors"
              style={{ color: "var(--muted)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
            >×</button>
          </div>
        );
      })}
    </div>
  );
}
