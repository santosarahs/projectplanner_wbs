import { SignJWT, jwtVerify } from "jose";

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET env var is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createMagicLinkToken(email: string): Promise<string> {
  return new SignJWT({ email, purpose: "login" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secretKey());
}

export async function verifyMagicLinkToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secretKey());
  if (payload.purpose !== "login" || typeof payload.email !== "string") {
    throw new Error("Invalid login token");
  }
  return payload.email;
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ email, purpose: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secretKey());
  if (payload.purpose !== "session" || typeof payload.email !== "string") {
    throw new Error("Invalid session token");
  }
  return payload.email;
}
