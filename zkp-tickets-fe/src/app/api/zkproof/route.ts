// app/api/zkproof/route.ts
// Stores AES-GCM encrypted proof blobs.
// Key = sha256(secret) — server cannot decrypt without the QR.

import { NextRequest, NextResponse } from "next/server";

interface StoredEntry {
  encryptedBlob: string; // base64(iv + ciphertext)
  expires: number;
}

const store = new Map<string, StoredEntry>();

function purge() {
  const now = Date.now();
  for (const [k, v] of store) if (v.expires < now) store.delete(k);
}

// POST /api/zkproof  { lookupKey, encryptedBlob }
export async function POST(req: NextRequest) {
  try {
    purge();
    const { lookupKey, encryptedBlob } = await req.json();
    if (!lookupKey || !encryptedBlob) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    store.set(lookupKey, {
      encryptedBlob,
      expires: Date.now() + 30 * 60 * 1000, // 30 min TTL
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// GET /api/zkproof?key=<sha256ofSecret>
export async function GET(req: NextRequest) {
  purge();
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  const entry = store.get(key);
  if (!entry || entry.expires < Date.now()) {
    store.delete(key ?? "");
    return NextResponse.json({ error: "Not found or expired" }, { status: 404 });
  }

  return NextResponse.json({ encryptedBlob: entry.encryptedBlob });
}

// DELETE /api/zkproof?key=<sha256ofSecret>  — called after successful verify
export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key) store.delete(key);
  return NextResponse.json({ ok: true });
}
