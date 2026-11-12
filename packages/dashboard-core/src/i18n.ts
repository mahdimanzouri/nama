import { SUPPORTED_LOCALES, type Locale } from "@nama/dashboard-types";

export type Direction = "ltr" | "rtl";

export interface DashboardI18n {
  locale: string;
  direction: Direction;
  translate(key: string, values?: Record<string, unknown>): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string;
}

const EN_MESSAGES: Record<string, string> = {
  "builder.toolbar.save": "Save draft",
  "builder.toolbar.publish": "Publish",
  "builder.conflict.title": "This dashboard changed elsewhere",
  "builder.canvas.ltrNotice":
    "The canvas only supports left-to-right editing in this version",
  "viewer.empty": "This dashboard has no widgets",
  "widget.empty": "No data",
  "widget.loading": "Loading…",
  "widget.error": "This widget could not be displayed",
  "widget.invalidConfig": "This widget's configuration is invalid",
  "widget.unknown": "Unknown widget type: {type}",
  "widget.unsupportedVersion": "{type} config version {version} is not supported",
};

const FA_MESSAGES: Record<string, string> = {
  "builder.toolbar.save": "ذخیرهٔ پیش‌نویس",
  "builder.toolbar.publish": "انتشار",
  "builder.conflict.title": "این داشبورد جای دیگری تغییر کرده است",
  "builder.canvas.ltrNotice":
    "ویرایشگر داشبورد در این نسخه فقط از چیدمان چپ‌به‌راست پشتیبانی می‌کند",
  "viewer.empty": "این داشبورد هیچ ویجتی ندارد",
  "widget.empty": "داده‌ای برای نمایش نیست",
  "widget.loading": "در حال بارگذاری…",
  "widget.error": "نمایش این ویجت ممکن نشد",
  "widget.invalidConfig": "پیکربندی این ویجت معتبر نیست",
  "widget.unknown": "نوع ویجت ناشناخته: {type}",
  "widget.unsupportedVersion": "نسخهٔ پیکربندی {version} برای {type} پشتیبانی نمی‌شود",
};

export const SDK_MESSAGES: Readonly<Record<Locale, Readonly<Record<string, string>>>> =
  Object.freeze({ en: Object.freeze(EN_MESSAGES), fa: Object.freeze(FA_MESSAGES) });

const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

/** Converts Persian and Arabic-Indic digits to ASCII before validation. */
export function normalizeDigits(value: string): string {
  let result = "";

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= PERSIAN_ZERO && codePoint <= PERSIAN_ZERO + 9) {
      result += String(codePoint - PERSIAN_ZERO);
    } else if (codePoint >= ARABIC_INDIC_ZERO && codePoint <= ARABIC_INDIC_ZERO + 9) {
      result += String(codePoint - ARABIC_INDIC_ZERO);
    } else {
      result += character;
    }
  }

  return result;
}

function defaultDirection(locale: string): Direction {
  return locale.startsWith("fa") || locale.startsWith("ar") ? "rtl" : "ltr";
}

function interpolate(template: string, values?: Record<string, unknown>): string {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

function catalogFor(locale: string): Readonly<Record<string, string>> {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? SDK_MESSAGES[locale as Locale]
    : SDK_MESSAGES.en;
}

function isDevelopment(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.env !== "undefined" &&
    process.env.NODE_ENV !== "production"
  );
}

export interface DashboardI18nOptions {
  locale: string;
  direction?: Direction;
  /** Host overrides; win over SDK messages. */
  messages?: Readonly<Record<string, string>>;
  /** Display time zone for `formatDate`; UTC is the storage time zone. */
  timezone?: string;
  warn?: (message: string) => void;
}

/**
 * Builds the injected i18n facade. Resolution is host messages → SDK catalog →
 * English → the key itself, with one development warning per missing key.
 * Translation never throws.
 */
export function createDashboardI18n(options: DashboardI18nOptions): DashboardI18n {
  const { locale, messages, timezone } = options;
  const direction = options.direction ?? defaultDirection(locale);
  const catalog = catalogFor(locale);
  const warned = new Set<string>();
  const warn =
    options.warn ??
    ((message: string) => {
      if (!isDevelopment()) return;
      console.warn(message);
    });

  return {
    locale,
    direction,
    translate(key, values) {
      const template = messages?.[key] ?? catalog[key] ?? SDK_MESSAGES.en[key];
      if (template === undefined) {
        if (!warned.has(key)) {
          warned.add(key);
          warn(`[nama] missing translation for "${key}" in "${locale}"`);
        }
        return key;
      }
      return interpolate(template, values);
    },
    formatNumber(value, numberOptions) {
      return new Intl.NumberFormat(locale, numberOptions).format(value);
    },
    formatDate(value, dateOptions = {}) {
      const date = value instanceof Date ? value : new Date(value);
      const timeZone = dateOptions.timeZone ?? timezone;
      return new Intl.DateTimeFormat(
        locale,
        timeZone ? { ...dateOptions, timeZone } : dateOptions,
      ).format(date);
    },
  };
}
