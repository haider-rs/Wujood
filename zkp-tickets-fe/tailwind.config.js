/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:      "#03080F",
        surface: "#080F1A",
        card:    "#0C1525",
        border:  "#132240",
        "border-bright": "#1E3A6A",
        green:   "#00E87A",
        "green-dim": "#00A855",
        blue:    "#0EA5E9",
        gold:    "#F5A623",
        red:     "#FF3B5C",
        muted:   "#4A6080",
        dim:     "#1A3050",
      },
      fontFamily: {
        display: ["'Orbitron'", "monospace"],
        body:    ["'Rajdhani'", "sans-serif"],
        mono:    ["'JetBrains Mono'", "monospace"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(0,232,122,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,232,122,0.03) 1px, transparent 1px)",
        "radial-green":
          "radial-gradient(ellipse at 50% 0%, rgba(0,232,122,0.12) 0%, transparent 70%)",
        "radial-blue":
          "radial-gradient(ellipse at 100% 100%, rgba(14,165,233,0.10) 0%, transparent 60%)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      animation: {
        "pulse-green": "pulseGreen 2s ease-in-out infinite",
        "scan-line": "scanLine 3s linear infinite",
        "fade-in": "fadeIn 0.4s ease forwards",
        "slide-up": "slideUp 0.5s ease forwards",
        glow: "glowPulse 2s ease-in-out infinite",
      },
      keyframes: {
        pulseGreen: {
          "0%, 100%": { boxShadow: "0 0 8px rgba(0,232,122,0.4)" },
          "50%":      { boxShadow: "0 0 24px rgba(0,232,122,0.8)" },
        },
        scanLine: {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        glowPulse: {
          "0%, 100%": { textShadow: "0 0 8px rgba(0,232,122,0.6)" },
          "50%":      { textShadow: "0 0 20px rgba(0,232,122,1)" },
        },
      },
    },
  },
  plugins: [],
};
