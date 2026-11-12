import {
  isVariableValue,
  queryFilterSchema,
  queryRequestSchema,
  queryTimeRangeSchema,
  type DashboardConfig,
  type DashboardControlValues,
  type DashboardFilter,
  type DashboardWidget,
  type QueryFilter,
  type QueryRequest,
  type QueryTimeRange,
} from "@nama/dashboard-types";

import { buildQueryRequest, resolveQueryTimeRange } from "./query";

/** Defaults for every declared variable; unknown host values are ignored. */
export function defaultVariables(
  config: Pick<DashboardConfig, "variables">,
): Record<string, unknown> {
  return Object.fromEntries(
    config.variables.map((variable) => [variable.name, variable.defaultValue]),
  );
}

/**
 * Fills control values from defaults. A host value that does not match the
 * declared type falls back to the default rather than reaching a query.
 */
export function resolveControlValues(
  config: Pick<DashboardConfig, "variables">,
  input: Partial<DashboardControlValues> = {},
): DashboardControlValues {
  const variables: Record<string, unknown> = {};

  for (const variable of config.variables) {
    const candidate = input.variables?.[variable.name];
    variables[variable.name] = isVariableValue(variable.type, candidate)
      ? candidate
      : variable.defaultValue;
  }

  const range = queryTimeRangeSchema.safeParse(input.timeRange);

  return range.success ? { variables, timeRange: range.data } : { variables };
}

interface BoundValues {
  parameters: Record<string, unknown>;
  filters: Map<string, unknown>;
  timeRange?: QueryTimeRange;
}

function bindVariables(
  config: Pick<DashboardConfig, "variables">,
  values: DashboardControlValues,
): BoundValues {
  const parameters: Record<string, unknown> = {};
  const filters = new Map<string, unknown>();
  let timeRange: QueryTimeRange | undefined;

  for (const variable of config.variables) {
    const value = values.variables[variable.name];
    if (value === undefined) continue;

    for (const binding of variable.bindings) {
      switch (binding.target) {
        case "query.parameter":
          parameters[binding.parameter] = value;
          break;
        case "query.timeRange": {
          const range = queryTimeRangeSchema.safeParse(value);
          if (range.success) timeRange = range.data;
          break;
        }
        case "filter.value":
          filters.set(binding.parameter, value);
          break;
      }
    }
  }

  return {
    parameters,
    filters,
    ...(timeRange === undefined ? {} : { timeRange }),
  };
}

/**
 * Substitutes variable-bound filter values. A binding names its filter by id
 * first and by field name second.
 */
export function resolveDashboardFilters(
  config: Pick<DashboardConfig, "variables" | "filters">,
  values: DashboardControlValues,
): DashboardFilter[] {
  const bound = bindVariables(config, values).filters;

  return config.filters.map((filter) => {
    if (bound.has(filter.id)) return { ...filter, value: bound.get(filter.id) };
    if (bound.has(filter.field)) return { ...filter, value: bound.get(filter.field) };
    return filter;
  });
}

/**
 * Dashboard filters apply to widgets whose query selects the filtered field;
 * unrelated widgets keep working when an organization adds a global filter.
 */
function applicableFilters(
  filters: readonly DashboardFilter[],
  fields: readonly string[],
): QueryFilter[] {
  return filters
    .filter((filter) => filter.value !== undefined && fields.includes(filter.field))
    .map((filter) => ({
      field: filter.field,
      operator: filter.operator,
      value: filter.value,
    }));
}

export interface BuildControlledQueryOptions {
  /** Clock used to resolve relative ranges; tests pin it. */
  now?: Date;
  variables?: Readonly<Record<string, unknown>>;
  /** Dashboard-wide range, for example from a time-range picker. */
  timeRange?: QueryTimeRange;
  /** Host parameters, applied after variable bindings. */
  parameters?: Record<string, unknown>;
}

/**
 * Resolves dashboard variables, filters and the selected time range into a
 * single query request. Precedence for the range is dashboard control, then a
 * `query.timeRange` binding, then the widget's persisted range.
 */
export function buildControlledQueryRequest(
  widget: DashboardWidget,
  config: Pick<DashboardConfig, "variables" | "filters">,
  options: BuildControlledQueryOptions = {},
): QueryRequest | undefined {
  if (!widget.query || !widget.dataSourceId) return undefined;

  const values = resolveControlValues(config, {
    ...(options.variables === undefined ? {} : { variables: options.variables }),
    ...(options.timeRange === undefined ? {} : { timeRange: options.timeRange }),
  });
  const bound = bindVariables(config, values);
  const range = resolveQueryTimeRange(
    values.timeRange ?? bound.timeRange,
    options.now ?? new Date(),
  );
  const parameters = { ...bound.parameters, ...options.parameters };
  const base = buildQueryRequest(widget, {
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(Object.keys(parameters).length === 0 ? {} : { parameters }),
    ...(range === undefined ? {} : { timeRange: range }),
  });

  if (!base) return undefined;

  const merged = [
    ...(base.query.filters ?? []),
    ...applicableFilters(resolveDashboardFilters(config, values), base.query.fields),
  ];

  return queryRequestSchema.parse({
    ...base,
    query: {
      ...base.query,
      ...(merged.length === 0
        ? {}
        : { filters: merged.map((filter) => queryFilterSchema.parse(filter)) }),
    },
  });
}

type Token =
  | { kind: "identifier"; value: string }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "operator"; value: "==" | "!=" | ">" | ">=" | "<" | "<=" }
  | { kind: "logical"; value: "and" | "or" }
  | { kind: "not" };

const TOKEN_PATTERN =
  /\s*(?:(==|!=|>=|<=|>|<)|([A-Za-z_][A-Za-z0-9_]*)|(-?\d+(?:\.\d+)?)|("([^"]*)"|'([^']*)'))/uy;

function tokenize(expression: string): Token[] | undefined {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    TOKEN_PATTERN.lastIndex = index;
    const match = TOKEN_PATTERN.exec(expression);
    if (!match) return undefined;
    index = TOKEN_PATTERN.lastIndex;

    const [whole, operator, identifier, number, , doubleQuoted, singleQuoted] = match;

    if (operator) {
      tokens.push({
        kind: "operator",
        value: operator as Extract<Token, { kind: "operator" }>["value"],
      });
    } else if (number !== undefined) {
      tokens.push({ kind: "literal", value: Number(number) });
    } else if (doubleQuoted !== undefined || singleQuoted !== undefined) {
      tokens.push({ kind: "literal", value: doubleQuoted ?? singleQuoted ?? "" });
    } else if (identifier !== undefined) {
      if (identifier === "and" || identifier === "or") {
        tokens.push({ kind: "logical", value: identifier });
      } else if (identifier === "true" || identifier === "false") {
        tokens.push({ kind: "literal", value: identifier === "true" });
      } else if (identifier === "not") {
        tokens.push({ kind: "not" });
      } else {
        tokens.push({ kind: "identifier", value: identifier });
      }
    } else {
      return undefined;
    }

    if (whole === undefined) return undefined;
  }

  return tokens;
}

function truthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return value.length > 0;
  return value !== undefined && value !== null;
}

function compare(
  left: unknown,
  operator: Extract<Token, { kind: "operator" }>["value"],
  right: string | number | boolean,
): boolean {
  if (left === undefined) return false;
  if (operator === "==") return String(left) === String(right);
  if (operator === "!=") return String(left) !== String(right);

  if (typeof left !== "number" || typeof right !== "number") return false;

  switch (operator) {
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
  }
}

/**
 * Evaluates the visibility grammar: comparisons (`name == "value"`, `name > 3`)
 * joined by `and`/`or`, a bare variable (truthy), or `not name`. Parentheses are
 * not supported. A missing variable is false; a malformed expression is treated
 * as visible so a typo never hides a widget silently.
 */
export function evaluateVisibilityCondition(
  condition: string,
  variables: Readonly<Record<string, unknown>>,
): boolean {
  const tokens = tokenize(condition);
  if (!tokens || tokens.length === 0) return true;

  let position = 0;

  const peek = (): Token | undefined => tokens[position];
  const next = (): Token | undefined => tokens[position++];
  const isJoin = (value: "and" | "or"): boolean => {
    const token = peek();
    return token?.kind === "logical" && token.value === value;
  };

  function parseValue(): { value: unknown } | undefined {
    const token = next();
    if (!token) return undefined;
    if (token.kind === "identifier") {
      return {
        value: Object.hasOwn(variables, token.value) ? variables[token.value] : undefined,
      };
    }
    if (token.kind === "literal") return { value: token.value };
    return undefined;
  }

  function parseComparison(): boolean | undefined {
    const token = peek();

    if (token?.kind === "not") {
      next();
      const operand = parseComparison();
      return operand === undefined ? undefined : !operand;
    }

    const left = parseValue();
    if (!left) return undefined;

    const operator = peek();
    if (operator?.kind !== "operator") return truthy(left.value);

    next();
    const right = parseValue();
    if (!right) return undefined;

    return compare(left.value, operator.value, right.value as string | number | boolean);
  }

  function parseAnd(): boolean | undefined {
    let value = parseComparison();
    if (value === undefined) return undefined;

    while (isJoin("and")) {
      next();
      const right = parseComparison();
      if (right === undefined) return undefined;
      value = value && right;
    }

    return value;
  }

  let result = parseAnd();
  if (result === undefined) return true;

  while (isJoin("or")) {
    next();
    const right = parseAnd();
    if (right === undefined) return true;
    result = result || right;
  }

  return result;
}

export function isWidgetVisible(
  widget: Pick<DashboardWidget, "visibility">,
  values: DashboardControlValues,
): boolean {
  if (widget.visibility?.enabled === false) return false;
  if (widget.visibility?.condition) {
    return evaluateVisibilityCondition(widget.visibility.condition, values.variables);
  }
  return true;
}
