# Kiro usage and development decisions

A factual record of how this project was built. Entries are added only after the work
actually happens. Nothing here is aspirational, and no test result or hook execution
is recorded unless it was observed.

## Kiro features used so far

| Feature | Status |
|---|---|
| Steering (`.kiro/steering/project.md`) | In use |
| Specs (`.kiro/specs/workforce-budget-impact/`) | In use — requirements, design, tasks |
| Hooks (`.kiro/hooks/`) | **Not yet created.** Scheduled for task 3.4 |

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

Wrote the specification for the three connected functions as a single spec, not three.
The deciding factor was the requirement that all three views share one data model and
one calculation engine: splitting them into separate specs would have invited three
drifting copies of the cost formula.

**Installed-tool survey.** Probed before choosing a stack, rather than assuming:

| Tool | Result |
|---|---|
| Git | 2.53.0.windows.2 |
| Python | 3.14.6 |
| winget | present |
| Node.js, npm, npx, pnpm, yarn, bun, deno | not installed |
| nvm, fnm, Volta | not installed |

Common Node install directories were checked individually and are all absent, so this
is a genuine absence rather than a PATH problem. `winget search OpenJS.NodeJS.LTS`
reports 24.22.1 available, matching the Node 24 Active LTS line.

Node.js was **not** installed as part of this milestone. The deliverable was
specifications, Node is a system-level install rather than a workspace dependency, and
installing it changes PATH in a way that needs a new shell. It is recorded as task 0.1
and as the first open issue in the design.

**Decisions recorded.**

- Money is stored as `bigint` minor units with decimal.js for rate arithmetic.
  Rounding happens at exactly one place — the per-employee, per-component leaf — so
  every aggregation above it is exact integer summation and the sum of displayed parts
  always equals the displayed total.
- Value states are a four-case discriminated union (`known`, `missing`, `unknown`,
  `excluded`). Making this a type rather than a convention means the compiler refuses
  to let a missing value be read as a number.
- The chart will be hand-written SVG. A charting library would add a dependency, hand
  back less control over accessibility, and make decorative extras the path of least
  resistance.
- A `total-payroll` component identifier exists purely so that a total-payroll claim
  can be recognized and routed to "Cannot verify" instead of being compared against an
  incremental figure.
- The financial-test hook is scheduled for task 3.4, after the test suite exists.
  Creating it now would produce a hook that can only fail, which would be decorative
  Kiro configuration rather than real.

**Verified arithmetic.** The required acceptance case was worked through in integer
cents while writing the design, and the figures reconcile: baseline $3,000,000;
annualized recurring increase $90,000; six-twelfths proration giving a $45,000
current-year base increment; $25,000 in bonuses; $70,000 total current-year
incremental; and a $45,000 claim covering both raise and bonus differing by $25,000.
This arithmetic has been checked by hand, **not** by executing code — there is no code
yet. The executable assertion is task 3.1.

## Open issues

Carried from design §16:

1. Node.js not installed — blocks implementation.
2. Scheduled hours (40 h/week × 52 weeks) is a declared dataset assumption, not a
   payroll convention.
3. Bonus eligibility is modeled as a flag; the rule setting it is undefined.
4. Independent overtime rates are held flat pending a confirmed escalation rule.
5. Overtime hours assumptions are annual and department-wide for the MVP.
6. Mid-month proration counts the effective day as worked; disclosed as an assumption.
7. "Material change" threshold for effective hourly cost needs a default.
8. Default tolerance for the stated-cost check needs a stated value.
9. The component taxonomy is a fixed enum; anything outside it resolves to
   "Cannot verify".
