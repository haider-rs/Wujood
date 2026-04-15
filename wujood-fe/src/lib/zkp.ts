// lib/zkp.ts

// ── Primitives ────────────────────────────────────────────────────────────────

export function randomBigInt31(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(31));
  return BigInt("0x" + [...bytes].map(b => b.toString(16).padStart(2, "0")).join(""));
}

export function bigintToBytes32(n: bigint): `0x${string}` {
  return `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
}

// ── Poseidon ──────────────────────────────────────────────────────────────────

export async function computeCommitment(secret: bigint, nullifier: bigint): Promise<bigint> {
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  return poseidon.F.toObject(poseidon([secret, nullifier]));
}

export async function computeNullifierHash(nullifier: bigint): Promise<bigint> {
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  return poseidon.F.toObject(poseidon([nullifier, nullifier]));
}

// ── Proof generation ──────────────────────────────────────────────────────────

export async function generateProof(secret: bigint, nullifier: bigint) {
  // @ts-ignore
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    { secret: secret.toString(), nullifier: nullifier.toString() },
    "/circuits/ticket_verify.wasm",
    "/circuits/ticket_verify_final.zkey"
  );
  return { proof, publicSignals };
}

// ── Proof → calldata ──────────────────────────────────────────────────────────

export function proofToCalldata(proof: any) {
  return {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])] as [bigint, bigint],
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ] as [[bigint, bigint], [bigint, bigint]],
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])] as [bigint, bigint],
  };
}

// Compact hex: 8 BN254 field elements, pre-swapped for calldata
export function proofToHex(proof: any): string {
  const fe = (n: string) => BigInt(n).toString(16).padStart(64, "0");
  return (
    fe(proof.pi_a[0]) + fe(proof.pi_a[1]) +
    fe(proof.pi_b[0][1]) + fe(proof.pi_b[0][0]) +
    fe(proof.pi_b[1][1]) + fe(proof.pi_b[1][0]) +
    fe(proof.pi_c[0]) + fe(proof.pi_c[1])
  );
}

export function proofFromHex(hex: string) {
  if (hex.length !== 512) throw new Error("Invalid proof hex length");
  const chunk = (i: number): bigint => BigInt("0x" + hex.slice(i * 64, (i + 1) * 64));
  return {
    pA: [chunk(0), chunk(1)] as [bigint, bigint],
    pB: [[chunk(2), chunk(3)], [chunk(4), chunk(5)]] as [[bigint, bigint], [bigint, bigint]],
    pC: [chunk(6), chunk(7)] as [bigint, bigint],
  };
}

// ── Encrypted QR helpers ──────────────────────────────────────────────────────
//
// QR content: "zkkey:<secretHex>"  (~70 chars → tiny QR)
// Server stores AES-GCM encrypted proof blob, keyed by sha256(secret)
// Without the physical QR, the server blob is undecipherable.

export interface ZKProofPayload {
  matchAddr: string;
  commitment: string;
  nullifierHash: string;
  proofHex: string; // 512 hex chars
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a random 32-byte secret, returned as hex */
export function generateQRSecret(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** Derive AES-GCM CryptoKey from 32-byte hex secret */
async function deriveKey(secretHex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", hexToBytes(secretHex),
    { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
  );
}

/** Encrypt proof payload with secret. Returns base64(iv + ciphertext) */
export async function encryptProof(payload: ZKProofPayload, secretHex: string): Promise<string> {
  const key = await deriveKey(secretHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...combined));
}

/** Decrypt proof payload using secret from QR */
export async function decryptProof(encryptedB64: string, secretHex: string): Promise<ZKProofPayload> {
  const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const key = await deriveKey(secretHex);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    key,
    combined.slice(12)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

/** sha256(secretHex) as hex — used as server-side lookup key (server never sees secret) */
export async function secretToLookupKey(secretHex: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", hexToBytes(secretHex));
  return bytesToHex(new Uint8Array(hash));
}

/** Encode secret into QR string */
export function encodeSecretQR(secretHex: string): string {
  return `zkkey:${secretHex}`;
}

/** Check if a QR string is an encrypted ZK key */
export function isZKKeyQR(data: string): boolean {
  return data.startsWith("zkkey:");
}

/** Extract secret hex from QR string */
export function decodeSecretQR(data: string): string {
  if (!data.startsWith("zkkey:")) throw new Error("Not a ZK key QR");
  return data.slice(6);
}

// ── Legacy ────────────────────────────────────────────────────────────────────

export function isZKPQR(data: string): boolean {
  return data.startsWith("zkkey:") || data.startsWith("zkp:");
}

export function encodeZKQR(matchAddr: string, commitment: string, nullifierHash: string, _proof?: any): string {
  return `zkp:${matchAddr}:${commitment}:${nullifierHash}`;
}

// ── localStorage helpers ──────────────────────────────────────────────────────

export interface ZKTicketData {
  secret: string;
  nullifier: string;
  commitment: string;
  nullifierHash: string;
  seatLabel: string;
  matchAddr: string;
  matchName?: string;
  purchasedAt: number;
}

export function saveZKTicket(commitment: string, data: ZKTicketData) {
  localStorage.setItem(`zkticket_${commitment}`, JSON.stringify(data));
}

export function loadZKTicket(commitment: string): ZKTicketData | null {
  try {
    const raw = localStorage.getItem(`zkticket_${commitment}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function listZKTickets(matchAddr?: string): ZKTicketData[] {
  const tickets: ZKTicketData[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("zkticket_")) continue;
    try {
      const t: ZKTicketData = JSON.parse(localStorage.getItem(key)!);
      if (!matchAddr || t.matchAddr.toLowerCase() === matchAddr.toLowerCase()) tickets.push(t);
    } catch { /* skip */ }
  }
  return tickets;
}
