/**
 * Application state: one dataset, one set of thresholds, one engine view.
 *
 * The engine view is recomputed from the dataset on every change, so the three
 * views are always looking at the same numbers. `epoch` increments when the
 * dataset is replaced wholesale (demo reset, successful import) and is used to
 * remount the forms. Ordinary edits leave it alone, which is what keeps a
 * half-typed value in one field from being wiped when another field changes.
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
  computeEngineView,
  type EngineView,
  type ReviewThresholds,
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
};

const AppStateContext = createContext<AppStateValue | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [dataset, setDataset] = useState<Dataset>(() => buildDemoDataset());
  const [thresholds, setThresholds] = useState<ReviewThresholds>(DEFAULT_REVIEW_THRESHOLDS);
  const [epoch, setEpoch] = useState(0);

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
    setDataset(buildDemoDataset());
    setThresholds(DEFAULT_REVIEW_THRESHOLDS);
    setEpoch((n) => n + 1);
  }, []);

  const engine = useMemo(() => computeEngineView(dataset, thresholds), [dataset, thresholds]);

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
    }),
    [dataset, engine, thresholds, epoch, updateOffer, updateDataset, replaceDataset, resetDemo],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside AppStateProvider');
  return value;
}
