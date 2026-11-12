import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const EDITOR = { email: "demo@nama.local", password: "nama-demo-123" };
const CHART = '.nama-chart[role="group"][aria-label="Trend"]';

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[autocomplete="username"]').fill(EDITOR.email);
  await page.locator('input[autocomplete="current-password"]').fill(EDITOR.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboards");
}

/** Publishes an operations dashboard and opens its read-only view. */
async function openOperationsView(page: Page): Promise<void> {
  await signIn(page);

  await page.getByLabel("New dashboard name").fill(`Accessibility ${Date.now()}`);
  await page.getByLabel("Template").selectOption("operations");
  await page.getByRole("button", { name: "Create dashboard" }).click();
  await page.waitForURL(/\/dashboards\/[0-9a-f-]+$/u);

  const published = page.waitForResponse(
    (response) =>
      response.url().includes("/publish") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  expect((await published).ok()).toBe(true);

  await page.goto(`${page.url()}/view`);
}

/** Advances focus with Tab only, failing instead of guessing when it stalls. */
async function tabTo(page: Page, selector: string, limit = 80): Promise<void> {
  for (let pressed = 0; pressed < limit; pressed += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(
      (target) => document.activeElement?.matches(target) ?? false,
      selector,
    );
    if (focused) return;
  }

  throw new Error(`Keyboard focus never reached ${selector} within ${limit} tabs`);
}

test("scans the published viewer for WCAG violations", async ({ page }) => {
  await openOperationsView(page);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("navigates a chart to its values with the keyboard alone", async ({ page }) => {
  await openOperationsView(page);

  // The chart is reachable by Tab, announces instructions and exposes the same
  // values as a table: canvas pixels alone are not available to assistive tech.
  await tabTo(page, CHART);
  await expect(page.locator(CHART)).toHaveAttribute("aria-describedby", /.+/u);

  await page.keyboard.press("End");
  const status = page.locator(`${CHART} ~ p[role="status"]`);
  await expect(status).toHaveText(/^.+: .+$/u);

  const announced = await status.textContent();
  await page.keyboard.press("Tab");
  await expect(page.locator(".nama-chart-data[open]")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page.locator(".nama-chart-data[open]")).toHaveCount(1);
  await expect(page.locator(".nama-chart-data[open] caption")).toHaveText("Trend data");
  await expect(page.locator(".nama-chart-data[open] tbody tr").last()).toContainText(
    announced?.split(": ")[0] ?? "",
  );

  // Selecting a point writes the dashboard variable, which reveals the widget
  // that is conditioned on a non-empty selection.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article", { name: "Selected sample" })).toBeVisible();
});
