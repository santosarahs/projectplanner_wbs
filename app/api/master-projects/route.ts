import { NextResponse } from "next/server";
import { latestMasterProjectNames } from "@/lib/dbWbs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await latestMasterProjectNames());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Failed to list Project Master projects:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
