/**
 * The shell: three plainly labeled views and a persistent synthetic-data
 * indicator. Tabs are a real tab list with arrow-key navigation.
 */
import { useRef, useState } from 'react';
import { AppStateProvider, useAppState } from './ui/state/AppState';
import { SyntheticBadge } from './ui/components/Common';
import { DataPanel } from './ui/components/DataPanel';
import { CompareProposals } from './ui/views/CompareProposals';
import { ReviewOvertime } from './ui/views/ReviewOvertime';
import { CheckStatedCost } from './ui/views/CheckStatedCost';
import { PrintableReport } from './ui/views/PrintableReport';
import { calculationBreakdownCsv, downloadTextFile } from './export/breakdown';
import { checkStatedCost } from './engine';

type TabId = 'compare' | 'overtime' | 'stated';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'compare', label: 'Compare proposals' },
  { id: 'overtime', label: 'Review overtime' },
  { id: 'stated', label: 'Check a stated cost' },
];

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}

/** Read once per render of the export, never inside the engine. */
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function Shell() {
  const { dataset, engine } = useAppState();
  const [active, setActive] = useState<TabId>('compare');
  const [printing, setPrinting] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (printing) {
    return <PrintableReport generatedOn={todayIso()} onBack={() => setPrinting(false)} />;
  }

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const next = TABS[nextIndex];
    if (!next) return;
    setActive(next.id);
    tabRefs.current[next.id]?.focus();
  }

  function exportBreakdown() {
    const claim = dataset.statedCosts[0];
    downloadTextFile(
      'fiscaldiff-calculation-breakdown.csv',
      calculationBreakdownCsv({
        dataset,
        offerId: 'A',
        offer: engine.offers.A,
        budget: engine.budgets.A,
        overtimeRows: engine.overtimeRows,
        flags: engine.flags.flags,
        reconciliation: claim ? checkStatedCost(dataset, claim, 'A') : undefined,
        generatedOn: todayIso(),
      }),
    );
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="site-header">
        <div className="site-header__inner">
          <div className="site-header__titles">
            <h1>FiscalDiff — workforce budget impact</h1>
            <span className="site-header__context">
              {dataset.department.name} · {dataset.fiscalYear.label}
            </span>
          </div>
          <SyntheticBadge label={dataset.meta.label} />
        </div>
      </header>

      <main className="shell" id="main">
        <div className="tabs" role="tablist" aria-label="Views">
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              className="tab"
              aria-selected={active === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={active === tab.id ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(e) => onTabKeyDown(e, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`panel-${active}`}
          aria-labelledby={`tab-${active}`}
          tabIndex={0}
        >
          {active === 'compare' ? <CompareProposals /> : null}
          {active === 'overtime' ? <ReviewOvertime /> : null}
          {active === 'stated' ? <CheckStatedCost /> : null}
        </div>

        <hr style={{ margin: '2.5rem 0', border: 0, borderTop: '1px solid var(--border)' }} />

        <section className="section" aria-labelledby="export-heading">
          <div className="section__head">
            <h2 id="export-heading">Take it away</h2>
            <p className="section__hint">
              Both outputs carry the synthetic-data label, the fiscal period, the
              assumptions applied, the excluded cost categories and the date.
            </p>
          </div>
          <div className="button-row">
            <button type="button" className="button" onClick={exportBreakdown}>
              Export calculation breakdown (CSV)
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setPrinting(true)}
            >
              Open printable summary
            </button>
          </div>
        </section>

        <DataPanel />

        <footer>
          <p className="state-note">
            FiscalDiff is a prototype built for Hackachusetts 2026. It runs entirely in this
            browser tab: no backend, no database, no payroll connection and no AI service at
            run time. All data shown is fictional. Employer taxes, pension and benefits are
            not calculated.
          </p>
        </footer>
      </main>
    </>
  );
}
