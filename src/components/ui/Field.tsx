import * as React from 'react';
import { cn } from '../../lib/utils';

interface FieldBaseProps {
  /** Etiqueta visible siempre (no se usa placeholder como etiqueta) */
  label: string;
  /** Pista de ayuda bajo el campo */
  hint?: string;
  /** Mensaje de error: marca el campo como inválido y se anuncia */
  error?: string;
  /** Clase del contenedor (no del control) */
  wrapperClassName?: string;
}

export interface TextFieldProps extends FieldBaseProps, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {}

export interface SelectFieldProps
  extends FieldBaseProps,
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {}

function useFieldIds(id: string | undefined, hint?: string, error?: string) {
  const autoId = React.useId();
  const base = id ?? `mr-field-${autoId}`;
  const hintId = hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return { base, describedBy, errorId, hintId };
}

function FieldFrame({
  label,
  htmlFor,
  hint,
  hintId,
  error,
  errorId,
  wrapperClassName,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId?: string;
  wrapperClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-mr-ink">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={hintId} className="text-[0.8125rem] leading-snug text-mr-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[0.8125rem] font-semibold leading-snug text-mr-accent-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Campo de texto con etiqueta visible, pista y error accesibles. */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, wrapperClassName, id, className, ...rest },
  ref,
) {
  const { base, describedBy, errorId, hintId } = useFieldIds(id, hint, error);
  return (
    <FieldFrame
      label={label}
      htmlFor={base}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
      wrapperClassName={wrapperClassName}
    >
      <input
        ref={ref}
        id={base}
        className={cn('mr-field', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
    </FieldFrame>
  );
});

/** Desplegable con etiqueta visible. Los <option> se pasan como children. */
export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, wrapperClassName, id, className, children, ...rest },
  ref,
) {
  const { base, describedBy, errorId, hintId } = useFieldIds(id, hint, error);
  return (
    <FieldFrame
      label={label}
      htmlFor={base}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
      wrapperClassName={wrapperClassName}
    >
      <select
        ref={ref}
        id={base}
        className={cn('mr-field', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      >
        {children}
      </select>
    </FieldFrame>
  );
});
