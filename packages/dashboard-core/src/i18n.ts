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
  "builder.toolbar.title": "Dashboard title",
  "builder.toolbar.save": "Save draft",
  "builder.toolbar.publish": "Publish",
  "builder.toolbar.undo": "Undo",
  "builder.toolbar.redo": "Redo",
  "builder.toolbar.preview": "Preview",
  "builder.toolbar.exitPreview": "Exit preview",
  "builder.toolbar.breakpoint.desktop": "Desktop",
  "builder.toolbar.breakpoint.tablet": "Tablet",
  "builder.toolbar.breakpoint.mobile": "Mobile",
  "builder.status.revision": "Revision {revision}",
  "builder.status.unsaved": "Unsaved changes",
  "builder.status.neverPublished": "Never published",
  "builder.status.savedAt": "Saved {time}",
  "builder.status.publishedAt": "Published {time}",
  "builder.status.saving": "Saving…",
  "builder.status.publishing": "Publishing…",
  "builder.notice.saved": "Draft saved.",
  "builder.notice.published": "Published.",
  "builder.notice.readOnly": "Your role can read this dashboard but cannot edit it.",
  "builder.conflict.title": "This dashboard changed elsewhere",
  "builder.conflict.body":
    "The server is at revision {current}, while this editor is based on revision {expected}. Your changes were not saved.",
  "builder.conflict.dismiss": "Keep editing",
  "builder.conflict.discard": "Discard local changes",
  "builder.palette.title": "Widgets",
  "builder.palette.empty": "No widget types are registered.",
  "builder.palette.add": "Add {name}",
  "builder.settings.title": "Widget settings",
  "builder.settings.none": "Select a widget to edit its settings.",
  "builder.settings.name": "Title",
  "builder.settings.dataSource": "Data source",
  "builder.settings.noOptions": "This widget has no configurable options.",
  "builder.settings.invalid": "Some values are not valid and were not applied.",
  "builder.settings.remove": "Remove widget",
  "builder.settings.moveLeft": "Move left",
  "builder.settings.moveRight": "Move right",
  "builder.settings.moveUp": "Move up",
  "builder.settings.moveDown": "Move down",
  "builder.settings.narrower": "Make narrower",
  "builder.settings.wider": "Make wider",
  "builder.settings.shorter": "Make shorter",
  "builder.settings.taller": "Make taller",
  "builder.canvas.label": "Dashboard editor canvas",
  "builder.canvas.unplaced": "Widgets without a position",
  "builder.canvas.manyWidgets":
    "This dashboard has {count} widgets; about 50 is the practical limit.",
  "builder.canvas.place": "Place",
  "builder.error.unknownWidget": "Unknown widget type: {type}",
  "builder.error.widgetLimit": "This dashboard already has {limit} widgets",
  "builder.canvas.ltrNotice":
    "The canvas only supports left-to-right editing in this version",
  "viewer.empty": "This dashboard has no widgets",
  "widget.empty": "No data",
  "widget.loading": "Loading…",
  "widget.error": "This widget could not be displayed",
  "widget.invalidConfig": "This widget's configuration is invalid",
  "widget.unknown": "Unknown widget type: {type}",
  "widget.unsupportedVersion": "{type} config version {version} is not supported",
  "widget.truncated": "Showing partial results",
  "widgets.settings.auto": "Auto",
  "widgets.settings.seriesLabel": "Series label",
  "widgets.settings.categoryField": "Category field",
  "widgets.settings.valueField": "Value field",
  "widgets.settings.labelField": "Label field",
  "widgets.settings.smooth": "Smooth line",
  "widgets.settings.area": "Fill area",
  "widgets.settings.label": "Label",
  "widgets.settings.unit": "Unit",
  "widgets.settings.min": "Minimum",
  "widgets.settings.max": "Maximum",
  "widgets.settings.donut": "Donut",
  "widgets.settings.maxRows": "Maximum rows",
  "controls.title": "Dashboard controls",
  "controls.timeRange": "Time range",
  "controls.timeRange.default": "Default",
  "controls.timeRange.15m": "15 min",
  "controls.timeRange.1h": "1 hour",
  "controls.timeRange.6h": "6 hours",
  "controls.timeRange.24h": "24 hours",
  "controls.timeRange.7d": "7 days",
  "controls.timeRange.30d": "30 days",
  "controls.variable": "Variable {name}",
  "controls.rangeFrom": "From",
  "controls.rangeTo": "To",
  "controls.reset": "Reset",
  "builder.controls.title": "Dashboard variables",
  "builder.controls.addVariable": "Add variable",
  "builder.controls.addFilter": "Add filter",
  "builder.controls.name": "Name",
  "builder.controls.type": "Type",
  "builder.controls.defaultValue": "Default value",
  "builder.controls.bindingTarget": "Binding",
  "builder.controls.bindingParameter": "Target name",
  "builder.controls.filterField": "Filter field",
  "builder.controls.filterOperator": "Operator",
  "builder.controls.filterValue": "Filter value",
  "builder.controls.remove": "Remove",
  "builder.controls.empty": "No variables yet.",
  "builder.controls.invalid": "Some values are not valid and were not applied.",
  "builder.controls.filtersTitle": "Dashboard filters",
  "builder.controls.filtersEmpty": "No dashboard filters yet.",
  "builder.controls.type.string": "Text",
  "builder.controls.type.number": "Number",
  "builder.controls.type.boolean": "Boolean",
  "builder.controls.type.date": "Date",
  "builder.controls.type.timeRange": "Time range",
  "builder.controls.target.queryParameter": "Query parameter",
  "builder.controls.target.queryTimeRange": "Query time range",
  "builder.controls.target.filterValue": "Filter value",
  "builder.settings.visibility": "Visibility",
  "builder.settings.visibilityEnabled": "Visible",
  "builder.settings.visibilityCondition": "Show when",
  "builder.settings.visibilityHint": 'Example: region == "eu" and not archived',
  "builder.settings.interaction": "Selection variable",
  "builder.settings.interactionNone": "None",
  "builder.settings.interactionHint": "Clicking a category sets the selected variable.",
  "builder.toolbar.export": "Export",
  "builder.toolbar.import": "Import",
  "builder.import.error": "This file is not a valid dashboard export.",
  "builder.import.confirm": "Replace the current draft with the imported dashboard?",
};

const FA_MESSAGES: Record<string, string> = {
  "builder.toolbar.title": "عنوان داشبورد",
  "builder.toolbar.save": "ذخیرهٔ پیش‌نویس",
  "builder.toolbar.publish": "انتشار",
  "builder.toolbar.undo": "واگرد",
  "builder.toolbar.redo": "ازنو",
  "builder.toolbar.preview": "پیش‌نمایش",
  "builder.toolbar.exitPreview": "خروج از پیش‌نمایش",
  "builder.toolbar.breakpoint.desktop": "رایانه",
  "builder.toolbar.breakpoint.tablet": "تبلت",
  "builder.toolbar.breakpoint.mobile": "موبایل",
  "builder.status.revision": "نسخهٔ {revision}",
  "builder.status.unsaved": "تغییرات ذخیره‌نشده",
  "builder.status.neverPublished": "هرگز منتشر نشده",
  "builder.status.savedAt": "ذخیره {time}",
  "builder.status.publishedAt": "انتشار {time}",
  "builder.status.saving": "در حال ذخیره…",
  "builder.status.publishing": "در حال انتشار…",
  "builder.notice.saved": "پیش‌نویس ذخیره شد.",
  "builder.notice.published": "منتشر شد.",
  "builder.notice.readOnly":
    "نقش شما اجازهٔ خواندن این داشبورد را دارد، اما ویرایش آن را ندارد.",
  "builder.conflict.title": "این داشبورد جای دیگری تغییر کرده است",
  "builder.conflict.body":
    "سرور در نسخهٔ {current} است، در حالی که این ویرایشگر بر نسخهٔ {expected} بنا شده است. تغییرات شما ذخیره نشد.",
  "builder.conflict.dismiss": "ادامهٔ ویرایش",
  "builder.conflict.discard": "دورریختن تغییرات محلی",
  "builder.palette.title": "ویجت‌ها",
  "builder.palette.empty": "هیچ نوع ویجتی ثبت نشده است.",
  "builder.palette.add": "افزودن {name}",
  "builder.settings.title": "تنظیمات ویجت",
  "builder.settings.none": "برای ویرایش تنظیمات، یک ویجت را انتخاب کنید.",
  "builder.settings.name": "عنوان",
  "builder.settings.dataSource": "منبع داده",
  "builder.settings.noOptions": "این ویجت گزینهٔ قابل تنظیمی ندارد.",
  "builder.settings.invalid": "برخی مقادیر معتبر نیستند و اعمال نشدند.",
  "builder.settings.remove": "حذف ویجت",
  "builder.settings.moveLeft": "جابه‌جایی به چپ",
  "builder.settings.moveRight": "جابه‌جایی به راست",
  "builder.settings.moveUp": "جابه‌جایی به بالا",
  "builder.settings.moveDown": "جابه‌جایی به پایین",
  "builder.settings.narrower": "باریک‌تر",
  "builder.settings.wider": "پهن‌تر",
  "builder.settings.shorter": "کوتاه‌تر",
  "builder.settings.taller": "بلندتر",
  "builder.canvas.label": "بوم ویرایش داشبورد",
  "builder.canvas.unplaced": "ویجت‌های بدون جایگاه",
  "builder.canvas.manyWidgets":
    "این داشبورد {count} ویجت دارد؛ حد عملی حدود ۵۰ ویجت است.",
  "builder.canvas.place": "جای‌گذاری",
  "builder.error.unknownWidget": "نوع ویجت ناشناخته: {type}",
  "builder.error.widgetLimit": "این داشبورد از قبل {limit} ویجت دارد",
  "builder.canvas.ltrNotice":
    "ویرایشگر داشبورد در این نسخه فقط از چیدمان چپ‌به‌راست پشتیبانی می‌کند",
  "viewer.empty": "این داشبورد هیچ ویجتی ندارد",
  "widget.empty": "داده‌ای برای نمایش نیست",
  "widget.loading": "در حال بارگذاری…",
  "widget.error": "نمایش این ویجت ممکن نشد",
  "widget.invalidConfig": "پیکربندی این ویجت معتبر نیست",
  "widget.unknown": "نوع ویجت ناشناخته: {type}",
  "widget.unsupportedVersion": "نسخهٔ پیکربندی {version} برای {type} پشتیبانی نمی‌شود",
  "widget.truncated": "نتایج به‌صورت بخشی نمایش داده می‌شوند",
  "widgets.settings.auto": "خودکار",
  "widgets.settings.seriesLabel": "برچسب سری",
  "widgets.settings.categoryField": "ستون دسته",
  "widgets.settings.valueField": "ستون مقدار",
  "widgets.settings.labelField": "ستون برچسب",
  "widgets.settings.smooth": "خط نرم",
  "widgets.settings.area": "پر کردن ناحیه",
  "widgets.settings.label": "برچسب",
  "widgets.settings.unit": "واحد",
  "widgets.settings.min": "کمینه",
  "widgets.settings.max": "بیشینه",
  "widgets.settings.donut": "حلقه‌ای",
  "widgets.settings.maxRows": "حداکثر ردیف‌ها",
  "controls.title": "کنترل‌های داشبورد",
  "controls.timeRange": "بازهٔ زمانی",
  "controls.timeRange.default": "پیش‌فرض",
  "controls.timeRange.15m": "۱۵ دقیقه",
  "controls.timeRange.1h": "۱ ساعت",
  "controls.timeRange.6h": "۶ ساعت",
  "controls.timeRange.24h": "۲۴ ساعت",
  "controls.timeRange.7d": "۷ روز",
  "controls.timeRange.30d": "۳۰ روز",
  "controls.variable": "متغیر {name}",
  "controls.rangeFrom": "از",
  "controls.rangeTo": "تا",
  "controls.reset": "بازنشانی",
  "builder.controls.title": "متغیرهای داشبورد",
  "builder.controls.addVariable": "افزودن متغیر",
  "builder.controls.addFilter": "افزودن فیلتر",
  "builder.controls.name": "نام",
  "builder.controls.type": "نوع",
  "builder.controls.defaultValue": "مقدار پیش‌فرض",
  "builder.controls.bindingTarget": "اتصال",
  "builder.controls.bindingParameter": "نام هدف",
  "builder.controls.filterField": "فیلد فیلتر",
  "builder.controls.filterOperator": "عملگر",
  "builder.controls.filterValue": "مقدار فیلتر",
  "builder.controls.remove": "حذف",
  "builder.controls.empty": "هنوز متغیری تعریف نشده است.",
  "builder.controls.invalid": "برخی مقادیر معتبر نیستند و اعمال نشدند.",
  "builder.controls.filtersTitle": "فیلترهای داشبورد",
  "builder.controls.filtersEmpty": "هنوز فیلتری تعریف نشده است.",
  "builder.controls.type.string": "متن",
  "builder.controls.type.number": "عدد",
  "builder.controls.type.boolean": "بولی",
  "builder.controls.type.date": "تاریخ",
  "builder.controls.type.timeRange": "بازهٔ زمانی",
  "builder.controls.target.queryParameter": "پارامتر پرس‌وجو",
  "builder.controls.target.queryTimeRange": "بازهٔ زمانی پرس‌وجو",
  "builder.controls.target.filterValue": "مقدار فیلتر",
  "builder.settings.visibility": "نمایش",
  "builder.settings.visibilityEnabled": "نمایش داده شود",
  "builder.settings.visibilityCondition": "نمایش در صورت",
  "builder.settings.visibilityHint": 'نمونه: region == "eu" and not archived',
  "builder.settings.interaction": "متغیر انتخاب",
  "builder.settings.interactionNone": "هیچ",
  "builder.settings.interactionHint":
    "کلیک روی یک دسته، متغیر انتخاب‌شده را تنظیم می‌کند.",
  "builder.toolbar.export": "خروجی",
  "builder.toolbar.import": "ورودی",
  "builder.import.error": "این فایل، خروجی معتبر یک داشبورد نیست.",
  "builder.import.confirm": "پیش‌نویس فعلی با داشبورد واردشده جایگزین شود؟",
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

/**
 * Parses user-entered numbers after normalizing Persian and Arabic-Indic
 * digits. Group separators (including the Persian `٬` and the thin spaces
 * `Intl` emits) are dropped and the Arabic decimal separator `٫` becomes `.`.
 * Returns `undefined` for empty or non-numeric input so callers keep the
 * previous value instead of committing a junk number.
 */
export function parseLocalizedNumber(text: string): number | undefined {
  const normalized = normalizeDigits(text)
    .replace(/[\s\u00a0\u202f,\u066c]/gu, "")
    .replace(/\u066b/gu, ".");

  if (normalized === "") return undefined;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
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

/**
 * Persian dates display in the Solar Hijri calendar through ICU. The tag is
 * explicit so the result does not depend on a runtime's default calendar; the
 * stored value and the native date input stay Gregorian ISO.
 */
export function dateLocale(locale: string): string {
  return locale.startsWith("fa") ? "fa-IR-u-ca-persian" : locale;
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
        dateLocale(locale),
        timeZone ? { ...dateOptions, timeZone } : dateOptions,
      ).format(date);
    },
  };
}
