import { NextResponse } from "next/server";
import { getAllWeeks } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getAllWeeks();
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Failed to load weekly reports:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
