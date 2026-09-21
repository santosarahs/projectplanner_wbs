import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { isAllowed } from "@/lib/allowlist";
import { createMagicLinkToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let email: unknown;
  try {
    ({ email } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();

  // Always respond the same way whether or not the address is on the
  // allowlist, so this endpoint can't be used to enumerate valid emails.
  if (isAllowed(normalized)) {
    const token = await createMagicLinkToken(normalized);
    const base = process.env.BASE_URL || `${req.nextUrl.protocol}//${req.headers.get("host")}`;
    const link = `${base}/api/auth/verify?token=${encodeURIComponent(token)}`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "Project Master <onboarding@resend.dev>",
      to: normalized,
      subject: "Sign in to Project Master",
      html: `
        <p>Click below to sign in to Project Master. This link expires in 15 minutes.</p>
        <p><a href="${link}">Sign in to Project Master</a></p>
        <p style="color:#888;font-size:12px;">If you didn't request this, you can ignore this email.</p>
      `,
    });
  }

  return NextResponse.json({ ok: true });
}
