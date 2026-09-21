import { NextRequest, NextResponse } from "next/server";
import { parseWorkbook } from "@/lib/parseWorkbook";
import { replaceAllWeeks } from "@/lib/db";
import { verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  let uploadedBy: string | null = null;
  try {
    uploadedBy = token ? await verifySessionToken(token) : null;
  } catch {
    uploadedBy = null;
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "Please upload the .xlsx workbook" }, { status: 400 });
  }

  const buf = await file.arrayBuffer();

  let parsed;
  try {
    parsed = parseWorkbook(buf);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Could not read this workbook: ${message}` }, { status: 400 });
  }

  if (parsed.sheetOrder.length === 0) {
    return NextResponse.json({ error: "No weekly report sheets were found in this file" }, { status: 400 });
  }

  await replaceAllWeeks(parsed, uploadedBy);

  return NextResponse.json({ ok: true, weeks: parsed.sheetOrder.length });
}
