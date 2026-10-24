# FiscalDiff

Built at Sundai — Hackachusetts 2026.

## Status

**Implementation has not started.** This repository currently contains project setup
only: a README, a license, a `.gitignore`, and a steering document. There is no
application code, no working calculation engine, no test suite, and no results of
any kind yet.

## Purpose

FiscalDiff is intended to verify municipal contract cost calculations against a
stated fiscal impact, with traceable sources and explicit assumptions.

The problem it targets: when a municipality publishes a contract alongside a claimed
budget impact, the arithmetic connecting the two is often spread across PDFs, meeting
minutes, and spreadsheets. Reconciling the stated figure with the underlying contract
terms is manual, slow, and hard to audit.

The intended approach:

- Recompute contract costs from stated terms using deterministic, tested code.
- Compare the recomputed total against the publicly stated fiscal impact.
- Attach a traceable source reference to every input figure.
- Record every assumption explicitly, and leave missing or ambiguous inputs marked
  as unresolved rather than filling them in with guesses.

Scope, data sources, and methodology are not finalized.

## Event

- **Event:** Hackachusetts 2026, hosted at Sundai
- **Track:** Civic Action
- **Participant:** Heet Shah (solo)

## License

MIT — see [LICENSE](LICENSE). Copyright 2026 Heet Shah. The license covers the
original code in this repository.
