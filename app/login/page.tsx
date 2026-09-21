"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "That email isn't on the access list yet. Ask an admin to add it.",
  invalid_token: "That sign-in link is invalid or has expired. Request a new one below.",
  missing_token: "That sign-in link is missing its token. Request a new one below.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const params = useSearchParams();
  const errorCode = params.get("error");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    await fetch("/api/auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setStatus("sent");
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-mark">PM</div>
        <h1>Project Master</h1>
        <p>Sign in with your work email to view the weekly project tracker.</p>

        {errorCode && ERROR_MESSAGES[errorCode] && status !== "sent" && (
          <p className="login-error">{ERROR_MESSAGES[errorCode]}</p>
        )}

        {status === "sent" ? (
          <p className="login-sent">
            If that email is on the access list, a sign-in link is on its way &mdash; check your inbox (and spam
            folder).
          </p>
        ) : (
          <form onSubmit={onSubmit}>
            <input
              id="email"
              type="email"
              required
              placeholder="you@villa.com.mv"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="btn primary" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
