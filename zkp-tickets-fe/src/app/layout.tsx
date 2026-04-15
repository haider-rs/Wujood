import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/Navbar";
import { RoleProvider } from "@/context/RoleContext";
import { ToastContainer } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Wujood · PSL · WireFluid",
  description: "Privacy-preserving PSL event tickets on WireFluid Testnet — powered by Groth16 ZK proofs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg min-h-screen">
        <Providers>
          <RoleProvider>
            {/* ── Dot-grid background ── */}
            <div className="fixed inset-0 bg-grid pointer-events-none" />

            {/* ── Ambient light: top-center violet ── */}
            <div
              className="fixed pointer-events-none"
              style={{
                top: "-120px",
                left: "50%",
                transform: "translateX(-50%)",
                width: "900px",
                height: "500px",
                background: "radial-gradient(ellipse at 50% 0%, rgba(124,92,252,0.14) 0%, transparent 65%)",
              }}
            />

            {/* ── Ambient light: bottom-right cyan ── */}
            <div
              className="fixed pointer-events-none"
              style={{
                bottom: 0,
                right: 0,
                width: "600px",
                height: "420px",
                background: "radial-gradient(ellipse at 100% 100%, rgba(0,201,255,0.08) 0%, transparent 65%)",
              }}
            />

            <Navbar />
            <ToastContainer />

            <main className="relative z-10 pt-20 min-h-screen">
              {children}
            </main>
          </RoleProvider>
        </Providers>
      </body>
    </html>
  );
}
