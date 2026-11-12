"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { apiClient } from "@/lib/api";
import { errorMessage } from "@/lib/error-message";
import { useWebI18n } from "@/lib/web-preferences";

const DEMO_ACCOUNTS = [
  {
    roleKey: "web.login.role.editor",
    email: "demo@nama.local",
    password: "nama-demo-123",
    hintKey: "web.login.hint.editor",
  },
  {
    roleKey: "web.login.role.viewer",
    email: "viewer@nama.local",
    password: "nama-viewer-123",
    hintKey: "web.login.hint.viewer",
  },
] as const;

const [EDITOR_ACCOUNT] = DEMO_ACCOUNTS;

export default function LoginPage() {
  return (
    <AppShell>
      <LoginForm />
    </AppShell>
  );
}

function LoginForm() {
  const router = useRouter();
  const t = useWebI18n();
  const [email, setEmail] = useState<string>(EDITOR_ACCOUNT.email);
  const [password, setPassword] = useState<string>(EDITOR_ACCOUNT.password);
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
      setError(errorMessage(failure, t.translate("web.common.errorFallback")));
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
    <section className="app-card app-login">
      <h1 className="app-title">{t.translate("web.login.title")}</h1>
      <p className="app-subtitle">{t.translate("web.login.description")}</p>

      <form className="app-form" onSubmit={handleSubmit}>
        <label className="app-field">
          <span>{t.translate("web.login.email")}</span>
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
          <span>{t.translate("web.login.password")}</span>
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
          {pending ? t.translate("web.login.pending") : t.translate("web.common.signIn")}
        </button>
      </form>

      <div className="app-stack app-login__accounts">
        <h2 className="app-section-title">{t.translate("web.login.demoAccounts")}</h2>
        {DEMO_ACCOUNTS.map((account, index) => (
          <button
            key={account.email}
            type="button"
            className="app-button app-demo-account"
            onClick={() => fillDemoAccount(index)}
          >
            <span>{t.translate(account.roleKey)}</span>
            <span className="app-muted">
              {account.email} · {t.translate(account.hintKey)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
