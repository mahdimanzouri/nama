/**
 * Fails when the routes served by apps/api drift from docs/api/openapi.yaml.
 *
 * Every served method+path must be documented, and every documented operation
 * marked `x-m0-status: implemented` must be served. `/healthz` is operational
 * and intentionally absent from the public specification.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { buildApp } from "../src/app.ts";
import { loadEnv } from "../src/env.ts";

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, "../../../docs/api/openapi.yaml");
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
const OPERATIONAL_PATHS = new Set(["/healthz"]);
const STATUSES = new Set(["implemented", "proposed", "stub"]);

interface Operation {
  status: string;
}

interface SpecPath {
  methods: Map<string, Operation>;
}

function normalizeUrl(url: string): string {
  const withoutQuery = url.split("?")[0] ?? url;
  return withoutQuery.replace(/:([A-Za-z0-9_]+)/gu, "{$1}");
}

function main(): void {
  const document = parse(readFileSync(specPath, "utf8")) as {
    paths?: Record<string, Record<string, unknown>>;
  };
  const specPaths = new Map<string, SpecPath>();
  const errors: string[] = [];

  for (const [path, entry] of Object.entries(document.paths ?? {})) {
    const methods = new Map<string, Operation>();
    for (const method of HTTP_METHODS) {
      const operation = entry[method];
      if (!operation || typeof operation !== "object") continue;
      const status = (operation as { "x-m0-status"?: string })["x-m0-status"];
      if (!status || !STATUSES.has(status)) {
        errors.push(
          `${method.toUpperCase()} ${path}: x-m0-status must be one of ${[...STATUSES].join(", ")}`,
        );
        continue;
      }
      methods.set(method.toUpperCase(), { status });
    }
    if (methods.size > 0) specPaths.set(path, { methods });
  }

  const served = new Map<string, Set<string>>();
  const app = buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }), {
    onRoute: (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      const path = normalizeUrl(route.url);
      for (const method of methods) {
        if (method === "HEAD") continue;
        const entries = served.get(path) ?? new Set<string>();
        entries.add(method.toUpperCase());
        served.set(path, entries);
      }
    },
  });

  try {
    for (const [path, methods] of served) {
      if (OPERATIONAL_PATHS.has(path)) continue;
      const specPath = specPaths.get(path);
      if (!specPath) {
        errors.push(`served but undocumented: ${[...methods].join(", ")} ${path}`);
        continue;
      }
      for (const method of methods) {
        if (!specPath.methods.has(method)) {
          errors.push(`served but undocumented: ${method} ${path}`);
        }
      }
    }

    for (const [path, specPath] of specPaths) {
      for (const [method, operation] of specPath.methods) {
        if (operation.status === "implemented" && !served.get(path)?.has(method)) {
          errors.push(`marked implemented but not served: ${method} ${path}`);
        }
      }
    }
  } finally {
    void app.close();
  }

  const servedCount = [...served.values()].reduce(
    (total, methods) => total + methods.size,
    0,
  );
  const documentedCount = [...specPaths.values()].reduce(
    (total, entry) => total + entry.methods.size,
    0,
  );

  if (errors.length > 0) {
    console.error(`OpenAPI drift detected (${errors.length} problem(s)):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `OpenAPI is in sync: ${servedCount} served operations, ${documentedCount} documented.`,
  );
}

main();
