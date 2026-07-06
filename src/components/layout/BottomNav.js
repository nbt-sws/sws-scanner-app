import React from 'react';
import { Icon } from '../Icon';
import { cn } from '../../lib/utils';

const TABS = [
  { key: 'scan', label: 'Scan', icon: 'document_scanner' },
  { key: 'vault', label: 'Vault', icon: 'inventory_2' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

export function BottomNav({ active, onChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-[72px] glass-panel border-t border-white/5 px-1 pb-2 md:h-16 md:px-margin-desktop md:pb-0">
      <div className="grid grid-cols-3 h-full max-w-7xl mx-auto">
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-2xl min-w-0 px-1 transition-colors',
                isActive
                  ? 'bg-primary-fixed-dim/20 text-primary-fixed-dim shadow-[0_0_15px_rgba(255,178,191,0.2)]'
                  : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              <Icon name={tab.icon} size={22} filled={isActive} />
              <span
                className={cn(
                  'font-label-caps text-[9px] leading-none uppercase tracking-widest truncate max-w-full',
                  isActive && 'text-primary-fixed-dim'
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
