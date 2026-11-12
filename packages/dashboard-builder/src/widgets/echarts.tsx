import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { BarChart, GaugeChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import type { ECElementEvent, ECharts, EChartsCoreOption } from "echarts/core";
import type { ThemeTokens } from "@nama/dashboard-core";

import { joinClassNames } from "../classnames";
import { usePrefersReducedMotion } from "../media";
import { resolveChartColors, type ChartColors } from "./chart-data";

let modulesRegistered = false;

/** Registers only the charts and components the built-in widgets render. */
function registerModules(): void {
  if (modulesRegistered) return;

  echarts.use([
    LineChart,
    BarChart,
    PieChart,
    GaugeChart,
    GridComponent,
    TooltipComponent,
    CanvasRenderer,
  ]);
  modulesRegistered = true;
}

interface ColorCache {
  theme: ThemeTokens;
  colors: ChartColors;
  dirty: boolean;
}

/** Shared per element so every chart in a dashboard resolves once per theme. */
const colorCache = new WeakMap<HTMLElement, ColorCache>();

function readColors(theme: ThemeTokens, element: HTMLElement): ChartColors {
  const cached = colorCache.get(element);
  if (cached && !cached.dirty && cached.theme === theme) return cached.colors;

  const colors = resolveChartColors(theme, element);
  colorCache.set(element, { theme, colors, dirty: false });
  return colors;
}

/**
 * Canvas cannot paint CSS variables, so tokens are resolved against the mounted
 * element and re-resolved whenever the provider switches `data-theme`.
 */
function useResolvedColors(
  theme: ThemeTokens,
  element: HTMLElement | null,
): ChartColors | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!element) return () => {};

      const root = element.closest("[data-theme]");
      if (!root) return () => {};

      const observer = new MutationObserver(() => {
        const cached = colorCache.get(element);
        if (cached) cached.dirty = true;
        onChange();
      });
      observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

      return () => observer.disconnect();
    },
    [element],
  );

  const getSnapshot = useCallback(
    (): ChartColors | null => (element ? readColors(theme, element) : null),
    [theme, element],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export interface EChartProps {
  ariaLabel: string;
  theme: ThemeTokens;
  /** Must be stable across renders; build it with `useCallback`. */
  buildOption: (colors: ChartColors, animation: boolean) => EChartsCoreOption;
  className?: string;
  /** Reports the clicked data index; charts map it back to a raw category. */
  onSelect?: (index: number) => void;
}

/**
 * Canvas host for the built-in chart widgets. Initialisation is deferred until
 * the container has a measurable size, which keeps grid layouts and SSR safe.
 */
export function EChart({
  ariaLabel,
  theme,
  buildOption,
  className,
  onSelect,
}: EChartProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);
  const optionRef = useRef<EChartsCoreOption | null>(null);
  const onSelectRef = useRef(onSelect);
  const colors = useResolvedColors(theme, element);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const attach = useCallback((node: HTMLDivElement | null) => {
    setElement(node);
  }, []);

  const ensureChart = useCallback((node: HTMLDivElement | null): ECharts | null => {
    if (!node) return null;
    if (chartRef.current) return chartRef.current;
    if (node.clientWidth < 2 || node.clientHeight < 2) return null;

    registerModules();
    const chart = echarts.init(node, undefined, { renderer: "canvas" });
    chart.on("click", (params: ECElementEvent) => {
      onSelectRef.current?.(params.dataIndex);
    });
    chartRef.current = chart;

    if (optionRef.current) chart.setOption(optionRef.current, { notMerge: true });
    return chart;
  }, []);

  useEffect(() => {
    if (!element) return;

    ensureChart(element);
    const observer = new ResizeObserver(() => {
      ensureChart(element)?.resize();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [element, ensureChart]);

  useEffect(() => {
    if (!colors) return;

    const option = buildOption(colors, !reducedMotion);
    optionRef.current = option;
    chartRef.current?.setOption(option, { notMerge: true });
  }, [buildOption, colors, reducedMotion]);

  return (
    <div
      ref={attach}
      className={joinClassNames("nama-chart", className)}
      role="img"
      aria-label={ariaLabel}
      data-selectable={onSelect ? "true" : undefined}
    />
  );
}
