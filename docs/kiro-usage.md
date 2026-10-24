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

### 2026-10-24 — Display rename to CivicVariance

Changed the display name from FiscalDiff to **CivicVariance**, with the tagline
"Understand workforce costs. Explain every difference."

Changed: the app header, the browser title and meta description, the printable
report heading and "Prepared with" line, the CSV export title row and download file
name (`civicvariance-calculation-breakdown.csv`), the in-app footer, `README.md`, and
`THIRD-PARTY-NOTICES.md`. The footer and README keep "Built at Sundai — Hackachusetts
2026.", Heet Shah, the Civic Action track, and the synthetic-data labels.

Deliberately unchanged: the folder `F:\fiscaldiff`, the repository
`https://github.com/Heet6969/fiscaldiff.git`, the npm package name `fiscaldiff`,
internal identifiers and CSV schemas, the three view labels, Git history, and the
earlier entries in this log, which describe the work under its original name. The
steering document and the spec under `.kiro/specs/workforce-budget-impact/` also still
say FiscalDiff; they are development records, not user-facing text.

No engine, money, or domain code was changed by the rename.

### 2026-10-24 — Hook execution check (second attempt)

Made a comment-only edit to `src/engine/dates.ts` (no behavior change) to trigger the
`PostFileSave` hook, then looked for any sign it ran: hook output returned with the
edit, new `node`/`vitest` processes, and recently written files under `.kiro` and the
Vite and Vitest caches. There was none. **The hook's automatic execution is still
unverified.**

No configuration change was made. The hook file is in the format Kiro's own hook
tool wrote, its matcher and command were verified earlier, and nothing observed points
to a specific misconfiguration. Kiro's description of `PostFileSave` is that it fires
when a user saves a file, so a likely explanation is that a file edited by the agent
does not count as a user save. That is an inference, not something observed. To close
this out, save any file under `src/engine/`, `src/money/` or `src/domain/` by hand in
the editor and note whether the financial suite runs.

### 2026-10-24 — Presentation pass

A focused UI improvement. No engine, money, domain or data code changed
(`git diff --stat` over `src/engine`, `src/money`, `src/domain` and `src/data` was
empty), so the financial suite was not re-run.

**Look.** Navy header and headings, warm-white page, white content surfaces, teal for
primary actions and for the one comparison series in charts, amber reserved for
"Needs review", red only for shortfalls and invalid inputs. The synthetic-data badge
was amber and is now a neutral chip, so amber keeps one meaning. Incomplete-result
warnings are slate rather than amber or red for the same reason.

**Structure.** Each view opens with one plain-English question and the key result:
what each offer costs, which months deserve a second look, whether the stated figure
matches. On wide screens inputs sit beside results; on narrow screens they stack, with
the key result still first. Overtime assumptions, review thresholds and the monthly
table are collapsed, with the current overtime setting and thresholds stated in the
summary line. Exclusions, invalid-input errors and incomplete-result notices stay
visible.

**Charts, all reading existing engine output.** A stacked A/B bar for current-year
cost by component (zero and negative components are drawn accurately, an excluded
component is named rather than drawn as zero, an unavailable total says so, and
annualized impact is labeled separately); the overtime trend with a budget line on the
dollars view only, flagged months marked with a diamond, and units that follow the
selected measure; and a stated-versus-calculated bar that is drawn only when a
comparison was actually made.

**One behavioral change worth knowing.** All three views now stay mounted and the
inactive ones are hidden, rather than being unmounted on tab switch. That is what lets
every entry, including a half-typed invalid one, survive switching views. The stated-cost
view previously lost its entries on a tab switch; it now keeps them and still resets
with the demonstration data.

**Tests.** Existing assertions were kept and changed only where the UI intentionally
changed: opening a collapsed section before using it, and scoping one query to its own
panel. Because every view is now in the DOM, an unscoped text query can find another
view's collapsed copy; new tests scope queries to the panel they mean. Added
`tests/e2e/presentation.spec.ts`: chart contents and units, budget line only on
dollars, gap handling, stated-cost chart absent for "Cannot verify", view-switching
preservation, layout at both widths, axe with every section expanded, colour roles,
keyboard focus and print layout.

### 2026-10-24 — CSV readability fix

**Diagnosis.** The calculation report was written as UTF-8 with no byte-order mark,
typed `text/csv;charset=utf-8;`, with bare LF row endings and three separate CSV
writers. It contains real non-ASCII characters (— – ÷ × −). Without a BOM, Windows Excel
assumes the Windows-1252 code page, so "—" appeared as "â€”". That was the cause of the
unreadable text. Checked and found fine: quoting (a strict comma parse gave no errors and
embedded quotes were doubled), the text itself (clean UTF-8, no U+FFFD, no `undefined`,
`NaN` or serialised values), and money (plain decimals).

**Change.** One shared writer, `src/data/csv/format.ts`, now produces the report, the
blank templates and the current-data downloads: UTF-8 with a BOM, CRLF row endings
(a line break inside a quoted cell stays a single LF, as Excel stores it), correct
quoting, and every row padded to the same width. The report no longer shows "A — Offer
A — …" and states that it is a report, not an import file. The importer strips a BOM if
present; it changes nothing else about the text it reads.

**Formula protection.** Exported text beginning with `=`, `+`, `-`, `@`, tab or carriage
return gets a leading apostrophe. Numbers, including negatives such as `-25000.00`, and
formatted amounts such as `-$25,000.00`, are left exactly as they are.

**Known limitation.** The protection is one-way. The importer deliberately does not strip
a leading apostrophe, because from the file alone it cannot tell protection from the
user's own text, and guessing wrong would silently alter data. Text that began with
`=`, `+`, `-` or `@` therefore returns from an export-then-import with the apostrophe
visible. Only the per-table "current data" downloads promise round-trip import; the
calculation report does not and the importer refuses it.

**Verified.** A real download through the export button: first bytes `ef bb bf`, 88
CRLF row endings, no bare LF or CR outside quoted cells, no parse errors, a regular
6-field grid, "—" kept as a real character, difference written as `-25000.00`. The same
file was opened in Microsoft Excel 16.0 through its automation interface: the title and
"Offer A — union request" displayed correctly, 0 of 528 cells showed mojibake, and the
difference cell was a number (`-25000`), not text. That was an automated read of cell
values, not a visual inspection of the window.

### 2026-10-24 — Chart interactions

Added hover, keyboard and touch interaction to the three existing charts, with no new
dependency and no change to any calculation (`git diff` over `src/engine`, `src/money`,
`src/domain` and `src/data` is empty, so the unit and financial suites were not re-run).

**How it works.** The SVGs are unchanged and keep their `role="img"` labels and text
equivalents. A shared layer, `src/ui/components/charts/ChartStage.tsx`, puts a transparent
`<button>` over each data point. Buttons rather than focusable SVG children, because an
SVG with `role="img"` treats its children as presentational and would hide them. Each
button's accessible name carries the tooltip text, so the visual tooltip is
`aria-hidden`. The layer is one tab stop; arrow keys, Home and End move between points,
Escape dismisses. Mouse hover is handled for mouse pointers only; touch and pen taps pin
the tooltip, and tapping again or elsewhere dismisses it.

**Tooltips.** Segment and bar tooltips show the exact formatted value. A percentage is
shown only when its denominator is clear: a segment's share of its offer's current-year
total (known, positive, no negative component), and the stated amount as a share of the
calculated amount (positive). Each says what it is a percentage of. Overtime tooltips show
the month, the selected measure with its unit, the budget only on the dollars view, and
"Needs review" when flagged. Excluded, missing and unknown values are named in words and
are never shown as zero; a known zero is still $0.00.

**A bug the tests found.** At phone width the 24 months are about 10px apart and the
26px targets overlapped, so a later month covered an earlier one and could not be
hovered. Targets are now full-height strips exactly one slot wide whenever spacing is
under 26px.

**Tests.** `tests/e2e/chartInteraction.spec.ts`: 28 tests covering hover, the 120–180ms
transition, keyboard, touch, tooltip placement inside desktop and phone-width viewports,
pointer-events on the tooltip, missing and excluded data, reduced motion, print, and axe
with a tooltip open on each chart.

**Limitations.** Touch was tested with Playwright's touch emulation, not on a physical
device. The reduced-motion and print behaviour were checked from computed styles, not by
printing. Tooltip text is spoken through the button labels rather than as a tooltip.

### 2026-10-24 — Fixes from an independent review

Eight reproducible findings, fixed without changing the design or feature scope.

1. **One stated-cost check.** The check lived inside its own view while the CSV and the
   printable summary used `statedCosts[0]` and Offer A, so all three could describe
   different claims. The inputs now live in the shared app state and one function,
   `resolveStatedCheck` (`src/engine/statedCheck.ts`), turns them into the outcome that the
   screen, the CSV and the summary all read. Each names the offer compared against. The CSV
   keeps its calculation breakdown for Offer A, labelled "Offer (calculation breakdown)", and
   labels the stated-cost section's offer separately. The summary used to replace the
   whole app; it is now an overlay beside it, with the app hidden but mounted, so entries
   (including half-typed invalid ones) survive opening print preview and returning.
2. **No verdict from a stale entry.** Clearing either period date, or entering an empty or
   invalid tolerance, used to be ignored and the old value kept producing a verdict. Those
   fields now hold "not valid" as an explicit state, no comparison is made, and the screen,
   CSV and summary all say "Cannot compare yet" and list what to correct. Overtime thresholds
   keep the last valid value (flags depend on it) but now say so, visibly, when an entry is
   not applied.
3. **Excluded is not zero in the scope gate.** A claimed component whose amount is
   excluded now returns Cannot verify. Reproduction: overtime excluded, overtime-only claim
   of $0 used to return Matches.
4. **Missing raise blocks a derived overtime rate.** It previously assumed the rate was
   unchanged. Dependent outputs are now blocked and the missing input is named. An
   independently confirmed rate is unaffected.
5. **Provenance after an edit.** An edited proposal value, or edited stated amount, becomes a
   user assumption. The old source label and agreement passage move to a separate
   `originalSource`, shown as "Replaced original — not support for this value" on screen and
   in its own CSV column, so the passage no longer reads as support for the new number.
6. **Money grouping.** `fromDecimalString` stripped every comma before validating, so "1,2,3"
   became 123. Grouping is now checked first: groups of exactly three digits, no leading
   zero group.
7. **Comparator pay basis.** Rows are now comparable only if role, grade/step and pay basis
   all match the subject; an hourly row against the annual-salary cohort is marked, with the
   reason. The demonstration's hourly row (Carrow) is now correctly marked too.
8. **Scrollable regions.** Every table wrapper is now a focusable, named region, which
   resolves the `scrollable-region-focusable` failure. They are always focusable rather than
   only when they overflow, because overflow is only known after layout and an accessibility
   check can run before that; the cost is a few extra tab stops.

**Tests found two problems in my own work.** The CSV assertions initially substring-matched a
padded, quoted file and so failed on correct output; they now parse it. And a scripted edit to
an existing test did not apply, which left an unscoped query that matched the hidden app, and
the full run caught it.

**Existing tests changed, and why.** Because the app now stays mounted behind the print
summary, the text queries in the two print-preview tests (journey and branding) are scoped
to `#print-report`. One assertion
about the CSV's "Offer" row was updated for the renamed row. No assertion was weakened and no
financial figure changed.

**Observed results after the last change.** Type check clean. Unit suite: 11 files, 215
tests passed. Production build: succeeded. Browser suite: 132 passed.

**Not changed.** The Kiro hook's execution on save remains unobserved.

### 2026-10-24 — Offer B increase/decrease rows

Offer B's single percentage is now repeatable rows (direction, nonnegative percentage, remove,
and "Add another increase/decrease"), initialised as one Increase row holding the existing
2.5%. Offer A is unchanged. Spec: requirement 13, design section 17, tasks milestone 11.

**Basis.** Signed percentages are summed first, then applied once to each employee's original
salary with the existing single rounding point; they are not compounded, so +3% and −1% is
exactly +2%. All rows share Offer B's one effective date and proration. No rows is an explicit
0%. `netBasePayChange` (`src/engine/adjustments.ts`) is the one place the net is computed;
`computeOffer` reads it once and passes the downstream functions an offer carrying it, so base
pay, a derived overtime rate and the audit trail cannot use different numbers. Percentages are
added as exact decimals.

**Blocking.** An unfinished or invalid row blocks everything that depends on it and is named;
it is never skipped, which would have quietly produced a different pay change. A combined net
below −100% is refused with the reason. This is judged on the net, so a −110% pair offset by a
+30% row is accepted. A newly added row starts empty and therefore blocks until it is filled in
or removed, which is deliberate. A derived overtime rate follows a decrease from the effective
date; an independently confirmed rate stays independent, so it survives an unfinished row.

**Signed values.** The integer-cent arithmetic already handled negatives, so the engine change
was small. What changed was wording: a negative amount is a decrease from baseline (a saving),
said in plain words beside the results table, the chart and the printable summary, in the CSV
basis column, and in the key result ("decrease (saving)"). A percentage share is not shown for a
non-positive total, so no share of a saving is ever drawn. A stated incremental cost may be
negative; salaries, bonuses and budgets remain nonnegative. The CSV and the summary state Offer
B's rows, net and date.

**Verified, after the final change.** Type check clean. Unit: 12 files, 249 tests passed.
Production build: succeeded. Browser: 156 passed. New coverage: `adjustments.test.ts` (34) and
`offerBAdjustments.spec.ts` (24), covering unchanged totals, sum-not-compound, net decreases for
base pay, derived overtime and budget, blocking and the −100% limit, row add/remove, state
through print preview, Offer A unchanged, and signed values agreeing across screen, stated-cost
check, CSV and print.

**One existing assertion changed:** the check that Offer B was untouched by an Offer A edit now
reads the value of Offer B's first row (still 2.5) instead of a single field that no longer exists.

**Mistakes while building this.** A scripted multi-pair edit aborted part-way and left a
duplicate import and a duplicate helper; the type checker caught both and they were removed.

**Limits.** One shared effective date for all rows; percentages only; no compounding option. At
most 100% per row (the existing cap), with the −100% net rule as the real guard. The CSV
breakdown is still for Offer A; Offer B's rows appear as a line and in the stated-cost section.
