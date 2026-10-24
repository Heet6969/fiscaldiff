/**
 * Form fields.
 *
 * Each field owns the text the user typed. It commits a parsed value upward
 * only when the text parses; when it does not, the text stays on screen with an
 * error message and the committed value becomes `missing`. Nothing is silently
 * turned into zero, and editing one field never rewrites another.
 */
import { useId, useState, type ReactNode } from 'react';
import { MoneyParseError, fromDecimalString, toDecimalString, type Money } from '../../money/money';
import { isValidIsoDate } from '../../engine/dates';
import type { Input, ValueState } from '../../domain/types';

type BaseProps = {
  readonly label: string;
  readonly hint?: ReactNode;
  readonly disabled?: boolean;
};

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {children(describedBy === '' ? undefined : describedBy)}
      {error ? (
        <span className="field__error" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Money field. Empty means missing, not zero. */
export function MoneyField({
  label,
  hint,
  disabled,
  value,
  onCommit,
  allowEmpty = true,
  allowNegative = false,
}: BaseProps & {
  readonly value: Input<Money>;
  readonly onCommit: (state: ValueState<Money>) => void;
  readonly allowEmpty?: boolean;
  /** Only for figures that can legitimately be savings, such as a stated incremental cost. */
  readonly allowNegative?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(() =>
    value.state.kind === 'known' ? toDecimalString(value.state.value) : '',
  );
  const [error, setError] = useState<string | undefined>(undefined);

  function handleChange(next: string) {
    setText(next);
    const trimmed = next.trim();

    if (trimmed === '') {
      setError(allowEmpty ? undefined : 'Enter an amount.');
      onCommit({ kind: 'missing' });
      return;
    }
    try {
      const parsed = fromDecimalString(trimmed);
      if (parsed.cents < 0n && !allowNegative) {
        setError('Enter an amount of zero or more.');
        onCommit({ kind: 'missing' });
        return;
      }
      setError(undefined);
      onCommit({ kind: 'known', value: parsed });
    } catch (caught) {
      setError(
        caught instanceof MoneyParseError
          ? allowNegative
            ? 'Enter a dollar amount, for example 500, 1,250.50 or -2,000 for a saving.'
            : 'Enter a dollar amount, for example 500 or 1,250.50.'
          : 'Enter a dollar amount.',
      );
      onCommit({ kind: 'missing' });
    }
  }

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => handleChange(e.target.value)}
        />
      )}
    </FieldShell>
  );
}

/** Numeric field for percentages and hours. */
export function NumberField({
  label,
  hint,
  disabled,
  value,
  onCommit,
  min = 0,
  max,
  step = 'any',
  suffix,
}: BaseProps & {
  readonly value: Input<number>;
  readonly onCommit: (state: ValueState<number>) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: string;
  readonly suffix?: string;
}) {
  const id = useId();
  const [text, setText] = useState(() =>
    value.state.kind === 'known' ? String(value.state.value) : '',
  );
  const [error, setError] = useState<string | undefined>(undefined);

  function handleChange(next: string) {
    setText(next);
    const trimmed = next.trim();

    if (trimmed === '') {
      setError(undefined);
      onCommit({ kind: 'missing' });
      return;
    }
    if (!/^-?\d*\.?\d*$/.test(trimmed) || trimmed === '.' || trimmed === '-') {
      setError('Enter a number.');
      onCommit({ kind: 'missing' });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setError('Enter a number.');
      onCommit({ kind: 'missing' });
      return;
    }
    if (parsed < min) {
      setError(`Enter ${min} or more.`);
      onCommit({ kind: 'missing' });
      return;
    }
    if (max !== undefined && parsed > max) {
      setError(`Enter ${max} or less.`);
      onCommit({ kind: 'missing' });
      return;
    }
    setError(undefined);
    onCommit({ kind: 'known', value: parsed });
  }

  return (
    <FieldShell
      id={id}
      label={suffix ? `${label} (${suffix})` : label}
      hint={hint}
      error={error}
    >
      {(describedBy) => (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          step={step}
          value={text}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => handleChange(e.target.value)}
        />
      )}
    </FieldShell>
  );
}

/** Date field. Invalid or empty means missing, never a guessed date. */
export function DateField({
  label,
  hint,
  disabled,
  value,
  onCommit,
}: BaseProps & {
  readonly value: Input<string>;
  readonly onCommit: (state: ValueState<string>) => void;
}) {
  const id = useId();
  const [text, setText] = useState(() =>
    value.state.kind === 'known' ? value.state.value : '',
  );
  const [error, setError] = useState<string | undefined>(undefined);

  function handleChange(next: string) {
    setText(next);
    const trimmed = next.trim();

    if (trimmed === '') {
      setError(undefined);
      onCommit({ kind: 'missing' });
      return;
    }
    if (!isValidIsoDate(trimmed)) {
      setError('Enter a valid date in the form YYYY-MM-DD.');
      onCommit({ kind: 'missing' });
      return;
    }
    setError(undefined);
    onCommit({ kind: 'known', value: trimmed });
  }

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <input
          id={id}
          type="date"
          value={text}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => handleChange(e.target.value)}
        />
      )}
    </FieldShell>
  );
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: BaseProps & {
  readonly value: T;
  readonly options: readonly { value: T; label: string }[];
  readonly onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      {(describedBy) => (
        <select
          id={id}
          value={value}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}
