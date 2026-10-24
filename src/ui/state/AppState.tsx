/**
 * Application state: one dataset, one set of thresholds, one engine view.
 *
 * The engine view is recomputed from the dataset on every change, so the three
 * views are always looking at the same numbers. `epoch` increments when the
 * dataset is replaced wholesale (demo reset, successful import) and is used to
 * remount the forms. Ordinary edits leave it alone, which is what keeps a
 * half-typed value in one field from being wiped when another field changes.
 *
 * The stated-cost check lives here too, not inside its own view. The screen, the
 * CSV report and the printable summary all read the same inputs and the same
 * outcome, so they cannot describe different claims or different offers.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Dataset, Offer, OfferId } from '../../domain/dataset';
import { buildDemoDataset } from '../../data/generate/demoDataset';
import {
  DEFAULT_REVIEW_THRESHOLDS,
  blankDraft,
  computeEngineView,
  draftFromClaim,
  initialStatedInputs,
  resolveStatedCheck,
  type EngineView,
  type ReviewThresholds,
  type StatedCheckInputs,
  type StatedCheckOutcome,
  type StatedClaimDraft,
} from '../../engine';

type AppStateValue = {
  readonly dataset: Dataset;
  readonly engine: EngineView;
  readonly thresholds: ReviewThresholds;
  readonly epoch: number;
  readonly updateOffer: (id: OfferId, patch: Partial<Offer>) => void;
  readonly updateDataset: (patch: Partial<Dataset>) => void;
  readonly replaceDataset: (next: Dataset) => void;
  readonly resetDemo: () => void;
  readonly setThresholds: (next: ReviewThresholds) => void;
  /** The stated-cost check exactly as currently set up. */
  readonly statedInputs: StatedCheckInputs;
  /** Its result, or what needs correcting before it can be computed. */
  readonly statedOutcome: StatedCheckOutcome;
  readonly updateStatedClaim: (change: (claim: StatedClaimDraft) => Partial<StatedClaimDraft>) => void;
  readonly setStatedOffer: (id: OfferId) => void;
  readonly loadStatedClaim: (claimId: string) => void;
};

const AppStateContext = createContext<AppStateValue | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [dataset, setDataset] = useState<Dataset>(() => buildDemoDataset());
  const [thresholds, setThresholds] = useState<ReviewThresholds>(DEFAULT_REVIEW_THRESHOLDS);
  const [epoch, setEpoch] = useState(0);
  const [statedInputs, setStatedInputs] = useState<StatedCheckInputs>(() =>
    initialStatedInputs(buildDemoDataset()),
  );

  const updateOffer = useCallback((id: OfferId, patch: Partial<Offer>) => {
    setDataset((current) => ({
      ...current,
      offers: { ...current.offers, [id]: { ...current.offers[id], ...patch } },
    }));
  }, []);

  const updateDataset = useCallback((patch: Partial<Dataset>) => {
    setDataset((current) => ({ ...current, ...patch }));
  }, []);

  const replaceDataset = useCallback((next: Dataset) => {
    setDataset(next);
    setEpoch((n) => n + 1);
  }, []);

  const resetDemo = useCallback(() => {
    const demo = buildDemoDataset();
    setDataset(demo);
    setThresholds(DEFAULT_REVIEW_THRESHOLDS);
    setStatedInputs(initialStatedInputs(demo));
    setEpoch((n) => n + 1);
  }, []);

  const updateStatedClaim = useCallback(
    (change: (claim: StatedClaimDraft) => Partial<StatedClaimDraft>) => {
      setStatedInputs((current) => ({ ...current, claim: { ...current.claim, ...change(current.claim) } }));
    },
    [],
  );

  const setStatedOffer = useCallback((offerId: OfferId) => {
    setStatedInputs((current) => ({ ...current, offerId }));
  }, []);

  const loadStatedClaim = useCallback(
    (claimId: string) => {
      const found = dataset.statedCosts.find((c) => c.id === claimId);
      setStatedInputs((current) => ({
        ...current,
        claim: found ? draftFromClaim(found) : blankDraft(dataset.fiscalYear),
      }));
    },
    [dataset],
  );

  const engine = useMemo(() => computeEngineView(dataset, thresholds), [dataset, thresholds]);
  const statedOutcome = useMemo(
    () => resolveStatedCheck(dataset, statedInputs),
    [dataset, statedInputs],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      dataset,
      engine,
      thresholds,
      epoch,
      updateOffer,
      updateDataset,
      replaceDataset,
      resetDemo,
      setThresholds,
      statedInputs,
      statedOutcome,
      updateStatedClaim,
      setStatedOffer,
      loadStatedClaim,
    }),
    [
      dataset,
      engine,
      thresholds,
      epoch,
      updateOffer,
      updateDataset,
      replaceDataset,
      resetDemo,
      statedInputs,
      statedOutcome,
      updateStatedClaim,
      setStatedOffer,
      loadStatedClaim,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside AppStateProvider');
  return value;
}
