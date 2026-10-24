# Implementation Plan — Workforce Budget Impact

Ordered so the calculation engine is correct and tested before any interface exists.
The Requirement 2.10 acceptance case is implemented early (task 4.1) and stays green
from that point on.

Status: not started. No task below has been implemented.

---

## Milestone 0 — Environment

- [ ] 0.1 Install the Node.js toolchain
  - Run `winget install OpenJS.NodeJS.LTS` (24.22.1 confirmed available) and open a
    new shell so PATH resolves
  - Record actual `node --version` and `npm --version` output in `docs/kiro-usage.md`
  - _Blocker for every later task. See design §1 and §16.1._

- [ ] 0.2 Scaffold the Vite + React + TypeScript project
  - Initialize in-place at the repository root; do not disturb `README.md`,
    `LICENSE`, `.gitignore`, or `.kiro/`
  - Enable `strict` and `noUncheckedIndexedAccess` in `tsconfig.json`
  - Add `decimal.js`, `papaparse`, `vitest`, `fast-check`, `@playwright/test`,
    `@axe-core/playwright` at pinned exact versions
  - Add scripts: `dev`, `build`, `test`, `test:financial`, `test:e2e`, `lint`
  - _Requirements: 2.1, 2.2_

- [ ] 0.3 Record dependency licenses
  - Create `THIRD-PARTY-NOTICES.md` listing each dependency, version, and license
  - _Requirements: steering rule 5_

---

## Milestone 1 — Money and value states

- [ ] 1.1 Implement `domain/` types
  - `ValueState<T>` as a four-case discriminated union, `Provenance`, `Input<T>`,
    `Completeness`, `ComponentId`, `IsoDate`, `YearMonth`
  - No logic in this module
  - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.8_

- [ ] 1.2 Implement `money/` with `bigint` cents
  - `fromDecimalString`, `add`, `subtract`, `multiplyByRate` (via decimal.js),
    `compare`, `format`
  - Reject JS `number` inputs at the type level; no float path into `Money`
  - _Requirements: 2.1, 2.2_

- [ ] 1.3 Write money and rounding tests
  - Round-half-up at the leaf; sum of rounded parts equals the reported total
  - Classic float traps (0.1 + 0.2, 1.005 rounding) handled exactly
  - Zero distinguished from `missing` and `excluded`
  - _Requirements: 1.7, 2.4, 12.1_

- [ ] 1.4 Implement `engine/fiscalCalendar.ts`
  - Civil-date handling with no timezone dependence
  - `prorationFactor` covering all four cases in design §7
  - `isWithinFiscalYear`, `wholeMonthsRemaining`, `daysInMonth`
  - _Requirements: 2.3, 3.1, 3.2, 3.3, 3.5_

- [ ] 1.5 Write fiscal-calendar tests
  - Month-start proration (2027-01-01 in FY2027 ⇒ exactly 6/12)
  - Mid-month day-count proration, asserting no snap to a month boundary
  - Effective date before FY start ⇒ 1; after FY end ⇒ 0
  - Leap-year February
  - _Requirements: 3.2, 3.3, 3.5, 12.1_

---

## Milestone 2 — Core engine

- [ ] 2.1 Implement `engine/baseline.ts`
  - Baseline annual base pay from employee records
  - Hourly base pay only from explicit scheduled hours; `missing` otherwise, with no
    hours-per-year fallback constant
  - _Requirements: 1.3, 2.7, 2.8_

- [ ] 2.2 Implement `engine/offer.ts`
  - Per-employee new salary, annual increment, prorated current-year increment
  - One-time bonus gated on eligibility and payment date inside the fiscal year
  - Annualized recurring increase excluding all one-time amounts
  - Overtime increment for both rate bases: `derived` escalates from the effective
    date, `independent` stays flat
  - Rate and hours changes combined as one rate×hours delta to prevent double counting
  - Return `excluded` entries for employer taxes, pension, benefits, headcount
  - _Requirements: 2.8, 2.9, 3.6, 3.7, 4.2, 4.9, 4.10, 4.12_

- [ ] 2.3 Implement completeness propagation
  - Any `missing`/`unknown` input required by a figure yields `partial` or `refused`
  - `partial` results name the absent inputs; `refused` results expose no total
  - _Requirements: 2.6, 1.6_

- [ ] 2.4 Implement budget comparison
  - Remaining or shortfall only when a workforce budget is supplied
  - Term "workforce budget shortfall"; the three figures stay separately labeled
  - _Requirements: 4.5, 4.6, 4.7_

---

## Milestone 3 — Acceptance case, then the hook

- [ ] 3.1 Implement the Requirement 2.10 acceptance test
  - Assert each figure separately: $3,000,000 / $45,000 / $25,000 / $70,000 / $90,000
  - Assert overtime and employer add-ons report as `excluded`
  - _Requirements: 2.10, 2.12_

- [ ] 3.2 Write offer-behavior tests
  - Zero changes ⇒ every incremental figure exactly zero
  - One-time payments absent from annualized recurring figures
  - Raise on the FY first day, final day, and outside the FY
  - A/B isolation: mutating A changes no output of B
  - Overtime rate and hours varied together without double counting
  - _Requirements: 4.11, 4.12, 3.5, 3.6, 3.7, 12.1_

- [ ] 3.3 Write property-based invariant tests
  - incremental = total proposed expenditure − baseline
  - components sum exactly to the reported total
  - zero change ⇒ zero incremental cost, across generated inputs
  - _Requirements: 12.2_

- [ ] 3.4 Create and verify the Kiro financial-test hook
  - `PostFileSave` hook matching `src/(engine|money)/.*\.ts$`, running
    `npm run test:financial`
  - Save an engine file, confirm the hook actually fires, and record the observed
    result in `docs/kiro-usage.md`
  - _Requirements: 12.6. Sequenced after the suite exists so the hook is real._

---

## Milestone 4 — Overtime review

- [ ] 4.1 Implement `engine/overtime.ts`
  - Monthly aggregates; effective hourly cost only when hours and dollars are `known`
    and hours > 0
  - Budget variance where an overtime budget exists
  - Equivalent-period comparison helpers (same month prior year, equal-length windows)
  - Zero or missing denominator ⇒ explicit "not enough comparable data", never
    Infinity or NaN
  - _Requirements: 6.3, 6.8, 6.10, 6.11_

- [ ] 4.2 Implement `engine/flags.ts`
  - The three flag types from design §10
  - Each flag returns record ids, the comparison, and the threshold
  - Label fixed to "Needs review"; no cause attribution; no prohibited vocabulary
  - _Requirements: 6.4, 6.5, 6.6, 6.7_

- [ ] 4.3 Write overtime and flag tests
  - Missing month treated as missing, not zero
  - Zero prior-period baseline produces no percentage change
  - Fewer than two comparable periods ⇒ no flag, explicit insufficient-data result
  - Each flag reports its records, comparison, and threshold
  - _Requirements: 6.9, 6.10, 12.1_

---

## Milestone 5 — Stated-cost reconciliation

- [ ] 5.1 Implement `engine/reconcile.ts`
  - Scope gate before arithmetic, in the design §11 order
  - Three verdicts only; `total-payroll` claims always "Cannot verify"
  - Reconciliation payload: stated, calculated, difference, itemized components,
    inputs, formula strings, assumptions, source references
  - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.7, 7.9_

- [ ] 5.2 Write reconciliation tests
  - Match within tolerance; difference requiring review; cannot verify
  - The $45,000-vs-$70,000 case reports a $25,000 difference requiring review
  - Total-payroll claim refused rather than compared
  - Period mismatch and uncalculated-component claims refused
  - Missing required input ⇒ "Cannot verify", not a number
  - No output string contains "error", "incorrect", or "wrong"
  - _Requirements: 2.11, 7.3, 7.5, 7.6, 7.9, 12.1_

- [ ] 5.3 Write cross-view reconciliation tests
  - A figure reachable from more than one view selector is identical in all of them
  - _Requirements: 1.1, 1.2, 12.1_

---

## Milestone 6 — Data, CSV, fixtures

- [ ] 6.1 Define CSV schemas as data
  - One schema object per record type driving validation, templates, and docs
  - Encode the `missing` / `UNKNOWN` / `EXCLUDED` sentinel mapping
  - _Requirements: 8.1, 1.5_

- [ ] 6.2 Implement the validate-then-commit importer
  - Parse → structural → typing → cross-row → atomic swap
  - Errors as `{ row, column, message }`; existing data untouched on failure
  - Honour declared provenance; never auto-tag imports as `synthetic-sample`
  - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ] 6.3 Generate sample templates from the schema objects
  - _Requirements: 8.2_

- [ ] 6.4 Build the deterministic synthetic generator
  - Committed seeded PRNG, not `Math.random`
  - One fictional department, employee cohort, several fictional comparators,
    24 complete months of overtime with a plausible spike
  - Clearly fictional names throughout
  - _Requirements: 11.1, 11.2, 11.6, 11.7_

- [ ] 6.5 Commit the three fixture sets with accurate labels
  - `valid-baseline/`, `invalid-imports/`, `fiscal-note-omission/`
  - A `README.md` per directory stating purpose and synthetic status; the spike
    labeled a review example
  - _Requirements: 11.4, 11.5_

- [ ] 6.6 Write data-layer tests
  - Re-running the generator reproduces the committed fixtures byte for byte
  - Each invalid fixture rejected with the expected row and column
  - Dataset state unchanged after a failed import
  - Every demo total recomputes from records, with no hardcoded result present
  - _Requirements: 8.4, 8.5, 11.2, 11.3, 12.1_

---

## Milestone 7 — Interface

- [ ] 7.1 Build the shell
  - Header with name, fiscal-year label, persistent "Synthetic demo data" indicator
  - Three-tab accessible tab list; base stylesheet with the restrained palette,
    generous spacing, tabular number alignment
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 7.2 Build shared components
  - `Figure` (label, amount, value state), `Disclosure`, `DataTable`,
    `WarningList` (always visible), `SyntheticBadge`
  - _Requirements: 10.5, 10.6, 10.10_

- [ ] 7.3 Build "Compare proposals"
  - Baseline summary, offers A and B, the labeled results table from design §8,
    visible warnings and exclusions line
  - Collapsed disclosures: assumptions and calculation steps, overtime stress test,
    comparison context
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8, 4.13, 10.5, 10.6_

- [ ] 7.4 Build the comparator table
  - Required columns; non-comparable rows marked and never averaged; normalizing
    assumptions shown; standing note that it does not establish fair pay
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 7.5 Build "Review overtime"
  - Metric selector, one SVG line chart, the same data as an accessible table,
    flag list showing records / comparison / threshold
  - Missing months marked; "Not enough comparable data" where applicable
  - _Requirements: 6.2, 6.3, 6.4, 6.9, 6.10_

- [ ] 7.6 Build "Check a stated cost"
  - Stated amount, fiscal period, component checkboxes, tolerance, optional document
    label and text; verdict in words; expandable reconciliation
  - _Requirements: 7.1, 7.3, 7.7, 7.8_

- [ ] 7.7 Wire CSV import/export controls
  - In-page file handling only; no network call; validation errors listed inline
  - _Requirements: 8.2, 8.7, 10.13_

---

## Milestone 8 — Exports

- [ ] 8.1 CSV breakdown export
  - Component, period, amount, provenance, value state, formula, source label
  - _Requirements: 9.1, 9.4_

- [ ] 8.2 Printable summary
  - Print stylesheet; charts replaced by data tables; no PDF dependency
  - _Requirements: 9.2_

- [ ] 8.3 Export headers
  - Synthetic label, fiscal period, assumptions, exclusions, generation date
  - _Requirements: 9.3_

- [ ] 8.4 Export tests
  - Exported figures identical to engine results; required labels present
  - _Requirements: 9.3, 9.4_

---

## Milestone 9 — Journey and accessibility verification

- [ ] 9.1 Playwright end-to-end journey
  - open demo → edit proposal → inspect result → review an overtime flag → check the
    stated cost → export a report
  - _Requirements: 12.3_

- [ ] 9.2 Accessibility checks
  - axe-core on all three views; keyboard-only traversal of the whole journey;
    visible focus; label association; announced validation; narrow-width layout;
    contrast
  - _Requirements: 10.7–10.12, 12.4_

- [ ] 9.3 Dead-interface sweep
  - Every control does something real; no fake integration, no placeholder success
    message, no prohibited vocabulary anywhere in the UI strings
  - _Requirements: 10.13, 6.6, 7.6_

---

## Milestone 10 — Documentation

- [ ] 10.1 Update `docs/kiro-usage.md` with actual development decisions
  - Real tool versions, real hook verification result, real test outcomes only
  - _Requirements: 12.5_

- [ ] 10.2 Update `README.md`
  - Run instructions, the three functions, synthetic-data statement, and the
    "Not implemented" roadmap
  - _Requirements: 11.5, 12.5_

- [ ] 10.3 Resolve or restate the design §16 open issues
  - Each either decided and documented, or carried forward as a stated assumption

---

## Deferred to protect the core

Not in the MVP. Listed so scope creep is a visible decision rather than a drift:

- Multiple departments; multiple raise events per offer; step/grade progression.
- Employer taxes, pension, and benefit modeling.
- PDF parsing, OCR, or any document extraction.
- Munis or payroll-system integration.
- Backend, database, accounts, or saved sessions.
- Runtime AI of any kind.
- Scenario history, audit log, or undo.
- More than one chart, or any configuration panel.
