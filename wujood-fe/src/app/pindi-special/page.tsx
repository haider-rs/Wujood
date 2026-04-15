"use client";

export default function PindiWinsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 text-center">

      {/* Badge */}
      <div
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6"
        style={{ borderColor: "rgba(245,166,35,0.30)", background: "rgba(245,166,35,0.06)" }}
      >
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "#F5A623", boxShadow: "0 0 6px rgba(245,166,35,0.9)", animation: "pulseGlow 2.2s ease-in-out infinite" }}
        />
        <span className="font-condensed text-xs tracking-[0.2em]" style={{ color: "#F5A623" }}>
          SPECIAL DRAW · RAWALPINDI
        </span>
      </div>

      {/* Coming Soon */}
      <p className="font-display font-black text-3xl sm:text-4xl tracking-widest text-white mb-8">
        COMING SOON
      </p>

      {/* Description */}
      <p className="font-body text-base max-w-lg mx-auto" style={{ color: "var(--muted)" }}>
        Every ticket holder for Rawalpindi matches enters the draw automatically.
        <br />
        10 lucky fans win exclusive prizes.
      </p>

    </div>
  );
}
