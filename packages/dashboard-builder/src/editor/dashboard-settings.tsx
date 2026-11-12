import { useState } from "react";
import { useStore } from "zustand";
import { normalizeDigits, parseLocalizedNumber } from "@nama/dashboard-core";
import {
  FILTER_OPERATORS,
  VARIABLE_BINDING_TARGETS,
  VARIABLE_TYPES,
  createId,
  dashboardFilterSchema,
  dashboardVariableSchema,
  isVariableValue,
  type DashboardFilter,
  type DashboardVariable,
  type FilterOperator,
  type VariableBinding,
  type VariableType,
} from "@nama/dashboard-types";

import { useDashboardRuntime } from "../context";
import { useEditorContext } from "./context";

type VariableBindingTarget = VariableBinding["target"];

const MAX_ENTRIES = 50;

const TARGET_LABEL: Record<VariableBindingTarget, string> = {
  "query.parameter": "builder.controls.target.queryParameter",
  "query.timeRange": "builder.controls.target.queryTimeRange",
  "filter.value": "builder.controls.target.filterValue",
};

/** Authoring for dashboard-level variables and filters. */
export function DashboardSettings({ disabled }: { disabled: boolean }) {
  const { store } = useEditorContext();
  const config = useStore(store, (state) => state.config);
  const translate = useDashboardRuntime().i18n.translate;
  const [error, setError] = useState<string | undefined>(undefined);

  const { variables, filters } = config;

  const replaceVariable = (index: number, next: DashboardVariable): boolean => {
    if (variables.some((entry, at) => at !== index && entry.name === next.name)) {
      setError(translate("builder.controls.invalid"));
      return false;
    }
    const previousName = variables[index]?.name;
    store.getState().upsertVariable(next, previousName);
    setError(undefined);
    return true;
  };

  const replaceFilter = (index: number, next: DashboardFilter): boolean => {
    store
      .getState()
      .setFilters(filters.map((entry, at) => (at === index ? next : entry)));
    setError(undefined);
    return true;
  };

  const addVariable = () => {
    if (variables.length >= MAX_ENTRIES) return;

    const names = new Set(variables.map((entry) => entry.name));
    let index = 1;
    while (names.has(`variable${index}`)) index += 1;

    store.getState().setVariables([
      ...variables,
      {
        id: createId(),
        name: `variable${index}`,
        type: "string",
        defaultValue: "",
        bindings: [{ target: "query.parameter", parameter: `variable${index}` }],
      },
    ]);
  };

  const addFilter = () => {
    if (filters.length >= MAX_ENTRIES) return;

    store
      .getState()
      .setFilters([
        ...filters,
        { id: createId(), field: "field", operator: "eq", value: "" },
      ]);
  };

  return (
    <section
      className="nama-dashboard-settings"
      aria-label={translate("builder.controls.title")}
    >
      <div className="nama-dashboard-settings__head">
        <h3 className="nama-panel__title">{translate("builder.controls.title")}</h3>
        <button
          type="button"
          className="nama-button"
          disabled={disabled || variables.length >= MAX_ENTRIES}
          onClick={addVariable}
        >
          {translate("builder.controls.addVariable")}
        </button>
      </div>

      {variables.length === 0 ? (
        <p className="nama-panel__hint">{translate("builder.controls.empty")}</p>
      ) : (
        <ul className="nama-dashboard-settings__list">
          {variables.map((variable, index) => (
            <li key={variable.id}>
              <VariableRow
                variable={variable}
                disabled={disabled}
                onChange={(next) => replaceVariable(index, next)}
                onRemove={() => store.getState().removeVariable(variable.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="nama-dashboard-settings__head">
        <h3 className="nama-panel__title">
          {translate("builder.controls.filtersTitle")}
        </h3>
        <button
          type="button"
          className="nama-button"
          disabled={disabled || filters.length >= MAX_ENTRIES}
          onClick={addFilter}
        >
          {translate("builder.controls.addFilter")}
        </button>
      </div>

      {filters.length === 0 ? (
        <p className="nama-panel__hint">{translate("builder.controls.filtersEmpty")}</p>
      ) : (
        <ul className="nama-dashboard-settings__list">
          {filters.map((filter, index) => (
            <li key={filter.id}>
              <FilterRow
                filter={filter}
                disabled={disabled}
                onChange={(next) => replaceFilter(index, next)}
                onRemove={() =>
                  store
                    .getState()
                    .setFilters(filters.filter((entry) => entry.id !== filter.id))
                }
              />
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="nama-notice nama-notice--error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function defaultForType(type: VariableType): unknown {
  switch (type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "date":
      return new Date().toISOString().slice(0, 10);
    case "timeRange": {
      const to = new Date();
      const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    case "string":
      return "";
  }
}

function VariableRow({
  variable,
  disabled,
  onChange,
  onRemove,
}: {
  variable: DashboardVariable;
  disabled: boolean;
  onChange: (next: DashboardVariable) => boolean;
  onRemove: () => void;
}) {
  const translate = useDashboardRuntime().i18n.translate;
  const [error, setError] = useState<string | undefined>(undefined);
  const binding = variable.bindings[0];

  const apply = (patch: Partial<DashboardVariable>): boolean => {
    const candidate = { ...variable, ...patch };
    const parsed = dashboardVariableSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? translate("builder.controls.invalid"));
      return false;
    }
    const accepted = onChange(parsed.data);
    setError(accepted ? undefined : translate("builder.controls.invalid"));
    return accepted;
  };

  const commitName = (input: HTMLInputElement) => {
    const name = input.value.trim();
    if (name === variable.name) {
      input.value = variable.name;
      return;
    }
    if (!apply({ name })) input.value = variable.name;
  };

  const commitType = (type: VariableType) => {
    const value = isVariableValue(type, variable.defaultValue)
      ? variable.defaultValue
      : defaultForType(type);
    const bindings =
      type === "timeRange" && binding?.target !== "query.timeRange"
        ? [
            {
              target: "query.timeRange" as const,
              parameter: binding?.parameter ?? variable.name,
            },
          ]
        : variable.bindings;
    apply({ type, defaultValue: value, bindings });
  };

  const commitTarget = (target: VariableBindingTarget) => {
    apply({
      bindings: [
        { target, parameter: binding?.parameter ?? variable.name },
        ...variable.bindings.slice(1),
      ],
    });
  };

  const commitParameter = (input: HTMLInputElement) => {
    const parameter = input.value.trim();
    if (parameter === binding?.parameter) return;
    if (
      !parameter ||
      !apply({ bindings: [{ target: binding?.target ?? "query.parameter", parameter }] })
    ) {
      input.value = binding?.parameter ?? "";
    }
  };

  return (
    <div className="nama-dashboard-settings__row">
      <div className="nama-dashboard-settings__grid">
        <label className="nama-settings__field">
          <span>{translate("builder.controls.name")}</span>
          <input
            key={`name:${variable.name}`}
            className="nama-input"
            defaultValue={variable.name}
            maxLength={64}
            disabled={disabled}
            onBlur={(event) => commitName(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>

        <label className="nama-settings__field">
          <span>{translate("builder.controls.type")}</span>
          <select
            className="nama-input"
            value={variable.type}
            disabled={disabled}
            onChange={(event) => commitType(event.currentTarget.value as VariableType)}
          >
            {VARIABLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {translate(`builder.controls.type.${type}`)}
              </option>
            ))}
          </select>
        </label>

        <DefaultValueField
          variable={variable}
          disabled={disabled}
          onCommit={(value) => apply({ defaultValue: value })}
        />

        <label className="nama-settings__field">
          <span>{translate("builder.controls.bindingTarget")}</span>
          <select
            className="nama-input"
            value={binding?.target ?? "query.parameter"}
            disabled={disabled}
            onChange={(event) =>
              commitTarget(event.currentTarget.value as VariableBindingTarget)
            }
          >
            {VARIABLE_BINDING_TARGETS.map((target) => (
              <option key={target} value={target}>
                {translate(TARGET_LABEL[target])}
              </option>
            ))}
          </select>
        </label>

        <label className="nama-settings__field">
          <span>{translate("builder.controls.bindingParameter")}</span>
          <input
            key={`parameter:${binding?.parameter ?? ""}`}
            className="nama-input"
            defaultValue={binding?.parameter ?? ""}
            maxLength={120}
            disabled={disabled}
            onBlur={(event) => commitParameter(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
      </div>

      <div className="nama-dashboard-settings__actions">
        <button
          type="button"
          className="nama-button nama-button--danger"
          disabled={disabled}
          onClick={onRemove}
        >
          {translate("builder.controls.remove")}
        </button>
      </div>

      {error ? (
        <p className="nama-panel__hint" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DefaultValueField({
  variable,
  disabled,
  onCommit,
}: {
  variable: DashboardVariable;
  disabled: boolean;
  onCommit: (value: unknown) => boolean;
}) {
  const translate = useDashboardRuntime().i18n.translate;
  const value = variable.defaultValue;

  if (variable.type === "boolean") {
    return (
      <label className="nama-settings__field">
        <span>{translate("builder.controls.defaultValue")}</span>
        <select
          className="nama-input"
          value={value === true ? "true" : "false"}
          disabled={disabled}
          onChange={(event) => onCommit(event.currentTarget.value === "true")}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
    );
  }

  if (variable.type === "timeRange") {
    const range =
      typeof value === "object" && value !== null
        ? (value as { from?: unknown; to?: unknown })
        : {};
    const from = typeof range.from === "string" ? range.from : "";
    const to = typeof range.to === "string" ? range.to : "";

    return (
      <fieldset className="nama-settings__field nama-settings__field--range">
        <legend>{translate("builder.controls.defaultValue")}</legend>
        <input
          key={`from:${from}`}
          type="datetime-local"
          className="nama-input"
          aria-label={translate("controls.rangeFrom")}
          defaultValue={from.slice(0, 16)}
          disabled={disabled}
          onBlur={(event) => {
            const nextFrom = toIso(event.currentTarget.value);
            if (!nextFrom || !onCommit({ from: nextFrom, to })) {
              event.currentTarget.value = from.slice(0, 16);
            }
          }}
        />
        <input
          key={`to:${to}`}
          type="datetime-local"
          className="nama-input"
          aria-label={translate("controls.rangeTo")}
          defaultValue={to.slice(0, 16)}
          disabled={disabled}
          onBlur={(event) => {
            const nextTo = toIso(event.currentTarget.value);
            if (!nextTo || !onCommit({ from, to: nextTo })) {
              event.currentTarget.value = to.slice(0, 16);
            }
          }}
        />
      </fieldset>
    );
  }

  return (
    <label className="nama-settings__field">
      <span>{translate("builder.controls.defaultValue")}</span>
      <input
        key={`default:${String(value)}`}
        type={variable.type === "date" ? "date" : "text"}
        inputMode={variable.type === "number" ? "decimal" : undefined}
        dir={variable.type === "number" ? "ltr" : undefined}
        className="nama-input"
        defaultValue={
          variable.type === "date" && typeof value === "string"
            ? value.slice(0, 10)
            : String(value ?? "")
        }
        maxLength={200}
        disabled={disabled}
        onBlur={(event) => {
          const raw = event.currentTarget.value;
          const next =
            variable.type === "number" ? (parseLocalizedNumber(raw) ?? Number.NaN) : raw;
          if (!onCommit(next)) event.currentTarget.value = String(value ?? "");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function FilterRow({
  filter,
  disabled,
  onChange,
  onRemove,
}: {
  filter: DashboardFilter;
  disabled: boolean;
  onChange: (next: DashboardFilter) => boolean;
  onRemove: () => void;
}) {
  const translate = useDashboardRuntime().i18n.translate;
  const [error, setError] = useState<string | undefined>(undefined);

  const apply = (patch: Partial<DashboardFilter>): boolean => {
    const parsed = dashboardFilterSchema.safeParse({ ...filter, ...patch });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? translate("builder.controls.invalid"));
      return false;
    }
    const accepted = onChange(parsed.data);
    setError(accepted ? undefined : translate("builder.controls.invalid"));
    return accepted;
  };

  const commitOperator = (operator: FilterOperator) => {
    const value =
      operator === "in"
        ? [""]
        : operator === "between"
          ? ["", ""]
          : Array.isArray(filter.value)
            ? ""
            : filter.value;
    apply({ operator, value });
  };

  const displayValue =
    typeof filter.value === "string"
      ? filter.value
      : filter.value === undefined
        ? ""
        : JSON.stringify(filter.value);

  return (
    <div className="nama-dashboard-settings__row">
      <div className="nama-dashboard-settings__grid">
        <label className="nama-settings__field">
          <span>{translate("builder.controls.filterField")}</span>
          <input
            key={`field:${filter.field}`}
            className="nama-input"
            defaultValue={filter.field}
            maxLength={200}
            disabled={disabled}
            onBlur={(event) => {
              const field = event.currentTarget.value.trim();
              if (field === filter.field) return;
              if (!apply({ field })) event.currentTarget.value = filter.field;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>

        <label className="nama-settings__field">
          <span>{translate("builder.controls.filterOperator")}</span>
          <select
            className="nama-input"
            value={filter.operator}
            disabled={disabled}
            onChange={(event) =>
              commitOperator(event.currentTarget.value as FilterOperator)
            }
          >
            {FILTER_OPERATORS.map((operator) => (
              <option key={operator} value={operator}>
                {operator}
              </option>
            ))}
          </select>
        </label>

        <label className="nama-settings__field">
          <span>{translate("builder.controls.filterValue")}</span>
          <input
            key={`value:${displayValue}`}
            className="nama-input"
            defaultValue={displayValue}
            disabled={disabled}
            onBlur={(event) => {
              const raw = event.currentTarget.value;
              const parsed = parseFilterValue(filter.operator, raw);
              if (!parsed || !apply({ value: parsed })) {
                event.currentTarget.value = displayValue;
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
      </div>

      <div className="nama-dashboard-settings__actions">
        <button
          type="button"
          className="nama-button nama-button--danger"
          disabled={disabled}
          onClick={onRemove}
        >
          {translate("builder.controls.remove")}
        </button>
      </div>

      {error ? (
        <p className="nama-panel__hint" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function parseFilterValue(operator: FilterOperator, raw: string): unknown {
  if (operator === "in" || operator === "between") {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  if (raw === "") return "";
  if (raw === "true" || raw === "false") return raw === "true";

  const text = normalizeDigits(raw).trim();
  const numeric = Number(text);
  return text !== "" && Number.isFinite(numeric) && String(numeric) === text
    ? numeric
    : raw;
}

function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const timestamp = Date.parse(local);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}
