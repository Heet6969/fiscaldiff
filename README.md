# FiscalDiff

A workforce budget-impact application for municipal finance staff.

Built at Sundai — Hackachusetts 2026.

## Status

**Specifications only. Implementation has not started.**

This repository currently contains setup files, a steering document, and a complete
specification. There is no application code, no test suite, no build, and no Kiro
hook yet. No test results, coverage figures, or working features exist to report.

The specification is at
[`.kiro/specs/workforce-budget-impact/`](.kiro/specs/workforce-budget-impact/):

| Document | Contents |
|---|---|
| [`requirements.md`](.kiro/specs/workforce-budget-impact/requirements.md) | 12 requirements with acceptance criteria, glossary, prohibited language |
| [`design.md`](.kiro/specs/workforce-budget-impact/design.md) | Architecture, money representation, data model, calculation rules, CSV schema, interface, open issues |
| [`tasks.md`](.kiro/specs/workforce-budget-impact/tasks.md) | Ordered implementation milestones |

## What it does

FiscalDiff answers three connected questions about a union request, from one shared
data model and one shared calculation engine, so the three answers cannot disagree.

**1. Compare proposals.** Enter a baseline and two offers — a percentage base-pay
raise, its effective date, a one-time bonus per eligible employee, and explicit
overtime assumptions. See the current fiscal-year incremental cost, the annualized
recurring increase, one-time cost separately, the base-pay and overtime components,
an A/B comparison, and remaining workforce budget or shortfall when a budget is
given.

**2. Review overtime.** Twenty-four complete months of overtime hours and spending,
one trend chart with a metric selector, effective overtime hourly cost, budget
variance, and a short list of explainable "Needs review" flags. Every flag names the
records, the comparison, and the threshold it used. The tool does not infer why a
number moved.

**3. Check a stated cost.** The original FiscalDiff function. Enter a stated
incremental cost, the period it covers, and the components it claims to include. The
result is one of three verdicts — matches within tolerance, difference requiring
review, or cannot verify — with an expandable reconciliation showing the stated
amount, the calculated amount, the difference, the components, and the inputs,
formulas, assumptions, and sources behind it.

## Principles

- Totals are derived from records. No finding is hardcoded.
- Money is exact. Integer cents and decimal arithmetic, never binary floating point.
- Missing, unknown, excluded, and zero are four different things, never flattened.
- Incomplete inputs produce a labeled partial estimate or no figure at all, never a
  confident total built on gaps.
- Costs that are not calculated — employer taxes, pension, benefits — are disclosed
  as excluded rather than guessed.
- Neutral language. "Needs review", not fraud. "Workforce budget shortfall", not city
  fiscal deficit.

## Data

All data is fictional. The application ships with a reproducible synthetic example —
one fictional department, an employee cohort, several fictional comparison
municipalities, and 24 months of overtime records — and shows a persistent "Synthetic
demo data" indicator.

No real municipal records are used. Nothing from any prior project or spreadsheet is
reused.

## Planned stack

TypeScript, React, and Vite as a static browser-only application, with integer-cent
money arithmetic and decimal.js for rates. No backend, no database, no account, no
payroll connection, and no runtime AI service. Uploaded data is processed in the
browser and is not transmitted anywhere.

Kiro is the development tool. The shipped application does not call a language model.

Node.js is not yet installed on the development machine; see
[design §1 and §16](.kiro/specs/workforce-budget-impact/design.md) for the
installed-tool findings and the resulting prerequisite.

## Roadmap — Not implemented

None of the following exists, is partially built, or is currently compatible. There
are no connection controls for any of it.

- Authorized Munis exports or APIs for payroll and budget data.
- Broader budgeting beyond a single department's workforce costs.
- Document extraction from fiscal notes and agreements.
- Multiple departments, multiple raise events per offer, and step/grade progression.
- Employer tax, pension, and benefit modeling.

## Development

Kiro specifications, steering, and hooks are tracked in Git under `.kiro/`.
Development decisions are recorded in [`docs/kiro-usage.md`](docs/kiro-usage.md).

## Event

- **Event:** Hackachusetts 2026, hosted at Sundai
- **Track:** Civic Action
- **Participant:** Heet Shah (solo)

## License

MIT — see [LICENSE](LICENSE). Copyright 2026 Heet Shah. The license covers the
original code in this repository. Third-party dependency licenses will be recorded in
`THIRD-PARTY-NOTICES.md` once dependencies are added.
