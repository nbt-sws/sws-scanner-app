import React from 'react';
import { cn } from '../../lib/utils';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled = false,
  ...props
}) {
  const variants = {
    primary:
      'bg-midnight-rose text-white border-transparent neon-glow hover:neon-glow-strong',
    secondary:
      'bg-transparent text-on-surface border border-outline-variant hover:bg-surface-container',
    surface:
      'bg-surface-container text-on-surface border border-outline-variant hover:bg-surface-container-high',
    ghost:
      'bg-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low',
  };

  const sizes = {
    sm: 'px-3 py-2 text-label-caps',
    md: 'px-4 py-3 text-body-sm',
    lg: 'px-4 py-3.5 text-body-sm',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-display font-semibold tracking-wide uppercase transition-all duration-150 disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98]',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
