import React from 'react';
import { Icon } from '../Icon';

export function TopBar({ user, onMenuClick }) {
  const avatar = (
    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden bg-surface-variant ring-1 ring-white/10">
      {user?.photoURL ? (
        <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-surface-container-high">
          <Icon name="person" size={18} className="text-on-surface-variant md:scale-110" />
        </div>
      )}
    </div>
  );

  const title = (
    <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg font-extrabold text-primary-fixed-dim tracking-tighter text-center flex items-center justify-center gap-2">
      SwibScan
      <span className="px-1.5 py-0.5 rounded bg-secondary/20 text-secondary text-[10px] font-label-caps uppercase tracking-wider border border-secondary/30">
        demo
      </span>
    </h1>
  );

  const menu = onMenuClick ? (
    <button
      onClick={onMenuClick}
      className="text-on-surface-variant hover:opacity-80 transition-opacity p-2 rounded-full hover:bg-white/5 tap-highlight-none ml-auto"
      aria-label="Menu"
    >
      <Icon name="filter_list" size={20} />
    </button>
  ) : (
    <div />
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-background/80 dark:bg-background/80 backdrop-blur-md border-b border-white/5 px-margin-mobile md:px-margin-desktop">
      <div className="max-w-7xl mx-auto h-full grid grid-cols-3 items-center">
        <div className="flex items-center">{avatar}</div>
        <div className="flex items-center justify-center">{title}</div>
        <div className="flex items-center justify-end">{menu}</div>
      </div>
    </header>
  );
}
