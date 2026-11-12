import { useCallback, useMemo, useState } from "react";
import {
  normalizeDigits,
  parseLocalizedNumber,
  resolveControlValues,
  type DashboardI18n,
} from "@nama/dashboard-core";
import {
  isVariableValue,
  type DashboardConfig,
  type DashboardControlValues,
  type DashboardVariable,
  type QueryTimeRange,
} from "@nama/dashboard-types";

import { joinClassNames } from "./classnames";
import { useDashboardRuntime } from "./context";

const TIME_RANGE_PRESETS = [
  { id: "default", last: undefined },
  { id: "15m", last: "15m" },
  { id: "1h", last: "1h" },
  { id: "6h", last: "6h" },
  { id: "24h", last: "24h" },
  { id: "7d", last: "7d" },
  { id: "30d", last: "30d" },
] as const;

type TimeRangePreset = (typeof TIME_RANGE_PRESETS)[number]["id"];

function presetRange(preset: Exclude<TimeRangePreset, "default">): QueryTimeRange {
  return { mode: "relative", last: preset };
}

export interface DashboardControlsState {
  values: DashboardControlValues;
  setVariable(name: string, value: unknown): void;
  setTimeRange(range: QueryTimeRange | undefined): void;
  reset(): void;
}

export interface DashboardControlsController {
  config: DashboardConfig;
  initial?: Partial<DashboardControlValues>;
  onChange?: (values: DashboardControlValues) => void;
}

/**
 * Holds runtime control values for one provider mount. Values are never
 * persisted; they start from variable defaults and are resolved into queries on
 * read, so changing a control re-executes only the affected widgets. Storing the
 * choices rather than resolved values lets a retyped variable fall back to its
 * default without discarding the values that survived a config edit.
 */
export function useDashboardControlsState({
  config,
  initial,
  onChange,
}: DashboardControlsController): DashboardControlsState {
  const [choices, setChoices] = useState<Partial<DashboardControlValues>>(
    () => initial ?? {},
  );
  const values = useMemo(() => resolveControlValues(config, choices), [config, choices]);

  const apply = useCallback(
    (next: Partial<DashboardControlValues>) => {
      const resolved = resolveControlValues(config, next);
      setChoices(next);
      onChange?.(resolved);
    },
    [config, onChange],
  );

  const setVariable = useCallback(
    (name: string, value: unknown) => {
      const variable = config.variables.find((entry) => entry.name === name);
      if (!variable || !isVariableValue(variable.type, value)) return;
      apply({
        ...values,
        variables: { ...values.variables, [name]: value },
      });
    },
    [apply, config.variables, values],
  );

  const setTimeRange = useCallback(
    (range: QueryTimeRange | undefined) => {
      apply({
        variables: values.variables,
        ...(range === undefined ? {} : { timeRange: range }),
      });
    },
    [apply, values.variables],
  );

  const reset = useCallback(() => {
    apply({});
  }, [apply]);

  return { values, setVariable, setTimeRange, reset };
}

/** Public hook: current control values and their setters. */
export function useDashboardControls(): DashboardControlsState {
  return useDashboardRuntime().controls;
}

export interface DashboardControlsProps {
  className?: string;
  /** Hide the dashboard-wide time range picker. */
  hideTimeRange?: boolean;
  /** Hide the reset action. */
  hideReset?: boolean;
}

export function DashboardControls({
  className,
  hideTimeRange = false,
  hideReset = false,
}: DashboardControlsProps) {
  const runtime = useDashboardRuntime();
  const { values, setVariable, setTimeRange, reset } = runtime.controls;
  const { i18n, config } = runtime;
  const resolved = useMemo(() => resolveControlValues(config, values), [config, values]);

  if (config.variables.length === 0 && hideTimeRange) return null;

  return (
    <section
      className={joinClassNames("nama-controls", className)}
      aria-label={i18n.translate("controls.title")}
    >
      {hideTimeRange ? null : (
        <div className="nama-controls__group" role="group">
          <span className="nama-controls__label">
            {i18n.translate("controls.timeRange")}
          </span>
          <div className="nama-controls__presets">
            {TIME_RANGE_PRESETS.map((preset) => {
              const range = values.timeRange;
              const pressed =
                preset.id === "default"
                  ? range === undefined
                  : range !== undefined &&
                    "mode" in range &&
                    range.mode === "relative" &&
                    range.last === preset.last;

              return (
                <button
                  key={preset.id}
                  type="button"
                  className="nama-button"
                  aria-pressed={pressed}
                  onClick={() =>
                    setTimeRange(
                      preset.id === "default" ? undefined : presetRange(preset.id),
                    )
                  }
                >
                  {i18n.translate(`controls.timeRange.${preset.id}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {config.variables.map((variable) => (
        <VariableField
          key={variable.id}
          variable={variable}
          value={resolved.variables[variable.name]}
          i18n={i18n}
          onChange={(value) => setVariable(variable.name, value)}
        />
      ))}

      {hideReset ? null : (
        <button type="button" className="nama-button" onClick={reset}>
          {i18n.translate("controls.reset")}
        </button>
      )}
    </section>
  );
}

function VariableField({
  variable,
  value,
  i18n,
  onChange,
}: {
  variable: DashboardVariable;
  value: unknown;
  i18n: DashboardI18n;
  onChange: (value: unknown) => void;
}) {
  const label = i18n.translate("controls.variable", { name: variable.name });

  if (variable.type === "boolean") {
    return (
      <label className="nama-controls__field nama-controls__field--inline">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }

  if (variable.type === "number") {
    return (
      <label className="nama-controls__field">
        <span className="nama-controls__label">{label}</span>
        <NumberControl value={value} onChange={onChange} />
      </label>
    );
  }

  if (variable.type === "date") {
    return (
      <label className="nama-controls__field">
        <span className="nama-controls__label">{label}</span>
        <input
          type="date"
          className="nama-input"
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(event) => {
            if (event.currentTarget.value) onChange(event.currentTarget.value);
          }}
        />
      </label>
    );
  }

  if (variable.type === "timeRange") {
    const range = asRange(value);
    return (
      <fieldset className="nama-controls__field nama-controls__field--range">
        <legend className="nama-controls__label">{label}</legend>
        <input
          type="datetime-local"
          className="nama-input"
          aria-label={i18n.translate("controls.rangeFrom")}
          value={range?.from.slice(0, 16) ?? ""}
          onChange={(event) => {
            const from = toIso(event.currentTarget.value);
            if (from && range) onChange({ from, to: range.to });
          }}
        />
        <input
          type="datetime-local"
          className="nama-input"
          aria-label={i18n.translate("controls.rangeTo")}
          value={range?.to.slice(0, 16) ?? ""}
          onChange={(event) => {
            const to = toIso(event.currentTarget.value);
            if (to && range) onChange({ from: range.from, to });
          }}
        />
      </fieldset>
    );
  }

  return (
    <label className="nama-controls__field">
      <span className="nama-controls__label">{label}</span>
      <input
        type="text"
        className="nama-input"
        value={typeof value === "string" ? value : ""}
        maxLength={200}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

/**
 * Persian and Arabic-Indic digits are normalized on input, and an incomplete
 * entry such as "" stays editable without discarding the committed value.
 */
function NumberControl({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const committed = typeof value === "number" ? String(value) : "";

  return (
    <input
      type="text"
      inputMode="decimal"
      dir="ltr"
      className="nama-input"
      value={draft ?? committed}
      onChange={(event) => {
        const text = normalizeDigits(event.currentTarget.value);
        setDraft(text);
        const next = parseLocalizedNumber(text);
        if (next !== undefined) onChange(next);
      }}
      onBlur={() => setDraft(undefined)}
    />
  );
}

function asRange(value: unknown): { from: string; to: string } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const from = (value as { from?: unknown }).from;
  const to = (value as { to?: unknown }).to;
  if (typeof from !== "string" || typeof to !== "string") return undefined;
  return { from, to };
}

function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const timestamp = Date.parse(local);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}
