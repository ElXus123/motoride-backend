import * as React from 'react';
import { cn } from '../../lib/utils';

export interface EyebrowProps extends React.HTMLAttributes<HTMLParagraphElement> {
  className?: string;
  children?: React.ReactNode;
}

/** Etiqueta corta en mayúsculas en ámbar sobre un titular (p. ej. «Ruta», «Grupo»). */
export function Eyebrow({ className, children, ...rest }: EyebrowProps) {
  return (
    <p className={cn('mr-eyebrow', className)} {...rest}>
      {children}
    </p>
  );
}
