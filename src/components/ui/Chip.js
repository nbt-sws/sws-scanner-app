import React from 'react';
import { cn } from '../../lib/utils';

export function Chip({ children, active = false, onClick, className }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center px-3 py-1.5 rounded-full font-mono text-label-caps uppercase tracking-wider border transition-colors',
        active
          ? 'bg-primary/20 text-primary border-primary/40 neon-border'
          : 'bg-surface-container text-on-surface-variant border-outline-variant/40 hover:bg-surface-container-high',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </button>
  );
}
