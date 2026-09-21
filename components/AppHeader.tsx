"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function AppHeader({ controls, actions }: { controls?: React.ReactNode; actions?: React.ReactNode }) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setEmail(j.email))
      .catch(() => setEmail(null));
  }, []);

  async function onSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">PM</span>
        <h1>Project Master</h1>
      </div>
      <nav className="modnav" aria-label="Modules">
        <Link href="/" className={pathname === "/" ? "active" : ""}>
          Dashboard
        </Link>
        <Link href="/wbs" className={pathname.startsWith("/wbs") ? "active" : ""}>
          WBS
        </Link>
      </nav>
      {controls && <div className="controls">{controls}</div>}
      <div className="session-bar">
        {email && <span className="session-email mono">{email}</span>}
        {actions}
        <button className="btn" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}
