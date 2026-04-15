"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onScan: (data: string) => void;
  active: boolean;
}

export function QRScanner({ onScan, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef   = useRef<InstanceType<typeof import("html5-qrcode").Html5Qrcode> | null>(null);
  const [error, setError] = useState<string>("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!active) return;
    let mounted = true;

    async function startScanner() {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!containerRef.current || !mounted) return;

      const scanner = new Html5Qrcode("qr-scanner-container");
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            if (mounted) onScan(decodedText);
          },
          undefined
        );
        if (mounted) setStarted(true);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Camera access denied");
      }
    }

    startScanner();

    return () => {
      mounted = false;
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 rounded border border-red/30 bg-red/5">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FF3B5C" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="font-display text-xs text-red tracking-widest">CAMERA ERROR</p>
        <p className="font-body text-sm text-muted text-center">{error}</p>
        <p className="font-body text-xs text-muted text-center">
          Ensure camera permissions are granted in your browser settings.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Scanner container */}
      <div
        id="qr-scanner-container"
        ref={containerRef}
        className="w-full rounded overflow-hidden"
        style={{ minHeight: 300 }}
      />

      {/* Scan overlay — corner brackets */}
      {started && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative w-60 h-60">
            {/* Top-left */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-green" />
            {/* Top-right */}
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-green" />
            {/* Bottom-left */}
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-green" />
            {/* Bottom-right */}
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-green" />
            {/* Scan line */}
            <div className="absolute left-2 right-2 h-0.5 bg-green/60 animate-scan-line" style={{ boxShadow: "0 0 8px #00E87A" }} />
          </div>
        </div>
      )}

      {/* Loading state */}
      {!started && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface rounded">
          <div className="spinner" style={{ width: 32, height: 32 }} />
          <p className="font-display text-xs text-green tracking-widest animate-pulse">
            INITIALIZING CAMERA…
          </p>
        </div>
      )}
    </div>
  );
}
