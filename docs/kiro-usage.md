# Kiro usage and development decisions

A factual record of how this project was built. Entries are added only after the
work actually happens. No test result or hook execution is recorded here unless it
was observed in a real run.

## Kiro features used

| Feature | Status |
|---|---|
| Steering (`.kiro/steering/project.md`) | In use |
| Specs (`.kiro/specs/workforce-budget-impact/`) | In use — requirements, design, tasks |
| Hooks (`.kiro/hooks/financial-tests-on-engine-change.json`) | Created; see the caveat under "Hook" below |

`.kiro/` and its subdirectories are tracked in Git, not ignored.

## Log

### 2026-10-24 — Repository setup

Initialized the repository on `main`, connected it to
`https://github.com/Heet6969/fiscaldiff.git`, and committed `README.md`, `LICENSE`
(MIT, 2026 Heet Shah), `.gitignore`, and `.kiro/steering/project.md`.

The remote existed and was reachable but had zero refs, so there was no history to
reconcile and the first push was a plain fast-forward of a new branch. No force-push.

`.gitignore` excludes `.env` files, credentials, `node_modules`, build output, and
temporary files, allows `.env.example`, and deliberately does not ignore `.kiro`.
Verified with `git check-ignore` rather than by inspection.

### 2026-10-24 — Specification milestone

Wrote the specification for the three connected functions as a single spec, not
three. The deciding factor was the requirement that all three views share one data
model and one calculation engine: separate specs would have invited three drifting
copies of the cost formula.

Node.js was absent at that point. It was recorded as task 0.1 rather than installed,
because the deliverable was specifications and Node is a system-level install.

### 2026-10-24 — Implementation

**Toolchain.** Installed Node.js with
`winget install --id OpenJS.NodeJS.LTS --exact --source winget`, which fetched the
official OpenJS MSI and verified its hash. Observed afterwards:

```
node --version   v24.22.1
npm  --version   11.19.1
```

The install did not refresh `PATH` in the already-running shell, so every command in
this session was run with `C:\Program Files\nodejs` prepended to `PATH`. A new
terminal picks Node up normally.

**Dependency compatibility, checked before installing.** Node 24.22.1 satisfies both
of the constraining packages:

| Package | Declared `engines.node` |
|---|---|
| vite 8.3.5 | `^20.19.0 \|\| >=22.12.0` |
| vitest 5.0.5 | `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` |

Two corrections came out of that check. `vite-node@5.0.5` does not exist, so the
fixture-regeneration script that depended on it was dropped and the generator became
a plain module covered by a determinism test instead. And TypeScript's current
release is 7.0.2, but 5.9.3 was pinned instead: TypeScript 7 is the new native port
and the surrounding tooling has not settled on it, which is not a risk worth taking
for a prototype whose value is correctness.

**Decisions.**

- Money is `bigint` minor units, with decimal.js only for rates and multipliers.
  Rounding happens at exactly one place, `multiplyByRate`, used at the per-employee
  per-component leaf. Everything above that is exact integer summation, which is why
  the displayed parts always add up to the displayed total rather than nearly.
- `ValueState` is a four-case discriminated union (`known`, `missing`, `unknown`,
  `excluded`). Making it a type rather than a convention means the compiler refuses
  to let a missing value be read as a number. `{ kind: 'known', value: 0 }` is a
  distinct, representable thing.
- Dates are plain `{y, m, d}` triples with explicit arithmetic. Using the platform
  `Date` would have made results depend on the machine timezone and broken
  determinism.
- `excluded` contributes nothing to a sum, while `missing` and `unknown` block the
  whole sum. The reasoning is in `src/domain/valueState.ts`: an exclusion is a
  deliberate scope decision shown to the user, so treating it as a zero contribution
  is honest; a gap is not.
- The chart is hand-written SVG. A charting library would have added a dependency,
  reduced control over the accessible markup, and made decoration the easy path.
- A `total-payroll` component identifier exists only so a total-payroll claim can be
  recognised and refused rather than silently compared against an incremental figure.
- The overtime increment is computed as a single (cost under offer − cost under
  baseline) subtraction. That is what stops a simultaneous rate change and hours
  change from being counted twice; `tests/unit/offer.test.ts` asserts the result is
  *not* equal to the sum of the two separate increments, which is the mistake the
  structure is there to prevent.

**Prototype choices, recorded explicitly** (all in `src/engine/config.ts`, all
user-editable, all stated on screen):

| Choice | Default | Framing |
|---|---|---|
| Overtime hours flag | 25% increase against the immediately preceding complete month | Demonstration threshold; not an industry standard and not a statistical anomaly detector |
| Effective hourly cost flag | 15% change in either direction | Same framing |
| Budget flag | Any amount above the entered monthly budget | Same framing |
| Fiscal-note tolerance | $1.00 absolute, editable | Prototype reconciliation tolerance, not an audit standard; the signed difference is always shown in full |
| Bonus eligibility | Explicit per-employee flag plus a payment date inside the period | Never inferred from role, grade or anything else |
| Proration | Full applicable month = 1/12; partial month = applicable days ÷ days in month × 1/12, effective date counted as applicable | Disclosed simplifying convention, not a payroll calendar |
| Overtime hours | Entered monthly assumption, department-wide | Not extrapolated from the history; the history is never turned into a forecast |

**Two bugs found by the tests, not by reading the code.**

1. The annualized recurring increase was made to depend on the raise effective date
   whenever the overtime rate was derived. When the date was absent, the engine
   withheld both the current-year *and* the annualized overtime figure. The
   annualized figure is a full year at the post-raise rate and does not need the
   date. Fixed in `src/engine/offer.ts`; the property test that should have caught it
   only exercised excluded overtime, so it now runs with overtime modeled as well.
2. The exclusions line claimed overtime was "not included in any figure above" while
   baseline overtime was in fact part of the baseline and total rows. The exclusion
   is now specifically the overtime *increase*, and the wording changed to "Not
   calculated, and so not part of any increase above".

**One problem found by looking at the rendered page.** The demonstration's monthly
overtime budget was set below typical monthly spend, so 13 of the 15 review flags
were budget overages and the two genuinely interesting patterns were buried. The
fictional budget was raised to $22,000, which leaves five flags clustered on the
February–April 2026 spike. The requirement asks for a short list of explainable
flags, and fifteen is not a short list.

**Observed verification results.**

```
npx tsc -b --force          exit 0, no diagnostics
npx vitest run              9 files, 137 tests passed
npm run test:financial      8 files, 120 tests passed
npx playwright test         51 tests passed (desktop and 380px narrow projects)
npx vite build              built; 377.17 kB JS (116.05 kB gzip), 9.92 kB CSS
```

The Playwright run includes axe-core scans of all three views, the printable
summary, and the import-error state, with zero WCAG 2.0/2.1 A and AA violations
detected. That is the machine-detectable subset only; it is not a claim of full WCAG
conformance, which also needs assistive-technology testing and expert review.

**Hook.** `.kiro/hooks/financial-tests-on-engine-change.json` is a `PostFileSave`
hook matching `src[\\/](engine|money|domain)[\\/].*\.ts$` and running
`npm run test:financial`.

What was verified:

- The matcher was tested against sample paths. It matches `src/engine/offer.ts`,
  `src/money/money.ts`, `src/domain/types.ts` and the backslash form
  `src\engine\flags.ts`; it does not match `src/ui/App.tsx`,
  `src/data/csv/schema.ts`, `tests/unit/offer.test.ts`, `README.md`, or
  `src/engine/dates.tsx`.
- The command it runs was executed directly and exits 0 with 120 tests passing.

What was **not** verified: the hook firing on a save. Kiro reported that the hook
"will be active on the next session start", and editing `src/engine/dates.ts` during
this session produced no hook output. So its execution is unconfirmed and is not
being claimed. To confirm it: start a new Kiro session in this workspace, open any
file under `src/engine/`, `src/money/` or `src/domain/`, save it, and watch for the
financial suite running. The outcome should be recorded here once observed.

## Open issues carried forward

1. Hook execution not yet observed — see above.
2. Scheduled hours (40 per week × 52 weeks) is a declared dataset assumption, not a
   payroll convention. Real use needs the actual figure.
3. The overtime rate for a department-wide hours assumption is derived from the
   *mean* hourly base pay of overtime-eligible staff. That is a stated method shown
   in the calculation steps, not a payroll rule. A per-employee overtime model would
   remove the need for it.
4. Independently confirmed overtime rates are held flat; escalating them needs a
   confirmed contractual rule.
5. Employer taxes, pension and benefits are not modeled at all and are disclosed as
   excluded everywhere.
6. The committed valid import fixture is hand-written rather than emitted by the
   generator, so the "regeneration reproduces fixtures byte for byte" check in the
   spec became a determinism test on the generator plus a CSV export/import
   round-trip test instead.
