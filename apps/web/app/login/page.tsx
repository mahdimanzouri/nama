"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { apiClient } from "@/lib/api";
import { errorMessage } from "@/lib/error-message";

const DEMO_ACCOUNTS = [
  {
    role: "Editor",
    email: "demo@nama.local",
    password: "nama-demo-123",
    hint: "create, edit and publish",
  },
  {
    role: "Viewer",
    email: "viewer@nama.local",
    password: "nama-viewer-123",
    hint: "read published dashboards only",
  },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState<string>(DEMO_ACCOUNTS[0].password);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Next preserves this route's state after navigation, so clear the submit
  // flags when the page is hidden; otherwise signing out returns to a form
  // stuck on "Signing in…".
  useEffect(() => {
    return () => {
      setPending(false);
      setError(null);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      await apiClient.login({ email, password });
      router.replace("/dashboards");
    } catch (failure) {
      setError(errorMessage(failure));
      setPending(false);
    }
  }

  function fillDemoAccount(index: number) {
    const account = DEMO_ACCOUNTS[index];
    if (!account) return;
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  return (
    <AppShell>
      <section className="app-card app-login">
        <h1 className="app-title">Sign in</h1>
        <p className="app-subtitle">
          The walking skeleton seeds two accounts in the Nama Demo organization. Data
          resets when the API restarts.
        </p>

        <form className="app-form" onSubmit={handleSubmit}>
          <label className="app-field">
            <span>Email</span>
            <input
              className="app-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="app-field">
            <span>Password</span>
            <input
              className="app-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? (
            <p className="app-notice app-notice--error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="app-button app-button--primary"
            disabled={pending}
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="app-stack app-login__accounts">
          <h2 className="app-section-title">Demo accounts</h2>
          {DEMO_ACCOUNTS.map((account, index) => (
            <button
              key={account.email}
              type="button"
              className="app-button app-demo-account"
              onClick={() => fillDemoAccount(index)}
            >
              <span>{account.role}</span>
              <span className="app-muted">
                {account.email} · {account.hint}
              </span>
            </button>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
