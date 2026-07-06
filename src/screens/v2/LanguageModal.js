import React from 'react';
import { Icon } from '../../components/Icon';

const LANGUAGES = [
  { key: 'EN', label: 'English' },
  { key: 'JP', label: 'Japanese' },
  { key: 'CN', label: 'Chinese' },
];

export default function LanguageModal({ isOpen, onSelect, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-md flex items-center justify-center p-margin-mobile">
      <div className="w-full max-w-sm glass-card rounded-2xl p-6 md:p-8 animate-scale-in">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-3">
            <Icon name="translate" size={24} className="text-primary" />
          </div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-secondary">Select Language</h2>
          <p className="font-body-sm text-on-surface-variant mt-1">
            Which language is the card printed in?
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.key}
              onClick={() => onSelect(lang.key)}
              className="w-full py-4 rounded-xl bg-surface-container border border-white/10 font-label-caps text-label-caps uppercase tracking-widest text-on-surface hover:bg-surface-container-high hover:border-primary-fixed-dim/30 transition-colors flex items-center justify-center gap-3"
            >
              <span>{lang.key}</span>
              <span className="text-on-surface-variant font-body-sm normal-case tracking-normal">{lang.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="w-full mt-4 py-3 text-on-surface-variant font-body-md text-body-md hover:text-on-surface transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
