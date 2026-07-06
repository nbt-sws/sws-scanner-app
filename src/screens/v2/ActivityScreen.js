import React from 'react';
import { Icon } from '../../components/Icon';

const ACTIVITIES = [
  { icon: 'qr_code_scanner', title: 'Scan Successful', desc: 'Asset ID #8849 authenticated via optical fingerprinting.', time: '2m ago', color: 'text-primary' },
  { icon: 'trending_up', title: 'Value Alert', desc: 'Vault valuation increased by 4.2% in the last 24h.', time: '1h ago', color: 'text-secondary' },
  { icon: 'inventory_2', title: 'Asset Deposited', desc: 'Vintage Chronograph added to Vault Alpha.', time: 'Yesterday', color: 'text-on-surface' },
  { icon: 'shield', title: 'Security Update', desc: 'New device authorized for account access.', time: 'Oct 12', color: 'text-on-surface-variant' },
];

export default function ActivityScreen() {
  return (
    <div className="flex flex-col min-h-full px-4 pt-16 pb-24 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="font-display text-2xl text-on-surface">Activity</div>
        <button className="font-mono text-label-caps text-primary tracking-widest">VIEW ALL</button>
      </div>

      <div className="space-y-3">
        {ACTIVITIES.map((a, idx) => (
          <div
            key={idx}
            className="flex items-start gap-4 p-4 rounded-2xl bg-surface-container border border-outline-variant/30"
          >
            <div className="w-10 h-10 rounded-full bg-surface-dim flex items-center justify-center shrink-0">
              <Icon name={a.icon} size={20} className={a.color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <div className="font-display text-body-sm text-on-surface">{a.title}</div>
                <div className="font-mono text-[10px] text-on-surface-variant whitespace-nowrap ml-2">
                  {a.time}
                </div>
              </div>
              <div className="text-body-sm text-on-surface-variant leading-snug">{a.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
