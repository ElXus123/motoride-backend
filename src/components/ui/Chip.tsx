import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Con onClick se renderiza como botón (44 px, tacto). Sin onClick, es una etiqueta de solo lectura (28 px). */
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  /** Estado seleccionado de un filtro (aria-pressed). Solo aplica si es interactiva. */
  selected?: boolean;
  /** Icono opcional antes del texto */
  icon?: React.ReactNode;
}

/** Píldora de filtro, estado o etiqueta. */
export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { onClick, selected, icon, className, children, ...rest },
  ref,
) {
  const content = (
    <>
      {icon ? <span aria-hidden="true" className="inline-flex shrink-0">{icon}</span> : null}
      {children}
    </>
  );

  if (!onClick) {
    return <span className={cn('mr-chip', className)}>{content}</span>;
  }

  return (
    <button
      ref={ref}
      type="button"
      className={cn('mr-chip', className)}
      aria-pressed={selected === undefined ? undefined : selected}
      data-active={selected ? 'true' : undefined}
      onClick={onClick}
      {...rest}
    >
      {content}
    </button>
  );
});
