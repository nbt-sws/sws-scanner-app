// src/screens/SignIn.js — v2 sign-in / sign-up screen.

import React, { useState } from 'react';
import { Icon } from '../components/Icon';
import {
  signInEmail,
  signUpEmail,
  isBypassCredentials,
} from '../auth';
import { firebaseEnabled } from '../firebase';

export default function SignIn({ onSignedIn }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isBypass = mode === 'signin' && isBypassCredentials(email, password);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInEmail(email, password);
      } else {
        await signUpEmail(email, password, displayName);
      }
      onSignedIn?.();
    } catch (err) {
      setError(err.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-xl bg-surface-container border border-outline-variant/50 px-4 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors';

  return (
    <div className="h-screen overflow-y-auto flex items-center justify-center relative overflow-hidden bg-background text-on-background px-margin-mobile py-8">
      {/* Ambient background orbs */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-primary/10 blur-[120px] animate-float" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-secondary/5 blur-[100px] animate-float" style={{ animationDelay: '2s' }} />
      </div>

      <div className="w-full max-w-md glass-panel rounded-2xl p-8 md:p-10 relative z-10 animate-scale-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-midnight-rose flex items-center justify-center mb-5 shadow-[0_8px_30px_-10px_rgba(255,178,191,0.4)]">
            <Icon name="layers" size={36} filled className="text-on-primary" />
          </div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl font-extrabold text-secondary mb-1 flex items-center justify-center gap-2">
            SwibScan
            <span className="px-1.5 py-0.5 rounded bg-secondary/20 text-secondary text-[10px] font-label-caps uppercase tracking-wider border border-secondary/30">
              demo
            </span>
          </h1>
          <p className="text-body-sm text-on-surface-variant text-center">
            {mode === 'signin' ? 'Welcome back, collector.' : 'Create your collector account.'}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-error-container/20 border border-error-container/40 text-error text-body-sm text-center">
            {error}
          </div>
        )}

        {!firebaseEnabled && !isBypass && (
          <div className="mb-5 p-3 rounded-xl bg-tertiary-container/20 border border-tertiary-container/40 text-tertiary text-body-sm text-center">
            Offline mode — Firebase keys not set. Sign-in is disabled.
          </div>
        )}
        {isBypass && (
          <div className="mb-5 p-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-body-sm text-center">
            Bypass credentials detected — sign in without Firebase.
          </div>
        )}

        <form onSubmit={submit} className="space-y-3 mb-6">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
              autoComplete="name"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            autoComplete="email"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
          />
          <button
            type="submit"
            disabled={busy || (!firebaseEnabled && !isBypass)}
            className="w-full mt-2 py-4 rounded-xl btn-primary font-label-caps text-label-caps uppercase tracking-widest disabled:opacity-50"
          >
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-body-sm text-on-surface-variant mt-6">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-primary font-semibold hover:underline"
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
