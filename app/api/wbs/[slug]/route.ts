import { NextRequest, NextResponse } from "next/server";
import { deleteWbs, getWbs, setCellStatus, setMasterProject } from "@/lib/dbWbs";
import { sessionEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

function fail(e: unknown, what: string) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`Failed to ${what}:`, e);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  try {
    const row = await getWbs(slug);
    if (!row) return NextResponse.json({ error: "WBS not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    return fail(e, "load WBS");
  }
}

// Two kinds of edit: link to a Project Master row, or change one unit's status.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    if ("masterProject" in body) {
      const value = body.masterProject;
      if (value !== null && typeof value !== "string") {
        return NextResponse.json({ error: "masterProject must be text or null" }, { status: 400 });
      }
      const ok = await setMasterProject(slug, value && value.trim() ? value.trim() : null);
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "WBS not found" }, { status: 404 });
    }

    const { taskIndex, taskId, unitIndex, status } = body;
    const validIndex = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
    if (!validIndex(taskIndex) || !validIndex(unitIndex) || typeof taskId !== "string") {
      return NextResponse.json({ error: "taskIndex, taskId and unitIndex are required" }, { status: 400 });
    }
    if (status !== null && status !== "C" && status !== "NR") {
      return NextResponse.json({ error: 'status must be "C", "NR" or null' }, { status: 400 });
    }

    const ok = await setCellStatus({
      slug,
      taskIndex,
      taskId,
      unitIndex,
      status,
      updatedBy: await sessionEmail(req),
    });
    if (!ok) {
      return NextResponse.json(
        { error: "That task changed since you opened this page. Reload and try again." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "update WBS");
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  try {
    const ok = await deleteWbs(slug);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "WBS not found" }, { status: 404 });
  } catch (e) {
    return fail(e, "delete WBS");
  }
}
