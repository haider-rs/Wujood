// app/api/zkproof/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const TTL = 30 * 60; // 30 min in seconds

// POST /api/zkproof  { lookupKey, encryptedBlob }
export async function POST(req: NextRequest) {
  try {
    const { lookupKey, encryptedBlob } = await req.json();
    if (!lookupKey || !encryptedBlob) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    await redis.set(lookupKey, encryptedBlob, { ex: TTL });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// GET /api/zkproof?key=<sha256ofSecret>
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  const blob = await redis.get<string>(key);
  if (!blob) {
    return NextResponse.json({ error: "Not found or expired" }, { status: 404 });
  }
  return NextResponse.json({ encryptedBlob: blob });
}

// DELETE /api/zkproof?key=<sha256ofSecret>
export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key) await redis.del(key);
  return NextResponse.json({ ok: true });
}
