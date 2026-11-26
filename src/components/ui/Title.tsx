import * as React from 'react';
import { cn } from '../../lib/utils';

export interface TitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Nivel semántico del encabezado (h1 solo una vez por pantalla) */
  level?: 1 | 2 | 3;
  /** Tamaño visual, independiente del nivel. Por defecto xl. */
  size?: 'xl' | 'lg' | 'md';
  className?: string;
  children?: React.ReactNode;
}

const SIZE: Record<NonNullable<TitleProps['size']>, string> = {
  xl: 'text-[clamp(2.5rem,9vw,3.75rem)]',
  lg: 'text-[clamp(2rem,7vw,2.75rem)]',
  md: 'text-[1.625rem]',
};

/** Titular de display (Barlow Condensed). Sin mayúsculas forzadas: las mayúsculas van en Eyebrow. */
export function Title({ level = 1, size = 'xl', className, children, ...rest }: TitleProps) {
  const Tag = (`h${level}` as 'h1' | 'h2' | 'h3');
  return (
    <Tag className={cn('mr-title', SIZE[size], className)} {...rest}>
      {children}
    </Tag>
  );
}
