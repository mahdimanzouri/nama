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
