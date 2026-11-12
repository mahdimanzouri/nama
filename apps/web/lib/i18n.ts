import { createDashboardI18n, type DashboardI18n } from "@nama/dashboard-builder";
import { SUPPORTED_LOCALES, type Locale } from "@nama/dashboard-types";

import { DASHBOARD_TEMPLATES } from "./templates";

/**
 * Chrome strings for the web app. Dashboard titles, widget configs and template
 * widget labels are authored content and stay as saved, not translated here.
 */
const WEB_MESSAGES: Record<Locale, Readonly<Record<string, string>>> = {
  en: {
    "web.common.tryAgain": "Try again",
    "web.common.loading": "Loading…",
    "web.common.back": "Back",
    "web.common.backToDashboards": "Back to dashboards",
    "web.common.signIn": "Sign in",
    "web.common.signOut": "Sign out",
    "web.common.openDashboards": "Open dashboards",
    "web.common.dashboards": "Dashboards",
    "web.common.primaryNav": "Primary",
    "web.common.redirecting": "Redirecting to sign in…",
    "web.common.loadingWorkspace": "Loading workspace…",
    "web.common.language": "Language",
    "web.common.theme": "Theme",
    "web.common.errorFallback": "Something went wrong. Check that the API is running.",
    "web.theme.light": "Light",
    "web.theme.dark": "Dark",
    "web.theme.system": "System",
    "web.home.tagline": "walking skeleton",
    "web.home.description":
      "Sign in, build a monitoring dashboard with a KPI and a line chart over HTTP polling, publish it and view the published configuration as a second user.",
    "web.home.locales": "Locales",
    "web.home.maxWidgets": "Max widgets",
    "web.home.queryTimeout": "Query timeout",
    "web.home.seconds": "{value}s",
    "web.login.title": "Sign in",
    "web.login.description":
      "The walking skeleton seeds two accounts in the Nama Demo organization. Data resets when the API restarts.",
    "web.login.email": "Email",
    "web.login.password": "Password",
    "web.login.pending": "Signing in…",
    "web.login.demoAccounts": "Demo accounts",
    "web.login.role.editor": "Editor",
    "web.login.role.viewer": "Viewer",
    "web.login.hint.editor": "create, edit and publish",
    "web.login.hint.viewer": "read published dashboards only",
    "web.dashboards.title": "Dashboards",
    "web.dashboards.signedInAs": "signed in as {name} ({role})",
    "web.dashboards.newName": "New dashboard name",
    "web.dashboards.namePlaceholder": "Operations overview",
    "web.dashboards.template": "Template",
    "web.dashboards.blankTemplate": "Blank dashboard",
    "web.dashboards.creating": "Creating…",
    "web.dashboards.create": "Create dashboard",
    "web.dashboards.cannotCreate":
      "Your role can view published dashboards but cannot create new ones.",
    "web.dashboards.loading": "Loading dashboards…",
    "web.dashboards.empty": "No dashboards in this organization yet.",
    "web.dashboards.meta.editor": "Revision {revision} · updated {time} · {state}",
    "web.dashboards.state.published": "published",
    "web.dashboards.state.draftOnly": "draft only",
    "web.dashboards.meta.viewer": "Published revision {revision} · {time}",
    "web.dashboards.meta.unpublished": "Not published yet",
    "web.dashboards.badge.published": "Published",
    "web.dashboards.badge.draft": "Draft",
    "web.dashboards.view": "View",
    "web.dashboards.edit": "Edit",
    "web.editor.loading": "Loading the draft…",
    "web.editor.openPublished": "Open published view",
    "web.editor.readOnly": "Your role can read this dashboard but cannot save edits.",
    "web.editor.conflict.body":
      "The server is at revision {current}. Reloading fetches that draft and replaces the local changes in this tab.",
    "web.editor.conflict.reloading": "Reloading…",
    "web.editor.conflict.reload": "Reload latest draft",
    "web.editor.versions.title": "Version history",
    "web.editor.versions.aria": "Version history",
    "web.editor.versions.hide": "Hide versions",
    "web.editor.versions.show": "Show versions",
    "web.editor.versions.loading": "Loading versions…",
    "web.editor.versions.empty": "This dashboard has not been published yet.",
    "web.editor.versions.entry": "Revision {revision} · {title}",
    "web.editor.versions.restore": "Restore into draft",
    "web.editor.versions.restored": "Restored revision {revision} into the draft.",
    "web.viewer.loading": "Loading the published dashboard…",
    "web.viewer.notPublished":
      "This dashboard has not been published yet. Drafts stay private to its editors.",
    "web.viewer.meta": "revision {revision} · published {time}",
    "web.viewer.meta.published": "revision {revision} · published",
    "web.templates.operations.name": "Operations overview",
    "web.templates.operations.description":
      "KPI row, trend, recent samples and a category bar chart. Selecting a bar narrows the dashboard to that sample.",
    "web.templates.trendAnalysis.name": "Trend analysis",
    "web.templates.trendAnalysis.description":
      "Trend and smoothed trend charts with a recent-sample breakdown. Clicking a series filters the table and reveals the selected sample.",
  },
  fa: {
    "web.common.tryAgain": "تلاش دوباره",
    "web.common.loading": "در حال بارگذاری…",
    "web.common.back": "بازگشت",
    "web.common.backToDashboards": "بازگشت به داشبوردها",
    "web.common.signIn": "ورود",
    "web.common.signOut": "خروج",
    "web.common.openDashboards": "مشاهدهٔ داشبوردها",
    "web.common.dashboards": "داشبوردها",
    "web.common.primaryNav": "ناوبری اصلی",
    "web.common.redirecting": "در حال انتقال به صفحهٔ ورود…",
    "web.common.loadingWorkspace": "در حال بارگذاری فضای کار…",
    "web.common.language": "زبان",
    "web.common.theme": "پوسته",
    "web.common.errorFallback": "خطایی رخ داد. بررسی کنید API در حال اجرا باشد.",
    "web.theme.light": "روشن",
    "web.theme.dark": "تیره",
    "web.theme.system": "سیستم",
    "web.home.tagline": "اسکلت ابتدایی",
    "web.home.description":
      "وارد شوید، یک داشبورد پایش با شاخص کلیدی و نمودار خطی روی HTTP بسازید، آن را منتشر کنید و پیکربندی منتشرشده را با کاربر دیگری ببینید.",
    "web.home.locales": "زبان‌ها",
    "web.home.maxWidgets": "حداکثر ویجت",
    "web.home.queryTimeout": "مهلت پرس‌وجو",
    "web.home.seconds": "{value} ثانیه",
    "web.login.title": "ورود",
    "web.login.description":
      "اسکلت ابتدایی دو حساب در سازمان نمونهٔ نما ایجاد می‌کند. داده‌ها با راه‌اندازی دوبارهٔ API بازنشانی می‌شوند.",
    "web.login.email": "ایمیل",
    "web.login.password": "گذرواژه",
    "web.login.pending": "در حال ورود…",
    "web.login.demoAccounts": "حساب‌های نمونه",
    "web.login.role.editor": "ویرایشگر",
    "web.login.role.viewer": "بیننده",
    "web.login.hint.editor": "ساخت، ویرایش و انتشار",
    "web.login.hint.viewer": "فقط مشاهدهٔ داشبوردهای منتشرشده",
    "web.dashboards.title": "داشبوردها",
    "web.dashboards.signedInAs": "ورود به‌عنوان {name} ({role})",
    "web.dashboards.newName": "نام داشبورد جدید",
    "web.dashboards.namePlaceholder": "نمای عملیات",
    "web.dashboards.template": "الگو",
    "web.dashboards.blankTemplate": "داشبورد خالی",
    "web.dashboards.creating": "در حال ساخت…",
    "web.dashboards.create": "ساخت داشبورد",
    "web.dashboards.cannotCreate":
      "نقش شما می‌تواند داشبوردهای منتشرشده را ببیند، اما اجازهٔ ساخت داشبورد تازه ندارد.",
    "web.dashboards.loading": "در حال بارگذاری داشبوردها…",
    "web.dashboards.empty": "هنوز داشبوردی در این سازمان نیست.",
    "web.dashboards.meta.editor": "نسخهٔ {revision} · به‌روزرسانی {time} · {state}",
    "web.dashboards.state.published": "منتشرشده",
    "web.dashboards.state.draftOnly": "فقط پیش‌نویس",
    "web.dashboards.meta.viewer": "نسخهٔ منتشرشدهٔ {revision} · {time}",
    "web.dashboards.meta.unpublished": "هنوز منتشر نشده",
    "web.dashboards.badge.published": "منتشرشده",
    "web.dashboards.badge.draft": "پیش‌نویس",
    "web.dashboards.view": "نمایش",
    "web.dashboards.edit": "ویرایش",
    "web.editor.loading": "در حال بارگذاری پیش‌نویس…",
    "web.editor.openPublished": "گشودن نمای منتشرشده",
    "web.editor.readOnly":
      "نقش شما اجازهٔ خواندن این داشبورد را دارد، اما ذخیرهٔ تغییرات را ندارد.",
    "web.editor.conflict.body":
      "سرور در نسخهٔ {current} است. بارگذاری دوباره آن پیش‌نویس را می‌آورد و تغییرات محلی این زبانه را جایگزین می‌کند.",
    "web.editor.conflict.reloading": "در حال بارگذاری…",
    "web.editor.conflict.reload": "بارگذاری آخرین پیش‌نویس",
    "web.editor.versions.title": "تاریخچهٔ نسخه‌ها",
    "web.editor.versions.aria": "تاریخچهٔ نسخه‌ها",
    "web.editor.versions.hide": "پنهان‌کردن نسخه‌ها",
    "web.editor.versions.show": "نمایش نسخه‌ها",
    "web.editor.versions.loading": "در حال بارگذاری نسخه‌ها…",
    "web.editor.versions.empty": "این داشبورد هنوز منتشر نشده است.",
    "web.editor.versions.entry": "نسخهٔ {revision} · {title}",
    "web.editor.versions.restore": "بازگرداندن به پیش‌نویس",
    "web.editor.versions.restored": "نسخهٔ {revision} در پیش‌نویس بازگردانده شد.",
    "web.viewer.loading": "در حال بارگذاری داشبورد منتشرشده…",
    "web.viewer.notPublished":
      "این داشبورد هنوز منتشر نشده است. پیش‌نویس‌ها خصوصی و مخصوص ویرایشگران است.",
    "web.viewer.meta": "نسخهٔ {revision} · انتشار {time}",
    "web.viewer.meta.published": "نسخهٔ {revision} · منتشرشده",
    "web.templates.operations.name": "نمای عملیات",
    "web.templates.operations.description":
      "ردیف شاخص‌ها، روند، نمونه‌های اخیر و نمودار میله‌ای دسته‌ها. انتخاب یک میله داشبورد را به همان نمونه محدود می‌کند.",
    "web.templates.trendAnalysis.name": "تحلیل روند",
    "web.templates.trendAnalysis.description":
      "نمودارهای روند و روند هموارشده همراه با تفکیک نمونه‌های اخیر. کلیک روی یک سری جدول را فیلتر می‌کند و نمونهٔ انتخاب‌شده را نشان می‌دهد.",
  },
};

const TEMPLATE_KEYS: Record<string, string> = {
  operations: "operations",
  "trend-analysis": "trendAnalysis",
};

/** Template display names live in the catalog; widget content stays authored. */
export function templateLabels(
  t: DashboardI18n,
): readonly { id: string; name: string; description: string }[] {
  return DASHBOARD_TEMPLATES.map((template) => {
    const key = TEMPLATE_KEYS[template.id];
    return {
      id: template.id,
      name: key ? t.translate(`web.templates.${key}.name`) : template.name,
      description: key
        ? t.translate(`web.templates.${key}.description`)
        : template.description,
    };
  });
}

export function createWebI18n(locale: string, timezone?: string): DashboardI18n {
  const supported = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as Locale)
    : "en";
  return createDashboardI18n({
    locale: supported,
    messages: WEB_MESSAGES[supported],
    ...(timezone === undefined ? {} : { timezone }),
  });
}
