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

## Current status

Implementation has not started. The repository contains setup files only. Any claim
that a feature, calculation, or test exists must be verified against the repository
before it is stated.
