import {
  ISSUE_CODES,
  issuesFromZod,
  widgetCapabilitiesSchema,
  widgetManifestSchema,
  type ValidationIssue,
  type WidgetManifest,
} from "@nama/dashboard-types";

import { WidgetRegistrationError } from "./errors";
import type { ErasedWidgetPlugin } from "./plugin";

export interface RegisterWidgetOptions {
  /** Replaces a plugin registered under the same manifest id. */
  replace?: boolean;
}

export interface WidgetRegistry {
  register(plugin: ErasedWidgetPlugin, options?: RegisterWidgetOptions): void;
  unregister(type: string): void;
  get(type: string): ErasedWidgetPlugin | undefined;
  list(): WidgetManifest[];
  has(type: string): boolean;
}

function issue(
  code: string,
  path: Array<string | number>,
  message: string,
): ValidationIssue {
  return { code, path, message };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function validatePlugin(plugin: ErasedWidgetPlugin): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const manifest = widgetManifestSchema.safeParse(plugin.manifest);

  if (!manifest.success) {
    for (const problem of issuesFromZod(manifest.error)) {
      issues.push({ ...problem, path: ["manifest", ...problem.path] });
    }
  }

  if (!isPositiveInteger(plugin.configVersion)) {
    issues.push(
      issue(
        ISSUE_CODES.invalidWidgetPlugin,
        ["configVersion"],
        "configVersion must be an integer greater than or equal to 1",
      ),
    );
  }

  const size = plugin.defaultSize;
  if (
    typeof size !== "object" ||
    size === null ||
    !isPositiveInteger(size.w) ||
    !isPositiveInteger(size.h)
  ) {
    issues.push(
      issue(
        ISSUE_CODES.invalidWidgetPlugin,
        ["defaultSize"],
        "defaultSize must have positive integer w and h",
      ),
    );
  }

  const defaultConfig = plugin.configSchema.safeParse(plugin.defaultConfig);
  if (!defaultConfig.success) {
    for (const problem of issuesFromZod(defaultConfig.error)) {
      issues.push({ ...problem, path: ["defaultConfig", ...problem.path] });
    }
  }

  if (plugin.capabilities !== undefined) {
    const capabilities = widgetCapabilitiesSchema.safeParse(plugin.capabilities);
    if (!capabilities.success) {
      for (const problem of issuesFromZod(capabilities.error)) {
        issues.push({ ...problem, path: ["capabilities", ...problem.path] });
      }
    }
  }

  const component: unknown = plugin.component;
  if (
    typeof component !== "function" &&
    (typeof component !== "object" || component === null)
  ) {
    issues.push(
      issue(
        ISSUE_CODES.invalidWidgetPlugin,
        ["component"],
        "component must be a React component",
      ),
    );
  }

  return issues;
}

function pluginIdOf(plugin: ErasedWidgetPlugin): string {
  return typeof plugin.manifest?.id === "string" ? plugin.manifest.id : "<invalid>";
}

/**
 * Registration is explicit and validated; the SDK never discovers or fetches
 * plugins at runtime. Duplicate types are rejected unless the host replaces.
 */
export function createWidgetRegistry(
  initial: readonly ErasedWidgetPlugin[] = [],
): WidgetRegistry {
  const plugins = new Map<string, ErasedWidgetPlugin>();

  function register(
    plugin: ErasedWidgetPlugin,
    options: RegisterWidgetOptions = {},
  ): void {
    const id = pluginIdOf(plugin);
    const issues = validatePlugin(plugin);

    if (issues.length > 0) {
      throw new WidgetRegistrationError(id, issues);
    }

    if (plugins.has(id) && !options.replace) {
      throw new WidgetRegistrationError(id, [
        issue(
          ISSUE_CODES.duplicateWidgetType,
          ["manifest", "id"],
          `widget type "${id}" is already registered`,
        ),
      ]);
    }

    const manifest = widgetManifestSchema.parse(plugin.manifest);
    plugins.set(id, { ...plugin, manifest: Object.freeze(manifest) });
  }

  for (const plugin of initial) {
    register(plugin);
  }

  return {
    register,
    unregister(type) {
      plugins.delete(type);
    },
    get(type) {
      return plugins.get(type);
    },
    list() {
      return [...plugins.values()].map((plugin) => plugin.manifest);
    },
    has(type) {
      return plugins.has(type);
    },
  };
}
