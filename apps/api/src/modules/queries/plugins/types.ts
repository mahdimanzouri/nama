/**
 * The data-source plugin contract lives in `@nama/dashboard-types` so a
 * standalone plugin package can implement it without importing the API.
 * This module keeps the API-local names stable.
 */
export {
  DataSourceError,
  type DataSourceLimits,
  type DataSourceValidationResult,
  type DataSourceValidationResult as ValidationResult,
  type DatasetSchema,
  type PluginContext,
  type PluginLogger,
  type PluginQueryRequest,
  type ServerDataSourcePlugin,
  type TestResult,
} from "@nama/dashboard-types";
