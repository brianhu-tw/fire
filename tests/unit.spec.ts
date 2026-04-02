import { test, expect, Page } from "@playwright/test";

// Helper: navigate with __TEST__ flag and return the __FIRE__ bridge
async function fire(page: Page) {
  await page.addInitScript(() => {
    (window as any).__TEST__ = true;
  });
  await page.goto("/");
  await page.waitForFunction(() => (window as any).__FIRE__);
  return (fn: string, ...args: any[]) =>
    page.evaluate(
      ([fn, args]) => {
        const f = (window as any).__FIRE__;
        return f[fn](...args);
      },
      [fn, args] as const
    );
}

// ─── clamp ───
test.describe("clamp", () => {
  test("clamps below min", async ({ page }) => {
    const call = await fire(page);
    expect(await call("clamp", -5, 0, 100)).toBe(0);
  });

  test("clamps above max", async ({ page }) => {
    const call = await fire(page);
    expect(await call("clamp", 150, 0, 100)).toBe(100);
  });

  test("returns value when in range", async ({ page }) => {
    const call = await fire(page);
    expect(await call("clamp", 50, 0, 100)).toBe(50);
  });

  test("treats NaN as min", async ({ page }) => {
    const call = await fire(page);
    expect(await call("clamp", NaN, 10, 100)).toBe(10);
  });

  test("boundary: exact min", async ({ page }) => {
    const call = await fire(page);
    expect(await call("clamp", 0, 0, 80)).toBe(0);
  });

  test("boundary: exact max", async ({ page }) => {
    const call = await fire(page);
    expect(await call("clamp", 80, 0, 80)).toBe(80);
  });
});

// ─── stripCommas / addCommas ───
test.describe("stripCommas", () => {
  test("removes commas", async ({ page }) => {
    const call = await fire(page);
    expect(await call("stripCommas", "1,234,567")).toBe("1234567");
  });

  test("no-op on plain string", async ({ page }) => {
    const call = await fire(page);
    expect(await call("stripCommas", "500000")).toBe("500000");
  });

  test("empty string", async ({ page }) => {
    const call = await fire(page);
    expect(await call("stripCommas", "")).toBe("");
  });
});

test.describe("addCommas", () => {
  test("formats integer", async ({ page }) => {
    const call = await fire(page);
    expect(await call("addCommas", 1234567)).toBe("1,234,567");
  });

  test("formats with decimal", async ({ page }) => {
    const call = await fire(page);
    expect(await call("addCommas", 1234.56)).toBe("1,234.56");
  });

  test("small number no comma", async ({ page }) => {
    const call = await fire(page);
    expect(await call("addCommas", 999)).toBe("999");
  });

  test("zero", async ({ page }) => {
    const call = await fire(page);
    expect(await call("addCommas", 0)).toBe("0");
  });

  test("negative number", async ({ page }) => {
    const call = await fire(page);
    expect(await call("addCommas", -1234567)).toBe("-1,234,567");
  });
});

// ─── hexAlpha ───
test.describe("hexAlpha", () => {
  test("converts hex to rgba", async ({ page }) => {
    const call = await fire(page);
    expect(await call("hexAlpha", "#ff0000", 0.5)).toBe("rgba(255,0,0,0.5)");
  });

  test("handles blue", async ({ page }) => {
    const call = await fire(page);
    expect(await call("hexAlpha", "#0000ff", 1)).toBe("rgba(0,0,255,1)");
  });

  test("handles without hash", async ({ page }) => {
    const call = await fire(page);
    // The function does replace("#", ""), so without hash should also work
    expect(await call("hexAlpha", "6366f1", 0.19)).toBe("rgba(99,102,241,0.19)");
  });
});

// ─── simulate ───
test.describe("simulate", () => {
  let call: ReturnType<typeof fire> extends Promise<infer R> ? R : never;

  test.beforeEach(async ({ page }) => {
    call = await fire(page);
  });

  test("feasible scenario: high income, low expense", async ({ page }) => {
    // Set DOM values for currentAge
    await page.locator("#p_age").fill("30");
    const result = await page.evaluate(() => {
      const f = (window as any).__FIRE__;
      return f.simulate(50, {
        assets: 0,
        income: 1_000_000,
        expenses: 300_000,
        nomReturn: 0.07,
        inflation: 0.03,
        incGrowRate: 0,
        deathAge: 90,
      });
    });
    expect(result.feasible).toBe(true);
    expect(result.ages[0]).toBe(30);
    expect(result.ages[result.ages.length - 1]).toBe(90);
    expect(result.reals.length).toBe(result.ages.length);
  });

  test("infeasible scenario: zero income, high expense", async ({ page }) => {
    await page.locator("#p_age").fill("30");
    const result = await page.evaluate(() => {
      const f = (window as any).__FIRE__;
      return f.simulate(40, {
        assets: 100_000,
        income: 0,
        expenses: 500_000,
        nomReturn: 0.07,
        inflation: 0.03,
        incGrowRate: 0,
        deathAge: 90,
      });
    });
    expect(result.feasible).toBe(false);
    expect(result.minPort).toBeLessThan(0);
  });

  test("custom return rate is used", async ({ page }) => {
    await page.locator("#p_age").fill("30");
    const [r1, r2] = await page.evaluate(() => {
      const f = (window as any).__FIRE__;
      const p = {
        assets: 1_000_000,
        income: 500_000,
        expenses: 300_000,
        nomReturn: 0.07,
        inflation: 0.03,
        incGrowRate: 0,
        deathAge: 90,
      };
      const r1 = f.simulate(50, p, 0.05);
      const r2 = f.simulate(50, p, 0.12);
      return [r1, r2];
    });
    // Higher return rate should yield bigger final portfolio
    const last1 = r1.reals[r1.reals.length - 1];
    const last2 = r2.reals[r2.reals.length - 1];
    expect(last2).toBeGreaterThan(last1);
  });

  test("income override changes the result", async ({ page }) => {
    await page.locator("#p_age").fill("25");
    const [rBase, rOverride] = await page.evaluate(() => {
      const f = (window as any).__FIRE__;
      const p = {
        assets: 0,
        income: 500_000,
        expenses: 300_000,
        nomReturn: 0.07,
        inflation: 0.03,
        incGrowRate: 0,
        deathAge: 90,
      };
      const rBase = f.simulate(50, p);
      const rOverride = f.simulate(50, p, undefined, {
        startAge: 35,
        amount: 2_000_000,
      });
      return [rBase, rOverride];
    });
    // With income boost at age 35, the portfolio at retirement should be larger
    const retIdx = 50 - 25; // index for age 50
    expect(rOverride.reals[retIdx]).toBeGreaterThan(rBase.reals[retIdx]);
  });
});

// ─── findEarliest ───
test.describe("findEarliest", () => {
  test("returns retirement age for normal scenario", async ({ page }) => {
    const call = await fire(page);
    // Set age to 25
    await page.locator("#p_age").fill("25");
    const earliest = await page.evaluate(() => {
      const f = (window as any).__FIRE__;
      return f.findEarliest({
        assets: 500_000,
        income: 1_000_000,
        expenses: 400_000,
        nomReturn: 0.07,
        inflation: 0.03,
        incGrowRate: 0,
        deathAge: 80,
      });
    });
    expect(earliest).toBeGreaterThanOrEqual(25);
    expect(earliest).toBeLessThan(80);
  });

  test("returns null when retirement is impossible", async ({ page }) => {
    await fire(page);
    await page.locator("#p_age").fill("30");
    const earliest = await page.evaluate(() => {
      const f = (window as any).__FIRE__;
      return f.findEarliest({
        assets: 0,
        income: 300_000,
        expenses: 600_000,
        nomReturn: 0.02,
        inflation: 0.03,
        incGrowRate: 0,
        deathAge: 80,
      });
    });
    expect(earliest).toBeNull();
  });

  test("boundary: already wealthy enough to retire immediately", async ({ page }) => {
    await fire(page);
    await page.locator("#p_age").fill("40");
    const earliest = await page.evaluate(() => {
      const f = (window as any).__FIRE__;
      return f.findEarliest({
        assets: 100_000_000,
        income: 500_000,
        expenses: 300_000,
        nomReturn: 0.07,
        inflation: 0.03,
        incGrowRate: 0,
        deathAge: 80,
      });
    });
    expect(earliest).toBe(40); // can retire right now
  });
});

// ─── calcYearLoanPayment ───
test.describe("calcYearLoanPayment", () => {
  test("empty loans returns 0", async ({ page }) => {
    const call = await fire(page);
    expect(await call("calcYearLoanPayment", [], 0)).toBe(0);
  });

  test("null/undefined loans returns 0", async ({ page }) => {
    const call = await fire(page);
    expect(await call("calcYearLoanPayment", null, 0)).toBe(0);
    expect(await call("calcYearLoanPayment", undefined, 0)).toBe(0);
  });

  test("single loan full year (12 months active)", async ({ page }) => {
    const call = await fire(page);
    // balance=4,800,000 at 0% for 240 months → mp=20,000; yearIndex=0 → active=12
    const loans = [{ name: "房貸", balance: 4_800_000, rate: 0, remainingMonths: 240 }];
    expect(await call("calcYearLoanPayment", loans, 0)).toBe(20000 * 12);
  });

  test("loan expires mid-first-year", async ({ page }) => {
    const call = await fire(page);
    // balance=60,000 at 0% for 6 months → mp=10,000; yearIndex=0 → active=min(12,6)=6
    const loans = [{ name: "信貸", balance: 60_000, rate: 0, remainingMonths: 6 }];
    expect(await call("calcYearLoanPayment", loans, 0)).toBe(10000 * 6);
  });

  test("loan already expired", async ({ page }) => {
    const call = await fire(page);
    // balance=90,000 at 0% for 6 months → mp=15,000; yearIndex=1 → monthStart=12 > 6 → 0
    const loans = [{ name: "已還清", balance: 90_000, rate: 0, remainingMonths: 6 }];
    expect(await call("calcYearLoanPayment", loans, 1)).toBe(0);
  });

  test("loan partially active in second year", async ({ page }) => {
    const call = await fire(page);
    // balance=75,000 at 0% for 15 months → mp=5,000; yearIndex=1 → monthStart=12, active=min(12,15-12)=3
    const loans = [{ name: "車貸", balance: 75_000, rate: 0, remainingMonths: 15 }];
    expect(await call("calcYearLoanPayment", loans, 1)).toBe(5000 * 3);
  });

  test("multiple loans sum correctly", async ({ page }) => {
    const call = await fire(page);
    const loans = [
      { name: "房貸", balance: 4_800_000, rate: 0, remainingMonths: 240 },
      { name: "信貸", balance: 60_000, rate: 0, remainingMonths: 6 },
    ];
    // yearIndex=0: loan1 active=12 (mp=20000), loan2 active=6 (mp=10000)
    expect(await call("calcYearLoanPayment", loans, 0)).toBe(20000 * 12 + 10000 * 6);
  });

  test("integer years work correctly", async ({ page }) => {
    const call = await fire(page);
    // balance=240,000 at 0% for 24 months → mp=10,000; yearIndex=1 → active=12
    const loans = [{ name: "信貸", balance: 240_000, rate: 0, remainingMonths: 24 }];
    expect(await call("calcYearLoanPayment", loans, 1)).toBe(10000 * 12);
    // yearIndex=2 → monthStart=24, active=max(0,24-24)=0
    expect(await call("calcYearLoanPayment", loans, 2)).toBe(0);
  });
});

// ─── simulate with loans ───
test.describe("simulate with loans", () => {
  test("loans reduce portfolio compared to no-loans", async ({ page }) => {
    await fire(page);
    await page.locator("#p_age").fill("30");
    const [noLoan, withLoan] = await page.evaluate(() => {
      const f = (window as any).__FIRE__;
      const p = {
        assets: 1_000_000,
        income: 1_000_000,
        expenses: 400_000,
        nomReturn: 0.07,
        inflation: 0.03,
        incGrowRate: 0,
        deathAge: 90,
      };
      const loans = [{ name: "房貸", balance: 4_800_000, rate: 0, remainingMonths: 240 }];
      const noLoan = f.simulate(50, p);
      const withLoan = f.simulate(50, p, undefined, undefined, loans);
      return [noLoan, withLoan];
    });
    // With loans, portfolio should be smaller at every point
    const retIdx = 50 - 30;
    expect(withLoan.reals[retIdx]).toBeLessThan(noLoan.reals[retIdx]);
  });

  test("simulate returns yearLoanPayments array", async ({ page }) => {
    await fire(page);
    await page.locator("#p_age").fill("30");
    const result = await page.evaluate(() => {
      const f = (window as any).__FIRE__;
      const p = {
        assets: 0,
        income: 500_000,
        expenses: 300_000,
        nomReturn: 0.07,
        inflation: 0.03,
        incGrowRate: 0,
        deathAge: 90,
      };
      const loans = [{ name: "信貸", balance: 300_000, rate: 0, remainingMonths: 30 }];
      return f.simulate(50, p, undefined, undefined, loans);
    });
    expect(result.yearLoanPayments).toBeDefined();
    expect(result.yearLoanPayments.length).toBe(result.ages.length);
    // Year 0: full 12 months → 120000
    expect(result.yearLoanPayments[0]).toBe(120000);
    // Year 2: remainingMonths=30, monthStart=24, active=min(12,6)=6
    expect(result.yearLoanPayments[2]).toBe(60000);
    // Year 3: monthStart=36 > 30 → 0
    expect(result.yearLoanPayments[3]).toBe(0);
  });

  test("loan payments are not inflation-adjusted", async ({ page }) => {
    await fire(page);
    await page.locator("#p_age").fill("30");
    const result = await page.evaluate(() => {
      const f = (window as any).__FIRE__;
      const p = {
        assets: 5_000_000,
        income: 1_000_000,
        expenses: 300_000,
        nomReturn: 0.07,
        inflation: 0.05,
        incGrowRate: 0,
        deathAge: 90,
      };
      const loans = [{ name: "房貸", balance: 4_800_000, rate: 0, remainingMonths: 240 }];
      return f.simulate(50, p, undefined, undefined, loans);
    });
    // Loan payment should be the same nominal amount every year (240000)
    // for years where the loan is fully active
    expect(result.yearLoanPayments[0]).toBe(240000);
    expect(result.yearLoanPayments[5]).toBe(240000);
    expect(result.yearLoanPayments[10]).toBe(240000);
  });
});

// ─── findEarliest with loans ───
test.describe("findEarliest with loans", () => {
  test("loans delay retirement age", async ({ page }) => {
    await fire(page);
    await page.locator("#p_age").fill("25");
    const [noLoan, withLoan] = await page.evaluate(() => {
      const f = (window as any).__FIRE__;
      const p = {
        assets: 500_000,
        income: 1_000_000,
        expenses: 400_000,
        nomReturn: 0.07,
        inflation: 0.03,
        incGrowRate: 0,
        deathAge: 80,
      };
      const loans = [{ name: "房貸", balance: 6_000_000, rate: 0, remainingMonths: 240 }];
      const noLoan = f.findEarliest(p);
      const withLoan = f.findEarliest(p, undefined, undefined, loans);
      return [noLoan, withLoan];
    });
    expect(noLoan).not.toBeNull();
    expect(withLoan).not.toBeNull();
    expect(withLoan).toBeGreaterThan(noLoan);
  });
});

// ─── calcMonthlyPayment ───
test.describe("calcMonthlyPayment", () => {
  test("zero interest: balance / total months", async ({ page }) => {
    const call = await fire(page);
    // 100萬, 0% rate, 10 years → 100萬 / 120 = 8333
    expect(await call("calcMonthlyPayment", 1_000_000, 0, 10)).toBe(8333);
  });

  test("normal interest rate", async ({ page }) => {
    const call = await fire(page);
    // 800萬, 2.1%, 20 years → standard amortization formula
    const result = await call("calcMonthlyPayment", 8_000_000, 0.021, 20);
    // Expected: ~40,618 (verified with standard mortgage calculator)
    expect(result).toBeGreaterThan(40000);
    expect(result).toBeLessThan(42000);
  });

  test("zero balance returns 0", async ({ page }) => {
    const call = await fire(page);
    expect(await call("calcMonthlyPayment", 0, 0.05, 10)).toBe(0);
  });

  test("negative balance returns 0", async ({ page }) => {
    const call = await fire(page);
    expect(await call("calcMonthlyPayment", -100, 0.05, 10)).toBe(0);
  });

  test("zero years returns 0", async ({ page }) => {
    const call = await fire(page);
    expect(await call("calcMonthlyPayment", 1_000_000, 0.05, 0)).toBe(0);
  });

  test("negative rate treated as zero interest", async ({ page }) => {
    const call = await fire(page);
    expect(await call("calcMonthlyPayment", 1_200_000, -0.01, 10)).toBe(10000);
  });

  test("short loan: 1 year at 5%", async ({ page }) => {
    const call = await fire(page);
    // 120萬, 5%, 1 year (12 months)
    const result = await call("calcMonthlyPayment", 1_200_000, 0.05, 1);
    // Should be close to 102,728
    expect(result).toBeGreaterThan(102000);
    expect(result).toBeLessThan(103000);
  });
});

// ─── calcYearLoanPayment with mode ───
test.describe("calcYearLoanPayment with mode", () => {
  test("mode='simple' uses monthlyPayment directly", async ({ page }) => {
    const call = await fire(page);
    const loans = [{ name: "房貸", monthlyPayment: 40000, balance: 0, rate: 0, remainingMonths: 240 }];
    // simple mode: 40000 * 12 = 480000
    expect(await call("calcYearLoanPayment", loans, 0, "simple")).toBe(40000 * 12);
  });

  test("mode=undefined backward-compat uses balance/rate (precise)", async ({ page }) => {
    const call = await fire(page);
    // balance=4,800,000 at 0% for 240 months → mp=20,000; yearIndex=0 → 20000*12
    const loans = [{ name: "房貸", monthlyPayment: 99999, balance: 4_800_000, rate: 0, remainingMonths: 240 }];
    expect(await call("calcYearLoanPayment", loans, 0)).toBe(20000 * 12);
  });

  test("mode='simple' respects remainingMonths expiry", async ({ page }) => {
    const call = await fire(page);
    const loans = [{ name: "信貸", monthlyPayment: 10000, balance: 0, rate: 0, remainingMonths: 6 }];
    // yearIndex=0: active=min(12,6)=6 → 10000*6=60000
    expect(await call("calcYearLoanPayment", loans, 0, "simple")).toBe(10000 * 6);
    // yearIndex=1: monthStart=12 > 6 → 0
    expect(await call("calcYearLoanPayment", loans, 1, "simple")).toBe(0);
  });
});

// ─── c3Returns ───
test.describe("c3Returns", () => {
  test("returns base ±2%", async ({ page }) => {
    const call = await fire(page);
    const result = await call("c3Returns", { nomReturn: 0.07 }) as number[];
    expect(result[0]).toBeCloseTo(0.05, 10);
    expect(result[1]).toBeCloseTo(0.07, 10);
    expect(result[2]).toBeCloseTo(0.09, 10);
  });

  test("handles 0% return", async ({ page }) => {
    const call = await fire(page);
    const result = await call("c3Returns", { nomReturn: 0 }) as number[];
    expect(result[0]).toBeCloseTo(-0.02, 10);
    expect(result[1]).toBeCloseTo(0, 10);
    expect(result[2]).toBeCloseTo(0.02, 10);
  });

  test("handles 15% return", async ({ page }) => {
    const call = await fire(page);
    const result = await call("c3Returns", { nomReturn: 0.15 }) as number[];
    expect(result[0]).toBeCloseTo(0.13, 10);
    expect(result[1]).toBeCloseTo(0.15, 10);
    expect(result[2]).toBeCloseTo(0.17, 10);
  });
});

// ─── escAttr ───
test.describe("escAttr", () => {
  test("escapes &, \", <, >", async ({ page }) => {
    const call = await fire(page);
    expect(await call("escAttr", '&"<>')).toBe("&amp;&quot;&lt;&gt;");
  });

  test("passes through normal text unchanged", async ({ page }) => {
    const call = await fire(page);
    expect(await call("escAttr", "hello 前年 123")).toBe("hello 前年 123");
  });
});

// ─── buildLoanFormula ───
test.describe("buildLoanFormula", () => {
  test("single loan full year in simple mode", async ({ page }) => {
    const call = await fire(page);
    const loans = [{ name: "房貸", monthlyPayment: 40000, balance: 0, rate: 0, remainingMonths: 240 }];
    const result = await call("buildLoanFormula", loans, 0, "simple");
    expect(result).toContain("房貸");
    expect(result).toContain("40,000/月");
    expect(result).toContain("12月");
    expect(result).toContain("480,000");
  });

  test("single loan partial year", async ({ page }) => {
    const call = await fire(page);
    const loans = [{ name: "信貸", monthlyPayment: 10000, balance: 60000, rate: 0, remainingMonths: 6 }];
    const result = await call("buildLoanFormula", loans, 0, "simple");
    expect(result).toContain("信貸");
    expect(result).toContain("10,000/月");
    expect(result).toContain("6月");
    expect(result).toContain("60,000");
  });

  test("multiple loans show per-loan breakdown and total", async ({ page }) => {
    const call = await fire(page);
    const loans = [
      { name: "房貸", monthlyPayment: 40000, balance: 0, rate: 0, remainingMonths: 240 },
      { name: "信貸", monthlyPayment: 10000, balance: 0, rate: 0, remainingMonths: 36 },
    ];
    const result = await call("buildLoanFormula", loans, 0, "simple");
    expect(result).toContain("房貸");
    expect(result).toContain("信貸");
    expect(result).toContain("合計");
    expect(result).toContain("600,000"); // 480,000 + 120,000
  });

  test("loan expired returns empty string", async ({ page }) => {
    const call = await fire(page);
    const loans = [{ name: "已還清", monthlyPayment: 10000, balance: 0, rate: 0, remainingMonths: 6 }];
    const result = await call("buildLoanFormula", loans, 1, "simple");
    expect(result).toBe("");
  });

  test("empty array returns empty string", async ({ page }) => {
    const call = await fire(page);
    expect(await call("buildLoanFormula", [], 0, "simple")).toBe("");
  });

  test("precise mode uses calculated monthly payment", async ({ page }) => {
    const call = await fire(page);
    // balance=4,800,000 at 0% for 240 months → mp=20,000 (calculated)
    const loans = [{ name: "房貸", monthlyPayment: 99999, balance: 4_800_000, rate: 0, remainingMonths: 240 }];
    const result = await call("buildLoanFormula", loans, 0, "precise");
    expect(result).toContain("房貸");
    expect(result).toContain("20,000/月"); // calculated, not 99,999
    expect(result).toContain("240,000");   // 20,000 * 12
  });
});
