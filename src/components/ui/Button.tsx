import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: ámbar con texto en tinta · ghost: contorno · quiet: solo texto */
  variant?: 'primary' | 'ghost' | 'quiet';
  /** md: 44 px · lg: 52 px (acciones principales en móvil) */
  size?: 'md' | 'lg';
  /** Ocupa todo el ancho disponible */
  fullWidth?: boolean;
  /** Icono opcional antes del texto (aria-hidden automáticamente) */
  icon?: React.ReactNode;
}

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'mr-btn-primary',
  ghost: 'mr-btn-ghost',
  quiet:
    'inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-[12px] font-bold text-[0.9375rem] text-mr-accent-text bg-transparent hover:bg-mr-line transition-colors disabled:opacity-45 disabled:cursor-not-allowed',
};

const SIZE: Record<NonNullable<ButtonProps['size']>, string> = {
  md: '',
  lg: 'min-h-[52px] px-6 text-base',
};

/** Botón de marca. Tacto mínimo 44 px. Solo presentación: la lógica va en el llamador. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth = false, icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(VARIANT[variant], SIZE[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {icon ? <span aria-hidden="true" className="inline-flex shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
});
