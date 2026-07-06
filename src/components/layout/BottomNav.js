import React from 'react';
import { Icon } from '../Icon';
import { cn } from '../../lib/utils';

const TABS = [
  { key: 'scan', label: 'Scan', icon: 'qr_code_scanner' },
  { key: 'vault', label: 'Vault', icon: 'inventory_2' },
  { key: 'activity', label: 'Activity', icon: 'activity_feed' },
  { key: 'profile', label: 'Profile', icon: 'person' },
];

export function BottomNav({ active, onChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-[72px] glass-panel border-t border-white/5 px-2 pb-2">
      <div className="grid grid-cols-4 h-full">
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors',
                isActive
                  ? 'bg-surface-container-high text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              <Icon name={tab.icon} size={24} filled={isActive} />
              <span className={cn('text-[10px] font-mono uppercase tracking-wider', isActive && 'text-primary')}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
