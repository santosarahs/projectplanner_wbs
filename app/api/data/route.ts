import { NextResponse } from "next/server";
import { getAllWeeks } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getAllWeeks();
  return NextResponse.json(data);
}
