#!/usr/bin/env node
/**
 * Guards the workspace boundaries recorded in
 * docs/architecture/package-dependencies.md.
 *
 * Failing checks:
 *  - a package imports Next.js, an app, or an internal package it does not declare
 *  - a package declares an internal dependency outside the approved graph
 *  - the API imports React or a React-based package
 *  - more than one React version is installed
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const APPROVED_INTERNAL_DEPENDENCIES = {
  "dashboard-types": [],
  "dashboard-core": ["@nama/dashboard-types"],
  "dashboard-builder": ["@nama/dashboard-core", "@nama/dashboard-types"],
  "api-client": ["@nama/dashboard-types"],
};

const REACT_PACKAGES = ["@nama/dashboard-core", "@nama/dashboard-builder"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*["']([^"']+)["']/gu;

const failures = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      checkFile(path);
    }
  }
}

function importsIn(path) {
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1]);
}

function checkFile(path) {
  const label = relative(root, path);
  const packageDirectory = relative(join(root, "packages"), path).split("/")[0];
  const inPackage = packageDirectory in APPROVED_INTERNAL_DEPENDENCIES;
  const inApi = label.startsWith("apps/api/");

  for (const specifier of importsIn(path)) {
    if (specifier === "next" || specifier.startsWith("next/")) {
      failures.push(
        `${label}: imports Next.js ("${specifier}"); the SDK must stay host-agnostic`,
      );
    }

    if (specifier.startsWith("@nama/")) {
      if (
        inPackage &&
        !APPROVED_INTERNAL_DEPENDENCIES[packageDirectory].includes(specifier)
      ) {
        failures.push(
          `${label}: "${specifier}" is not an approved dependency of @nama/${packageDirectory}`,
        );
      }
      if (
        inApi &&
        (specifier === "@nama/api-client" || REACT_PACKAGES.includes(specifier))
      ) {
        failures.push(`${label}: the API must not import ${specifier}`);
      }
    }

    if (inApi && (specifier === "react" || specifier === "react-dom")) {
      failures.push(`${label}: the API must not import ${specifier}`);
    }

    if (specifier.includes("apps/") || specifier.startsWith("../../../apps")) {
      failures.push(`${label}: packages and apps must not import from another app`);
    }
  }
}

function checkDeclaredGraph() {
  for (const [directory, approved] of Object.entries(APPROVED_INTERNAL_DEPENDENCIES)) {
    const manifestPath = join(root, "packages", directory, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const declared = Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.devDependencies,
    })
      .filter((name) => name.startsWith("@nama/"))
      .sort();

    if (JSON.stringify(declared) !== JSON.stringify([...approved].sort())) {
      failures.push(
        `packages/${directory}/package.json: internal dependencies are [${declared.join(", ")}], approved graph is [${approved.join(", ")}]`,
      );
    }
  }
}

function checkReactVersions() {
  const virtualStore = join(root, "node_modules", ".pnpm");
  let entries;

  try {
    entries = readdirSync(virtualStore);
  } catch {
    return;
  }

  const versions = new Set(
    entries
      .map((entry) => /^react@(\d[^_]*)/u.exec(entry)?.[1])
      .filter((version) => version !== undefined),
  );

  if (versions.size > 1) {
    failures.push(`React is installed more than once: ${[...versions].join(", ")}`);
  }
}

walk(join(root, "packages"));
walk(join(root, "apps", "api"));
checkDeclaredGraph();
checkReactVersions();

if (failures.length > 0) {
  console.error("Workspace boundary check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  "Workspace boundaries OK: approved package graph, no host imports, single React version.",
);
