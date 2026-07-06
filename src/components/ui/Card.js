import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ children, className, onClick }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-surface-container rounded-2xl border border-outline-variant/30 overflow-hidden transition-colors hover:bg-surface-container-high/60',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardContent({ children, className }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}
