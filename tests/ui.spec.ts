import { test, expect, Page } from "@playwright/test";

// Helper: go to page with test bridge enabled
async function setup(page: Page) {
  await page.addInitScript(() => {
    (window as any).__TEST__ = true;
  });
  await page.goto("/");
  await page.waitForFunction(() => (window as any).__FIRE__);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P2: Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe("P2: validation", () => {
  test("age > 80 shows range error", async ({ page }) => {
    await setup(page);
    await page.locator("#p_age").fill("85");
    // Trigger recalculate by blurring
    await page.locator("#p_age").blur();
    // Wait for debounce
    await page.waitForTimeout(400);
    const err = page.locator("#err_age");
    await expect(err).toHaveText("年齡需介於 0–80 歲");
    await expect(page.locator("#p_age")).toHaveClass(/invalid/);
  });

  test("age as decimal shows integer error", async ({ page }) => {
    await setup(page);
    await page.locator("#p_age").fill("25.5");
    await page.locator("#p_age").blur();
    await page.waitForTimeout(400);
    const err = page.locator("#err_age");
    await expect(err).toHaveText("年齡須為整數");
  });

  test("return rate > 15 shows range error", async ({ page }) => {
    await setup(page);
    // Open advanced settings first
    await page.locator("details.advanced summary").click();
    // Select 自訂 to make return-group visible
    await page.locator("#p_etf").selectOption("");
    await page.waitForTimeout(200);
    await page.locator("#p_return").fill("20");
    await page.locator("#p_return").blur();
    await page.waitForTimeout(400);
    const err = page.locator("#err_return");
    await expect(err).toHaveText("報酬率需介於 0%–15%");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3: End-to-end user flows
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe("P3: user flows", () => {
  test("default values show retirement age in conclusion", async ({ page }) => {
    await setup(page);
    const conclusion = page.locator("#conclusion");
    await expect(conclusion).toContainText("歲");
    // Should contain a strong tag with the retirement age
    const strong = conclusion.locator("strong");
    await expect(strong).toHaveCount(1);
    const text = await strong.textContent();
    // The number should be a valid age
    const age = parseInt(text!);
    expect(age).toBeGreaterThanOrEqual(22);
    expect(age).toBeLessThanOrEqual(80);
  });

  test("increasing income lowers retirement age", async ({ page }) => {
    await setup(page);
    // Get baseline retirement age
    const baseAge = await page.locator("#conclusion strong").textContent();
    const base = parseInt(baseAge!);

    // Increase income significantly
    await page.locator("#p_income").fill("2,000,000");
    await page.locator("#p_income").blur();
    await page.waitForTimeout(500);

    const newAge = await page.locator("#conclusion strong").textContent();
    const updated = parseInt(newAge!);
    expect(updated).toBeLessThanOrEqual(base);
  });

  test("expenses > income shows warning", async ({ page }) => {
    await setup(page);
    await page.locator("#p_income").fill("200,000");
    await page.locator("#p_income").blur();
    await page.waitForTimeout(300);
    await page.locator("#p_expenses").fill("500,000");
    await page.locator("#p_expenses").blur();
    await page.waitForTimeout(500);

    const conclusion = page.locator("#conclusion");
    // Should have warn class and show warning message
    await expect(conclusion).toHaveClass(/warn/);
  });

  test("ETF selector fills return rate", async ({ page }) => {
    await setup(page);
    // Open advanced settings
    await page.locator("details.advanced summary").click();

    // Select VOO
    await page.locator("#p_etf").selectOption("14");
    await page.waitForTimeout(400);

    const returnVal = await page.locator("#p_return").inputValue();
    expect(returnVal).toBe("14");
  });

  test("reset button restores defaults", async ({ page }) => {
    await setup(page);

    // Change some values
    await page.locator("#p_age").fill("35");
    await page.locator("#p_age").blur();
    await page.locator("#p_income").fill("1,000,000");
    await page.locator("#p_income").blur();
    await page.waitForTimeout(400);

    // Click reset
    await page.locator("#resetBtn").click();
    await page.waitForTimeout(400);

    // Verify defaults
    expect(await page.locator("#p_age").inputValue()).toBe("22");
    expect(await page.locator("#p_income").inputValue()).toBe("546,000");
    expect(await page.locator("#p_expenses").inputValue()).toBe("320,000");
    expect(await page.locator("#p_assets").inputValue()).toBe("0");
  });

  test("chart3 canvas is visible and rendered", async ({ page }) => {
    await setup(page);
    const canvas = page.locator("#chart3");
    await expect(canvas).toBeVisible();
    // Check that chart has actually rendered (has non-zero size)
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P4: Persistence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe("P4: persistence", () => {
  test("params survive reload via localStorage", async ({ page }) => {
    await setup(page);

    // Change age and income
    await page.locator("#p_age").fill("35");
    await page.locator("#p_age").blur();
    await page.locator("#p_income").fill("800,000");
    await page.locator("#p_income").blur();
    await page.waitForTimeout(500);

    // Reload
    await page.reload();
    await page.waitForFunction(() => document.readyState === "complete");

    // Values should be restored
    expect(await page.locator("#p_age").inputValue()).toBe("35");
    expect(await page.locator("#p_income").inputValue()).toBe("800,000");
  });

  test("URL params override localStorage", async ({ page }) => {
    // First set localStorage values
    await setup(page);
    await page.locator("#p_age").fill("35");
    await page.locator("#p_age").blur();
    await page.waitForTimeout(300);

    // Now navigate with URL params
    await page.goto("/?age=45&income=1200000&expenses=400000&return=8&inflation=2&incGrowRate=1");
    await page.waitForFunction(() => document.readyState === "complete");

    expect(await page.locator("#p_age").inputValue()).toBe("45");
    expect(await page.locator("#p_income").inputValue()).toBe("1,200,000");
    expect(await page.locator("#p_expenses").inputValue()).toBe("400,000");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P5: Loans UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Helper to switch loan mode (forward declaration for use in addLoan)
async function ensureLoanSectionOpen(page: Page) {
  const details = page.locator("#loansSection");
  const isOpen = await details.evaluate(el => (el as HTMLDetailsElement).open);
  if (!isOpen) {
    // Click the summary to open
    await details.locator("summary").click();
    await page.waitForTimeout(100);
  }
}

// Helper to add a loan in precise mode (used by existing tests)
async function addLoan(page: Page, name: string, balance: string, rate: string, months: string) {
  await ensureLoanSectionOpen(page);
  // Switch to precise mode
  await page.locator(`#loansSection .loan-mode-toggle [data-mode="precise"]`).click();
  await page.waitForTimeout(200);
  await page.locator("#addLoanBtn").click();
  const rows = page.locator(".loan-row");
  const lastRow = rows.last();
  await lastRow.locator('input[data-field="name"]').fill(name);
  await lastRow.locator('input[data-field="balance"]').fill(balance);
  await lastRow.locator('input[data-field="rate"]').fill(rate);
  await lastRow.locator('input[data-field="remainingMonths"]').fill(months);
  await lastRow.locator('input[data-field="remainingMonths"]').blur();
  await page.waitForTimeout(400);
}

test.describe("P5: loans UI", () => {
  test("add loan button creates a loan row", async ({ page }) => {
    await setup(page);
    await ensureLoanSectionOpen(page);
    await page.locator("#addLoanBtn").click();
    await page.waitForTimeout(200);
    const rows = page.locator(".loan-row");
    await expect(rows).toHaveCount(1);
  });

  test("delete loan button removes the row", async ({ page }) => {
    await setup(page);
    await addLoan(page, "房貸", "8,000,000", "2.1", "240");
    await expect(page.locator(".loan-row")).toHaveCount(1);
    await page.locator(".loan-row .loan-remove-btn").click();
    await expect(page.locator(".loan-row")).toHaveCount(0);
  });

  test("loan shows in yearly table column", async ({ page }) => {
    await setup(page);
    await addLoan(page, "房貸", "8,000,000", "2.1", "240");
    // Open yearly table
    await page.locator(".yearly-table-wrap details summary").click();
    // Check that 貸款 column header exists
    const headers = page.locator(".yearly-table th");
    const headerTexts = await headers.allTextContents();
    expect(headerTexts.some(h => h.includes("貸款"))).toBe(true);
    // First data row loan column (7th td)
    const firstLoanCell = page.locator(".yearly-table tbody tr:first-child td:nth-child(7)");
    const text = await firstLoanCell.textContent();
    expect(text).not.toBe("—");
    expect(text).not.toBe("0");
  });

  test("loans persist across reload", async ({ page }) => {
    await setup(page);
    await addLoan(page, "房貸", "8,000,000", "2.1", "240");
    await page.reload();
    await page.waitForFunction(() => document.readyState === "complete");
    await expect(page.locator(".loan-row")).toHaveCount(1);
    const nameVal = await page.locator('.loan-row input[data-field="name"]').inputValue();
    expect(nameVal).toBe("房貸");
    const balanceVal = await page.locator('.loan-row input[data-field="balance"]').inputValue();
    expect(balanceVal).toBe("8,000,000");
  });

  test("reset clears all loans", async ({ page }) => {
    await setup(page);
    await addLoan(page, "房貸", "8,000,000", "2.1", "240");
    await addLoan(page, "信貸", "300,000", "3", "36");
    await expect(page.locator(".loan-row")).toHaveCount(2);
    await page.locator("#resetBtn").click();
    await page.waitForTimeout(400);
    await expect(page.locator(".loan-row")).toHaveCount(0);
  });

  test("loans impact retirement age", async ({ page }) => {
    await setup(page);
    // Increase income so retirement is feasible even with a loan
    await page.locator("#p_income").fill("1,000,000");
    await page.locator("#p_income").blur();
    await page.waitForTimeout(500);

    // Get baseline retirement age
    const baseText = await page.locator("#conclusion strong").textContent();
    const base = parseInt(baseText!);

    // Add a moderate loan
    await addLoan(page, "房貸", "8,000,000", "2.1", "240");
    await page.waitForTimeout(500);

    // Retirement age should be delayed or at least the same
    const conclusion = page.locator("#conclusion");
    const hasStrong = await conclusion.locator("strong").count();
    if (hasStrong > 0) {
      const newText = await conclusion.locator("strong").textContent();
      const updated = parseInt(newText!);
      expect(updated).toBeGreaterThanOrEqual(base);
    } else {
      // If no strong, it means retirement became impossible — that's a valid impact
      await expect(conclusion).toHaveClass(/warn/);
    }
  });

  test("loans visible without opening advanced settings", async ({ page }) => {
    await setup(page);
    // Loans section should be visible directly (not inside advanced)
    await expect(page.locator("#loansSection")).toBeVisible();
    // Open section to access add button and mode toggle
    await ensureLoanSectionOpen(page);
    await expect(page.locator("#addLoanBtn")).toBeVisible();
  });

  test("monthly payment display updates from balance/rate/months", async ({ page }) => {
    await setup(page);
    await addLoan(page, "房貸", "8,000,000", "2.1", "240");
    const row = page.locator(".loan-row").first();
    const display = row.locator(".loan-monthly-display");
    await expect(display).toBeVisible();
    const text = await display.textContent();
    // calcMonthlyPayment(8_000_000, 0.021, 240/12=20) = 40,851
    expect(text).toContain("40,851");
  });

  test("loan balance clears '0' on focus", async ({ page }) => {
    await setup(page);
    await ensureLoanSectionOpen(page);
    await page.locator(`#loansSection .loan-mode-toggle [data-mode="precise"]`).click();
    await page.waitForTimeout(200);
    await page.locator("#addLoanBtn").click();
    const bal = page.locator('.loan-row input[data-field="balance"]');
    await expect(bal).toHaveValue("0");
    await bal.focus();
    await expect(bal).toHaveValue("");
  });

  test("loan rate clears '0' on focus", async ({ page }) => {
    await setup(page);
    await ensureLoanSectionOpen(page);
    await page.locator(`#loansSection .loan-mode-toggle [data-mode="precise"]`).click();
    await page.waitForTimeout(200);
    await page.locator("#addLoanBtn").click();
    const rate = page.locator('.loan-row input[data-field="rate"]');
    await expect(rate).toHaveValue("0");
    await rate.focus();
    await expect(rate).toHaveValue("");
  });

  test("loan remaining months clears '0' on focus", async ({ page }) => {
    await setup(page);
    await ensureLoanSectionOpen(page);
    await page.locator(`#loansSection .loan-mode-toggle [data-mode="precise"]`).click();
    await page.waitForTimeout(200);
    await page.locator("#addLoanBtn").click();
    const months = page.locator('.loan-row input[data-field="remainingMonths"]');
    await expect(months).toHaveValue("0");
    await months.focus();
    await expect(months).toHaveValue("");
  });

  test("loan balance restores '0' on empty blur", async ({ page }) => {
    await setup(page);
    await switchLoanMode(page, "precise");
    await page.locator("#addLoanBtn").click();
    const bal = page.locator('.loan-row input[data-field="balance"]');
    await bal.focus();
    await expect(bal).toHaveValue("");
    await bal.blur();
    await expect(bal).toHaveValue("0");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P6: Loan collapsible + dual mode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Helper to switch loan mode
async function switchLoanMode(page: Page, mode: "simple" | "precise") {
  await ensureLoanSectionOpen(page);
  await page.locator(`#loansSection .loan-mode-toggle [data-mode="${mode}"]`).click();
  await page.waitForTimeout(200);
}

// Precise mode helper (for existing tests)
async function addLoanPrecise(page: Page, name: string, balance: string, rate: string, months: string) {
  await switchLoanMode(page, "precise");
  await page.locator("#addLoanBtn").click();
  const lastRow = page.locator(".loan-row").last();
  await lastRow.locator('input[data-field="name"]').fill(name);
  await lastRow.locator('input[data-field="balance"]').fill(balance);
  await lastRow.locator('input[data-field="rate"]').fill(rate);
  await lastRow.locator('input[data-field="remainingMonths"]').fill(months);
  await lastRow.locator('input[data-field="remainingMonths"]').blur();
  await page.waitForTimeout(400);
}

// Simple mode helper
async function addLoanSimple(page: Page, name: string, monthlyPayment: string, months: string) {
  await switchLoanMode(page, "simple");
  await page.locator("#addLoanBtn").click();
  const lastRow = page.locator(".loan-row").last();
  await lastRow.locator('input[data-field="name"]').fill(name);
  await lastRow.locator('input[data-field="monthlyPayment"]').fill(monthlyPayment);
  await lastRow.locator('input[data-field="remainingMonths"]').fill(months);
  await lastRow.locator('input[data-field="remainingMonths"]').blur();
  await page.waitForTimeout(400);
}

test.describe("P6: loan collapsible + dual mode", () => {
  test("loan section is collapsed by default", async ({ page }) => {
    await setup(page);
    const details = page.locator("#loansSection");
    await expect(details).not.toHaveAttribute("open", "");
    // Summary label should still be visible when collapsed
    await expect(page.locator("#loansSection summary .loan-label")).toBeVisible();
  });

  test("expanded section shows toolbar with mode toggle and add button", async ({ page }) => {
    await setup(page);
    await page.locator("#loansSection summary").click();
    await expect(page.locator(".loan-toolbar")).toBeVisible();
    await expect(page.locator("#addLoanBtn")).toBeVisible();
    await expect(page.locator('.loan-mode-toggle [data-mode="simple"]')).toBeVisible();
    await expect(page.locator('.loan-mode-toggle [data-mode="precise"]')).toBeVisible();
  });

  test("default mode is simple", async ({ page }) => {
    await setup(page);
    await page.locator("#loansSection summary").click();
    const simpleBtn = page.locator('#loansSection .loan-mode-toggle [data-mode="simple"]');
    await expect(simpleBtn).toHaveClass(/active/);
  });

  test("simple mode shows name, monthlyPayment, remainingMonths", async ({ page }) => {
    await setup(page);
    await ensureLoanSectionOpen(page);
    await page.locator("#addLoanBtn").click();
    const row = page.locator(".loan-row").first();
    await expect(row.locator('input[data-field="name"]')).toBeVisible();
    await expect(row.locator('input[data-field="monthlyPayment"]')).toBeVisible();
    await expect(row.locator('input[data-field="remainingMonths"]')).toBeVisible();
    // Should NOT have balance or rate fields
    await expect(row.locator('input[data-field="balance"]')).toHaveCount(0);
    await expect(row.locator('input[data-field="rate"]')).toHaveCount(0);
  });

  test("switch to precise mode shows balance, rate, remainingMonths", async ({ page }) => {
    await setup(page);
    await ensureLoanSectionOpen(page);
    await page.locator("#addLoanBtn").click();
    await switchLoanMode(page, "precise");
    const row = page.locator(".loan-row").first();
    await expect(row.locator('input[data-field="balance"]')).toBeVisible();
    await expect(row.locator('input[data-field="rate"]')).toBeVisible();
    await expect(row.locator('input[data-field="remainingMonths"]')).toBeVisible();
    // monthly-display element exists (text empty with default 0 values)
    await expect(row.locator('.loan-monthly-display')).toHaveCount(1);
  });

  test("precise→simple auto-fills monthlyPayment from calculation", async ({ page }) => {
    await setup(page);
    await addLoanPrecise(page, "房貸", "8,000,000", "2.1", "240");
    // Switch to simple — monthlyPayment should be auto-filled
    await switchLoanMode(page, "simple");
    const mp = page.locator('.loan-row input[data-field="monthlyPayment"]');
    const val = await mp.inputValue();
    // calcMonthlyPayment(8_000_000, 0.021, 20) ≈ 40,851
    expect(val).toContain("40,851");
  });

  test("simple mode loan affects retirement age", async ({ page }) => {
    await setup(page);
    await page.locator("#p_income").fill("1,000,000");
    await page.locator("#p_income").blur();
    await page.waitForTimeout(500);

    const baseText = await page.locator("#conclusion strong").textContent();
    const base = parseInt(baseText!);

    await addLoanSimple(page, "房貸", "40,000", "240");
    await page.waitForTimeout(500);

    const conclusion = page.locator("#conclusion");
    const hasStrong = await conclusion.locator("strong").count();
    if (hasStrong > 0) {
      const newText = await conclusion.locator("strong").textContent();
      const updated = parseInt(newText!);
      expect(updated).toBeGreaterThanOrEqual(base);
    } else {
      await expect(conclusion).toHaveClass(/warn/);
    }
  });

  test("loan mode persists across reload", async ({ page }) => {
    await setup(page);
    await ensureLoanSectionOpen(page);
    await switchLoanMode(page, "precise");
    await page.reload();
    await page.waitForFunction(() => document.readyState === "complete");
    await ensureLoanSectionOpen(page);
    const preciseBtn = page.locator('#loansSection .loan-mode-toggle [data-mode="precise"]');
    await expect(preciseBtn).toHaveClass(/active/);
  });

  test("section auto-opens when loans exist on load", async ({ page }) => {
    await setup(page);
    await addLoanSimple(page, "房貸", "40,000", "240");
    await page.reload();
    await page.waitForFunction(() => document.readyState === "complete");
    const details = page.locator("#loansSection");
    await expect(details).toHaveAttribute("open", "");
  });

  test("reset also resets loanMode to simple", async ({ page }) => {
    await setup(page);
    await ensureLoanSectionOpen(page);
    await switchLoanMode(page, "precise");
    await page.locator("#resetBtn").click();
    await page.waitForTimeout(400);
    // Open section and check mode
    await ensureLoanSectionOpen(page);
    const simpleBtn = page.locator('#loansSection .loan-mode-toggle [data-mode="simple"]');
    await expect(simpleBtn).toHaveClass(/active/);
  });

  test("new loan gets auto-generated default name", async ({ page }) => {
    await setup(page);
    await ensureLoanSectionOpen(page);
    await page.locator("#addLoanBtn").click();
    const name1 = page.locator('.loan-row').first().locator('input[data-field="name"]');
    await expect(name1).toHaveValue("貸款 A");
    await page.locator("#addLoanBtn").click();
    const name2 = page.locator('.loan-row').last().locator('input[data-field="name"]');
    await expect(name2).toHaveValue("貸款 B");
  });

  test("header row shows column labels once, per-row labels hidden", async ({ page }) => {
    await setup(page);
    await addLoanSimple(page, "房貸", "40,000", "240");
    // Header row should exist with column labels
    const header = page.locator(".loan-header");
    await expect(header).toBeVisible();
    await expect(header).toContainText("名稱");
    await expect(header).toContainText("每月還款");
    await expect(header).toContainText("剩餘期數");
    // Per-row labels should be hidden (display:none on desktop)
    const rowLabel = page.locator(".loan-row label").first();
    await expect(rowLabel).toBeHidden();
  });

  test("precise mode header shows correct columns including monthly", async ({ page }) => {
    await setup(page);
    await addLoanPrecise(page, "房貸", "8,000,000", "2.1", "240");
    const header = page.locator(".loan-header");
    await expect(header).toBeVisible();
    await expect(header).toContainText("名稱");
    await expect(header).toContainText("貸款餘額");
    await expect(header).toContainText("年利率");
    await expect(header).toContainText("剩餘期數");
    await expect(header).toContainText("月付額");
  });

  test("monthly display is a separate column in precise mode", async ({ page }) => {
    await setup(page);
    await addLoanPrecise(page, "房貸", "8,000,000", "2.1", "240");
    const display = page.locator('.loan-row .loan-monthly-display');
    await expect(display).toHaveCount(1);
    await expect(display).toContainText("40,851");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P7: Loan name XSS safety
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe("P7: loan name escaping", () => {
  test("loan name with double-quote renders correctly", async ({ page }) => {
    await setup(page);
    await ensureLoanSectionOpen(page);
    await page.locator("#addLoanBtn").click();
    const nameInput = page.locator('.loan-row input[data-field="name"]');
    await nameInput.fill('貸款"test');
    await nameInput.blur();
    await page.waitForTimeout(300);

    // Save and re-render by switching mode back and forth
    await switchLoanMode(page, "precise");
    await switchLoanMode(page, "simple");

    // The input should still contain the name with the quote
    const val = await page.locator('.loan-row input[data-field="name"]').inputValue();
    expect(val).toBe('貸款"test');
  });

  test("loan name with HTML chars does not break rendering", async ({ page }) => {
    await setup(page);
    await ensureLoanSectionOpen(page);
    await page.locator("#addLoanBtn").click();
    const nameInput = page.locator('.loan-row input[data-field="name"]');
    await nameInput.fill('<script>alert(1)</script>');
    await nameInput.blur();
    await page.waitForTimeout(300);

    // Re-render
    await switchLoanMode(page, "precise");
    await switchLoanMode(page, "simple");

    // Should have exactly 1 loan row (not broken HTML)
    await expect(page.locator(".loan-row")).toHaveCount(1);
    const val = await page.locator('.loan-row input[data-field="name"]').inputValue();
    expect(val).toBe('<script>alert(1)</script>');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// F1: Table formula tooltips
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe("F1: table formula tooltips", () => {
  test("nominal first row has '初始資產' formula", async ({ page }) => {
    await setup(page);
    await page.locator(".yearly-table-wrap details summary").click();
    await page.waitForTimeout(300);
    const cell = page.locator(".yearly-table tbody tr:first-child td:nth-child(3)");
    await expect(cell).toHaveAttribute("data-formula", /初始資產/);
  });

  test("real asset first row has '初始資產' formula", async ({ page }) => {
    await setup(page);
    await page.locator(".yearly-table-wrap details summary").click();
    await page.waitForTimeout(300);
    const cell = page.locator(".yearly-table tbody tr:first-child td:nth-child(4)");
    await expect(cell).toHaveAttribute("data-formula", /初始資產/);
  });

  test("nominal second row references previous year values", async ({ page }) => {
    await setup(page);
    await page.locator(".yearly-table-wrap details summary").click();
    await page.waitForTimeout(300);
    const cell = page.locator(".yearly-table tbody tr:nth-child(2) td:nth-child(3)");
    const formula = await cell.getAttribute("data-formula");
    expect(formula).not.toBeNull();
    expect(formula).toContain("前年");
    expect(formula).toContain("收入");
    expect(formula).toContain("支出");
  });

  test("expense column has inflation-based formula", async ({ page }) => {
    await setup(page);
    await page.locator(".yearly-table-wrap details summary").click();
    await page.waitForTimeout(300);
    // Second row expense — should reference previous year
    const cell = page.locator(".yearly-table tbody tr:nth-child(2) td:nth-child(6)");
    const formula = await cell.getAttribute("data-formula");
    expect(formula).not.toBeNull();
    expect(formula).toContain("前年");
    expect(formula).toContain("×");
  });

  test("return column has rate formula when assets > 0", async ({ page }) => {
    await setup(page);
    await page.locator("#p_assets").fill("10,000,000");
    await page.locator("#p_assets").blur();
    await page.waitForTimeout(500);
    await page.locator(".yearly-table-wrap details summary").click();
    await page.waitForTimeout(300);
    const cell = page.locator(".yearly-table tbody tr:first-child td:nth-child(8)");
    const formula = await cell.getAttribute("data-formula");
    expect(formula).not.toBeNull();
    expect(formula).toContain("年初");
    expect(formula).toContain("×");
    expect(formula).toContain("%");
  });

  test("loan column has formula when loans exist", async ({ page }) => {
    await setup(page);
    await addLoanSimple(page, "房貸", "40,000", "240");
    await page.waitForTimeout(500);
    await page.locator(".yearly-table-wrap details summary").click();
    await page.waitForTimeout(300);
    const cell = page.locator(".yearly-table tbody tr:first-child td:nth-child(7)");
    const formula = await cell.getAttribute("data-formula");
    expect(formula).not.toBeNull();
    expect(formula).toContain("房貸");
    expect(formula).toContain("40,000/月");
  });

  test("dash cells have no data-formula", async ({ page }) => {
    await setup(page);
    await page.locator(".yearly-table-wrap details summary").click();
    await page.waitForTimeout(300);
    // Last row income column shows "—" and should have no formula
    const lastRow = page.locator(".yearly-table tbody tr:last-child");
    const incCell = lastRow.locator("td:nth-child(5)");
    await expect(incCell).toHaveText("—");
    expect(await incCell.getAttribute("data-formula")).toBeNull();
  });

  test("hover shows tooltip bubble with formula content (after delay)", async ({ page }) => {
    await setup(page);
    await page.locator(".yearly-table-wrap details summary").click();
    await page.waitForTimeout(300);
    // First row nominal column has formula "初始資產"
    const cell = page.locator(".yearly-table tbody tr:first-child td:nth-child(3)");
    await cell.hover();
    // At 100ms the bubble should NOT be visible yet (hover delay is 300ms)
    await page.waitForTimeout(100);
    await expect(page.locator(".tip-bubble")).toHaveCount(0);
    // After 300ms total the bubble should appear
    await page.waitForTimeout(250);
    const bubble = page.locator(".tip-bubble");
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText("初始資產");
  });

  test("info-tip hover uses CSS ::after, not JS bubble", async ({ page }) => {
    await setup(page);
    const tip = page.locator(".info-tip").first();
    await tip.hover();
    await page.waitForTimeout(200);
    // CSS ::after handles desktop tooltip; JS .tip-bubble should NOT appear
    await expect(page.locator(".tip-bubble")).toHaveCount(0);
  });

  test("click event does not toggle off hover-created formula bubble", async ({ page }) => {
    await setup(page);
    await page.locator(".yearly-table-wrap details summary").click();
    await page.waitForTimeout(300);
    const cell = page.locator(".yearly-table tbody tr:first-child td:nth-child(3)");
    // Hover to show bubble (300ms delay)
    await cell.hover();
    await page.waitForTimeout(400);
    await expect(page.locator(".tip-bubble")).toBeVisible();
    // Fire click event — should NOT dismiss hover bubble
    await cell.dispatchEvent("click");
    await page.waitForTimeout(100);
    await expect(page.locator(".tip-bubble")).toBeVisible();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIRE ratio excludes loans (standard definition)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe("FIRE ratio with loans", () => {
  test("FIRE ratio uses expenses only, not loans (4% rule = perpetual expenses)", async ({ page }) => {
    await setup(page);
    await page.locator("#p_assets").fill("10,000,000");
    await page.locator("#p_assets").blur();
    await page.locator("#p_expenses").fill("400,000");
    await page.locator("#p_expenses").blur();
    await page.waitForTimeout(500);

    // Without loans: 10,000,000 / 400,000 = 25.0
    const noLoanText = await page.locator(".metric-card:nth-child(3) .value").textContent();
    expect(noLoanText).toContain("25.0");

    // Add loan — ratio should stay 25.0 (loans are temporary, not in FIRE formula)
    await addLoanSimple(page, "房貸", "40,000", "240");
    await page.waitForTimeout(500);

    const withLoanText = await page.locator(".metric-card:nth-child(3) .value").textContent();
    expect(withLoanText).toContain("25.0");
  });

  test("FIRE ratio info-tip explains loans excluded when loans exist", async ({ page }) => {
    await setup(page);
    await addLoanSimple(page, "房貸", "40,000", "240");
    await page.waitForTimeout(500);
    const tip = page.locator(".metric-card:nth-child(3) .info-tip");
    const tipText = await tip.getAttribute("data-tip");
    expect(tipText).toContain("貸款");
    expect(tipText).toContain("暫時性");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// F2: 支出成長率 + ETF 收合 + 手機版兩欄
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe("F2: expense growth rate", () => {
  test("p_expGrowRate field exists and defaults to 0", async ({ page }) => {
    await setup(page);
    await page.locator("details.advanced summary").click();
    const input = page.locator("#p_expGrowRate");
    await expect(input).toBeVisible();
    expect(await input.inputValue()).toBe("0");
  });

  test("p_expGrowRate clears on focus and restores on empty blur", async ({ page }) => {
    await setup(page);
    await page.locator("details.advanced summary").click();
    const input = page.locator("#p_expGrowRate");
    // Focus should clear the default "0"
    await input.focus();
    expect(await input.inputValue()).toBe("");
    // Blur empty → restores "0"
    await input.blur();
    expect(await input.inputValue()).toBe("0");
  });

  test("expense formula tooltip shows separate inflation and growth multipliers", async ({ page }) => {
    await setup(page);
    // Set non-zero expense growth rate
    await page.locator("details.advanced summary").click();
    await page.locator("#p_expGrowRate").fill("2");
    await page.locator("#p_expGrowRate").blur();
    await page.waitForTimeout(500);
    // Open yearly table
    await page.locator(".yearly-table-wrap details summary").click();
    await page.waitForTimeout(300);
    // Second row expense column
    const cell = page.locator(".yearly-table tbody tr:nth-child(2) td:nth-child(6)");
    const formula = await cell.getAttribute("data-formula");
    expect(formula).not.toBeNull();
    // Should show two separate multipliers, not a combined one
    expect(formula).toContain("通膨");
    expect(formula).toContain("支出成長");
  });

  test("setting expGrowRate > 0 delays retirement", async ({ page }) => {
    await setup(page);
    // Get baseline
    const baseText = await page.locator("#conclusion strong").textContent();
    const base = parseInt(baseText!);

    // Set expense growth rate
    await page.locator("details.advanced summary").click();
    await page.locator("#p_expGrowRate").fill("2");
    await page.locator("#p_expGrowRate").blur();
    await page.waitForTimeout(500);

    const conclusion = page.locator("#conclusion");
    const hasStrong = await conclusion.locator("strong").count();
    if (hasStrong > 0) {
      const newText = await conclusion.locator("strong").textContent();
      const updated = parseInt(newText!);
      expect(updated).toBeGreaterThanOrEqual(base);
    } else {
      // Retirement became impossible — valid impact
      await expect(conclusion).toHaveClass(/warn/);
    }
  });
});

test.describe("F2: ETF return-group visibility", () => {
  test("ETF defaults to 0050 and return-group is hidden", async ({ page }) => {
    await setup(page);
    await page.locator("details.advanced summary").click();
    const etf = page.locator("#p_etf");
    expect(await etf.inputValue()).toBe("12.5");
    const returnGroup = page.locator("#return-group");
    await expect(returnGroup).toBeHidden();
  });

  test("selecting 自訂 shows return-group", async ({ page }) => {
    await setup(page);
    await page.locator("details.advanced summary").click();
    await page.locator("#p_etf").selectOption("");
    await page.waitForTimeout(300);
    const returnGroup = page.locator("#return-group");
    await expect(returnGroup).toBeVisible();
  });

  test("selecting back to ETF hides return-group and sets correct rate", async ({ page }) => {
    await setup(page);
    await page.locator("details.advanced summary").click();
    // First go to custom
    await page.locator("#p_etf").selectOption("");
    await page.waitForTimeout(300);
    await expect(page.locator("#return-group")).toBeVisible();
    // Select VOO
    await page.locator("#p_etf").selectOption("14");
    await page.waitForTimeout(300);
    await expect(page.locator("#return-group")).toBeHidden();
    expect(await page.locator("#p_return").inputValue()).toBe("14");
  });
});

test.describe("F2: mobile advanced two-column grid", () => {
  test("advanced param-grid uses two-column layout on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setup(page);
    await page.locator("details.advanced summary").click();
    const grid = page.locator(".advanced .param-grid");
    const cols = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns);
    // Should have exactly two columns (two values separated by space)
    const colValues = cols.split(/\s+/).filter(Boolean);
    expect(colValues.length).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mobile info-tip tooltip behavior
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe("mobile info-tip tooltips", () => {
  test("tapping info-tip shows tooltip bubble on mobile", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await setup(page);
    const tip = page.locator("label[for='p_assets'] .info-tip");
    await tip.tap();
    await page.waitForTimeout(200);
    const bubble = page.locator(".tip-bubble");
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText("投資的總金額");
    await ctx.close();
  });

  test("tapping info-tip inside label does NOT focus the input", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await setup(page);
    const tip = page.locator("label[for='p_assets'] .info-tip");
    await tip.tap();
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).not.toBe("p_assets");
    await ctx.close();
  });

  test("info-tip touch target is at least 44px", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await setup(page);
    const tip = page.locator("label[for='p_assets'] .info-tip");
    const box = await tip.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await ctx.close();
  });

  test("second tap closes tooltip without triggering label or summary", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await setup(page);
    const tip = page.locator("label[for='p_assets'] .info-tip");
    // First tap: show tooltip
    await tip.tap();
    await page.waitForTimeout(200);
    await expect(page.locator(".tip-bubble")).toBeVisible();
    // Second tap: close tooltip
    await tip.tap();
    await page.waitForTimeout(200);
    // Tooltip should be gone
    await expect(page.locator(".tip-bubble")).toHaveCount(0);
    // Input should NOT be focused (label default action blocked)
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).not.toBe("p_assets");
    await ctx.close();
  });

  test("second tap on loans info-tip does not toggle details", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await setup(page);
    // Open loans section first
    await page.locator("#loansSection summary").tap();
    await page.waitForTimeout(200);
    const wasOpen = await page.locator("#loansSection").evaluate(el => (el as HTMLDetailsElement).open);
    expect(wasOpen).toBe(true);
    // First tap on loans info-tip
    const tip = page.locator("#loansSection .info-tip");
    await tip.tap();
    await page.waitForTimeout(200);
    await expect(page.locator(".tip-bubble")).toBeVisible();
    // Second tap — should close tooltip but NOT toggle the details
    await tip.tap();
    await page.waitForTimeout(200);
    const stillOpen = await page.locator("#loansSection").evaluate(el => (el as HTMLDetailsElement).open);
    expect(stillOpen).toBe(true);
    await ctx.close();
  });

  test("no horizontal overflow on mobile viewport", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await setup(page);
    // Also open loans section and add a loan to test with more content
    await page.locator("#loansSection summary").click();
    await page.locator("#addLoanBtn").click();
    await page.waitForTimeout(300);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
    await ctx.close();
  });
});