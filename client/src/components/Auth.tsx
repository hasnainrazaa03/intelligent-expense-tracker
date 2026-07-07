import React, { useState } from 'react';
import { GoogleIcon, ExclamationTriangleIcon } from './Icons';
import { ExpenseTrackerLogo } from './Branding';
import { registerUser, loginUser, forgotPassword, resetPassword, verifyLoginOtp } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Label } from './ui';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

interface AuthProps {
  onLoginSuccess: () => void;
}

const scorePassword = (value: string): number => {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[a-z]/.test(value)) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return score;
};

const isStrongPassword = (value: string): boolean => scorePassword(value) >= 5;

const Auth: React.FC<AuthProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginView, setIsLoginView] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [loginOtp, setLoginOtp] = useState('');
  const [pendingLoginEmail, setPendingLoginEmail] = useState('');
  const navigate = useNavigate();

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'email' | 'code'>('email');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const authErrorId = 'auth-error';
  const resetErrorId = 'reset-error';

  const closeForgotPasswordModal = () => {
    setShowForgotPassword(false);
    setResetStep('email');
    setResetCode('');
    setNewPassword('');
    setResetError(null);
    setResetLoading(false);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLoginView) {
        const data = await loginUser(email, password);
        if (data.requiresTwoFactor) {
          setRequiresTwoFactor(true);
          setPendingLoginEmail(data.email || email);
          setSuccessMsg('Verification code sent to your email.');
        } else {
          onLoginSuccess();
        }
      } else {
        if (!isStrongPassword(password)) {
          setError('Password must include uppercase, lowercase, number, symbol, and be at least 8 characters.');
          return;
        }
        await registerUser(email, password);
        navigate('/verify', { state: { email: email } });
      }
    } catch (err: any) {
      setError(err.message || 'AUTHENTICATION_FAILURE');
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await verifyLoginOtp(pendingLoginEmail, loginOtp);
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'TWO_FACTOR_VERIFICATION_FAILED');
    } finally {
      setLoading(false);
    }
  };

  const toggleView = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoginView(!isLoginView);
    setEmail('');
    setPassword('');
    setRequiresTwoFactor(false);
    setLoginOtp('');
    setPendingLoginEmail('');
    setError(null);
    setSuccessMsg(null);
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetError(null);
    try {
      if (resetStep === 'email') {
        await forgotPassword(resetEmail);
        setResetStep('code');
      } else {
        if (!isStrongPassword(newPassword)) {
          setResetError('Password must include uppercase, lowercase, number, symbol, and be at least 8 characters.');
          return;
        }
        await resetPassword(resetEmail, resetCode, newPassword);
        closeForgotPasswordModal();
        setResetEmail('');
        setSuccessMsg('Password reset successfully! You can now log in.');
      }
    } catch (err: any) {
      setResetError(err.message || 'Something went wrong');
    } finally {
      setResetLoading(false);
    }
  };

  const passwordScore = scorePassword(password);
  const newPasswordScore = scorePassword(newPassword);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 antialiased relative overflow-hidden">
      <div className="starfield" />

      <div className="w-full max-w-md md:max-w-lg glass rounded-3xl relative z-10 transition-all mx-auto overflow-hidden">

        {/* HEADER */}
        <div className="p-7 md:p-9 border-b border-app-border">
          <ExpenseTrackerLogo className="h-7 md:h-8 w-auto text-app-text mb-5" />
          <h1 className="font-display text-2xl md:text-3xl font-bold text-app-text leading-tight">
            {isLoginView ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-sm text-app-muted mt-1.5">
            {isLoginView ? 'Sign in to your Orbit dashboard.' : 'Start tracking in under a minute.'}
          </p>
        </div>

        <div className="p-7 md:p-9">
          <form onSubmit={handleFormSubmit} className="space-y-6">
            {/* ALERT BOX */}
            {error && (
              <div id={authErrorId} role="alert" aria-live="assertive" className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-3.5 flex items-center text-sm font-medium">
                <ExclamationTriangleIcon className="h-5 w-5 mr-3 shrink-0" />
                {error}
              </div>
            )}
            {successMsg && (
              <div className="bg-ok/10 border border-ok/30 text-ok rounded-xl p-3.5 flex items-center text-sm font-medium">
                {successMsg}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <Label htmlFor="email" className="tracking-[0.14em]">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="md:py-3.5 text-base disabled:opacity-50"
                  aria-invalid={!!error}
                  aria-describedby={error ? authErrorId : undefined}
                  required
                  placeholder="you@email.com"
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
              <div>
                <Label htmlFor="password" className="tracking-[0.14em]">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="md:py-3.5 text-base disabled:opacity-50"
                  aria-invalid={!!error}
                  aria-describedby={error ? authErrorId : undefined}
                  required
                  placeholder="••••••••"
                  autoComplete={isLoginView ? "current-password" : "new-password"}
                  disabled={loading}
                />
                {!isLoginView && (
                  <>
                    <div className="mt-2.5 grid grid-cols-5 gap-1.5" aria-hidden="true">
                      {Array.from({ length: 5 }, (_, idx) => (
                        <div
                          key={idx}
                          className={`h-1.5 rounded-full transition-colors ${idx < passwordScore ? 'bg-primary' : 'bg-surface-2 border border-app-border'}`}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-app-muted">
                      Use 8+ chars with upper, lower, number, and symbol.
                    </p>
                  </>
                )}
                {isLoginView && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(true);
                      setResetEmail(email);
                      setResetError(null);
                      setResetStep('email');
                      setResetCode('');
                      setNewPassword('');
                    }}
                    className="mt-2.5 text-xs font-medium text-primary hover:brightness-125 transition-all"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            </div>

            <Button
              type="submit"
              fullWidth
              size="lg"
              className="py-3.5"
              disabled={loading}
            >
              {loading
                ? (isLoginView ? 'Signing in…' : 'Creating…')
                : (isLoginView ? 'Sign in' : 'Create account')}
            </Button>
          </form>

          {requiresTwoFactor && (
            <form onSubmit={handleTwoFactorSubmit} className="mt-6 space-y-4 rounded-2xl border border-app-border bg-surface-2 p-5">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-app-muted">Two-factor required</p>
              <Input
                type="text"
                value={loginOtp}
                onChange={(e) => setLoginOtp(e.target.value)}
                className="md:py-3.5 text-base disabled:opacity-50"
                placeholder="Enter 6-digit code"
                maxLength={6}
                required
                disabled={loading}
              />
              <Button
                type="submit"
                fullWidth
                className="py-3"
                disabled={loading}
              >
                {loading ? 'Verifying…' : 'Verify & sign in'}
              </Button>
            </form>
          )}

          {/* VISUAL DIVIDER */}
          <div className="relative my-7 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-app-border" />
            </div>
            <span className="relative bg-surface px-4 text-[11px] text-app-faint uppercase tracking-[0.14em]">
              or
            </span>
          </div>

          {/* GOOGLE SSO BUTTON */}
          <a
            href={`${API_BASE_URL}/auth/google`}
            className="w-full flex items-center justify-center py-3.5 px-4 bg-surface-2 border border-app-border rounded-xl text-app-text font-semibold text-sm hover:border-app-border-strong transition-all"
          >
            <GoogleIcon className="h-5 w-5 mr-3" />
            <span>Continue with Google</span>
          </a>

          {/* VIEW TOGGLE */}
          <p className="text-center mt-7 text-sm text-app-muted">
            {isLoginView ? "Don't have an account? " : 'Already have an account? '}
            <a
              href="#"
              onClick={toggleView}
              className="font-semibold text-primary hover:brightness-125 transition-all"
            >
              {isLoginView ? 'Sign up' : 'Sign in'}
            </a>
          </p>
        </div>

        {/* FOOTER */}
        <div className="px-7 py-4 border-t border-app-border text-app-faint text-[10px] flex justify-between uppercase select-none tracking-[0.16em]">
          <span>Bank-level security</span>
          <span>© Orbit {'2026'}</span>
        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeForgotPasswordModal} />
          <div className="relative w-full max-w-md glass rounded-2xl z-10 overflow-hidden">
            <div className="p-5 border-b border-app-border flex justify-between items-center">
              <h2 className="font-display text-lg font-bold text-app-text">
                {resetStep === 'email' ? 'Reset password' : 'Enter reset code'}
              </h2>
              <button
                type="button"
                onClick={closeForgotPasswordModal}
                aria-label="Close"
                className="grid place-items-center w-8 h-8 rounded-lg text-app-muted hover:text-app-text hover:bg-surface-2 transition-colors text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-5">
              {resetError && (
                <div id={resetErrorId} role="alert" aria-live="assertive" className="bg-danger/10 border border-danger/30 text-danger rounded-xl p-3 text-sm font-medium flex items-center">
                  <ExclamationTriangleIcon className="h-4 w-4 mr-2 shrink-0" />
                  {resetError}
                </div>
              )}

              {resetStep === 'email' ? (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-5">
                  <p className="text-sm text-app-muted">
                    Enter your registered email to receive a reset code.
                  </p>
                  <div>
                    <Label htmlFor="reset-email" className="tracking-[0.14em]">Email address</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      className="md:py-3.5 text-base disabled:opacity-50"
                      aria-invalid={!!resetError}
                      aria-describedby={resetError ? resetErrorId : undefined}
                      required
                      placeholder="you@email.com"
                      disabled={resetLoading}
                    />
                  </div>
                  <Button
                    type="submit"
                    fullWidth
                    className="py-3"
                    disabled={resetLoading}
                  >
                    {resetLoading ? 'Sending…' : 'Send reset code'}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-5">
                  <p className="text-sm text-app-muted">
                    Enter the 6-digit code sent to {resetEmail}.
                  </p>
                  <div>
                    <Label htmlFor="reset-code" className="tracking-[0.14em]">Reset code</Label>
                    <Input
                      id="reset-code"
                      type="text"
                      value={resetCode}
                      onChange={e => setResetCode(e.target.value)}
                      className="md:py-3.5 text-base disabled:opacity-50"
                      aria-invalid={!!resetError}
                      aria-describedby={resetError ? resetErrorId : undefined}
                      required
                      placeholder="000000"
                      maxLength={6}
                      disabled={resetLoading}
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-password" className="tracking-[0.14em]">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="md:py-3.5 text-base disabled:opacity-50"
                      aria-invalid={!!resetError}
                      aria-describedby={resetError ? resetErrorId : undefined}
                      required
                      placeholder="••••••••"
                      disabled={resetLoading}
                    />
                    <div className="mt-2.5 grid grid-cols-5 gap-1.5" aria-hidden="true">
                      {Array.from({ length: 5 }, (_, idx) => (
                        <div
                          key={idx}
                          className={`h-1.5 rounded-full transition-colors ${idx < newPasswordScore ? 'bg-primary' : 'bg-surface-2 border border-app-border'}`}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-app-muted">
                      Must include upper, lower, number, and symbol.
                    </p>
                  </div>
                  <Button
                    type="submit"
                    fullWidth
                    className="py-3"
                    disabled={resetLoading}
                  >
                    {resetLoading ? 'Resetting…' : 'Reset password'}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Auth;