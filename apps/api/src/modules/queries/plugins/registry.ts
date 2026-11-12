import { createRestPlugin, REST_KIND } from "./rest.ts";
import { createStaticPlugin, STATIC_KIND } from "./static.ts";
import type { ServerDataSourcePlugin } from "./types.ts";

export interface PluginRegistry {
  get(kind: string): ServerDataSourcePlugin | undefined;
  list(): ServerDataSourcePlugin[];
}

export function createPluginRegistry(
  plugins: ServerDataSourcePlugin[] = [createStaticPlugin(), createRestPlugin()],
): PluginRegistry {
  const byKind = new Map(plugins.map((plugin) => [plugin.kind, plugin]));
  return {
    get: (kind) => byKind.get(kind),
    list: () => [...byKind.values()],
  };
}

export { REST_KIND, STATIC_KIND };
export type { PluginRegistry as DataSourceRegistry };
