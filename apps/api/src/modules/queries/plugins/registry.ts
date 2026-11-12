import {
  createDataSourcePluginRegistry,
  type DataSourcePluginRegistry,
  type ServerDataSourcePlugin,
} from "@nama/dashboard-types";

import { createRestPlugin, REST_KIND } from "./rest.ts";
import { createStaticPlugin, STATIC_KIND } from "./static.ts";

export type PluginRegistry = DataSourcePluginRegistry;

/**
 * Registration validates the public contract: manifest, schemas, required
 * methods and capability declarations. Duplicate kinds are rejected.
 */
export function createPluginRegistry(
  plugins: ServerDataSourcePlugin[] = [createStaticPlugin(), createRestPlugin()],
): PluginRegistry {
  return createDataSourcePluginRegistry(plugins);
}

export { REST_KIND, STATIC_KIND };
