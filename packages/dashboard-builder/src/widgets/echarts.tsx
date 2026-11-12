import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

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

export interface EChartTableRow {
  label: string;
  value: string;
}

/**
 * Tabular equivalent of the painted series. The table is the fallback for
 * assistive technology: canvas output is invisible to screen readers.
 */
export interface EChartTable {
  summary: string;
  caption: string;
  categoryHeader: string;
  valueHeader: string;
  rows: readonly EChartTableRow[];
  /** Set when `rows` omits values. */
  note?: string;
}

/**
 * Maps a navigation key to the next data index. Returns `undefined` for keys
 * the chart does not handle, so the browser keeps its own behaviour.
 */
export function keyboardPointIndex(
  current: number | null,
  key: string,
  length: number,
): number | undefined {
  if (length === 0) return undefined;

  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return current === null ? 0 : Math.min(current + 1, length - 1);
    case "ArrowLeft":
    case "ArrowUp":
      return current === null ? length - 1 : Math.max(current - 1, 0);
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return undefined;
  }
}

export interface EChartProps {
  ariaLabel: string;
  /** Keyboard instructions, rendered visually hidden and linked by `aria-describedby`. */
  ariaDescription?: string;
  /** Table fallback for assistive technology. */
  table?: EChartTable;
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
 * Selectable charts also expose keyboard navigation and a data table, because
 * canvas pixels are not reachable for assistive technology.
 */
export function EChart({
  ariaLabel,
  ariaDescription,
  table,
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
  const descriptionId = useId();
  // Selection carries the table it was made against, so new data resets the
  // active point without a state-synchronising effect.
  const [selection, setSelection] = useState<{
    table: EChartTable | undefined;
    index: number | null;
    announcement: string;
  }>({ table: undefined, index: null, announcement: "" });
  const rows = useMemo(() => table?.rows ?? [], [table]);
  const selectable = Boolean(onSelect) && rows.length > 0;
  const activeIndex = selection.table === table ? selection.index : null;
  const announcement = selection.table === table ? selection.announcement : "";

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !selectable) return;

    chart.dispatchAction({ type: "downplay", seriesIndex: 0 });
    if (activeIndex !== null) {
      chart.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex: activeIndex });
    }
  }, [activeIndex, selectable]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!selectable) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const index = activeIndex ?? 0;
        setSelection({
          table,
          index,
          announcement: `${rows[index]?.label ?? ""}: ${rows[index]?.value ?? ""}`,
        });
        onSelectRef.current?.(index);
        return;
      }

      if (event.key === "Escape") {
        setSelection({ table, index: null, announcement: "" });
        return;
      }

      const next = keyboardPointIndex(activeIndex, event.key, rows.length);
      if (next === undefined) return;

      event.preventDefault();
      setSelection({
        table,
        index: next,
        announcement: `${rows[next]?.label ?? ""}: ${rows[next]?.value ?? ""}`,
      });
    },
    [selectable, table, activeIndex, rows],
  );

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
    <>
      <div
        ref={attach}
        className={joinClassNames("nama-chart", className)}
        role={selectable ? "group" : "img"}
        aria-label={ariaLabel}
        aria-describedby={selectable && ariaDescription ? descriptionId : undefined}
        tabIndex={selectable ? 0 : undefined}
        data-selectable={onSelect ? "true" : undefined}
        onKeyDown={selectable ? handleKeyDown : undefined}
      />
      {selectable && ariaDescription ? (
        <p id={descriptionId} className="nama-visually-hidden">
          {ariaDescription}
        </p>
      ) : null}
      {selectable ? (
        <p className="nama-visually-hidden" role="status">
          {announcement}
        </p>
      ) : null}
      {table && table.rows.length > 0 ? (
        <details className="nama-chart-data">
          <summary>{table.summary}</summary>
          <div className="nama-table-wrap" tabIndex={0}>
            <table className="nama-table">
              <caption>{table.caption}</caption>
              <thead>
                <tr>
                  <th scope="col">{table.categoryHeader}</th>
                  <th scope="col">{table.valueHeader}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, index) => (
                  <tr key={`${row.label}:${index}`}>
                    <td>{row.label}</td>
                    <td>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.note ? <p className="nama-chart-frame__note">{table.note}</p> : null}
        </details>
      ) : null}
    </>
  );
}
