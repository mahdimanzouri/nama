import type { ErasedWidgetPlugin } from "@nama/dashboard-core";

import { areaWidget, barWidget, lineWidget } from "./cartesian";
import { gaugeWidget } from "./gauge";
import { kpiWidget } from "./kpi";
import { pieWidget } from "./pie";
import { tableWidget } from "./table";

/**
 * Built-in visualizations. They carry no host-specific data binding; the host
 * supplies `defaultQuery`/`defaultDataSourceId` by wrapping the plugins.
 */
export const NAMA_WIDGETS: readonly ErasedWidgetPlugin[] = [
  kpiWidget,
  lineWidget,
  areaWidget,
  barWidget,
  pieWidget,
  gaugeWidget,
  tableWidget,
];

export { areaWidget, barWidget, lineWidget, cartesianConfigSchema } from "./cartesian";
export type { CartesianConfig } from "./cartesian";
export { gaugeWidget, gaugeConfigSchema } from "./gauge";
export type { GaugeConfig } from "./gauge";
export { kpiWidget, kpiConfigSchema } from "./kpi";
export type { KpiConfig } from "./kpi";
export { pieWidget, pieConfigSchema } from "./pie";
export type { PieConfig } from "./pie";
export { tableWidget, tableConfigSchema } from "./table";
export type { TableConfig } from "./table";

export type { ChartColors, SeriesPoint } from "./chart-data";
export {
  buildBarOption,
  buildGaugeOption,
  buildLineOption,
  buildPieOption,
  type ChartContext,
} from "./chart-options";
export { EChart, type EChartProps } from "./echarts";
