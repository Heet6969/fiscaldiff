# FiscalDiff — Project Steering

FiscalDiff verifies municipal contract cost calculations against a stated fiscal
impact, with traceable sources and explicit assumptions. It is public-interest
tooling: a wrong number presented confidently is worse than no number at all. The
rules below are binding for all work in this repository.

## 1. Never invent content

Do not fabricate any of the following, under any circumstances:

- Source passages, quotes, or document excerpts.
- Dates, fiscal years, contract terms, or effective periods.
- Financial inputs: rates, quantities, escalators, totals, or stated impacts.
- Test results, benchmark numbers, or coverage figures.
- Completed features, implementation status, or deliverables.

If a value is not present in a real, cited source, it does not get written down as
a value. Say that it is unknown. Never produce a plausible-looking placeholder that
could be mistaken for real data, and never describe work as done when it is not.

## 2. Financial calculations must be deterministic and tested

- Every cost calculation lives in plain, reviewable code — not in model output, not
  in prose, not inferred at runtime by a language model.
- Same inputs must always produce the same outputs. No randomness, no reliance on
  ambient state, no implicit locale or timezone dependence.
- Use exact decimal arithmetic for money. Do not use binary floating point for
  currency amounts. Make rounding rules explicit and apply them at defined points.
- Every calculation path requires unit tests, including boundary cases and known
  worked examples. A calculation without a test is not finished.

## 3. Missing and ambiguous inputs stay explicit

- Represent unknown inputs as unknown. Do not substitute zero, a default, or an
  average to make a computation complete.
- When a source is ambiguous, record the ambiguity and the candidate readings rather
  than silently picking one.
- Outputs must surface which inputs were missing or ambiguous and how that limits
  the conclusion. A comparison built on incomplete inputs must be labeled as such,
  never presented as a clean verification.

## 4. Demo data is labeled synthetic

- Any example, fixture, or demo dataset that is not a real cited municipal document
  must be clearly labeled synthetic wherever it appears: in the file name, in the
  data itself, and in any interface that displays it.
- Synthetic figures must never be presented as findings about a real municipality,
  contract, or official.

## 5. Preserve sources and license notices

- Every input figure keeps its provenance: document identity, location within the
  document, and retrieval date. Do not drop or summarize away a source reference.
- Quote source material only as far as is necessary and attribute it.
- Retain dependency licenses and attribution notices. Record third-party licenses,
  and do not remove copyright headers from vendored or borrowed code.

## 6. Accessible interfaces

- Everything operable must be reachable and usable by keyboard, with a visible focus
  indicator and a sensible tab order.
- Use real semantic elements and real labels. Every input has an associated label;
  controls have accessible names; errors are announced, not conveyed by color alone.
- Do not encode meaning in color or position only. Numbers, differences, and
  statuses carry text labels.

## 7. Kiro configuration is tracked in Git

- `.kiro/` and its subdirectories are committed, not ignored.
- Specifications, steering documents, and hooks in the repository must be the actual
  ones in use. Do not write aspirational or decorative Kiro files that do not reflect
  how the project is really built.

## 8. Scope of the application

FiscalDiff answers three connected questions from one shared data model and one
shared calculation engine:

1. **Compare proposals** — the budget impact of what a union requests.
2. **Review overtime** — unusual overtime patterns flagged for human review.
3. **Check a stated cost** — whether a stated financial impact matches the agreement
   terms and verified inputs. This is the original FiscalDiff function and is
   mandatory, not optional.

No view may hold its own copy of a cost formula. Any figure appearing in more than one
view must come from the same engine call on the same records, so the three views
cannot contradict each other.

The MVP is a browser-only static application: no backend, no database, no account, no
payroll connection, and no runtime AI service. Kiro is the development tool; the
shipped application does not call a language model. Uploaded data stays in the
browser.

## 9. Terminology discipline

The intended reader is a nontechnical municipal finance employee. Wording carries
legal and reputational weight, so these substitutions are binding:

| Never write | Write |
|---|---|
| City fiscal deficit | Workforce budget shortfall |
| Fraud, misconduct, abuse | Needs review |
| Incorrect pay, overpayment | Needs review |
| Proven error, wrong figure | Difference requiring review |
| AI-extracted, intelligently parsed | Manually entered / fixed-format import |
| Fair pay, justified market rate | Comparison context |

Additional rules:

- Keep **total proposed expenditure**, **increase over baseline**, and **budget
  remaining or shortfall** as three separately labeled figures. Never let one stand in
  for another.
- Never infer the cause of an overtime fluctuation.
- Never call a difference an error until assumptions and scope have been confirmed.
- Never compare total payroll against an incremental-cost claim.
- Never state that a comparator table establishes fair pay.

## 10. Design restraint

The interface is for someone competent with money and unfamiliar with software. It
should read like a well-made form.

- Three plainly labeled views, nothing more.
- A persistent, unobtrusive "Synthetic demo data" indicator in every view.
- Clear language, restrained styling, generous spacing, readable numbers, few controls.
- No animations, decorative charts, endless cards, or configuration panels.
- Detailed assumptions and calculation steps go behind clearly labeled expandable
  sections, collapsed by default.
- Incomplete-input warnings stay visible and are never collapsed.
- No dead buttons, fake integrations, or placeholder success messages.

## 11. Honest capability claims

- Manual entry and fixed-format CSV parsing are never described as AI extraction or
  general document understanding.
- Future possibilities — authorized Munis exports or APIs, broader budgeting, document
  extraction — appear only in a README roadmap labeled "Not implemented". Never imply
  current compatibility and never display a connection control that does nothing.
- Monthly proration is disclosed as a simplifying assumption, never presented as a
  reproduction of an actual payroll calendar.
- Incomplete applicable inputs must prevent an unsupported complete-cost result. A
  clearly labeled partial estimate is allowed; a confident total built on gaps is not.

## Current status

Working prototype. The three views, the shared engine, the synthetic dataset, CSV
import/export and both exports are implemented and tested. Node.js 24.22.1 is
installed.

As of the last verified run: type check clean, 215 unit tests passing, 132 browser
tests passing, production build succeeding. The display name is now CivicVariance;
FiscalDiff was the working name and remains the repository and package name. The
financial-test hook exists at
`.kiro/hooks/financial-tests-on-engine-change.json`, but **its execution on save has
not yet been observed** — see `docs/kiro-usage.md`.

Any claim that a feature, calculation, test result, or hook execution exists must be
verified against the repository before it is stated. Record observed command output,
not expected output.
