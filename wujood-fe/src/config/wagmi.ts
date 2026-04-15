import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { activeChain } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "PSL Tickets",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains: [activeChain],
  ssr: true,
});

export const FACTORY_ADDRESS = (
  process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;
