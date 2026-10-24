# Requirements — Workforce Budget Impact

## Introduction

FiscalDiff is a workforce budget-impact application for municipal finance staff. It
answers three connected questions about a union request, from one shared data model
and one shared calculation engine:

1. **Compare proposals** — what does what the union is asking for cost?
2. **Review overtime** — which overtime patterns deserve a human look?
3. **Check a stated cost** — does a published figure match the agreement terms and
   the verified inputs? (This is the original FiscalDiff function and is mandatory.)

The three views must never disagree. Any number shown in more than one place is
produced by the same engine from the same records.

The intended user is a nontechnical city employee — a budget analyst, a finance
director, a clerk preparing a fiscal note. They are competent with money and
unfamiliar with software. The interface must read like a well-made form, not like a
developer tool.

All data in this project is fictional. The application ships with a reproducible
synthetic department example and runs entirely in the browser with no external API
key, database account, payroll connection, or runtime AI service.

### Scope of this spec

This spec covers the MVP: requirements, design, and implementation tasks for the
three functions, the shared engine, the synthetic dataset, CSV import/export,
exports, and tests. Implementation has not started.

---

## Glossary

Terminology is binding. These words mean exactly this throughout the code, the
interface, and the exports.

| Term | Meaning |
|---|---|
| **Baseline** | The current cost of the workforce before any offer is applied. |
| **Offer** | A proposed change to compensation (A or B). The baseline is not an offer. |
| **Total proposed expenditure** | Baseline cost + incremental cost, for a period. |
| **Incremental cost** | Offer cost minus baseline cost, for a period. The *increase*, not the total. |
| **Current fiscal-year incremental cost** | Incremental cost falling inside the active fiscal year, including proration. |
| **Annualized recurring increase** | Incremental cost of a full 12 months at the post-change rate. Excludes one-time amounts. |
| **One-time cost** | An amount paid once. Never part of a recurring or annualized figure. |
| **Workforce budget shortfall** | Workforce budget minus total required, when negative. |
| **Needs review** | A pattern meeting a stated threshold that a human should examine. |
| **Derived overtime rate** | An overtime rate computed from hourly base pay × a multiplier. |
| **Independent overtime rate** | A confirmed overtime rate entered directly, not computed from base pay. |

### Prohibited language

| Never say | Say instead |
|---|---|
| City fiscal deficit | Workforce budget shortfall |
| Fraud, misconduct, abuse | Needs review |
| Incorrect pay, overpayment | Needs review |
| Error, wrong, discrepancy proven | Difference requiring review |
| AI-extracted, intelligently parsed | Manually entered / fixed-format import |
| Fair pay, market rate justified | Comparison context |

---

## Requirement 1 — Shared data model

**User story:** As a finance analyst, I want all three views to work from one set of
records, so that the overtime review, the proposal cost, and the stated-cost check
can never contradict each other.

### Acceptance criteria

1.1. The system SHALL define a single in-memory dataset containing: one department,
an employee cohort, a fiscal-year definition, offers, overtime records, overtime
budget, workforce budget, comparator municipalities, and stated-cost claims.

1.2. All three views SHALL read from that one dataset and compute through one
calculation engine. No view SHALL contain its own copy of a cost formula.

1.3. Every total displayed anywhere SHALL be derived from underlying records at
runtime. The system SHALL NOT contain a hardcoded result, summary, or finding.

1.4. Each numeric input SHALL carry a provenance tag of exactly one of:
`source-supported`, `user-assumption`, or `synthetic-sample`.

1.5. Each numeric input SHALL carry a value state of exactly one of: `known`,
`missing`, `unknown`, or `excluded`. These four states SHALL be distinct and SHALL
NOT collapse into zero.

1.6. WHEN a value state is `missing`, `unknown`, or `excluded`, THEN the system
SHALL NOT substitute zero, a default, or an average in order to complete a
calculation.

1.7. A value of zero SHALL be representable as `known` with amount zero, and SHALL
be treated as different from `missing` and from `excluded`.

1.8. Each input SHALL support an optional source label and an optional agreement
passage stored alongside it, and the system SHALL preserve both through import,
calculation, and export.

---

## Requirement 2 — Deterministic calculation engine

**User story:** As a finance analyst, I need the arithmetic to be exact and
repeatable, so that I can defend the number in a public meeting.

### Acceptance criteria

2.1. The engine SHALL represent money as integer minor units (cents) and SHALL NOT
use binary floating point for any monetary value.

2.2. The engine SHALL use exact decimal arithmetic for rates, percentages, and
multipliers.

2.3. Given identical inputs, the engine SHALL produce byte-identical outputs. It
SHALL NOT depend on the current clock, the system locale, the system timezone, or
any random source.

2.4. The engine SHALL apply a single documented rounding policy, round-half-up, at
defined points, and totals SHALL reconcile exactly against the sum of their parts.

2.5. The engine SHALL be a pure library with no DOM, network, or storage access, so
that it is testable in isolation.

2.6. WHEN an input required by a requested figure has state `missing` or `unknown`,
THEN the engine SHALL NOT return a complete-cost result. It SHALL return either a
refusal or a result explicitly marked as a partial estimate naming the absent
inputs.

2.7. The engine SHALL compute hourly pay from annual salary only when scheduled
hours are explicitly provided. It SHALL NOT assume an hours-per-year convention.

2.8. The engine SHALL NOT introduce employer taxes, pension contributions, benefit
loading, headcount changes, or payroll conventions that were not supplied as inputs.

2.9. Every result SHALL carry a list of excluded cost categories, and the interface
and exports SHALL disclose that list.

### Required financial acceptance test

2.10. Given this exact synthetic case:

- 50 eligible employees
- $60,000 annual base salary each
- Fiscal year July 1, 2026 through June 30, 2027
- 3% base-pay raise effective January 1, 2027
- $500 one-time bonus per employee, paid within this fiscal year
- Explicit monthly proration: six of twelve months
- Overtime and employer add-ons explicitly excluded

the engine SHALL produce exactly:

| Figure | Expected |
|---|---|
| Baseline annual base pay | $3,000,000 |
| Current-year incremental base pay | $45,000 |
| One-time bonuses | $25,000 |
| Current-year total incremental cost | $70,000 |
| Annualized recurring base-pay increase | $90,000 |

2.11. Given the same case and a stated incremental cost of $45,000 claiming to cover
both the raise and the bonus, the system SHALL report a difference of $25,000
requiring review.

2.12. This case SHALL be labeled synthetic and SHALL NOT be described as a finding
about any real municipality.

---

## Requirement 3 — Fiscal calendar and effective dates

**User story:** As a finance analyst, I want raise timing handled honestly, so that
a mid-year raise is not quietly charged for a full year.

### Acceptance criteria

3.1. The fiscal year SHALL be defined by an explicit start and end date and SHALL be
stated in the interface and in exports.

3.2. WHEN a raise effective date falls on the first day of a month, THEN the engine
SHALL prorate by whole months remaining in the fiscal year.

3.3. WHEN a raise effective date falls mid-month, THEN the engine SHALL prorate the
partial month by calendar days and SHALL NOT silently round the date to a month
boundary.

3.4. The engine SHALL disclose monthly proration as an explicit simplifying
assumption and SHALL NOT present it as a reproduction of an actual payroll calendar.

3.5. WHEN a raise effective date falls outside the fiscal year, THEN current-year
incremental cost from that raise SHALL be zero while the annualized recurring
increase SHALL still be reported, each labeled.

3.6. The annualized recurring increase SHALL be independent of the effective date.

3.7. One-time amounts SHALL be attributed to the fiscal year containing their
payment date and SHALL be excluded from annualized recurring figures.

---

## Requirement 4 — Compare proposals

**User story:** As a finance analyst, I want to enter what the union asked for and
see what it costs against the baseline and against an alternative offer.

### Acceptance criteria

4.1. The view SHALL support a baseline and exactly two editable offers, A and B.

4.2. Each offer SHALL support: a percentage base-pay raise, a raise effective date, a
flat one-time bonus per eligible employee, explicit overtime-hour assumptions, and
an overtime rate that is either independent-confirmed or derived from hourly base pay
and a multiplier.

4.3. The MVP SHALL support one department and one raise event per offer.

4.4. The view SHALL display: current fiscal-year incremental cost, annualized
recurring increase, one-time cost shown separately, incremental base-pay and overtime
components, and an A/B comparison.

4.5. The view SHALL visibly distinguish total proposed expenditure, increase over
baseline, and budget remaining or shortfall as three different figures with three
different labels.

4.6. WHEN a workforce budget is provided, THEN the view SHALL display remaining
budget or shortfall, using the term "workforce budget shortfall".

4.7. WHEN no workforce budget is provided, THEN the view SHALL omit the
remaining/shortfall figure rather than assume a budget.

4.8. The view SHALL provide an overtime-hours stress test varying assumed overtime
hours and showing the effect on cost, with the varied assumption stated.

4.9. WHEN an offer's overtime rate is derived from base pay, THEN the engine SHALL
increase the overtime rate from the raise effective date.

4.10. WHEN an offer's overtime rate is entered independently, THEN the engine SHALL
NOT escalate it with the raise unless a confirmed escalation rule is supplied.

4.11. Offers A and B SHALL be fully isolated. Editing one SHALL NOT change any input
or output of the other.

4.12. WHEN all offer changes are zero, THEN every incremental figure SHALL be exactly
zero.

4.13. The view SHALL disclose excluded cost categories, including at minimum employer
taxes, pension, and benefits, as not calculated.

---

## Requirement 5 — Comparator context

**User story:** As a finance analyst, I want limited comparison context for
negotiation, without it becoming a second application.

### Acceptance criteria

5.1. The system SHALL provide a small optional comparison table of fictional
municipalities.

5.2. Each comparator row SHALL state role, grade/step, effective date, scheduled
hours, and pay basis.

5.3. The system SHALL NOT present positions with differing role, grade/step, or pay
basis as equivalent.

5.4. WHEN values are normalized for comparison, THEN the normalizing assumption
SHALL be displayed with the normalized value.

5.5. The system SHALL NOT state or imply that the comparison establishes fair pay,
market rate, or a justified wage.

5.6. The comparator SHALL remain a single table and SHALL NOT gain its own
calculation engine, scoring, or ranking.

---

## Requirement 6 — Review overtime

**User story:** As a finance analyst, I want to see overtime trends and a short list
of patterns worth examining, each explained well enough that I can check it myself.

### Acceptance criteria

6.1. The dataset SHALL contain 24 complete months of fictional overtime hours and
spending.

6.2. The view SHALL display one readable trend chart with a clear metric selector.
It SHALL NOT display multiple simultaneous or decorative charts.

6.3. The view SHALL display monthly overtime hours and dollars, effective overtime
hourly cost, and budget variance where an overtime budget exists.

6.4. The view SHALL display a short list of review flags. Each flag SHALL identify
the records involved, the comparison made, and the threshold used.

6.5. Flag types SHALL include at minimum: hours exceeding a configurable comparison
threshold, a material change in effective hourly cost, and spending exceeding the
entered overtime budget.

6.6. Flags SHALL use the label "Needs review". The system SHALL NOT use the words
fraud, misconduct, abuse, incorrect pay, or overpayment.

6.7. The system SHALL NOT state or imply a cause for any fluctuation.

6.8. Comparisons SHALL be between equivalent periods — same month prior year, or a
trailing window of equal length.

6.9. Missing monthly values SHALL be treated as missing, not as zero, and SHALL be
visibly marked.

6.10. WHEN a comparison denominator is zero or a required value is missing, THEN the
system SHALL display "Not enough comparable data" and SHALL NOT produce an infinite,
NaN, or arbitrarily large percentage change.

6.11. Effective overtime hourly cost SHALL be computed only when both hours and
dollars are `known` and hours are greater than zero.

---

## Requirement 7 — Check a stated cost

**User story:** As a finance analyst, I want to check a published fiscal-impact
figure against the same calculation, and see exactly where any difference comes from.

### Acceptance criteria

7.1. The view SHALL accept: a stated incremental cost, the fiscal period it covers,
the components it claims to include, and an optional supporting document label or
text.

7.2. The system SHALL compare the stated amount only against the calculated figure
for the matching scope — matching fiscal period and matching component set.

7.3. The system SHALL return exactly one of three verdicts:
- **Matches within the stated tolerance**
- **Difference requiring review**
- **Cannot verify** — information is missing, or scopes differ

7.4. WHEN the claimed component set does not match an available calculated scope,
THEN the verdict SHALL be "Cannot verify", with the scope mismatch named.

7.5. The system SHALL NOT compare total payroll against an incremental-cost claim.
Such a comparison SHALL return "Cannot verify".

7.6. The system SHALL NOT label a difference an error, a mistake, or incorrect until
assumptions and scope are confirmed. The neutral label is "Difference requiring
review".

7.7. The view SHALL provide an expandable reconciliation showing: stated amount,
calculated amount, difference, included components, and the inputs, formulas,
assumptions, and source references used.

7.8. The tolerance SHALL be user-visible and user-settable, and the verdict SHALL
state the tolerance applied.

7.9. WHEN any input required by the matching scope has state `missing` or `unknown`,
THEN the verdict SHALL be "Cannot verify" rather than a numeric match or difference.

---

## Requirement 8 — CSV import and export

**User story:** As a finance analyst, I want to get my own figures in and my results
out, using files I can open in a spreadsheet.

### Acceptance criteria

8.1. The system SHALL define a strict CSV schema per record type, with required
columns, types, and formats documented.

8.2. The system SHALL offer a downloadable sample template per record type.

8.3. The system SHALL validate an entire import before applying any of it.

8.4. WHEN validation fails, THEN the system SHALL keep existing data completely
intact and SHALL report each problem with its row number and column.

8.5. Validation SHALL reject or clearly flag: duplicate identifiers, invalid dates,
invalid numbers, missing required fields, and totals inconsistent with their
components.

8.6. Imported data SHALL be tagged `source-supported` or `user-assumption` as
declared, and SHALL NOT be silently tagged `synthetic-sample`.

8.7. All import processing SHALL occur in the browser. Uploaded data SHALL NOT be
transmitted anywhere.

8.8. The system SHALL NOT implement arbitrary PDF parsing, OCR, live Munis
integration, or confidential-record ingestion.

8.9. The system SHALL NOT describe manual entry or fixed-format CSV parsing as AI
extraction.

---

## Requirement 9 — Exports

**User story:** As a finance analyst, I want to take a defensible summary into a
meeting.

### Acceptance criteria

9.1. The system SHALL export the calculation breakdown as CSV.

9.2. The system SHALL provide a printable summary suitable for a meeting, using
print styles rather than a generated binary format.

9.3. Every export SHALL visibly include: the synthetic-data label, the assumptions
applied, the excluded cost categories, the fiscal period, and the generation date.

9.4. Exported figures SHALL be produced by the same engine as the on-screen figures
and SHALL match them exactly.

---

## Requirement 10 — Interface and accessibility

**User story:** As a nontechnical city employee, I want an interface that is calm,
plainly labeled, and usable entirely from the keyboard.

### Acceptance criteria

10.1. The application SHALL present exactly three plainly labeled views: "Compare
proposals", "Review overtime", "Check a stated cost".

10.2. A persistent, unobtrusive "Synthetic demo data" indicator SHALL be visible in
every view.

10.3. The interface SHALL use restrained styling, generous spacing, readable number
formatting with thousands separators and aligned decimals, and a small number of
purposeful controls.

10.4. The interface SHALL NOT include animations, decorative charts, endless card
grids, or configuration panels.

10.5. Detailed assumptions and calculation steps SHALL be placed behind clearly
labeled expandable sections, collapsed by default.

10.6. Incomplete-input warnings SHALL remain visible and SHALL NOT be collapsed
behind an expandable section.

10.7. All functionality SHALL be operable by keyboard, with a visible focus indicator
and a logical tab order.

10.8. Every input SHALL have a programmatically associated label. Every control SHALL
have an accessible name.

10.9. Validation messages SHALL be announced to assistive technology and SHALL NOT
rely on color alone.

10.10. Status, difference, and flag meanings SHALL carry text labels, not color or
position alone.

10.11. Text and essential interface elements SHALL meet WCAG 2.1 AA contrast ratios.

10.12. The layout SHALL remain usable at narrow widths without horizontal scrolling
of body content.

10.13. The application SHALL NOT contain dead buttons, fake integrations, or
placeholder success messages.

---

## Requirement 11 — Synthetic dataset

**User story:** As a reviewer, I want a ready-to-use fictional example that
demonstrates the workflow without any real data.

### Acceptance criteria

11.1. The system SHALL ship a reproducible fictional example containing: one
department, a manageable employee cohort, several fictional comparison
municipalities, and 24 complete months of overtime records.

11.2. Generation SHALL be deterministic — a fixed seed or committed fixture files
producing identical data on every run.

11.3. All displayed totals SHALL be derived from the underlying records.

11.4. The system SHALL provide three distinct fixture sets, each accurately labeled:
- a valid baseline dataset containing a plausible overtime spike,
- deliberately invalid import fixtures, kept separate from valid data,
- a fiscal-note example containing an intentional omission.

11.5. The overtime spike SHALL be labeled a review example and SHALL NOT be described
as proof of wrongdoing.

11.6. All municipality, department, and employee names SHALL be clearly fictional.

11.7. The project SHALL NOT reuse Lowell internal records, prior spreadsheets, or
prior project code.

---

## Requirement 12 — Testing and quality

**User story:** As the author, I want tests that would actually catch a wrong number.

### Acceptance criteria

12.1. Automated tests SHALL cover: the Requirement 2.10 acceptance example; totals
reconciling across all three views; zero changes producing zero incremental cost;
one-time payments excluded from recurring costs; raise timing and fiscal-year
boundaries; overtime rate and hours changes without double counting; missing data;
incomparable fiscal-note scopes; invalid and duplicate CSV records; zero comparison
baselines; A/B scenario isolation; and decimal rounding.

12.2. Property-based tests SHALL cover arithmetic invariants, including: incremental
cost equals total proposed expenditure minus baseline; the sum of components equals
the reported total; and zero change implies zero incremental cost.

12.3. An end-to-end browser test SHALL cover the journey: open demo → edit proposal →
inspect result → review an overtime flag → check the stated cost → export a report.

12.4. Automated checks SHALL cover keyboard navigation, label association, visible
focus, validation messages, responsive layout, and contrast.

12.5. No test result, coverage figure, or benchmark SHALL be reported unless produced
by an actual run.

12.6. A Kiro hook SHALL run the financial test suite when calculation code changes,
and SHALL be verified to execute during implementation.

---

## Requirement 13 — Counterproposal base-pay adjustments (Offer B)

**User story:** As a finance analyst, I want to model a counterproposal as several
increases and decreases, so I can test a trade-off without recomputing by hand.

### Acceptance criteria

13.1. Offer A SHALL keep one union-proposed base-pay percentage and effective date, both
editable.

13.2. Offer B SHALL replace its single percentage with repeatable rows, each holding a
direction (Increase or Decrease), a nonnegative percentage, and a remove control, plus an
"Add another increase/decrease" control. The existing alternative SHALL initialise as one
Increase row holding its current percentage, leaving every existing figure unchanged.

13.3. The signed percentages SHALL be summed first and the net applied once to each
employee's original salary using the existing exact-money rounding. They SHALL NOT be
compounded: +3% and −1% is exactly a net +2%.

13.4. All rows SHALL share Offer B's one effective date and proration. No rows SHALL be an
explicit 0% adjustment, not a missing value.

13.5. An unfinished or invalid row SHALL block every dependent result and name the row;
it SHALL NOT be skipped. A combined change below −100% SHALL be refused with a reason, so a
salary is never negative.

13.6. A derived overtime rate SHALL follow the resulting pay change from the effective
date, including a decrease; an independently confirmed rate SHALL stay independent.

13.7. The one-time bonus SHALL remain separate. Offer B SHALL be calculated against the
baseline independently of Offer A.

13.8. The interface SHALL show a compact "Net base-pay change" and the basis in one
sentence. Counterproposal adjustments are user assumptions.

13.9. A decrease SHALL be shown as a negative amount everywhere — results, charts, budget
position, stated-cost check, CSV and printable summary — with a plain-words note that a
negative amount is a decrease from baseline (a saving).

13.10. A stated incremental cost MAY be negative, to check a saving. Salaries, bonuses and
budgets SHALL remain nonnegative.

13.11. The CSV and printable summary SHALL state Offer B's rows, net and effective date.
## Out of scope for this MVP

Named here so they are not mistaken for planned MVP behavior:

- Backend service, database, or user accounts.
- Runtime AI or language-model inference.
- PDF parsing, OCR, or document extraction.
- Live Munis or payroll-system integration.
- Multiple departments, multiple raise events per offer, or step/grade progression.
- Employer taxes, pension, or benefit modeling.
- Real municipal data of any kind.
