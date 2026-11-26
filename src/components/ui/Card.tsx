import * as React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Elemento semántico (por defecto div) */
  as?: 'div' | 'section' | 'article' | 'li';
  /** Estilo billete de ruta: filo ámbar y perforación en el pie */
  ticket?: boolean;
  /** Relleno interno: none (lo pone el contenido) · sm 12 px · md 16 px · lg 20 px */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PAD: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

/** Tarjeta de papel con borde de 1 px en tinta al 13 % y radio 14 px. */
export const Card = React.forwardRef<HTMLElement, CardProps>(function Card(
  { as: Tag = 'div', ticket = false, padding = 'md', className, children, ...rest },
  ref,
) {
  const Comp = Tag as React.ElementType;
  return (
    <Comp ref={ref} className={cn('mr-card', ticket && 'mr-ticket', PAD[padding], className)} {...rest}>
      {children}
    </Comp>
  );
});
