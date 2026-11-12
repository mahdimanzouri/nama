import { z } from "zod";
import {
  defineWidget,
  type WidgetRenderProps,
  type WidgetSettingsProps,
} from "@nama/dashboard-core";
import type { DashboardI18n } from "@nama/dashboard-core";

import { useDashboardLocale } from "../hooks";
import { TruncatedNote, WidgetStateMessage } from "./common";
import { NumberField } from "./settings-controls";

export const tableConfigSchema = z
  .object({
    maxRows: z.number().int().min(1).max(100).default(25),
  })
  .strict();

export type TableConfig = z.infer<typeof tableConfigSchema>;

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/u;

function formatCell(locale: DashboardI18n, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return locale.formatNumber(value, { maximumFractionDigits: 2 });
  }
  if (typeof value === "string" && ISO_TIMESTAMP.test(value)) {
    return locale.formatDate(value, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return String(value);
}

function TableWidget({ widget, config, data, locale }: WidgetRenderProps<TableConfig>) {
  if (data.status === "idle" || data.status === "loading") {
    return <WidgetStateMessage>{locale.translate("widget.loading")}</WidgetStateMessage>;
  }

  if (data.status === "error") {
    return (
      <WidgetStateMessage tone="alert">
        {locale.translate("widget.error")}
      </WidgetStateMessage>
    );
  }

  const columns = data.result.columns;
  const rows = data.result.rows.slice(0, config.maxRows);

  if (columns.length === 0 || rows.length === 0) {
    return <WidgetStateMessage>{locale.translate("widget.empty")}</WidgetStateMessage>;
  }

  return (
    <div className="nama-chart-frame">
      <div className="nama-table-wrap" tabIndex={0}>
        <table className="nama-table" aria-label={widget.title}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.name} scope="col">
                  {column.label ?? column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.name}>{formatCell(locale, row[column.name])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.truncated ? <TruncatedNote locale={locale} /> : null}
    </div>
  );
}

function TableSettings({ config, onChange, disabled }: WidgetSettingsProps<TableConfig>) {
  const translate = useDashboardLocale().translate;

  return (
    <div className="nama-settings__stack">
      <NumberField
        label={translate("widgets.settings.maxRows")}
        value={config.maxRows}
        min={1}
        max={100}
        disabled={disabled}
        onCommit={(maxRows) => onChange({ ...config, maxRows })}
      />
    </div>
  );
}

export const tableWidget = defineWidget({
  manifest: { id: "table", version: "0.2.0", name: "Table" },
  configVersion: 1,
  configSchema: tableConfigSchema,
  defaultConfig: { maxRows: 25 },
  defaultSize: { w: 6, h: 6 },
  capabilities: { filters: true, export: true },
  component: TableWidget,
  settings: TableSettings,
});
