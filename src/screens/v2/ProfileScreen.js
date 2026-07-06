import React from 'react';
import { Icon } from '../../components/Icon';
import { signOut } from '../../auth';

const MENU = [
  { icon: 'payments', label: 'Currency Preferences' },
  { icon: 'card_membership', label: 'Membership' },
  { icon: 'notifications', label: 'Notification Settings' },
];

export default function ProfileScreen({ user }) {
  const displayName = user?.displayName || user?.email || 'Guest';
  const isMember = false; // TODO: wire membership tier

  return (
    <div className="flex flex-col min-h-full px-4 pt-16 pb-24 max-w-md mx-auto">
      {/* Profile header */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative w-24 h-24 rounded-full border-2 border-primary p-1 mb-4">
          <div className="w-full h-full rounded-full bg-surface-container flex items-center justify-center overflow-hidden">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <Icon name="person" size={40} className="text-on-surface-variant" />
            )}
          </div>
          <button className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center">
            <Icon name="edit" size={14} />
          </button>
        </div>
        <h1 className="font-display text-headline-lg text-on-surface mb-1">{displayName}</h1>
        <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-mono text-label-caps">
          {isMember ? 'PRO COLLECTOR' : 'COLLECTOR'}
        </div>
      </div>

      {/* KYC status */}
      <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-label-caps text-on-surface-variant tracking-widest">
            KYC STATUS
          </span>
          <Icon name="check_circle" size={18} className="text-secondary" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-body-md text-on-surface">Verified to Tier 1</span>
          <button className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-mono text-label-caps">
            UPDATE
          </button>
        </div>
      </div>

      {/* Menu */}
      <div className="space-y-2 mb-6">
        {MENU.map((item) => (
          <button
            key={item.label}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-surface-container border border-outline-variant/30 text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <div className="flex items-center gap-3">
              <Icon name={item.icon} size={20} className="text-on-surface-variant" />
              <span className="text-body-md">{item.label}</span>
            </div>
            <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
          </button>
        ))}
      </div>

      <button
        onClick={signOut}
        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-error-container/20 border border-error-container/40 text-error font-display text-body-sm hover:bg-error-container/30 transition-colors"
      >
        <Icon name="logout" size={20} />
        Sign Out
      </button>

      <div className="mt-8 text-center">
        <div className="text-[10px] font-mono text-on-surface-variant tracking-widest">
          v2.4 · SWIBScan
        </div>
      </div>
    </div>
  );
}
