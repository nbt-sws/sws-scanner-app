import React from 'react';
import { cn } from '../lib/utils';

export function Icon({ name, className, filled = false, size = 24 }) {
  return (
    <span
      className={cn(
        'material-symbols-outlined inline-flex items-center justify-center leading-none',
        className
      )}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}`,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
