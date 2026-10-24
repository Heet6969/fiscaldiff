/**
 * Shared interaction layer for the three charts.
 *
 * The SVG stays a labelled image with its text equivalents. On top of it sits a
 * layer of real <button> elements, one per data point, sized to the shape they
 * describe. Buttons are used rather than focusable SVG children because an SVG
 * with role="img" treats its children as presentational, which would hide them.
 *
 * One mechanism serves every input:
 *  - mouse: hover shows the tooltip and highlights the matching shape;
 *  - keyboard: the layer is a single tab stop; arrow keys, Home and End move
 *    between points, Escape dismisses;
 *  - touch / pen: tap pins the tooltip, tap again or tap elsewhere dismisses.
 *
 * Each button's accessible name carries the same text as the tooltip, so the
 * information is available to screen readers without the visual tooltip, which
 * is therefore hidden from assistive technology to avoid reading it twice.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export type TooltipContent = {
  readonly title: string;
  readonly lines: readonly string[];
  /** Short status such as "Needs review", shown on its own line. */
  readonly badge?: string;
};

export type ChartTarget = {
  readonly id: string;
  /** Pixel box inside the stage, in the same coordinates as the SVG. */
  readonly box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly shape?: 'rect' | 'circle';
  readonly tooltip: TooltipContent;
};

export function targetLabel(content: TooltipContent): string {
  return [content.title, ...content.lines, ...(content.badge ? [content.badge] : [])].join('. ');
}

function isFocusVisible(element: HTMLElement): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}

export function ChartStage({
  width,
  height,
  targets,
  groupLabel,
  children,
}: {
  width: number;
  height: number;
  targets: readonly ChartTarget[];
  groupLabel: string;
  /** Draws the SVG. `activeId` is the id of the point currently shown. */
  children: (state: { activeId: string | null }) => ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const lastShown = useRef<ChartTarget | undefined>(undefined);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [rovingIndex, setRovingIndex] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const requestedId = hoverId ?? focusId ?? pinnedId;
  const active = requestedId === null ? undefined : targets.find((t) => t.id === requestedId);
  if (active) lastShown.current = active;
  // Keep the last content on screen while the tooltip fades out.
  const shown = active ?? lastShown.current;

  const lastIndex = targets.length - 1;
  const tabStop = Math.min(rovingIndex, Math.max(lastIndex, 0));

  function clearAll() {
    setHoverId(null);
    setFocusId(null);
    setPinnedId(null);
  }

  const engaged = hoverId !== null || focusId !== null || pinnedId !== null;
  useEffect(() => {
    if (!engaged) return undefined;
    const onDown = (event: PointerEvent) => {
      if (stageRef.current && !stageRef.current.contains(event.target as Node)) {
        setHoverId(null);
        setFocusId(null);
        setPinnedId(null);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [engaged]);

  // Place the tooltip: centred on the point, kept inside the viewport, above the
  // point when it fits and below it otherwise.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    const stage = stageRef.current;
    if (!active || !tip || !stage) return;

    const tipBox = tip.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    const { x, y, w, h } = active.box;
    const viewportWidth = document.documentElement.clientWidth;

    const minLeft = 4 - stageBox.left;
    const maxLeft = viewportWidth - stageBox.left - tipBox.width - 4;
    const left = Math.max(minLeft, Math.min(x + w / 2 - tipBox.width / 2, maxLeft));

    const above = y - tipBox.height - 8;
    const fitsAbove = above >= 0 && stageBox.top + above >= 4;
    const top = fitsAbove ? above : y + h + 8;

    setPos((previous) => (previous.left === left && previous.top === top ? previous : { left, top }));
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      clearAll();
      return;
    }
    if (lastIndex < 0) return;

    let next: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(lastIndex, tabStop + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, tabStop - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = lastIndex;
    if (next === undefined) return;

    event.preventDefault();
    setRovingIndex(next);
    buttons.current[next]?.focus();
  }

  return (
    <div
      ref={stageRef}
      className={`chart-stage${active ? ' is-engaged' : ''}`}
      style={{ width, height }}
    >
      {children({ activeId: active ? active.id : null })}

      {targets.length > 0 ? (
        <div className="chart-overlay" role="group" aria-label={groupLabel} onKeyDown={onKeyDown}>
          {targets.map((target, index) => (
            <button
              key={target.id}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              className={`chart-target${target.shape === 'circle' ? ' chart-target--circle' : ''}`}
              style={{
                left: target.box.x,
                top: target.box.y,
                width: target.box.w,
                height: target.box.h,
              }}
              tabIndex={index === tabStop ? 0 : -1}
              aria-label={targetLabel(target.tooltip)}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') setHoverId(target.id);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') setHoverId(null);
              }}
              onFocus={(event) => {
                setRovingIndex(index);
                // A mouse click also focuses the button; only keyboard focus
                // should keep a tooltip open after the pointer has gone.
                if (isFocusVisible(event.currentTarget)) setFocusId(target.id);
              }}
              onBlur={() => setFocusId((current) => (current === target.id ? null : current))}
              onClick={(event) => {
                const kind = (event.nativeEvent as PointerEvent).pointerType;
                if (kind !== 'touch' && kind !== 'pen') return;
                if (pinnedId === target.id) {
                  clearAll();
                  event.currentTarget.blur();
                } else {
                  setPinnedId(target.id);
                }
              }}
            />
          ))}
        </div>
      ) : null}

      <div
        ref={tipRef}
        className={`chart-tooltip${active ? ' is-visible' : ''}`}
        style={{ left: pos.left, top: pos.top }}
        aria-hidden="true"
      >
        {shown ? (
          <>
            <div className="chart-tooltip__title">{shown.tooltip.title}</div>
            {shown.tooltip.lines.map((line) => (
              <div className="chart-tooltip__line" key={line}>
                {line}
              </div>
            ))}
            {shown.tooltip.badge ? (
              <div className="chart-tooltip__badge">{shown.tooltip.badge}</div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
