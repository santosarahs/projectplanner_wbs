export function getAllowlist(): string[] {
  const raw = process.env.ALLOWED_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string): boolean {
  return getAllowlist().includes(email.trim().toLowerCase());
}
