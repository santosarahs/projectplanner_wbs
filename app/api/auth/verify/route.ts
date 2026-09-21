import { NextRequest, NextResponse } from "next/server";
import { verifyMagicLinkToken, createSessionToken } from "@/lib/auth";
import { isAllowed } from "@/lib/allowlist";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", req.url));
  }

  try {
    const email = await verifyMagicLinkToken(token);
    if (!isAllowed(email)) {
      return NextResponse.redirect(new URL("/login?error=not_allowed", req.url));
    }
    const session = await createSessionToken(email);
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set("session", session, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?error=invalid_token", req.url));
  }
}
