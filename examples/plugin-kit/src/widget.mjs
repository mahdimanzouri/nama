import { createElement as h } from "react";
import { z } from "zod";
import {
  defineWidget,
  UnsupportedConfigVersionError,
} from "@nama/dashboard-builder/plugins";

export const STATUS_WIDGET_ID = "@example/status-badge";
export const STATUS_CONFIG_VERSION = 2;

const configSchema = z
  .object({
    label: z.string().min(1).max(80).default("Status"),
    tone: z.enum(["neutral", "positive", "negative"]).default("neutral"),
  })
  .strict();

function StatusBadge({ config, data, locale }) {
  if (data.status === "loading" || data.status === "idle") {
    return h("span", { "data-widget-status": data.status }, "…");
  }
  if (data.status === "error") {
    return h(
      "span",
      { "data-widget-status": "error" },
      locale.translate(data.error.messageKey),
    );
  }

  const row = data.result.rows[0];
  const value = row ? Object.values(row)[0] : undefined;

  return h(
    "span",
    {
      "data-widget-status": "ready",
      "data-tone": config.tone,
      className: `example-status example-status--${config.tone}`,
    },
    `${config.label}: ${value === undefined ? "—" : String(value)}`,
  );
}

function StatusSettings({ config, onChange, disabled }) {
  return h(
    "label",
    { className: "example-status__settings" },
    "Label",
    h("input", {
      value: config.label,
      disabled,
      onChange: (event) => onChange({ ...config, label: event.currentTarget.value }),
    }),
    h(
      "select",
      {
        value: config.tone,
        disabled,
        onChange: (event) => onChange({ ...config, tone: event.currentTarget.value }),
      },
      h("option", { value: "neutral" }, "Neutral"),
      h("option", { value: "positive" }, "Positive"),
      h("option", { value: "negative" }, "Negative"),
    ),
  );
}

/**
 * Example visualization plugin written against the public contract. Version 2
 * adds `tone`; a version-1 config migrates without user action.
 */
export const statusBadgePlugin = defineWidget({
  manifest: {
    id: STATUS_WIDGET_ID,
    version: "1.1.0",
    name: "Status badge",
    description: "Shows a label and the first value of the result row",
    author: "Example",
  },
  configVersion: STATUS_CONFIG_VERSION,
  configSchema,
  defaultConfig: { label: "Status", tone: "neutral" },
  defaultSize: { w: 3, h: 3 },
  capabilities: { filters: true },
  migrate(config, fromVersion) {
    if (fromVersion === 1) {
      const previous = config ?? {};
      return {
        label: typeof previous.label === "string" ? previous.label : "Status",
        tone: "neutral",
      };
    }
    throw new UnsupportedConfigVersionError(
      STATUS_WIDGET_ID,
      fromVersion,
      STATUS_CONFIG_VERSION,
    );
  },
  component: StatusBadge,
  settings: StatusSettings,
});
