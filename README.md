# CivicVariance

**Understand workforce costs. Explain every difference.**

A workforce budget-impact application for municipal finance staff.

Built at Sundai — Hackachusetts 2026.

> Naming: the project was developed under the working name FiscalDiff. The display
> name is now CivicVariance. The repository, folder, package name and internal
> identifiers keep the original `fiscaldiff` name.

## Status

Working prototype. Runs entirely in the browser on fictional data.

Verified on 2026-10-24, after the fixes from an independent review: type check clean,
215 unit tests passing across 11 files, 132 browser tests passing, production build
succeeding. All three suites were run after the final change. See
[`docs/kiro-usage.md`](docs/kiro-usage.md) for the observed output of each command
and for what has **not** been verified.

## Run it

Needs Node.js 22.12+ or 24+ (built and tested on 24.22.1).

```bash
npm install
npm run dev
```

Then open **http://localhost:5173/**. The application opens straight onto the
fictional demonstration dataset — there is nothing to configure, no API key, no
account, and no database.

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 5173 |
| `npm run build` | Type check and build to `dist/` |
| `npm run preview` | Serve the built output on port 4173 |
| `npm test` | All unit tests |
| `npm run test:financial` | The financial suite only (money, calendar, offers, overtime, reconciliation, invariants) |
| `npm run test:e2e` | Playwright browser and accessibility tests |
| `npm run typecheck` | TypeScript, no emit |

## What it does

Three connected questions about a union request, answered from one shared data model
and one shared calculation engine, so the three answers cannot disagree.

### 1. Compare proposals

A baseline and two independent offers. Each offer takes a percentage base-pay raise
and its effective date, a one-time bonus per eligible employee and its payment date,
and an explicit overtime assumption — either no overtime modeled, a rate derived from
hourly base pay, or a separately confirmed rate.

The results keep three easily-confused figures separately labeled:

- **Increase over baseline** for the current fiscal year, split into base pay,
  overtime and one-time cost
- **Annualized recurring increase** over a full twelve months, with one-time amounts
  excluded
- **Total proposed expenditure**, the baseline plus the increase
- **Workforce budget remaining or shortfall**, shown only when a budget is entered

Plus an overtime-hours stress test, and a small comparison table of fictional
municipalities that marks rows which are not directly comparable and does not claim
to establish fair pay.

### 2. Review overtime

Twenty-four complete months of fictional overtime hours and spending: one trend chart
with a metric selector, monthly hours and dollars, effective overtime hourly cost,
budget variance, and a short list of "Needs review" flags.

Every flag names the records it used, the comparison it made, and the threshold it
applied. Thresholds are editable and are labeled demonstration values. The tool does
not infer why a number moved, and it does not use the word fraud.

### 3. Check a stated cost

The original function of the project, developed under the working name FiscalDiff. Enter a published figure, the period it covers, and
the components it claims to include. The result is one of three verdicts:

- **Matches within the stated tolerance**
- **Difference requiring review**
- **Cannot verify** — information is missing, or the scopes differ

The scope is settled before any arithmetic runs, so a claim about a different period,
about total payroll, or about costs this prototype does not calculate comes back as
"Cannot verify" rather than as a difference that looks like a finding. An expandable
reconciliation shows the stated amount, the calculated amount, the signed difference,
the components, and the inputs, formulas, assumptions and sources behind them.

## Principles the code actually follows

- **Totals come from records.** No finding is hardcoded. The demonstration figures are
  recomputed from the fictional employee and overtime rows on every render.
- **Money is exact.** Amounts are integer cents in a `bigint`; rates use decimal.js.
  No `number` ever holds an amount of money. Rounding happens at exactly one place, so
  the displayed parts always add up to the displayed total.
- **Missing, unknown, excluded and zero are four different things.** They are a
  discriminated union, so the compiler will not let a gap be read as a number.
- **Gaps block totals.** An incomplete input produces a labeled partial estimate or no
  figure at all, never a confident total with a hole in it.
- **Uncalculated costs are disclosed.** Employer taxes, pension, benefits, headcount
  changes and step progression are not modeled, and every screen and export says so.
- **No percentage from a zero baseline.** Comparisons against a zero or absent month
  return "Not enough comparable data" instead of infinity.
- **Neutral language.** "Needs review", not fraud. "Workforce budget shortfall", not
  city fiscal deficit. "Difference requiring review", not error.

## The financial acceptance case

The engine is pinned to this exact synthetic case as an executable test
([`tests/unit/acceptance.test.ts`](tests/unit/acceptance.test.ts)). The expected
figures are asserted; they are not stored anywhere in the application.

50 employees at $60,000, fiscal year July 1 2026 – June 30 2027, a 3% raise effective
January 1 2027, a $500 one-time bonus each paid inside the year, six of twelve months
of proration, overtime and employer add-ons excluded:

| Figure | Expected |
|---|---|
| Baseline annual base pay | $3,000,000 |
| Current-year incremental base pay | $45,000 |
| One-time bonuses | $25,000 |
| Current-year total incremental cost | $70,000 |
| Annualized recurring base-pay increase | $90,000 |

A $45,000 claim covering both the raise and the bonus differs by $25,000 and is
reported as a difference requiring review. This case is synthetic and is not a
statement about any real municipality.

## Data

All data is fictional. The application ships with a reproducible synthetic example —
one fictional department, 50 employees, five fictional comparison municipalities, and
24 months of overtime records containing a plausible winter spike — generated from a
committed seeded PRNG so the numbers are identical on every run.

The spike is a **review example**. It is not evidence of wrongdoing, and nothing in
the application suggests a cause for it.

A persistent "Synthetic demo data" indicator is visible in every view, and every
export carries it too.

### Your own data

Optional CSV import and export for employees, overtime records and comparison
municipalities. Imports are validated in full before anything is replaced, so a
rejected file leaves existing data exactly as it was; problems are reported with
their row and column. Blank templates and a copy of the current data are downloadable,
and an export re-imports cleanly.

Example files, including deliberately invalid ones, are in
[`public/fixtures/`](public/fixtures/).

CSV downloads are UTF-8 with a byte-order mark and CRLF line endings, so Windows Excel
shows characters such as "—" correctly. Exported text that starts with `=`, `+`, `-` or
`@` gets a leading apostrophe so a spreadsheet cannot run it as a formula; numbers are
left alone. The calculation report is for reading, not importing. Only the per-table
"current data" downloads re-import, and protected text comes back with its apostrophe
still on it.

All file handling happens in the page. Nothing is uploaded — there is no server to
upload to. A browser test asserts the application makes no external network requests.

There is **no document reading and no automated extraction** here. Pasting a passage
into the text box is manual entry, and the interface says so.

## Technology

TypeScript, React 19 and Vite 8 as a static single-page application. Money arithmetic
uses `bigint` cents with decimal.js for rates; CSV parsing uses Papa Parse. Tests use
Vitest, fast-check for arithmetic invariants, and Playwright with axe-core for the
browser journey and accessibility.

No backend, no database, no accounts, no payroll connection, and no AI service at run
time. Kiro was the development tool; the shipped application does not call a language
model.

Dependency licenses are recorded in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## Accessibility

Keyboard operable throughout, with a real tab list using arrow-key navigation, labels
associated with every control, validation messages tied to their inputs and announced,
visible focus, text labels on every status so nothing depends on colour, and a layout
that holds together at 380px. axe-core reports no WCAG 2.0/2.1 A or AA violations on
any of the three views, the printable summary, or the import-error state.

That is the machine-detectable subset. Full WCAG conformance also requires manual
testing with assistive technologies and expert accessibility review, which has not
been done.

## Roadmap — Not implemented

None of the following exists, is partially built, or is currently compatible. There
are no connection controls for any of it.

- Authorized Munis exports or APIs for payroll and budget data.
- Broader budgeting beyond a single department's workforce costs.
- Document extraction from fiscal notes and agreements.
- Multiple departments, multiple raise events per offer, and step/grade progression.
- Employer tax, pension and benefit modeling.

## Development

Kiro specifications, steering and hooks are tracked in Git under
[`.kiro/`](.kiro/). The specification is at
[`.kiro/specs/workforce-budget-impact/`](.kiro/specs/workforce-budget-impact/), and
development decisions, verified results and open issues are recorded in
[`docs/kiro-usage.md`](docs/kiro-usage.md).

## Event

- **Event:** Hackachusetts 2026, hosted at Sundai
- **Track:** Civic Action
- **Participant:** Heet Shah (solo)

## License

MIT — see [LICENSE](LICENSE). Copyright 2026 Heet Shah. The license covers the
original code in this repository.
