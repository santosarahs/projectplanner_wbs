import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return NextResponse.json({ email: null });
  try {
    const email = await verifySessionToken(token);
    return NextResponse.json({ email });
  } catch {
    return NextResponse.json({ email: null });
  }
}
