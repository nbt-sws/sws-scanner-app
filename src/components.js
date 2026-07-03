// src/components.js
// Tiny shared component kit pulled from v12 — Screen, Button, Pill, StatTile, Spinner.
// SCN30 adds Card / LoadingCard / SectionLabel / FieldLabel which were
// originally defined locally in Scanner.js but got lost during in-session
// edits; centralising them here keeps them isolated from Scanner.js churn.

import React from 'react';
import { T, SZ } from './theme';

export function Screen({ children, style = {} }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        color: T.textHi,
        fontFamily: T.fontBody,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Button({ onClick, variant = 'primary', size = 'md', children, style = {}, disabled = false, type = 'button' }) {
  const variants = {
    primary:  { bg: T.gradientPrimary, color: '#0A0F2E', border: 'none', shadow: '0 6px 20px -8px rgba(240,106,232,0.55)' },
    accent:   { bg: T.cyan,            color: T.bgDeep,  border: 'none', shadow: '0 4px 16px -6px rgba(93,213,240,0.5)' },
    outline:  { bg: 'transparent',     color: T.textHi,  border: `1px solid ${T.borderHi}`, shadow: 'none' },
    surface:  { bg: T.surface,         color: T.textMid, border: `1px solid ${T.border}`,   shadow: 'none' },
    danger:   { bg: T.red,             color: '#fff',    border: 'none', shadow: '0 4px 14px -6px rgba(255,77,77,0.6)' },
  };
  const sizes = {
    sm: { padding: '10px 14px', fontSize: SZ.sm },
    md: { padding: '14px 18px', fontSize: SZ.md },
    lg: { padding: '16px 20px', fontSize: SZ.base },
  };
  const v = variants[variant] || variants.primary;
  const s = sizes[size] || sizes.md;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: v.bg,
        color: v.color,
        border: v.border,
        borderRadius: 14,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 600,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        width: '100%',
        boxShadow: v.shadow,
        transition: 'transform 0.12s ease, opacity 0.15s, box-shadow 0.15s',
        fontFamily: T.fontDisplay,
        ...style,
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {children}
    </button>
  );
}

const TAG_STYLES = {
  Raw:       { bg: 'rgba(123,138,245,0.15)', c: '#A6B4FF', b: 'rgba(123,138,245,0.3)' },
  'PSA 10':  { bg: 'rgba(213,43,43,0.15)',   c: '#FF8080', b: 'rgba(213,43,43,0.4)' },
  'PSA 9':   { bg: 'rgba(213,43,43,0.15)',   c: '#FF8080', b: 'rgba(213,43,43,0.4)' },
  'BGS 10':  { bg: 'rgba(255,216,77,0.15)',  c: '#FFD84D', b: 'rgba(255,216,77,0.4)' },
  'ARS 10':  { bg: 'rgba(79,224,208,0.15)',  c: '#4FE0D0', b: 'rgba(79,224,208,0.4)' },
  'CGC 10':  { bg: 'rgba(133,183,235,0.15)', c: '#85B7EB', b: 'rgba(133,183,235,0.4)' },
  Leader:    { bg: 'rgba(213,43,43,0.15)',   c: '#FF8080', b: 'rgba(213,43,43,0.35)' },
  Character: { bg: 'rgba(123,138,245,0.15)', c: '#A6B4FF', b: 'rgba(123,138,245,0.3)' },
  Event:     { bg: 'rgba(79,224,208,0.15)',  c: '#4FE0D0', b: 'rgba(79,224,208,0.3)' },
  Stage:     { bg: 'rgba(255,184,108,0.15)', c: '#FFB86C', b: 'rgba(255,184,108,0.3)' },
  'DON!!':   { bg: 'rgba(255,216,77,0.15)',  c: '#FFD84D', b: 'rgba(255,216,77,0.4)' },
  EN:        { bg: 'rgba(123,138,245,0.12)', c: '#A6B4FF', b: 'rgba(123,138,245,0.28)' },
  JP:        { bg: 'rgba(79,224,208,0.12)',  c: '#4FE0D0', b: 'rgba(79,224,208,0.28)' },
  AE:        { bg: 'rgba(255,184,108,0.12)', c: '#FFB86C', b: 'rgba(255,184,108,0.28)' },
  Promo:     { bg: 'rgba(240,106,168,0.2)',  c: '#F06AA8', b: '#F06AA8' },
  Cached:    { bg: 'rgba(79,224,208,0.15)',  c: '#4FE0D0', b: 'rgba(79,224,208,0.4)' },
  _default:  { bg: 'rgba(240,106,168,0.15)', c: '#F06AA8', b: 'rgba(240,106,168,0.3)' },
};

function tagStyle(tag) {
  return TAG_STYLES[tag] || TAG_STYLES._default;
}

export function Pill({ tag, size = 'md' }) {
  if (!tag) return null;
  const s = tagStyle(tag);
  return (
    <span
      style={{
        display: 'inline-block',
        background: s.bg,
        color: s.c,
        border: `0.5px solid ${s.b}`,
        fontWeight: 500,
        fontSize: size === 'sm' ? 11 : 12,
        padding: size === 'sm' ? '3px 7px' : '4px 10px',
        borderRadius: 99,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {tag}
    </span>
  );
}

export function StatTile({ label, value, color = T.textHi, gradient = false, sub = null }) {
  const bg = gradient ? `linear-gradient(135deg, ${T.pink}, ${T.blue})` : T.surface;
  const border = gradient ? 'none' : `0.5px solid ${T.border}`;
  const labelColor = gradient ? T.pinkDark : T.textLow;
  const valueColor = gradient ? T.pinkDark : color;
  return (
    <div style={{ background: bg, border, borderRadius: 10, padding: '12px 12px' }}>
      <div style={{ fontSize: SZ.xs - 1, color: labelColor, fontWeight: 500, letterSpacing: '0.05em', opacity: gradient ? 0.82 : 1 }}>{label}</div>
      <div style={{ fontSize: SZ.lg, fontWeight: 500, color: valueColor, marginTop: 4, fontFamily: T.fontMono }}>{value}</div>
      {sub && <div style={{ fontSize: SZ.xs - 1, color: T.textDim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function Spinner({ size = 18, color = T.pink }) {
  return (
    <span
      aria-label="Loading"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `2px solid ${color}33`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'swib-spin 0.9s linear infinite',
      }}
    >
      <style>{`@keyframes swib-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div
      style={{
        background: 'rgba(213,43,43,0.15)',
        border: `0.5px solid ${T.red}`,
        color: T.redLight,
        padding: '12px 14px',
        borderRadius: 10,
        fontSize: SZ.sm,
        marginBottom: 12,
      }}
    >
      {message}
    </div>
  );
}

// SCN30 — UI primitives restored after they were lost from Scanner.js
// mid-edits. Card: panel wrapper. LoadingCard: card with spinner.
// SectionLabel + FieldLabel: small uppercase headers used in forms/sections.

export function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        padding: 16,
        marginBottom: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function LoadingCard({ text = 'Loading…' }) {
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: T.textMid,
          fontSize: SZ.sm,
        }}
      >
        <Spinner size={16} />
        <span>{text}</span>
      </div>
    </Card>
  );
}

export function SectionLabel({ children, style = {} }) {
  return (
    <div
      style={{
        fontSize: SZ.xs,
        color: T.textLow,
        fontFamily: T.fontDisplay,
        letterSpacing: '0.08em',
        fontWeight: 700,
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function FieldLabel({ children, style = {} }) {
  return (
    <div
      style={{
        fontSize: SZ.xs,
        color: T.textLow,
        fontFamily: T.fontDisplay,
        letterSpacing: '0.08em',
        fontWeight: 600,
        textTransform: 'uppercase',
        marginBottom: 6,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
