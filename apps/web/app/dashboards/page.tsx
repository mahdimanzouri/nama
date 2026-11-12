"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DashboardList, DashboardSummary, SessionPayload } from "@nama/api-client";

import { WorkspaceGate } from "@/components/workspace-gate";
import { apiClient } from "@/lib/api";
import { errorMessage } from "@/lib/error-message";

export default function DashboardsPage() {
  return (
    <WorkspaceGate>{(session) => <DashboardListPage session={session} />}</WorkspaceGate>
  );
}

function DashboardListPage({ session }: { session: SessionPayload }) {
  const router = useRouter();
  const [list, setList] = useState<DashboardList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const canCreate = session.permissions.includes("dashboard.create");
  const canEdit = session.permissions.includes("dashboard.update");

  useEffect(() => {
    const controller = new AbortController();

    apiClient.listDashboards({ signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) setList(result);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      },
    );

    return () => controller.abort();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = name.trim();

    if (!title || creating) return;

    setCreating(true);
    setError(null);

    try {
      const view = await apiClient.createDashboard({ name: title });
      router.push(`/dashboards/${view.id}`);
    } catch (failure) {
      setError(errorMessage(failure));
      setCreating(false);
    }
  }

  return (
    <div className="app-stack">
      <header>
        <h1 className="app-title">Dashboards</h1>
        <p className="app-subtitle">
          {session.organization.name} · signed in as {session.user.displayName} (
          {session.role})
        </p>
      </header>

      {error ? (
        <div className="app-notice app-notice--error" role="alert">
          {error}
        </div>
      ) : null}

      {canCreate ? (
        <form className="app-card app-row app-create" onSubmit={handleCreate}>
          <label className="app-field">
            <span>New dashboard name</span>
            <input
              className="app-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              required
              placeholder="Operations overview"
            />
          </label>
          <button
            type="submit"
            className="app-button app-button--primary"
            disabled={creating}
          >
            {creating ? "Creating…" : "Create dashboard"}
          </button>
        </form>
      ) : (
        <p className="app-muted">
          Your role can view published dashboards but cannot create new ones.
        </p>
      )}

      {list === null && error === null ? (
        <p className="app-muted">Loading dashboards…</p>
      ) : null}

      {list && list.items.length === 0 ? (
        <p className="app-muted">No dashboards in this organization yet.</p>
      ) : null}

      {list && list.items.length > 0 ? (
        <ul className="app-list">
          {list.items.map((item) => (
            <DashboardRow key={item.id} item={item} canEdit={canEdit} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DashboardRow({ item, canEdit }: { item: DashboardSummary; canEdit: boolean }) {
  const meta = canEdit
    ? `Revision ${item.revision} · updated ${new Date(item.updatedAt).toLocaleString()} · ${
        item.publishedAt ? "published" : "draft only"
      }`
    : item.publishedAt
      ? `Published revision ${item.publishedRevision ?? "—"} · ${new Date(
          item.publishedAt,
        ).toLocaleString()}`
      : "Not published yet";

  return (
    <li className="app-list-item">
      <div className="app-list-item__body">
        <span className="app-list-item__title">{item.name}</span>
        <span className="app-muted">{meta}</span>
      </div>
      <span
        className={
          item.publishedAt ? "app-badge app-badge--ok" : "app-badge app-badge--warn"
        }
      >
        {item.publishedAt ? "Published" : "Draft"}
      </span>
      <div className="app-row">
        <Link className="app-button" href={`/dashboards/${item.id}/view`}>
          View
        </Link>
        {canEdit ? (
          <Link className="app-button" href={`/dashboards/${item.id}`}>
            Edit
          </Link>
        ) : null}
      </div>
    </li>
  );
}
