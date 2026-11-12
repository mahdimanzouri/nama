"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DashboardList, DashboardSummary, SessionPayload } from "@nama/api-client";

import { WorkspaceGate } from "@/components/workspace-gate";
import { apiClient } from "@/lib/api";
import { errorMessage } from "@/lib/error-message";
import { templateLabels } from "@/lib/i18n";
import { findTemplate } from "@/lib/templates";
import { useWebI18n } from "@/lib/web-preferences";

export default function DashboardsPage() {
  return (
    <WorkspaceGate>{(session) => <DashboardListPage session={session} />}</WorkspaceGate>
  );
}

function DashboardListPage({ session }: { session: SessionPayload }) {
  const router = useRouter();
  const t = useWebI18n();
  const [list, setList] = useState<DashboardList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [creating, setCreating] = useState(false);

  const canCreate = session.permissions.includes("dashboard.create");
  const canEdit = session.permissions.includes("dashboard.update");
  const templates = templateLabels(t);
  const selectedTemplate = templates.find((template) => template.id === templateId);

  useEffect(() => {
    const controller = new AbortController();

    apiClient.listDashboards({ signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) setList(result);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(failure, t.translate("web.common.errorFallback")));
        }
      },
    );

    return () => controller.abort();
  }, [t]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = name.trim();

    if (!title || creating) return;

    setCreating(true);
    setError(null);

    try {
      const template = templateId ? findTemplate(templateId) : undefined;
      const view = await apiClient.createDashboard(
        template ? { name: title, config: template.create(title) } : { name: title },
      );
      router.push(`/dashboards/${view.id}`);
    } catch (failure) {
      setError(errorMessage(failure, t.translate("web.common.errorFallback")));
      setCreating(false);
    }
  }

  return (
    <div className="app-stack">
      <header>
        <h1 className="app-title">{t.translate("web.dashboards.title")}</h1>
        <p className="app-subtitle">
          {session.organization.name} ·{" "}
          {t.translate("web.dashboards.signedInAs", {
            name: session.user.displayName,
            role: session.role,
          })}
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
            <span>{t.translate("web.dashboards.newName")}</span>
            <input
              className="app-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              required
              placeholder={t.translate("web.dashboards.namePlaceholder")}
            />
          </label>
          <label className="app-field">
            <span>{t.translate("web.dashboards.template")}</span>
            <select
              className="app-input"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              <option value="">{t.translate("web.dashboards.blankTemplate")}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {selectedTemplate ? <span>{selectedTemplate.description}</span> : null}
          </label>
          <button
            type="submit"
            className="app-button app-button--primary"
            disabled={creating}
          >
            {creating
              ? t.translate("web.dashboards.creating")
              : t.translate("web.dashboards.create")}
          </button>
        </form>
      ) : (
        <p className="app-muted">{t.translate("web.dashboards.cannotCreate")}</p>
      )}

      {list === null && error === null ? (
        <p className="app-muted">{t.translate("web.dashboards.loading")}</p>
      ) : null}

      {list && list.items.length === 0 ? (
        <p className="app-muted">{t.translate("web.dashboards.empty")}</p>
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
  const t = useWebI18n();
  const timeFormat = { dateStyle: "medium", timeStyle: "short" } as const;

  const meta = canEdit
    ? t.translate("web.dashboards.meta.editor", {
        revision: t.formatNumber(item.revision),
        time: t.formatDate(item.updatedAt, timeFormat),
        state: t.translate(
          item.publishedAt
            ? "web.dashboards.state.published"
            : "web.dashboards.state.draftOnly",
        ),
      })
    : item.publishedAt
      ? t.translate("web.dashboards.meta.viewer", {
          revision: t.formatNumber(item.publishedRevision ?? item.revision),
          time: t.formatDate(item.publishedAt, timeFormat),
        })
      : t.translate("web.dashboards.meta.unpublished");

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
        {t.translate(
          item.publishedAt
            ? "web.dashboards.badge.published"
            : "web.dashboards.badge.draft",
        )}
      </span>
      <div className="app-row">
        <Link className="app-button" href={`/dashboards/${item.id}/view`}>
          {t.translate("web.dashboards.view")}
        </Link>
        {canEdit ? (
          <Link className="app-button" href={`/dashboards/${item.id}`}>
            {t.translate("web.dashboards.edit")}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
