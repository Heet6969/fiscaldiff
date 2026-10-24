# Design — Workforce Budget Impact

## 1. Installed-tool findings

Probed on this machine (Windows, PowerShell) before choosing the stack:

| Tool | Result |
|---|---|
| Git | 2.53.0.windows.2 — present at `C:\Program Files\Git\cmd\git.exe` |
| Python | 3.14.6 — present |
| winget | present |
| Node.js | **not installed** |
| npm / npx / pnpm / yarn / bun / deno | **not installed** |
| nvm / fnm / Volta | not installed |

Common Node install locations (`%ProgramFiles%\nodejs`, nvm, fnm, Volta, Scoop) were
checked and are all absent. `winget search OpenJS.NodeJS.LTS` reports **24.22.1**
available, which matches the Node 24 Active LTS line.

**Consequence:** the preferred TypeScript/React/Vite stack is the right choice but is
not yet runnable here. Installing Node.js LTS is a prerequisite for the first
implementation task, not for this spec. This is recorded as an open blocker in §14.

## 2. Stack decision

A static, browser-only single-page application. No backend, no database, no runtime
AI service — nothing in the three functions requires one, and the demo must work
without an API key or account.

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict` | Money and value-state bugs should fail at compile time. |
| UI | React | Requested; the view layer is forms and tables. |
| Build/dev | Vite | Fast, static output, trivial later deployment. |
| Money storage | `bigint` minor units (cents) | Exact by construction. No float can enter. |
| Rate arithmetic | decimal.js (MIT) | Exact decimal percentages and multipliers. |
| CSV | Papa Parse (MIT) | Correct quoting/escaping; hand-rolling this is a known source of bugs. |
| Chart | Hand-written SVG | One chart is needed. A charting library invites decorative extras and takes away accessibility control. |
| Unit tests | Vitest | Native Vite integration. |
| Property tests | fast-check | Arithmetic invariants (Req 12.2). |
| E2E + a11y | Playwright + axe-core | Real browser journey and automated accessibility checks. |
| Styling | Plain CSS with custom properties | Restrained styling needs no framework. |

Deployment target is static hosting. Nothing is uploaded; all file processing uses
the browser `File` API in-page.

### Dependency licensing

decimal.js, Papa Parse, React, Vite, Vitest, fast-check, and Playwright are all MIT
or Apache-2.0. A `THIRD-PARTY-NOTICES.md` will record each dependency and its
license, per steering rule 5.

## 3. Architecture

```
src/
  domain/          # types, value states, provenance. No logic.
  money/           # Money (bigint cents), parsing, rounding, formatting
  engine/
    fiscalCalendar.ts   # fiscal years, proration, effective dates
    baseline.ts         # baseline cost from employee records
    offer.ts            # offer cost, incremental cost, annualization
    overtime.ts         # monthly aggregates, effective hourly cost, variance
    flags.ts            # review flag evaluation
    reconcile.ts        # stated-cost comparison and verdicts
    index.ts            # the single public surface
  data/
    fixtures/           # committed synthetic CSV/JSON fixtures
    generate/           # deterministic generator (seeded)
    csv/                # schema, validate, import, export
  ui/
    App.tsx
    views/CompareProposals.tsx
    views/ReviewOvertime.tsx
    views/CheckStatedCost.tsx
    components/         # Figure, Disclosure, DataTable, TrendChart, Warnings
  export/           # CSV breakdown + printable summary
```

Strict dependency direction: `ui → engine → money → domain`. The engine never
imports from `ui` and touches no DOM, network, or storage (Req 2.5). Each view calls
`engine/index.ts`; no view holds a formula (Req 1.2).

State lives in one React context holding the single `Dataset`. Views derive
everything through engine selectors, so the three views cannot drift apart (Req 1.1).

## 4. Money and rounding

```ts
type Money = { readonly cents: bigint };     // canonical
```

- Parsing accepts a decimal string, never a JS `number`.
- Addition and subtraction are exact `bigint` operations.
- Multiplication by a rate goes through decimal.js, then rounds once to whole cents.

**Rounding policy.** Round half-up, away from zero, at exactly one place: when a
per-employee, per-component amount is converted to cents. Every aggregation above
that is exact integer summation.

This gives the reconciliation guarantee in Req 2.4: because rounding happens only at
the leaf and all sums are exact, the sum of displayed parts always equals the
displayed total. No drift, no plug figure.

Formatting for display is a separate concern from arithmetic and never feeds back
into a calculation.

## 5. Value states and provenance

```ts
type ValueState<T> =
  | { kind: 'known';    value: T }
  | { kind: 'missing' }                        // should exist, absent
  | { kind: 'unknown' }                        // exists, not determined
  | { kind: 'excluded'; reason: string };      // deliberately out of scope

type Provenance = 'source-supported' | 'user-assumption' | 'synthetic-sample';

type Input<T> = {
  state: ValueState<T>;
  provenance: Provenance;
  sourceLabel?: string;
  agreementPassage?: string;
};
```

Encoding these as a discriminated union makes Req 1.6 a compile-time matter: there is
no way to read a number out of an `Input<Money>` without handling all four states.
`{ kind: 'known', value: 0 }` is distinct from `missing` and `excluded` (Req 1.7).

Every engine result carries completeness:

```ts
type Completeness =
  | { kind: 'complete' }
  | { kind: 'partial';  absentInputs: string[] }   // labeled partial estimate
  | { kind: 'refused';  absentInputs: string[] };  // cannot produce a figure
```

A `partial` result may be displayed only with a visible partial-estimate label naming
the absent inputs. A `refused` result shows no total (Req 2.6).

## 6. Data model

```ts
type Dataset = {
  meta: { isSynthetic: true; label: string; generatedFrom: string };
  fiscalYear: { start: IsoDate; end: IsoDate; label: string };
  department: { id: string; name: string };
  employees: Employee[];
  baselineOvertime: OvertimeAssumption;
  overtimeRecords: OvertimeRecord[];   // 24 complete months
  workforceBudget?: Input<Money>;
  offers: { A: Offer; B: Offer };
  comparators: Comparator[];
  statedCosts: StatedCostClaim[];
};

type Employee = {
  id: string; role: string; gradeStep: string;
  annualBaseSalary: Input<Money>;
  scheduledHoursPerWeek: Input<Decimal>;
  weeksPerYear: Input<Decimal>;
  overtimeEligible: boolean;
  bonusEligible: boolean;
};

type Offer = {
  id: 'A' | 'B'; label: string;
  basePayRaisePercent: Input<Decimal>;
  raiseEffectiveDate: Input<IsoDate>;
  oneTimeBonusPerEmployee: Input<Money>;
  bonusPaymentDate: Input<IsoDate>;
  overtimeHoursAssumption: Input<Decimal>;      // annual hours, department-wide
  overtimeRate: OvertimeRateBasis;
};

type OvertimeRateBasis =
  | { kind: 'independent'; confirmedRate: Input<Money>; escalatesWithRaise: false }
  | { kind: 'derived';     multiplier: Input<Decimal> };   // hourly base × multiplier

type OvertimeRecord = {
  month: YearMonth;                  // 'YYYY-MM'
  hours: Input<Decimal>;
  dollars: Input<Money>;
  budgetDollars?: Input<Money>;
};

type StatedCostClaim = {
  id: string;
  statedAmount: Input<Money>;
  periodStart: IsoDate; periodEnd: IsoDate;
  claimedComponents: ComponentId[];
  tolerance: { kind: 'absolute'; amount: Money } | { kind: 'percent'; percent: Decimal };
  documentLabel?: string; documentText?: string;
};

type ComponentId =
  | 'base-pay-increment'
  | 'one-time-bonus'
  | 'overtime-increment'
  | 'employer-taxes'      // never calculated in MVP
  | 'pension'             // never calculated in MVP
  | 'benefits'            // never calculated in MVP
  | 'total-payroll';      // sentinel: not an incremental scope
```

`total-payroll` exists purely so a claim about total payroll can be *recognized* and
routed to "Cannot verify" (Req 7.5) instead of being silently compared against an
incremental figure.

Hourly base pay is computed only from explicit `scheduledHoursPerWeek × weeksPerYear`
(Req 2.7). There is no fallback constant anywhere in the engine. If either is absent,
hourly pay is `missing` and anything depending on it degrades accordingly.

## 7. Fiscal calendar and proration

```
prorationFactor(effectiveDate, fiscalYear) -> Decimal in [0, 1]
```

1. Effective date on or before FY start → `1`.
2. Effective date after FY end → `0`.
3. Effective date on the first of a month → `wholeMonthsRemaining / 12`.
4. Mid-month effective date → `(wholeMonthsAfter + partialFraction) / 12`, where
   `partialFraction = (daysInMonth − dayOfMonth + 1) / daysInMonth`.

Case 4 satisfies Req 3.3: a mid-month date is never snapped to a boundary. Dates are
handled as plain `YYYY-MM-DD` civil dates with no timezone involvement, keeping the
engine deterministic (Req 2.3).

The twelfths model is a simplifying assumption. It is surfaced in the assumptions
disclosure and in every export as monthly proration, explicitly not a reproduction of
an actual payroll calendar (Req 3.4).

## 8. Function 1 — Compare proposals

Per employee, per offer:

```
newSalary        = round(baseSalary × (1 + raisePercent))
annualIncrement  = newSalary − baseSalary
currentYearBase  = round(annualIncrement × prorationFactor)
oneTimeBonus     = bonusEligible && bonusDate ∈ fiscalYear ? bonusPerEmployee : 0
```

Department overtime increment:

- **derived** basis: the overtime rate is `hourlyBase × multiplier`, so the rate rises
  with the raise. The increment is the rate delta × assumed hours, prorated by the
  same factor (Req 4.9).
- **independent** basis: the confirmed rate is held flat. No escalation without a
  confirmed rule (Req 4.10).

Overtime hours changes and rate changes are computed as a single rate×hours delta
against the baseline assumption, so a change in both does not double count (Req 12.1).

Reported figures, each a distinct labeled field (Req 4.5):

| Field | Definition |
|---|---|
| Baseline cost | Sum of baseline annual base pay (+ baseline overtime when in scope) |
| Total proposed expenditure | Baseline + incremental |
| Current fiscal-year incremental cost | Prorated base increment + one-time + overtime increment |
| Annualized recurring increase | Full-year increment at the new rate, one-time amounts excluded |
| One-time cost | Shown on its own line, never inside the recurring figure |
| Base-pay component / Overtime component | The two parts of the increment |
| Workforce budget remaining or shortfall | Budget − total required, only when a budget is supplied (Req 4.6, 4.7) |

A/B isolation is structural: each offer is a separate immutable object and each
computation is a pure function of one offer (Req 4.11). Zero inputs yield exact
zeroes because the increment is a subtraction of identical values (Req 4.12).

Excluded categories — employer taxes, pension, benefits, headcount change — are
returned on every result as `excluded` with a reason, and rendered as a visible
exclusions line (Req 2.9, 4.13).

**Stress test.** The assumed overtime hours are varied across a small fixed set of
multipliers of the baseline assumption. Output is a short table: assumed hours,
overtime cost, total incremental cost. The varied assumption is named in the table
caption. It is a table, not an extra chart.

## 9. Comparator context

A single table, no engine of its own (Req 5.6). Columns: municipality, role,
grade/step, effective date, scheduled hours, pay basis, stated pay.

Rows whose role, grade/step, or pay basis differ from the subject position are marked
"Not directly comparable" and are never aggregated into an average (Req 5.3). If an
hourly/annual normalization is shown, the normalizing assumption prints next to the
normalized value (Req 5.4). The table carries a standing note that it provides
negotiation context only and does not establish fair pay (Req 5.5).

## 10. Function 2 — Review overtime

Monthly aggregates come from `OvertimeRecord[]`. Effective overtime hourly cost is
`dollars / hours`, computed only when both are `known` and `hours > 0`; otherwise the
cell reads "Not enough comparable data" (Req 6.10, 6.11).

One chart: an SVG line chart with a metric selector (hours, dollars, effective hourly
cost, budget variance). The chart is paired with a real `<table>` of the same numbers,
which is the accessible equivalent and also the print view (Req 6.2).

### Flag evaluation

Each flag is a pure function returning a structured, self-explaining record:

```ts
type Flag = {
  id: string;
  label: 'Needs review';
  summary: string;
  recordIds: YearMonth[];      // records involved
  comparison: string;          // the comparison made
  threshold: string;           // the threshold used
};
```

| Flag | Comparison | Guard |
|---|---|---|
| Hours above threshold | Month vs same month prior year, or vs trailing-window mean | Needs ≥ 2 comparable periods |
| Material change in effective hourly cost | Effective hourly cost vs prior comparable period | Both periods `known`, both `hours > 0` |
| Spending over budget | Month dollars vs entered overtime budget | Budget present and `known` |

Comparisons are only ever between equivalent periods — same month prior year, or
trailing windows of equal length (Req 6.8). The 24-month dataset exists precisely so
same-month-prior-year comparisons are possible for the most recent 12 months.

Percentage change is computed only when the denominator is `known` and non-zero;
otherwise the result is the explicit "Not enough comparable data" value. No infinity,
no `NaN`, no arbitrarily large number can reach the interface (Req 6.10). Missing
months are rendered as missing, not zero (Req 6.9).

Flags state what was compared and against what threshold. They never assert a cause
(Req 6.7), and the only status word used is "Needs review" (Req 6.6).

## 11. Function 3 — Check a stated cost

```
checkStatedCost(claim, dataset, offerId) -> Reconciliation
```

Scope matching runs **before** any arithmetic:

1. If `claimedComponents` includes `total-payroll` → **Cannot verify**, reason: a
   total-payroll claim is not an incremental-cost scope (Req 7.5).
2. If the claimed fiscal period does not equal the dataset fiscal period →
   **Cannot verify**, reason: period mismatch.
3. If any claimed component is one the MVP never calculates (employer taxes, pension,
   benefits) → **Cannot verify**, reason: claimed scope includes uncalculated
   components (Req 7.4).
4. If any input required by the matched scope is `missing` or `unknown` → **Cannot
   verify**, listing those inputs (Req 7.9).

Only if all four pass does the engine compute the calculated amount for exactly the
claimed component set and compare:

- `|difference| ≤ tolerance` → **Matches within the stated tolerance**
- otherwise → **Difference requiring review**

Never "error", never "incorrect" (Req 7.6). Tolerance is user-settable and printed in
the verdict (Req 7.8).

The expandable reconciliation renders: stated amount, calculated amount, difference,
the included components itemized, and per line the inputs, formula, assumptions, and
source references used (Req 7.7). The formula strings come from the engine alongside
the numbers, so the explanation cannot drift from the arithmetic.

### Worked acceptance example (Req 2.10)

The required synthetic case, in cents, as the engine computes it:

| Step | Computation | Result |
|---|---|---|
| Baseline annual base pay | 50 × 6,000,000¢ | 300,000,000¢ = **$3,000,000** |
| New salary per employee | round(6,000,000 × 1.03) | 6,180,000¢ = $61,800 |
| Annual increment per employee | 6,180,000 − 6,000,000 | 180,000¢ = $1,800 |
| Annualized recurring increase | 50 × 180,000 | 9,000,000¢ = **$90,000** |
| Proration factor | 2027-01-01 is a month start; 6 whole months to 2027-06-30 | 6/12 = 0.5 |
| Current-year base increment | 50 × round(180,000 × 0.5) | 4,500,000¢ = **$45,000** |
| One-time bonuses | 50 × 50,000¢ | 2,500,000¢ = **$25,000** |
| Current-year total incremental | 4,500,000 + 2,500,000 | 7,000,000¢ = **$70,000** |

Overtime and employer add-ons are `excluded` in this case and are listed as such.

A claim of $45,000 stating it covers both the raise and the bonus matches the scope
`['base-pay-increment', 'one-time-bonus']`, whose calculated amount is $70,000. The
verdict is **Difference requiring review**, difference **$25,000** — consistent with
a claim that omitted the bonus. This is synthetic and is not a statement about any
real municipality (Req 2.12).

This same case is the `fiscal-note-with-omission` fixture, so the acceptance test and
the demo narrative are the same arithmetic.

## 12. CSV schema, validation, and fixtures

### Schemas

**`employees.csv`** — `employee_id`, `department_id`, `role`, `grade_step`,
`annual_base_salary`, `scheduled_hours_per_week`, `weeks_per_year`,
`overtime_eligible`, `bonus_eligible`, `provenance`, `source_label`

**`overtime_records.csv`** — `department_id`, `month` (`YYYY-MM`), `overtime_hours`,
`overtime_dollars`, `overtime_budget_dollars`, `provenance`, `source_label`

**`comparators.csv`** — `municipality`, `role`, `grade_step`, `effective_date`,
`scheduled_hours_per_week`, `pay_basis` (`annual`|`hourly`), `stated_pay`,
`provenance`, `source_label`

**`stated_costs.csv`** — `claim_id`, `stated_amount`, `period_start`, `period_end`,
`claimed_components` (pipe-delimited `ComponentId`s), `tolerance_kind`,
`tolerance_value`, `document_label`, `document_text`, `provenance`

Money columns are decimal strings. Dates are `YYYY-MM-DD`. Booleans are `true`/`false`.
Empty means `missing`; the literal `UNKNOWN` means `unknown`; the literal `EXCLUDED`
means `excluded`. That mapping is what keeps the four states distinct through a file
round-trip.

### Validation pipeline

Parse → structural check → per-row typing → cross-row checks → commit or reject.

Nothing is applied until every stage passes. The importer builds a complete candidate
`Dataset` and swaps it in atomically, so a failed import leaves existing data
untouched (Req 8.4).

Checks: duplicate identifiers; duplicate or gapped months; invalid dates; invalid or
negative numbers where disallowed; missing required fields; unknown `provenance` or
`ComponentId`; and totals inconsistent with components (Req 8.5). Errors are reported
as a list of `{ row, column, message }`.

Sample templates for each record type are generated from the schema definition, so a
template can never fall out of step with the validator (Req 8.2).

All parsing is in-page via the `File` API. There is no upload endpoint and no network
call anywhere in the application (Req 8.7).

### Fixtures (Req 11.4)

| Fixture set | Contents |
|---|---|
| `valid-baseline/` | One fictional department, the employee cohort, 24 complete months of overtime including a plausible spike, comparators |
| `invalid-imports/` | Separate files each isolating one failure: duplicate id, bad date, bad number, missing required field, inconsistent total |
| `fiscal-note-omission/` | The $45,000 claim covering raise + bonus against the $70,000 calculated scope |

Each directory carries a `README.md` stating what the fixture is for and that the
contents are synthetic. The spike fixture is labeled a review example, not evidence of
wrongdoing (Req 11.5).

### Synthetic generation (Req 11.1–11.3)

A seeded generator (fixed integer seed, small deterministic PRNG committed in-repo —
not `Math.random`) emits the fixture CSVs. Generated files are committed, so tests run
against fixed bytes and the demo is reproducible. The generator is re-runnable and
must produce identical output; a test asserts that re-generation matches the committed
fixtures.

Names are plainly fictional (e.g. department "Public Works — Township of Meadowbrook",
comparator municipalities "Ashford", "Brookline Falls", "Carrow"). No real
municipality, no reuse of Lowell records, prior spreadsheets, or prior project code
(Req 11.6, 11.7).

Totals are never written into fixtures as findings; every total shown in the
application is recomputed from records (Req 11.3).

## 13. Interface

Shell: a plain header with the application name, the fiscal-year label, and a
persistent "Synthetic demo data" chip (Req 10.2). Below it, three tabs as a real
labeled tab list: **Compare proposals · Review overtime · Check a stated cost**.

A single-column, generously spaced layout at a readable measure. Numbers are
right-aligned and tabular-aligned with thousands separators. Restrained palette, no
animation, no decorative chart, no card grid (Req 10.3, 10.4).

### Compare proposals

```
Workforce budget (optional) [________]
Baseline: 50 employees · $3,000,000 annual base pay

┌ Offer A ──────────────┐  ┌ Offer B ──────────────┐
│ Base-pay raise  [ 3 ]%│  │ Base-pay raise  [ 0 ]%│
│ Effective  [2027-01-01]│  │ Effective  [__________]│
│ Bonus each   [ $500 ] │  │ Bonus each    [  $0  ] │
│ Bonus paid [2026-12-18]│  │ Bonus paid [__________]│
│ Overtime hours [_____]│  │ Overtime hours [_____] │
│ Overtime rate: ( ) confirmed  ( ) derived × [___] │
└───────────────────────┘  └───────────────────────┘

                                  Offer A      Offer B
Current fiscal-year increase      $70,000           $0
  Base pay                        $45,000           $0
  Overtime                       excluded     excluded
One-time cost (not recurring)     $25,000           $0
Annualized recurring increase     $90,000           $0
Total proposed expenditure     $3,070,000   $3,000,000
Workforce budget remaining         —            —

⚠ Overtime excluded: no confirmed overtime rate entered.
Excluded from all figures: employer taxes, pension, benefits.

▸ Assumptions and calculation steps
▸ Overtime hours stress test
▸ Comparison context (other municipalities)
```

The warning line stays visible; only assumptions, the stress test, and the comparator
table collapse (Req 10.5, 10.6).

### Review overtime

Metric selector, one chart, the same data as a table beneath it, then the flag list.
Each flag shows its summary, the months involved, the comparison, and the threshold.

### Check a stated cost

Stated amount, fiscal period, component checkboxes, tolerance, optional document
label and text. One verdict line in words, then an expandable reconciliation.

### Accessibility

Native semantic elements throughout: `<form>`, `<fieldset>`/`<legend>`, `<label for>`,
`<table>` with `<th scope>`, and a tab list with proper `role="tab"`/`aria-selected`
and arrow-key handling. Disclosures are `<details>`/`<summary>` or buttons with
`aria-expanded`.

Focus is never removed, only restyled, with a visible indicator meeting contrast.
Validation messages are tied to inputs with `aria-describedby` and announced via a
polite live region; every status also carries a text label so nothing depends on color
or position (Req 10.9, 10.10). Palette chosen for WCAG 2.1 AA contrast; verified with
axe-core plus manual keyboard passes. Full WCAG conformance also needs assistive-
technology testing and expert review, which automated checks do not replace.

## 14. Exports

- **CSV breakdown** — one row per component per offer: component, period, amount,
  provenance, value state, formula, source label.
- **Printable summary** — a print stylesheet over a dedicated summary layout; no PDF
  dependency. Charts are replaced by their data tables in print.

Both headers carry: "Synthetic demo data", the fiscal period, the assumptions applied,
the excluded categories, and the generation date (Req 9.3). Both are produced from the
same engine results as the screen (Req 9.4).

## 15. Testing strategy

| Layer | Tool | Coverage |
|---|---|---|
| Money and rounding | Vitest | Half-up rounding, sum-of-parts reconciliation, no float ingress |
| Fiscal calendar | Vitest | Month-start, mid-month day-count, before/after FY bounds |
| Acceptance case | Vitest | The exact Req 2.10 table, asserted figure by figure |
| Offers | Vitest | Zero-change zero cost, one-time excluded from recurring, A/B isolation, rate×hours no double count |
| Overtime | Vitest | Equivalent-period comparison, zero denominator, missing ≠ zero, flag threshold reporting |
| Reconciliation | Vitest | All three verdicts, total-payroll refusal, scope mismatch, missing-input refusal |
| CSV | Vitest | Each invalid fixture rejected with row/column; existing data intact after failure |
| Cross-view | Vitest | The same figure from all three view selectors is identical |
| Invariants | fast-check | incremental = total − baseline; components sum to total; zero change ⇒ zero |
| Journey | Playwright | open demo → edit proposal → inspect result → review a flag → check stated cost → export |
| Accessibility | Playwright + axe-core | Keyboard traversal, labels, visible focus, validation messages, narrow layout, contrast |

No coverage number or test result is written into any document unless it came from an
actual run (Req 12.5).

### Kiro hook

A `PostFileSave` hook matching `src/(engine|money)/.*\.ts$` runs the financial test
suite. It is created during implementation, after the suite exists, and its execution
is verified by saving an engine file and observing the run. Creating it before the
tests exist would make a hook that only fails, so it is deliberately scheduled in
Milestone 3 rather than now.

## 16. Open issues

Decisions that are assumptions rather than confirmed facts, carried as
`user-assumption` and surfaced in the interface:

1. **Node.js is not installed.** Blocks implementation. Resolve with
   `winget install OpenJS.NodeJS.LTS` (24.22.1) and a new shell for PATH.
2. **Scheduled hours.** The synthetic cohort uses 40 h/week × 52 weeks. Declared as a
   dataset assumption, not a payroll convention. Real use requires the actual figure.
3. **Bonus eligibility.** Modeled as a per-employee `bonusEligible` flag. The rule
   that determines the flag is not defined and is not invented.
4. **Independent overtime-rate escalation.** Held flat. A confirmed contractual rule
   would be needed to escalate it.
5. **Overtime hours assumption granularity.** Annual, department-wide for the MVP.
   Per-employee or monthly distribution is not modeled.
6. **Mid-month proration convention.** The effective day counts as worked
   (`daysInMonth − day + 1`). Plausible, not authoritative; disclosed as an assumption.
7. **"Material change" threshold** for effective hourly cost — needs a default value
   and must remain user-configurable.
8. **Default tolerance** for the stated-cost check — needs a stated default.
9. **Component taxonomy.** The `ComponentId` enum is fixed for the MVP. A claim using
   a component outside it resolves to "Cannot verify" rather than a guess.
