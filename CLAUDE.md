# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A retirement planning simulator ("幾歲能退休？") — a single-page Traditional Chinese (zh-TW) web app. Everything lives in one file: `index.html` (inline CSS + HTML + JS), no build step, no bundler, CDN-loaded Chart.js 4.x.

## Development

Open `index.html` directly in a browser or use any local HTTP server.

### Test

```bash
npm test                                    # run all Playwright tests
npx playwright test tests/unit.spec.ts      # run only unit tests
npx playwright test tests/ui.spec.ts        # run only UI tests
npx playwright test -g "clamp"              # run tests matching a name
```

Tests require the dev server on port 3000 (`npx serve . -l 3000`); Playwright starts it automatically via `playwright.config.ts`.

### Architecture

- All JS lives inside a single `DOMContentLoaded` closure in `index.html` (~1550 lines total: CSS → HTML → JS)
- Key pure functions: `clamp`, `stripCommas`/`addCommas`, `hexAlpha`, `simulate`, `findEarliest`, `c3Returns`
- Input helpers: `initMoneyInput(el, opts)` for money fields, `initNumberInput(el, opts)` for numeric fields — see `/input-fields` skill for full spec
- `simulate(retireAge, params, customReturn?, incomeOverride?)` — core simulation engine, returns `{feasible, ages[], reals[], minPort}`
- `findEarliest(params)` — binary-searches for the earliest feasible retirement age
- `recalculate()` — reads DOM inputs, runs simulation, updates chart and conclusion
- Tests access internals via `window.__TEST__` flag which exposes `window.__FIRE__` bridge with all key functions
- `tests/unit.spec.ts` — pure function tests (via `page.evaluate` against the `__FIRE__` bridge)
- `tests/ui.spec.ts` — DOM interaction / validation / persistence tests

### TDD 開發流程

**每次修改功能都必須遵守以下流程，沒有例外：**

1. **先寫測試** — 在 `tests/` 下新增或修改對應的 test case，描述預期行為。測試應該會失敗（紅燈）。
2. **再寫實作** — 只寫剛好讓測試通過的最少程式碼。
3. **跑測試確認綠燈** — 執行 `npm test`，全部通過才繼續。
4. **重構（可選）** — 改善程式碼品質，跑測試確認沒壞。

**規則：**
- 不准在測試失敗的狀態下 commit。
- 新增函數 → 必須有對應的 unit test。
- 修改 UI 行為 → 必須有對應的 UI test。
- 修 bug → 先寫一個能重現 bug 的測試，再修。

## Rules

- All UI text is in Traditional Chinese (zh-TW). Maintain this convention.
- **每次 `git push` 或部署前都必須先詢問使用者並取得明確同意，沒有例外。** 使用者說「改」只代表修改程式碼，不代表授權推送。只有使用者明確說出「push」、「deploy」、「部署」等字眼時才可以推送。
