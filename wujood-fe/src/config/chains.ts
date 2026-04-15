import { defineChain } from "viem";

// ── WireFluid Testnet ─────────────────────────────────────────────────────
// Branding: WireFluid everywhere in the UI.
// Internals: currently pointed at Base Sepolia for local testing.
//
// When the real WireFluid network is live, update these three values only:
//   CHAIN_ID     → from docs.wirefluid.com
//   RPC_URL      → from docs.wirefluid.com
//   EXPLORER_URL → https://wirefluidscan.com
//
// Nothing else in the codebase needs to change.
// ─────────────────────────────────────────────────────────────────────────

const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "92533");
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://evm2.wirefluid.com";
const EXPLORER_URL = process.env.NEXT_PUBLIC_BLOCK_EXPLORER ?? "https://wirefluidscan.com";

export const activeChain = defineChain({
  id: CHAIN_ID,
  name: "WireFluid Testnet",
  nativeCurrency: { decimals: 18, name: "WIRE", symbol: "WIRE" },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "WireFluidScan", url: EXPLORER_URL },
  },
  testnet: true,
});
