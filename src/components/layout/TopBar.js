import React from 'react';
import { Icon } from '../Icon';

export function TopBar({ onMenuClick }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 glass-panel border-b border-white/5 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-midnight-rose flex items-center justify-center">
          <Icon name="layers" size={18} filled className="text-on-primary" />
        </div>
        <span className="font-display font-bold text-xl text-primary tracking-tight neon-text">
          SwibScan
        </span>
      </div>
      <button
        onClick={onMenuClick}
        className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors"
        aria-label="Menu"
      >
        <Icon name="menu" size={20} />
      </button>
    </header>
  );
}
