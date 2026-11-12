#!/usr/bin/env node
/**
 * Consumer test for the SDK packages (M3 acceptance).
 *
 * Packs @nama/dashboard-types, @nama/dashboard-core and @nama/dashboard-builder,
 * installs the tarballs into a throwaway React project, server-renders a
 * dashboard with a custom widget and checks the distribution guarantees:
 *
 *  - the built entry keeps its `"use client"` directive
 *  - `@nama/dashboard-builder/styles.css` resolves and ships tokens
 *  - exactly one React copy is installed
 *  - the builder entry stays under the gzipped bundle budget
 *
 * Usage: node scripts/verify-consumer.mjs [--keep]
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keep = process.argv.includes("--keep");
const PACKAGES = ["dashboard-types", "dashboard-core", "dashboard-builder"];
// M4 adds the editor (React Grid Layout integration, toolbar and settings).
const BUNDLE_BUDGET_BYTES = 16 * 1024;

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`  FAIL ${message}`);
}

function pass(message) {
  console.log(`  ok   ${message}`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

const workspace = mkdtempSync(join(tmpdir(), "nama-consumer-"));
const tarballDirectory = join(workspace, "tarballs");
const appDirectory = join(workspace, "app");

try {
  console.log(`Consumer workspace: ${workspace}`);

  run("mkdir", ["-p", tarballDirectory]);

  for (const name of PACKAGES) {
    const packageDirectory = join(root, "packages", name);
    run("pnpm", ["pack", "--pack-destination", tarballDirectory], {
      cwd: packageDirectory,
    });
  }

  const tarballs = new Map(
    readdirSync(tarballDirectory)
      .filter((file) => file.endsWith(".tgz"))
      .map((file) => [
        file.replace(/^nama-/, "").replace(/-\d+\.\d+\.\d+\.tgz$/u, ""),
        file,
      ]),
  );

  for (const name of PACKAGES) {
    if (!tarballs.has(name)) fail(`missing tarball for ${name}`);
  }
  if (failures.length > 0) throw new Error("packing failed");
  pass("packed types, core and builder");

  run("mkdir", ["-p", appDirectory]);
  cpSync(
    join(root, "examples", "standalone-consumer", "src"),
    join(appDirectory, "src"),
    {
      recursive: true,
    },
  );

  const manifest = JSON.parse(
    readFileSync(join(root, "examples", "standalone-consumer", "package.json"), "utf8"),
  );
  for (const name of PACKAGES) {
    manifest.dependencies[`@nama/${name}`] = `file:../tarballs/${tarballs.get(name)}`;
  }
  // The packed packages still name each other by version; point those edges at
  // the same tarballs so the install stays offline.
  manifest.pnpm = {
    overrides: Object.fromEntries(
      PACKAGES.map((name) => [`@nama/${name}`, `file:../tarballs/${tarballs.get(name)}`]),
    ),
  };
  writeFileSync(
    join(appDirectory, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  run("pnpm", ["install", "--offline"], { cwd: appDirectory, stdio: "inherit" });
  pass("installed packed tarballs offline");

  const installed = join(appDirectory, "node_modules", "@nama", "dashboard-builder");
  const entry = readFileSync(join(installed, "dist", "index.mjs"), "utf8");
  if (entry.startsWith('"use client";')) {
    pass('built entry preserves "use client"');
  } else {
    fail('built entry lost its "use client" directive');
  }

  const gzipped = gzipSync(entry).length;
  if (gzipped <= BUNDLE_BUDGET_BYTES) {
    pass(`bundle budget: ${(gzipped / 1024).toFixed(1)} KiB gzipped (limit 16 KiB)`);
  } else {
    fail(`builder entry is ${gzipped} bytes gzipped, over the 16 KiB budget`);
  }

  const appRequire = createRequire(join(appDirectory, "package.json"));
  const cssPath = appRequire.resolve("@nama/dashboard-builder/styles.css");
  const css = readFileSync(cssPath, "utf8");
  if (css.includes("--nama-bg") && css.includes(".nama-canvas")) {
    pass("styles.css export resolves and ships tokens");
  } else {
    fail("styles.css export is missing theme tokens or canvas styles");
  }

  const html = run(process.execPath, [join(appDirectory, "src", "server.mjs")], {
    cwd: appDirectory,
  });
  const expected = [
    "Standalone dashboard",
    'data-widget-type="@example/kpi"',
    "Units produced",
    'data-theme="light"',
  ];
  const missing = expected.filter((value) => !html.includes(value));
  if (missing.length === 0) {
    pass("SSR renders the dashboard through the installed SDK");
  } else {
    fail(`SSR output is missing: ${missing.join(", ")}`);
  }

  const reactCopies = readdirSync(join(appDirectory, "node_modules", ".pnpm")).filter(
    (entry) => /^react@\d/u.test(entry),
  );
  if (reactCopies.length === 1) {
    pass(`single React copy (${reactCopies[0]})`);
  } else {
    fail(`expected one React copy, found ${reactCopies.join(", ") || "none"}`);
  }

  if (
    !existsSync(join(appDirectory, "node_modules", "@nama", "dashboard-core", "dist"))
  ) {
    fail("dashboard-core was not installed alongside the builder");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  if (keep) {
    console.log(`Kept workspace at ${workspace}`);
  } else {
    rmSync(workspace, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error(`\nConsumer verification failed with ${failures.length} problem(s).`);
  process.exit(1);
}

console.log("\nConsumer verification passed.");
