import { NextRequest, NextResponse } from "next/server";
import { parseWbs } from "@/lib/parseWbs";
import { listWbs, upsertWbs } from "@/lib/dbWbs";
import { sessionEmail } from "@/lib/auth";
import { summarize } from "@/lib/wbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const rows = await listWbs();
    return NextResponse.json(rows.map(summarize));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Failed to list WBS projects:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "Please upload the WBS as an .xlsx file" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseWbs(await file.arrayBuffer(), file.name);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const { replaced } = await upsertWbs({
      slug: parsed.slug,
      data: parsed.data,
      sourceFile: file.name,
      updatedBy: await sessionEmail(req),
    });
    return NextResponse.json({
      ok: true,
      slug: parsed.slug,
      title: parsed.data.title,
      tasks: parsed.data.tasks.length,
      units: parsed.data.units.length,
      replaced,
      ignoredCodes: parsed.ignoredCodes,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Failed to save WBS:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
