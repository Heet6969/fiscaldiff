# Implementation Plan — Workforce Budget Impact

Ordered so the calculation engine was correct and tested before any interface
existed. The Requirement 2.10 acceptance case was implemented at task 3.1 and has
been green since.

**Status: implemented.** Verified 2026-10-24 — type check clean, 137 unit tests
passing, 51 browser tests passing, production build succeeding. One task is
explicitly incomplete and marked below. Observed command output is in
[`docs/kiro-usage.md`](../../../docs/kiro-usage.md).

---

## Milestone 0 — Environment

- [x] 0.1 Install the Node.js toolchain
  - Installed with `winget install --id OpenJS.NodeJS.LTS --exact --source winget`
  - Observed: `node v24.22.1`, `npm 11.19.1`
  - `PATH` was stale in the running shell, so commands prepended
    `C:\Program Files\nodejs`

- [x] 0.2 Scaffold the Vite + React + TypeScript project
  - `strict` and `noUncheckedIndexedAccess` enabled, plus `noImplicitOverride`,
    `noFallthroughCasesInSwitch`, `noUnusedLocals`, `verbatimModuleSyntax`
  - Dependencies pinned to exact versions
  - **Deviation:** `vite-node@5.0.5` does not exist, so the
    `regen:fixtures` script was dropped; the generator is a plain module with a
    determinism test instead
  - **Deviation:** TypeScript pinned to 5.9.3 rather than the current 7.0.2, which
    is the new native port the surrounding tooling has not settled on
  - _Requirements: 2.1, 2.2_

- [x] 0.3 Record dependency licenses
  - `THIRD-PARTY-NOTICES.md`, versions and licenses read from `npm view`
  - _Requirements: steering rule 5_

---

## Milestone 1 — Money and value states

- [x] 1.1 `src/domain/types.ts` — four-case `ValueState`, `Provenance`, `Input`,
      `Completeness`, `ComponentId`, `IsoDate`, `YearMonth`. No logic.
      _Requirements: 1.4–1.8_
- [x] 1.2 `src/money/money.ts` — `bigint` cents, strict parsing, exact add/subtract,
      single rounding point in `multiplyByRate`. _Requirements: 2.1, 2.2_
- [x] 1.3 Money and rounding tests — half-up away from zero, sum of parts equals the
      total, float traps (`0.1 + 0.2`, `1.005`), zero distinct from missing and
      excluded, 10,000-addition exactness. _Requirements: 1.7, 2.4, 12.1_
- [x] 1.4 `src/engine/dates.ts` and `fiscalCalendar.ts` — civil dates with no
      timezone, all four proration cases. _Requirements: 2.3, 3.1–3.3, 3.5_
- [x] 1.5 Fiscal-calendar tests — 2027-01-01 gives exactly 6/12; mid-month day-count
      proration asserted *not* equal to either month boundary; leap-year February
      divides by 29; before/after bounds. _Requirements: 3.2, 3.3, 3.5, 12.1_

---

## Milestone 2 — Core engine

- [x] 2.1 `baseline.ts` — annual base pay from records; hourly pay only from explicit
      scheduled hours, with no hours-per-year fallback anywhere.
      _Requirements: 1.3, 2.7, 2.8_
- [x] 2.2 `offer.ts` — per-employee new salary and increment, prorated current year,
      bonus gated on explicit eligibility and an in-period payment date, annualized
      figure excluding one-time amounts, both overtime rate bases, single rate×hours
      delta, disclosed exclusions. _Requirements: 2.8, 2.9, 3.6, 3.7, 4.2, 4.9, 4.10, 4.12_
- [x] 2.3 Completeness propagation — `partial` names absent inputs, `refused` exposes
      no total. _Requirements: 2.6, 1.6_
- [x] 2.4 Budget comparison — remaining or shortfall only when a budget is supplied,
      using the term "workforce budget shortfall". _Requirements: 4.5–4.7_

---

## Milestone 3 — Acceptance case, then the hook

- [x] 3.1 Requirement 2.10 acceptance test — each figure asserted separately
      ($3,000,000 / $45,000 / $25,000 / $70,000 / $90,000), overtime and add-ons
      assert as `excluded`. Passed on its first run. _Requirements: 2.10, 2.12_
- [x] 3.2 Offer-behaviour tests — zero change gives exact zeroes, one-time excluded
      from recurring, four effective-date boundaries, A/B isolation, and a
      double-counting test that asserts the combined rate-and-hours increment is
      *not* the sum of the two separate increments.
      _Requirements: 4.11, 4.12, 3.5–3.7, 12.1_
- [x] 3.3 Property-based invariants — incremental equals total minus baseline,
      components sum to the total, zero change gives zero, current year never exceeds
      annualized plus one-time, determinism, and the annualized figure's independence
      from the effective date with overtime both excluded and modeled.
      _Requirements: 12.2_
- [~] 3.4 Kiro financial-test hook — **created, execution not yet observed**
  - `.kiro/hooks/financial-tests-on-engine-change.json`, `PostFileSave`, matcher
    `src[\\/](engine|money|domain)[\\/].*\.ts$`, command `npm run test:financial`
  - Verified: the matcher accepts engine/money/domain `.ts` paths in both slash
    styles and rejects `src/ui`, `src/data`, `tests/`, `.md` and `.tsx`; the command
    runs directly and exits 0 with 120 tests passing
  - **Not verified:** firing on save. Kiro reported the hook activates at the next
    session start, and an edit to `src/engine/dates.ts` in this session produced no
    hook output. Confirm in a new session, then record the result in
    `docs/kiro-usage.md`
  - _Requirements: 12.6_

---

## Milestone 4 — Overtime review

- [x] 4.1 `overtime.ts` — monthly aggregates, effective hourly cost only when both
      values are known and hours exceed zero, budget variance, equivalent-period
      helpers, guarded percentage change. _Requirements: 6.3, 6.8, 6.10, 6.11_
- [x] 4.2 `flags.ts` — the three flag types, each returning records, comparison and
      threshold; label fixed to "Needs review"; no cause attribution.
      _Requirements: 6.4–6.7_
- [x] 4.3 Overtime and flag tests — missing month stays missing, zero baseline yields
      no percentage, insufficient periods report explicitly, incomplete months are
      skipped and said to be skipped, and a vocabulary test asserts no accusatory
      words appear. _Requirements: 6.9, 6.10, 12.1_

---

## Milestone 5 — Stated-cost reconciliation

- [x] 5.1 `reconcile.ts` — scope gate before arithmetic, three verdicts only,
      `total-payroll` always refused, full reconciliation payload with formula
      strings emitted alongside the numbers. _Requirements: 7.2–7.5, 7.7, 7.9_
- [x] 5.2 Reconciliation tests — all three verdicts, the $45,000-vs-$70,000 case
      reporting −$25,000, total-payroll refusal, period mismatch, uncalculated
      components, missing input, and an assertion that no output contains "error",
      "incorrect" or "wrong". _Requirements: 2.11, 7.3, 7.5, 7.6, 7.9, 12.1_
- [x] 5.3 Cross-view tests — a property test asserts the combined `computeEngineView`
      and the direct `computeOffer` agree across generated inputs.
      _Requirements: 1.1, 1.2, 12.1_

---

## Milestone 6 — Data, CSV, fixtures

- [x] 6.1 Schemas as data, driving validation, templates and the on-screen column
      reference, including the empty / `UNKNOWN` / `EXCLUDED` sentinel mapping.
      _Requirements: 8.1, 1.5_
- [x] 6.2 Validate-then-commit importer — parse, structure, typing, cross-row, then
      an atomic swap; errors as `{row, column, message}`; declared provenance
      honoured. _Requirements: 8.3–8.7_
- [x] 6.3 Templates generated from the schema objects, with a test asserting each
      template passes its own validator. _Requirements: 8.2_
- [x] 6.4 Deterministic generator — committed mulberry32 PRNG, one fictional
      department, 50 employees, five fictional comparators, 24 complete months with a
      plausible spike. _Requirements: 11.1, 11.2, 11.6, 11.7_
- [x] 6.5 Fixtures committed under `public/fixtures/` with a README stating purpose
      and synthetic status, and the spike labeled a review example.
      _Requirements: 11.4, 11.5_
- [x] 6.6 Data-layer tests — each invalid fixture rejected with the expected row and
      column, dataset unchanged after failure, demo totals recomputed from records,
      value states surviving a file round trip
  - **Deviation:** the committed valid fixture is hand-written rather than emitted by
    the generator, so "regeneration reproduces fixtures byte for byte" became a
    generator determinism test plus a CSV export/import round-trip test
  - _Requirements: 8.4, 8.5, 11.2, 11.3, 12.1_

---

## Milestone 7 — Interface

- [x] 7.1 Shell — header with the fiscal-year label and a persistent "Synthetic demo
      data" indicator, three-tab accessible tab list with arrow-key navigation,
      restrained stylesheet with tabular figures. _Requirements: 10.1–10.4_
- [x] 7.2 Shared components — `Amount` (renders a state, never a number it is not),
      `Disclosure`, `WarningList`, `CompletenessNotice`, `ExclusionsNote`,
      `SyntheticBadge`, and fields that keep the user's text while committing a
      parsed value. _Requirements: 10.5, 10.6, 10.10_
- [x] 7.3 Compare proposals — baseline summary, two independent offers, the labeled
      results table, visible warnings and exclusions, collapsed disclosures for
      assumptions, the stress test and the comparator table.
      _Requirements: 4.1–4.5, 4.8, 4.13, 10.5, 10.6_
- [x] 7.4 Comparator table — required columns, non-comparable rows marked and never
      averaged, a standing note that it does not establish fair pay, and an
      explanation of why no average is shown. _Requirements: 5.1–5.6_
- [x] 7.5 Review overtime — metric selector, one hand-written SVG chart that breaks
      the line across gaps, the same data as an accessible table, flag list showing
      records / comparison / threshold, editable thresholds, and a "months not
      assessed" disclosure. _Requirements: 6.2–6.4, 6.9, 6.10_
- [x] 7.6 Check a stated cost — amount, period, component checkboxes that say when a
      selection makes the claim unverifiable, tolerance, optional document label and
      passage, verdict in words, expandable reconciliation.
      _Requirements: 7.1, 7.3, 7.7, 7.8_
- [x] 7.7 CSV controls — in-page file handling, inline error table, template and
      current-data downloads, reset, column reference, example files.
      _Requirements: 8.2, 8.7, 10.13_

---

## Milestone 8 — Exports

- [x] 8.1 CSV breakdown — figures with value states, calculation steps with formulas
      and provenance, assumptions, exclusions, warnings, the stated-cost check, the
      monthly overtime table and the flags. _Requirements: 9.1, 9.4_
- [x] 8.2 Printable summary — print stylesheet over a dedicated layout, charts
      replaced by their data, no PDF dependency. _Requirements: 9.2_
- [x] 8.3 Export headers — synthetic label, fiscal period, assumptions, exclusions
      and generation date in both outputs. _Requirements: 9.3_
- [x] 8.4 Export tests — a browser test reads the downloaded CSV back and asserts the
      figures and the required labels. _Requirements: 9.3, 9.4_

---

## Milestone 9 — Journey and accessibility verification

- [x] 9.1 Playwright journey — open demo, edit a proposal, inspect the result, review
      an overtime flag, check the stated cost, export both outputs; plus invalid
      input, invalid import, reset, and a test asserting no external network
      requests. _Requirements: 12.3_
- [x] 9.2 Accessibility — axe-core on all three views, the printable summary and the
      import-error state with zero WCAG 2.0/2.1 A and AA violations detected;
      keyboard tab navigation including wrap, Home and End; outline present on focus;
      every control has an accessible name; validation tied via `aria-describedby`;
      warnings not collapsed; disclosures start closed; 380px layout with no
      horizontal page scroll. _Requirements: 10.7–10.12, 12.4_
- [x] 9.3 Dead-interface sweep — every button enabled and wired; a body-text scan
      asserts no prohibited vocabulary. _Requirements: 10.13, 6.6, 7.6_

---

## Milestone 10 — Documentation

- [x] 10.1 `docs/kiro-usage.md` — real tool versions, decisions and their reasons, the
      two bugs the tests found, the one problem visual inspection found, observed
      command output, and the hook's unverified status. _Requirements: 12.5_
- [x] 10.2 `README.md` — run instructions and URL, the three functions, the
      acceptance case, the synthetic-data statement, accessibility scope, and the
      "Not implemented" roadmap. _Requirements: 11.5, 12.5_
- [x] 10.3 Open issues restated in `docs/kiro-usage.md` rather than quietly dropped.

---

## Deferred to protect the core

Not in the MVP, by decision rather than drift:

- Multiple departments; multiple raise events per offer; step/grade progression.
- Employer taxes, pension, and benefit modeling.
- PDF parsing, OCR, or any document extraction.
- Munis or payroll-system integration.
- Backend, database, accounts, or saved sessions.
- Runtime AI of any kind.
- Scenario history, audit log, or undo.
- More than one chart, or any configuration panel.
- Per-employee overtime modeling. The department-wide hours assumption needs a mean
  hourly rate across overtime-eligible staff, which is disclosed in the calculation
  steps; a per-employee model would remove that intermediate assumption.
