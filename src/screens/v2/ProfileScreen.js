import React, { useState } from 'react';
import { Icon } from '../../components/Icon';

import { signOut } from '../../auth';
import { useKycStatus } from '../../hooks/useKycStatus';
import { useNotifications } from '../../hooks/useNotifications';
import { TIERS, TIER_LABELS, TIER_BENEFITS, nextTierAbove } from '../../lib/tiers';

const STATIC_ACTIVITIES = [
  {
    icon: 'document_scanner',
    title: 'Scan Successful',
    desc: 'Asset ID #8849 authenticated via optical fingerprinting.',
    time: '2m ago',
    tone: 'primary',
  },
  {
    icon: 'trending_up',
    title: 'Value Alert',
    desc: 'Vault valuation increased by 4.2% in the last 24h.',
    time: '1h ago',
    tone: 'secondary',
  },
  {
    icon: 'inventory_2',
    title: 'Asset Deposited',
    desc: 'Vintage Chronograph added to Vault Alpha.',
    time: 'Yesterday',
    tone: 'muted',
  },
  {
    icon: 'security',
    title: 'Security Update',
    desc: 'New device authorized for account access.',
    time: 'Oct 12',
    tone: 'muted',
  },
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

function ToggleRow({ label, enabled, onChange }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className="w-full flex items-center justify-between py-3 border-b border-white/5 last:border-b-0 group"
      aria-pressed={enabled}
    >
      <span className="font-body-md text-body-md text-on-surface">{label}</span>
      <span
        className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
          enabled ? 'bg-primary/40' : 'bg-surface-container-high'
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-200 ${
            enabled ? 'left-7 bg-primary' : 'left-1 bg-on-surface-variant'
          }`}
        />
      </span>
    </button>
  );
}

function NotificationSettings({ user, getToken }) {
  const [priceAlerts, setPriceAlerts] = useState(() => {
    try { return localStorage.getItem('sws_notif_price') !== 'false'; } catch { return true; }
  });
  const [scanReminders, setScanReminders] = useState(() => {
    try { return localStorage.getItem('sws_notif_scan') === 'true'; } catch { return false; }
  });

  const persist = (key, value) => {
    try { localStorage.setItem(key, String(value)); } catch {}
  };

  const onPriceChange = (value) => {
    setPriceAlerts(value);
    persist('sws_notif_price', value);
  };
  const onScanChange = (value) => {
    setScanReminders(value);
    persist('sws_notif_scan', value);
  };

  return (
    <>
      <h3 className="font-label-caps text-label-caps text-secondary uppercase tracking-widest mb-4">Notification Settings</h3>
      <ToggleRow label="Price alerts" enabled={priceAlerts} onChange={onPriceChange} />
      <ToggleRow label="Scan reminders" enabled={scanReminders} onChange={onScanChange} />
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-4">
        Preferences are saved on this device. You can manage email and push alerts here when your account is connected.
      </p>
    </>
  );
}

export default function ProfileScreen({ user, getToken, currency = 'USD', onCurrencyChange }) {
  const displayName = user?.displayName || user?.email || 'Guest';
  const { data: kyc, isLoading: kycLoading } = useKycStatus(user, getToken);
  const { data: notifications } = useNotifications(getToken);

  const [openSection, setOpenSection] = useState(null);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [kycMessage, setKycMessage] = useState('');

  const kycTier = kycLoading ? 3 : kyc?.tier ?? 3;
  const kycStatus = kycLoading ? 'verified' : kyc?.status ?? 'verified';

  const activities = notifications?.length
    ? (showAllActivities ? notifications : notifications.slice(0, 6)).map((n, idx) => {
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
    <div className="min-h-full flex flex-col font-body-md">
      <main className="flex-1 min-h-full max-w-7xl mx-auto w-full px-margin-mobile md:px-margin-desktop py-6 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 pb-6">
        {/* Profile Section (Left Column Desktop / Top Mobile) */}
        <section className="md:col-span-4 flex flex-col gap-2 md:sticky md:top-6 md:self-start">
          <div className="glass-card rounded-xl md:rounded-2xl p-4 md:p-6 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-primary-fixed-dim/5 to-transparent pointer-events-none" />
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border border-primary p-0.5 mb-2 relative">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" className="w-full h-full object-cover rounded-full" />
              ) : (
                <div className="w-full h-full rounded-full bg-surface-container-high flex items-center justify-center">
                  <Icon name="person" size={32} className="text-on-surface-variant md:scale-110" />
                </div>
              )}
              <div className="absolute bottom-0 right-0 w-5 h-5 md:w-6 md:h-6 bg-secondary rounded-full border border-background flex items-center justify-center">
                <Icon name="verified" size={12} filled className="text-on-secondary" />
              </div>
            </div>
            <h2 className="font-headline-md text-[20px] md:text-[22px] leading-tight text-on-surface relative z-10 truncate max-w-full">{displayName}</h2>
            <div className="flex items-center gap-2 mt-2 relative z-10">
              <span className="bg-primary/20 text-primary font-label-caps text-label-caps px-3 py-1 rounded-full border border-primary/30 uppercase tracking-widest">
                PRO COLLECTOR
              </span>
            </div>
          </div>

          <div className="glass-card rounded-xl md:rounded-2xl p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-label-caps text-[11px] text-secondary uppercase tracking-widest">
                KYC STATUS
              </h3>
              <Icon
                name={kycStatus === 'verified' ? 'check_circle' : 'pending'}
                size={18}
                filled
                className="text-secondary"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-body-md text-body-md text-on-surface-variant">
                {kycStatus === 'verified' ? `Verified to Tier ${kycTier}` : `KYC ${kycStatus}`}
              </span>
              <button
                disabled={kycStatus === 'verified'}
                onClick={() => setKycMessage('KYC updates are handled through account verification. Contact support to upgrade your tier.')}
                className="bg-primary text-on-primary font-label-caps text-label-caps uppercase tracking-widest px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {kycStatus === 'verified' ? 'Verified' : 'Update'}
              </button>
            </div>
            {kycMessage && (
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-3">{kycMessage}</p>
            )}
          </div>

          <nav className="glass-card rounded-xl md:rounded-2xl overflow-hidden flex flex-col">
            {[
              { key: 'currency', icon: 'payments', label: 'Currency Preferences' },
              { key: 'membership', icon: 'card_membership', label: 'Membership' },
              { key: 'notifications', icon: 'notifications', label: 'Notification Settings' },
            ].map((item, idx, arr) => (
              <button
                key={item.label}
                onClick={() => setOpenSection(openSection === item.key ? null : item.key)}
                className="flex items-center justify-between p-3 border-b border-white/5 hover:bg-white/5 transition-colors text-left"
              >
                <div className="flex items-center gap-3 text-on-surface-variant">
                  <Icon name={item.icon} size={20} />
                  <span className="font-body-md text-body-md">{item.label}</span>
                </div>
                <Icon name={openSection === item.key ? 'expand_less' : 'chevron_right'} size={20} className="text-outline" />
              </button>
            ))}
            <button
              onClick={signOut}
              className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors text-left group"
            >
              <div className="flex items-center gap-3 text-error">
                <Icon name="logout" size={20} />
                <span className="font-body-md text-body-md">Sign Out</span>
              </div>
            </button>
          </nav>

          {/* Currency Preferences */}
          {openSection === 'currency' && (
            <div className="glass-card rounded-xl md:rounded-2xl p-4 animate-fade-up">
              <h3 className="font-label-caps text-[11px] text-secondary uppercase tracking-widest mb-3">Primary Currency</h3>
              <div className="grid grid-cols-3 gap-3">
                {['USD', 'THB', 'EUR', 'GBP', 'JPY', 'SGD'].map((c) => (
                  <button
                    key={c}
                    onClick={() => onCurrencyChange?.(c)}
                    className={`py-2.5 rounded-lg border font-label-caps text-[11px] uppercase tracking-widest transition-colors ${
                      currency === c
                        ? 'bg-primary-fixed-dim/20 border-primary-fixed-dim/50 text-primary-fixed-dim'
                        : 'bg-surface-container border-white/5 text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Membership */}
          {openSection === 'membership' && (
            <div className="glass-card rounded-xl md:rounded-2xl p-4 flex flex-col gap-3 animate-fade-up">
              <h3 className="font-label-caps text-[11px] text-secondary uppercase tracking-widest">Membership</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TIERS.map((tier) => {
                const meta = TIER_LABELS[tier];
                const benefit = TIER_BENEFITS[tier];
                const isCurrent = tier === 'user'; // until backend tier is wired
                return (
                  <div
                    key={tier}
                    className={`rounded-xl border p-3 transition-colors ${
                      isCurrent
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-white/5 bg-surface-container-low hover:bg-surface-container'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-headline-md text-headline-md" style={{ color: meta.color }}>{meta.name}</span>
                        {isCurrent && <span className="font-label-caps text-[10px] text-primary uppercase tracking-wider">Current</span>}
                      </div>
                      <span className="font-label-caps text-label-caps text-on-surface-variant">
                        {benefit.monthlyTHB === 0 ? 'Free' : `฿${benefit.monthlyTHB}/mo`}
                      </span>
                    </div>
                    <p className="font-body-sm text-on-surface-variant mb-3">{benefit.headline}</p>
                    <ul className="list-disc list-inside text-body-sm text-on-surface-variant space-y-1">
                      {benefit.perks.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {/* Notification Settings */}
          {openSection === 'notifications' && (
            <div className="glass-card rounded-xl md:rounded-2xl p-4 animate-fade-up">
              <NotificationSettings user={user} getToken={getToken} />
            </div>
          )}
        </section>

        {/* Activity Section (Right Column Desktop / Bottom Mobile) */}
        <section className="md:col-span-8 flex flex-col gap-2">
          <div className="flex items-center justify-between mb-2 mt-4 md:mt-0">
            <h2 className="font-headline-md text-[20px] md:text-[22px] leading-tight text-on-surface">Recent Activity</h2>
            <button
              onClick={() => setShowAllActivities((s) => !s)}
              className="text-primary font-label-caps text-label-caps uppercase tracking-widest hover:underline"
            >
              {showAllActivities ? 'SHOW LESS' : 'VIEW ALL'}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {activities.map((a, idx) => {
              const style = TONE_STYLES[a.tone] || TONE_STYLES.muted;
              return (
                <div
                  key={idx}
                  className={`glass-card rounded-xl md:rounded-2xl p-3 md:p-4 flex items-start gap-3 ${a.opacity || ''}`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${style.bg} ${style.border}`}
                  >
                    <Icon name={a.icon} size={18} className={style.icon} />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className="font-body-md text-body-md text-on-surface font-medium">{a.title}</h4>
                      <span className="font-body-sm text-body-sm text-on-surface-variant text-[12px]">
                        {a.time}
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{a.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
