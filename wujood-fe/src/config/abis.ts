// src/config/abis.ts

export const TICKET_FACTORY_ABI = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },

  // ── Events ───────────────────────────────────────────────────────────────
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "matchContract",  type: "address" },
      { indexed: false, name: "name",            type: "string"  },
      { indexed: false, name: "venue",           type: "string"  },
      { indexed: false, name: "generalPrice",    type: "uint256" },
      { indexed: false, name: "enclosurePrice",  type: "uint256" },
      { indexed: false, name: "vipPrice",        type: "uint256" },
      { indexed: false, name: "totalTickets",    type: "uint256" },
    ],
    name: "MatchCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "matchContract", type: "address" },
      { indexed: false, name: "active",         type: "bool"    },
    ],
    name: "MatchToggled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: "mod", type: "address" }],
    name: "ModAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: "mod", type: "address" }],
    name: "ModRemoved",
    type: "event",
  },

  // ── Match management ─────────────────────────────────────────────────────
  {
    inputs: [
      { name: "_name",           type: "string"  },
      { name: "_venue",          type: "string"  },
      { name: "_dateString",     type: "string"  },
      { name: "_totalTickets",   type: "uint256" },
      { name: "_generalPrice",   type: "uint256" },
      { name: "_enclosurePrice", type: "uint256" },
      { name: "_vipPrice",       type: "uint256" },
    ],
    name: "createMatch",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "matchAddr", type: "address" }],
    name: "toggleMatchActive",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getAllMatches",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "matchAddr", type: "address" }],
    name: "getMatchInfo",
    outputs: [
      {
        components: [
          { name: "name",           type: "string"  },
          { name: "venue",          type: "string"  },
          { name: "dateString",     type: "string"  },
          { name: "totalTickets",   type: "uint256" },
          { name: "generalPrice",   type: "uint256" },
          { name: "enclosurePrice", type: "uint256" },
          { name: "vipPrice",       type: "uint256" },
          { name: "contractAddr",   type: "address" },
          { name: "active",         type: "bool"    },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getMatchCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },

  // ── Mod management ────────────────────────────────────────────────────────
  {
    inputs: [{ name: "mod", type: "address" }],
    name: "addMod",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "mod", type: "address" }],
    name: "removeMod",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getMods",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "addr", type: "address" }],
    name: "isMod",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },

  // ── Public state ─────────────────────────────────────────────────────────
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "matchAddresses",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  // ── ZK / RewardsPool reads ────────────────────────────────────────────────
  {
    inputs: [],
    name: "zkVerifier",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "rewardsPool",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────

export const MATCH_TICKETS_ABI = [
  // ── Events ───────────────────────────────────────────────────────────────
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "ticketId",   type: "uint256" },
      { indexed: true,  name: "buyer",       type: "address" },
      { indexed: false, name: "holderName",  type: "string"  },
      { indexed: false, name: "category",    type: "uint8"   },
      { indexed: false, name: "seat",        type: "string"  },
    ],
    name: "TicketPurchased",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: "ticketId", type: "uint256" }],
    name: "TicketUsed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, name: "category", type: "uint8"   },
      { indexed: false, name: "price",    type: "uint256" },
    ],
    name: "CategoryPriceUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "to",     type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
    name: "FundsWithdrawn",
    type: "event",
  },
  // ── ZKP Events ───────────────────────────────────────────────────────────
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "commitment", type: "bytes32" },
      { indexed: false, name: "seat",       type: "string"  },
    ],
    name: "ZKTicketPurchased",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "nullifierHash", type: "bytes32" },
    ],
    name: "ZKEntryVerified",
    type: "event",
  },

  // ── Purchasing ────────────────────────────────────────────────────────────
  {
    inputs: [
      { name: "names",      type: "string[]"  },
      { name: "cnicHashes", type: "bytes32[]" },
      { name: "categories", type: "uint8[]"   },
      { name: "seatLabels", type: "string[]"  },
    ],
    name: "buyTickets",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  // ── ZKP Purchasing ────────────────────────────────────────────────────────
  {
    inputs: [
      { name: "commitment", type: "bytes32" },
      { name: "name",       type: "string"  },
      { name: "cnicHash",   type: "bytes32" },
      { name: "category",   type: "uint8"   },
      { name: "seatLabel",  type: "string"  },
    ],
    name: "buyTicketZK",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },

  // ── Entry ─────────────────────────────────────────────────────────────────
  {
    inputs: [{ name: "ticketId", type: "uint256" }],
    name: "useTicket",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // ── ZKP Entry ─────────────────────────────────────────────────────────────
  {
    inputs: [
      { name: "_pA",            type: "uint256[2]"    },
      { name: "_pB",            type: "uint256[2][2]" },
      { name: "_pC",            type: "uint256[2]"    },
      { name: "_commitment",    type: "bytes32"       },
      { name: "_nullifierHash", type: "bytes32"       },
    ],
    name: "verifyAndEnter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  {
    inputs: [],
    name: "withdrawFunds",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "category", type: "uint8"   },
      { name: "price",    type: "uint256" },
    ],
    name: "setCategoryPrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "_verifier", type: "address" }],
    name: "setZkVerifier",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ── Views ─────────────────────────────────────────────────────────────────
  {
    inputs: [{ name: "buyer", type: "address" }],
    name: "getPurchaserTickets",
    outputs: [
      {
        components: [
          { name: "id",          type: "uint256" },
          { name: "buyer",       type: "address" },
          { name: "holderName",  type: "string"  },
          { name: "cnicHash",    type: "bytes32" },
          { name: "category",    type: "uint8"   },
          { name: "seat",        type: "string"  },
          { name: "used",        type: "bool"    },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "tickets",
    outputs: [
      { name: "id",          type: "uint256" },
      { name: "buyer",       type: "address" },
      { name: "holderName",  type: "string"  },
      { name: "cnicHash",    type: "bytes32" },
      { name: "category",    type: "uint8"   },
      { name: "seat",        type: "string"  },
      { name: "used",        type: "bool"    },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "category", type: "uint8" }],
    name: "getCategoryPrice",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getAllPrices",
    outputs: [
      { name: "general",   type: "uint256" },
      { name: "enclosure", type: "uint256" },
      { name: "vip",       type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "seatLabel", type: "string" }],
    name: "isSeatTaken",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "seatLabels", type: "string[]" }],
    name: "getSeatsStatus",
    outputs: [{ name: "", type: "bool[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "ticketsRemaining",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // ── ZKP Views ─────────────────────────────────────────────────────────────
  {
    inputs: [{ name: "", type: "bytes32" }],
    name: "commitments",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "bytes32" }],
    name: "usedNullifiers",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "zkVerifier",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "zkTicketCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },

  // ── Public state ─────────────────────────────────────────────────────────
  {
    inputs: [],
    name: "matchName",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "venue",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "dateString",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalTickets",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "ticketsSold",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────

export const REWARDS_POOL_ABI = [
  // ── Public state (view) ───────────────────────────────────────────────────
  {
    inputs: [],
    name: "admin",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "factory",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "drawn",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // ── Commit-reveal state ───────────────────────────────────────────────────
  {
    inputs: [],
    name: "pendingCommit",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "commitBlock",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "snapshotTaken",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "COMMIT_DELAY",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // ── Views ─────────────────────────────────────────────────────────────────
  {
    inputs: [],
    name: "getWinners",
    outputs: [{ name: "", type: "address[3]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getAllBuyers",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getRegisteredMatches",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getSnapshotSize",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPool",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  // ── Admin — 3-step draw ───────────────────────────────────────────────────
  {
    inputs: [{ name: "_hash", type: "bytes32" }],
    name: "commitDraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "takeSnapshot",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "seed", type: "uint256" }],
    name: "drawWinners",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // ── Factory-only ──────────────────────────────────────────────────────────
  {
    inputs: [{ name: "matchAddr", type: "address" }],
    name: "addMatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // ── Events ────────────────────────────────────────────────────────────────
  {
    anonymous: false,
    inputs: [{ indexed: false, name: "winners", type: "address[3]" }],
    name: "WinnersDrawn",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: "matchContract", type: "address" }],
    name: "MatchRegistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: "commitHash", type: "bytes32" },
      { indexed: false, name: "atBlock",    type: "uint256" },
    ],
    name: "DrawCommitted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: false, name: "poolSize", type: "uint256" }],
    name: "SnapshotTaken",
    type: "event",
  },
] as const;
