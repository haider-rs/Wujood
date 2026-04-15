// ═══════════════════════════════════════════════════════════════════════════════
// ADD THESE TO YOUR EXISTING MATCH_TICKETS_ABI array in config/abis.ts
// ═══════════════════════════════════════════════════════════════════════════════

export const ZKP_ABI_ADDITIONS = [
  // ── setZkVerifier ───────────────────────────────────────────────────────────
  {
    type: "function",
    name: "setZkVerifier",
    inputs: [{ name: "_verifier", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ── buyTicketZK ─────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "buyTicketZK",
    inputs: [
      { name: "commitment",  type: "bytes32" },
      { name: "name",        type: "string"  },
      { name: "cnicHash",    type: "bytes32" },
      { name: "category",    type: "uint8"   },
      { name: "seatLabel",   type: "string"  },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  // ── verifyAndEnter ──────────────────────────────────────────────────────────
  {
    type: "function",
    name: "verifyAndEnter",
    inputs: [
      { name: "_pA",            type: "uint256[2]"    },
      { name: "_pB",            type: "uint256[2][2]" },
      { name: "_pC",            type: "uint256[2]"    },
      { name: "_commitment",    type: "bytes32"       },
      { name: "_nullifierHash", type: "bytes32"       },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ── Read: commitments ───────────────────────────────────────────────────────
  {
    type: "function",
    name: "commitments",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  // ── Read: usedNullifiers ────────────────────────────────────────────────────
  {
    type: "function",
    name: "usedNullifiers",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  // ── Read: zkVerifier ────────────────────────────────────────────────────────
  {
    type: "function",
    name: "zkVerifier",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  // ── Read: zkTicketCount ─────────────────────────────────────────────────────
  {
    type: "function",
    name: "zkTicketCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  // ── Events ──────────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "ZKTicketPurchased",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "seat",       type: "string",  indexed: false },
    ],
  },
  {
    type: "event",
    name: "ZKEntryVerified",
    inputs: [
      { name: "nullifierHash", type: "bytes32", indexed: true },
    ],
  },
] as const;


// ═══════════════════════════════════════════════════════════════════════════════
// REWARDS_POOL_ABI — new contract
// ═══════════════════════════════════════════════════════════════════════════════

export const REWARDS_POOL_ABI = [
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "addMatch",
    inputs: [{ name: "matchAddr", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "drawWinners",
    inputs: [{ name: "seed", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "drawn",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getWinners",
    inputs: [],
    outputs: [{ name: "", type: "address[3]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllBuyers",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRegisteredMatches",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "WinnersDrawn",
    inputs: [
      { name: "winners", type: "address[3]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MatchRegistered",
    inputs: [
      { name: "matchContract", type: "address", indexed: true },
    ],
  },
] as const;
