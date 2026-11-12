import assert from "node:assert/strict";

import {
  createWidgetRegistry,
  resolveWidgetConfig,
} from "@nama/dashboard-builder/plugins";
import {
  createDataSourcePluginRegistry,
  DataSourcePluginRegistrationError,
  validateDataSourcePlugin,
} from "@nama/dashboard-types";

import { createMemoryPlugin, MEMORY_KIND } from "./data-source.mjs";
import { STATUS_CONFIG_VERSION, STATUS_WIDGET_ID, statusBadgePlugin } from "./widget.mjs";

const context = {
  organizationId: "org",
  dataSourceId: "memory-source",
  requestId: "req",
  config: { rows: [{ value: 1 }, { value: 2 }, { value: 3 }] },
  credentials: async () => ({}),
  limits: { timeoutMs: 15000, maxRows: 2, maxBytes: 5 * 1024 * 1024, maxConcurrent: 4 },
  allowPrivateNetwork: false,
  fetch: globalThis.fetch,
  signal: new AbortController().signal,
  logger: { warn() {} },
};

// A widget registers, rejects duplicates and exposes its editor settings panel.
const widgets = createWidgetRegistry([statusBadgePlugin]);
assert.equal(widgets.get(STATUS_WIDGET_ID)?.manifest.version, "1.1.0");
assert.equal(typeof statusBadgePlugin.component, "function");
assert.equal(typeof statusBadgePlugin.settings, "function");
assert.throws(() => widgets.register(statusBadgePlugin), /already registered/u);
assert.throws(() =>
  widgets.register({
    ...statusBadgePlugin,
    manifest: { ...statusBadgePlugin.manifest, id: "Bad Id" },
  }),
);
assert.equal(widgets.list()[0]?.id, STATUS_WIDGET_ID);

// Version 1 config migrates to version 2; newer or invalid config is preserved.
const current = resolveWidgetConfig(statusBadgePlugin, {
  id: "w",
  type: STATUS_WIDGET_ID,
  configVersion: STATUS_CONFIG_VERSION,
  config: { label: "Build", tone: "positive" },
});
assert.deepEqual(current, {
  status: "ready",
  config: { label: "Build", tone: "positive" },
});

const migrated = resolveWidgetConfig(statusBadgePlugin, {
  id: "w",
  type: STATUS_WIDGET_ID,
  configVersion: 1,
  config: { label: "Build" },
});
assert.deepEqual(migrated, {
  status: "ready",
  config: { label: "Build", tone: "neutral" },
});

assert.equal(
  resolveWidgetConfig(statusBadgePlugin, {
    id: "w",
    type: STATUS_WIDGET_ID,
    configVersion: 3,
    config: {},
  }).status,
  "unsupportedVersion",
);
assert.equal(
  resolveWidgetConfig(statusBadgePlugin, {
    id: "w",
    type: STATUS_WIDGET_ID,
    configVersion: 2,
    config: { label: "" },
  }).status,
  "invalidConfig",
);

// A data-source adapter registers, rejects duplicates and validates capability
// declarations against the methods it ships.
const sources = createDataSourcePluginRegistry();
const memory = createMemoryPlugin();
assert.deepEqual(validateDataSourcePlugin(memory), []);
sources.register(memory);
assert.equal(sources.get(MEMORY_KIND)?.manifest.name, "In-memory rows");
assert.throws(
  () => sources.register(createMemoryPlugin()),
  (error) =>
    error instanceof DataSourcePluginRegistrationError &&
    /already registered/u.test(error.message),
);

const broken = { ...createMemoryPlugin(), discover: undefined };
assert.throws(
  () => createDataSourcePluginRegistry([broken]),
  /schemaDiscovery is declared but discover\(\) is not implemented/u,
);

// The adapter executes within the runtime limits and reports truncation.
const result = await memory.execute(
  {
    queryId: "plugin-kit",
    query: { queryId: "plugin-kit", fields: ["value"], limit: 5 },
    parameters: {},
  },
  context,
);
assert.deepEqual(result.rows, [{ value: 1 }, { value: 2 }]);
assert.equal(result.meta.rowCount, 2);
assert.equal(result.meta.truncated, true);
assert.deepEqual(result.columns, [{ name: "value", type: "number" }]);

const invalid = await memory.validate(
  { queryId: "plugin-kit", fields: ["missing"] },
  context,
);
assert.equal(invalid.valid, false);
assert.equal(invalid.issues[0]?.path.join("."), "query.fields");

process.stdout.write(
  [
    "PLUGIN_KIT_OK",
    `widget=${STATUS_WIDGET_ID}`,
    `migration=1->${STATUS_CONFIG_VERSION}`,
    `data-source=${MEMORY_KIND}`,
    "duplicate=rejected",
    "capability-mismatch=rejected",
  ].join(" ") + "\n",
);
