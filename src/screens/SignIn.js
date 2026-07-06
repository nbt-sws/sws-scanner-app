// src/screens/SignIn.js — v2 sign-in / sign-up screen.

import React, { useState } from 'react';
import { Icon } from '../components/Icon';
import { Button } from '../components/ui/Button';
import {
  signInEmail,
  signUpEmail,
  signInWithGoogle,
  signInWithApple,
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

  const oauth = (fn) => async () => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      onSignedIn?.();
    } catch (err) {
      setError(err.message || 'OAuth failed');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-xl bg-surface-container border border-outline-variant/50 px-4 py-3.5 text-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors';

  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col justify-center px-6 py-10">
      <div className="w-full max-w-sm mx-auto">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-midnight-rose flex items-center justify-center mb-4 shadow-[0_8px_30px_-10px_rgba(255,178,191,0.4)]">
            <Icon name="layers" size={32} filled className="text-on-primary" />
          </div>
          <h1 className="font-display text-headline-lg text-on-surface mb-1">SwibScan</h1>
          <p className="text-body-sm text-on-surface-variant">
            {mode === 'signin' ? 'Welcome back, collector.' : 'Create your collector account.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-error-container/20 border border-error-container/40 text-error text-body-sm text-center">
            {error}
          </div>
        )}

        {!firebaseEnabled && !isBypass && (
          <div className="mb-4 p-3 rounded-xl bg-tertiary-container/20 border border-tertiary-container/40 text-tertiary text-body-sm text-center">
            Offline mode — Firebase keys not set. Sign-in is disabled.
          </div>
        )}
        {isBypass && (
          <div className="mb-4 p-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-body-sm text-center">
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
          <Button
            type="submit"
            size="lg"
            disabled={busy || (!firebaseEnabled && !isBypass)}
            className="mt-2"
          >
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-outline-variant/40" />
          <span className="text-body-sm text-on-surface-variant">or</span>
          <div className="flex-1 h-px bg-outline-variant/40" />
        </div>

        <div className="space-y-3 mb-6">
          <Button
            variant="surface"
            size="lg"
            onClick={oauth(signInWithGoogle)}
            disabled={busy || !firebaseEnabled}
            className="gap-3"
          >
            <Icon name="google" size={20} />
            Continue with Google
          </Button>
          <Button
            variant="surface"
            size="lg"
            onClick={oauth(signInWithApple)}
            disabled={busy || !firebaseEnabled}
            className="gap-3"
          >
            <Icon name="apple" size={20} />
            Continue with Apple
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setError('LINE sign-in is coming soon — use Google, Apple, or email for now.')}
            disabled={busy}
            className="gap-3"
          >
            <Icon name="chat" size={20} />
            Continue with LINE · soon
          </Button>
        </div>

        <p className="text-center text-body-sm text-on-surface-variant">
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
