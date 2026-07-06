import React from 'react';
import { cn } from '../../lib/utils';

export function Screen({ children, className }) {
  return (
    <div className={cn('h-full min-h-full bg-background text-on-background', className)}>
      {children}
    </div>
  );
}

export function ScrollView({ children, className }) {
  return (
    <div className={cn('flex-1 overflow-y-auto no-scrollbar', className)}>
      {children}
    </div>
  );
}
