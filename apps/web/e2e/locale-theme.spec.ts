import { expect, test, type Page } from "@playwright/test";

const EDITOR = { email: "demo@nama.local", password: "nama-demo-123" };

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[autocomplete="username"]').fill(EDITOR.email);
  await page.locator('input[autocomplete="current-password"]').fill(EDITOR.password);
  await page.getByRole("button", { name: /^(Sign in|ورود)$/ }).click();
  await page.waitForURL("**/dashboards");
}

// Next keeps previously visited route segments mounted but hidden, so every
// chrome lookup is scoped to the visible shell.
function languageSelect(page: Page) {
  return page.locator(".app-header__select:visible select").first();
}

function themeSelect(page: Page) {
  return page.locator(".app-header__select:visible select").nth(1);
}

test("runs the chrome in Persian with an LTR canvas and a visible disclosure", async ({
  page,
}) => {
  const name = `داشبورد آزمون ${Date.now()}`;

  await page.goto("/login");
  await languageSelect(page).selectOption("fa");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ورود");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  await page.locator('input[autocomplete="username"]').fill(EDITOR.email);
  await page.locator('input[autocomplete="current-password"]').fill(EDITOR.password);
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await page.waitForURL("**/dashboards");

  // The signed-in user's stored preference wins once a session exists.
  await languageSelect(page).selectOption("fa");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("داشبوردها");

  await page.getByLabel("نام داشبورد جدید").fill(name);
  await page.getByLabel("الگو").selectOption("operations");
  await page.getByRole("button", { name: "ساخت داشبورد" }).click();
  await page.waitForURL(/\/dashboards\/[0-9a-f-]+$/u);

  await expect(page.getByRole("link", { name: "بازگشت به داشبوردها" })).toBeVisible();
  await expect(page.locator(".app-shell:visible")).toHaveAttribute("dir", "rtl");
  await expect(page.locator(".nama-editor-canvas__surface:visible")).toHaveAttribute(
    "dir",
    "ltr",
  );
  await expect(page.locator(".nama-canvas__notice:visible")).toHaveText(
    /فقط از چیدمان چپ‌به‌راست پشتیبانی می‌کند/u,
  );

  const draftList = page.url();
  const published = page.waitForResponse(
    (response) =>
      response.url().includes("/publish") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "انتشار", exact: true }).click();
  expect((await published).ok()).toBe(true);

  await page.goto(`${draftList}/view`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.locator(".app-shell:visible")).toHaveAttribute("dir", "rtl");
  await expect(page.locator(".nama-canvas:visible")).toHaveAttribute("dir", "ltr");
  await expect(page.locator(".nama-canvas__notice:visible")).toBeVisible();
  await expect(page.locator(".app-subtitle:visible")).toHaveText(/نسخهٔ\s.*[۰-۹]/u);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
});

test("persists the chosen theme across a reload", async ({ page }) => {
  await signIn(page);
  await languageSelect(page).selectOption("en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboards");

  await themeSelect(page).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".app-shell:visible")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    "rgb(10, 10, 10)",
  );

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await themeSelect(page).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    "rgb(255, 255, 255)",
  );

  await themeSelect(page).selectOption("system");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
});

test("keeps the Persian chrome in dark mode", async ({ page }) => {
  await signIn(page);
  await languageSelect(page).selectOption("fa");
  await themeSelect(page).selectOption("dark");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("داشبوردها");
  await expect(page.locator(".app-shell:visible")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    "rgb(10, 10, 10)",
  );
  await expect(page.locator(".app-header:visible")).toHaveScreenshot(
    "header-fa-dark.png",
  );
});

test("matches the chrome screenshots", async ({ page }) => {
  await page.goto("/login");
  await languageSelect(page).selectOption("en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await expect(page.locator(".app-header:visible")).toHaveScreenshot(
    "header-en-light.png",
  );
  await expect(page.locator(".app-login:visible")).toHaveScreenshot("login-en-light.png");

  await languageSelect(page).selectOption("fa");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ورود");
  await expect(page.locator(".app-login:visible")).toHaveScreenshot("login-fa-light.png");
});
