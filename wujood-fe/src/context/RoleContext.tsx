"use client";
import { createContext, useContext, useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { TICKET_FACTORY_ABI } from "@/config/abis";
import { FACTORY_ADDRESS } from "@/config/wagmi";

type RoleCtx = { isOwner: boolean; isMod: boolean; isLoading: boolean };
const RoleContext = createContext<RoleCtx>({ isOwner: false, isMod: false, isLoading: true });

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();

  const { data: owner, isLoading: ownerLoading } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: TICKET_FACTORY_ABI,
    functionName: "owner",
    query: { enabled: !!address, staleTime: Infinity, gcTime: Infinity },
  });

  // isMod() on contract returns true for owner AND mods — one call covers both
  const { data: modAccess, isLoading: modLoading } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: TICKET_FACTORY_ABI,
    functionName: "isMod",
    args: address ? [address] : undefined,
    query: { enabled: !!address, staleTime: Infinity, gcTime: Infinity },
  });

  const isOwner = useMemo(() =>
    !!isConnected && !!address && !!owner &&
    address.toLowerCase() === (owner as string).toLowerCase(),
    [isConnected, address, owner]
  );

  // isMod = has mod access but is NOT the owner (owner gets admin portal instead)
  const isMod = useMemo(() =>
    !!isConnected && !!modAccess && !isOwner,
    [isConnected, modAccess, isOwner]
  );

  const isLoading = (!owner && ownerLoading) || (modAccess === undefined && modLoading);

  return (
    <RoleContext.Provider value={useMemo(() => ({ isOwner, isMod, isLoading }), [isOwner, isMod, isLoading])}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);
