import React from 'react';
import { Icon } from '../../components/Icon';
import { TopBar } from '../../components/layout/TopBar';
import { useNotifications } from '../../hooks/useNotifications';

const STATIC_ACTIVITIES = [
  { icon: 'document_scanner', title: 'Scan Successful', desc: 'Asset ID #8849 authenticated via optical fingerprinting.', time: '2m ago', tone: 'primary' },
  { icon: 'trending_up', title: 'Value Alert', desc: 'Vault valuation increased by 4.2% in the last 24h.', time: '1h ago', tone: 'secondary' },
  { icon: 'inventory_2', title: 'Asset Deposited', desc: 'Vintage Chronograph added to Vault Alpha.', time: 'Yesterday', tone: 'muted' },
  { icon: 'security', title: 'Security Update', desc: 'New device authorized for account access.', time: 'Oct 12', tone: 'muted' },
];

const TONE_STYLES = {
  primary: { bg: 'bg-primary/10', border: 'border-primary/30', icon: 'text-primary' },
  secondary: { bg: 'bg-secondary/10', border: 'border-secondary/30', icon: 'text-secondary' },
  muted: { bg: 'bg-surface-container-high', border: 'border-outline-variant', icon: 'text-on-surface-variant' },
};

function mapNotificationTone(n) {
  const type = String(n.type || n.category || '').toLowerCase();
  if (type.includes('scan') || type.includes('auth')) return 'primary';
  if (type.includes('price') || type.includes('value') || type.includes('alert')) return 'secondary';
  return 'muted';
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now - d) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return String(iso);
  }
}

export default function ActivityScreen({ user, getToken }) {
  const { data: notifications, isLoading } = useNotifications(getToken);

  const activities = notifications?.length
    ? notifications.slice(0, 10).map((n, idx) => {
        const tone = mapNotificationTone(n);
        return {
          icon: n.icon || 'notifications',
          title: n.title || n.subject || 'Notification',
          desc: n.body || n.message || n.description || '',
          time: formatTime(n.createdAt || n.created_at || n.timestamp),
          tone,
          opacity: n.read || idx > 1 ? 'opacity-75' : '',
        };
      })
    : STATIC_ACTIVITIES.map((a, idx) => ({ ...a, opacity: idx > 1 ? 'opacity-75' : '' }));

  return (
    <div className="min-h-screen flex flex-col font-body-md pt-16">
      <TopBar user={user} />

      <main className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full px-margin-mobile md:px-margin-desktop py-gutter pb-28">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Activity</h2>
          <button className="text-primary font-label-caps text-label-caps uppercase tracking-widest hover:underline">
            VIEW ALL
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Icon name="progress_activity" size={28} className="animate-spin text-primary-fixed-dim" />
          </div>
        )}

        <div className="flex flex-col gap-2">
          {activities.map((a, idx) => {
            const style = TONE_STYLES[a.tone] || TONE_STYLES.muted;
            return (
              <div key={idx} className={`glass-card rounded-xl p-4 flex items-start gap-4 ${a.opacity || ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${style.bg} ${style.border}`}>
                  <Icon name={a.icon} size={20} className={style.icon} />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h4 className="font-body-md text-body-md text-on-surface font-medium">{a.title}</h4>
                    <span className="font-body-sm text-body-sm text-on-surface-variant text-[12px]">{a.time}</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{a.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
