import React, { useState } from 'react';
import { WalletIcon, GoogleIcon, ExclamationTriangleIcon } from './Icons';
import { registerUser, loginUser, forgotPassword, resetPassword } from '../services/api';
import { useNavigate } from 'react-router-dom';

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
        localStorage.setItem('authToken', data.token);
        onLoginSuccess();
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

  const toggleView = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoginView(!isLoginView);
    setEmail('');
    setPassword('');
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

  const inputClasses = "w-full bg-white border-4 border-ink p-3 md:p-4 font-loud text-base md:text-lg focus:ring-4 md:ring-8 focus:ring-usc-gold focus:outline-none transition-all placeholder:text-ink/50 text-ink";
  const labelClasses = "font-loud text-[10px] uppercase tracking-widest text-ink/40 mb-2 block";
  const passwordScore = scorePassword(password);
  const newPasswordScore = scorePassword(newPassword);

  return (
    <div className="min-h-screen graph-grid flex items-center justify-center p-4 antialiased relative overflow-hidden">
      <div className="noise-overlay" />

      <div className="w-full max-w-md md:max-w-lg bg-bone border-4 md:border-8 border-ink shadow-neo relative z-10 transition-all mx-auto">
        
        {/* HEADER STAMP: USC CARDINAL */}
        <div className="bg-usc-cardinal p-6 md:p-8 border-b-4 md:border-b-8 border-ink">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="font-loud text-3xl md:text-5xl text-bone leading-none tracking-tighter uppercase">
                {isLoginView ? 'SECURE_LOGIN' : 'CREATE_ID'}
              </h1>
              <p className="font-mono text-[10px] text-bone/60 mt-2 uppercase tracking-[0.3em]">
                System_Access // Log_v4.0
              </p>
            </div>
            <WalletIcon className="h-8 w-8 md:h-10 md:w-10 text-usc-gold shrink-0" />
          </div>
        </div>
        
        <div className="p-6 md:p-10">
          <form onSubmit={handleFormSubmit} className="space-y-6 md:space-y-8">
            {/* ALERT BOX */}
            {error && (
              <div id={authErrorId} role="alert" aria-live="assertive" className="bg-ink text-usc-cardinal p-4 border-4 border-usc-cardinal flex items-center font-loud text-xs italic uppercase">
                <ExclamationTriangleIcon className="h-5 w-5 mr-3" />
                {error}
              </div>
            )}
            {successMsg && (
              <div className="bg-green-700 text-bone p-4 border-4 border-ink flex items-center font-loud text-xs uppercase">
                {successMsg}
              </div>
            )}

            <div className="space-y-6">
              <div>
                <label htmlFor="email" className={labelClasses}>CREDENTIAL_EMAIL</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={inputClasses}
                  aria-invalid={!!error}
                  aria-describedby={error ? authErrorId : undefined}
                  required
                  placeholder="USER@USC.EDU"
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="password" className={labelClasses}>SECURE_PASSCODE</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={inputClasses}
                  aria-invalid={!!error}
                  aria-describedby={error ? authErrorId : undefined}
                  required
                  placeholder="••••••••"
                  autoComplete={isLoginView ? "current-password" : "new-password"}
                  disabled={loading}
                />
                {!isLoginView && (
                  <>
                    <div className="mt-2 grid grid-cols-5 gap-1" aria-hidden="true">
                      {Array.from({ length: 5 }, (_, idx) => (
                        <div
                          key={idx}
                          className={`h-1.5 border border-ink ${idx < passwordScore ? 'bg-usc-gold' : 'bg-white'}`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-ink/60">
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
                    className="mt-2 font-loud text-[9px] uppercase tracking-widest text-usc-cardinal hover:text-ink transition-colors underline decoration-1 underline-offset-2"
                  >
                    FORGOT_PASSCODE?
                  </button>
                )}
              </div>
            </div>

            <button 
              type="submit" 
              className="w-full bg-usc-gold text-ink font-loud text-lg md:text-2xl py-4 md:py-5 border-4 border-ink shadow-neo active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50"
              disabled={loading}
            >
              {loading 
                ? (isLoginView ? 'SYNCING...' : 'INITIALIZING...') 
                : (isLoginView ? 'INITIALIZE_SESSION' : 'GENERATE_CREDENTIALS')}
            </button>
          </form>
          
          {/* VISUAL DIVIDER */}
          <div className="relative my-10 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-4 border-dashed border-ink/20" />
            </div>
            <span className="relative bg-bone px-4 font-loud text-[10px] text-ink/40 uppercase">
              Auth_Gateway_Switch
            </span>
          </div>

          {/* GOOGLE SSO BUTTON */}
          <a 
            href={`${API_BASE_URL}/auth/google`} 
            className="w-full flex items-center justify-center py-4 md:py-5 px-4 bg-white border-4 border-ink text-ink font-loud text-base md:text-lg shadow-neo active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
          >
            <GoogleIcon className="h-5 w-5 md:h-6 md:w-6 mr-3 md:mr-4" />
            <span>GOOGLE_SSO_ACCESS</span>
          </a>

          {/* VIEW TOGGLE */}
          <p className="text-center mt-8 md:mt-10">
            <a 
              href="#" 
              onClick={toggleView} 
              className="font-loud text-[10px] md:text-xs uppercase tracking-widest text-ink hover:text-usc-cardinal transition-colors underline decoration-2 md:decoration-4 decoration-usc-gold underline-offset-4"
            >
              {isLoginView ? 'Switch to [Account_Registration]' : 'Switch to [Secure_Login]'}
            </a>
          </p>
        </div>

        {/* FOOTER TECHNICAL STAMP */}
        <div className="p-4 bg-ink text-white font-mono text-[8px] flex justify-between uppercase select-none tracking-[0.2em]">
          <span>Fight_On_Security_Shield</span>
          <span>© TROJAN_FIN_SYSTEM_2025</span>
        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={closeForgotPasswordModal} />
          <div className="relative w-full max-w-md bg-bone border-4 border-ink shadow-neo z-10">
            <div className="bg-usc-cardinal p-5 border-b-4 border-ink flex justify-between items-center">
              <h2 className="font-loud text-xl text-bone uppercase tracking-tight">
                {resetStep === 'email' ? 'RESET_PASSCODE' : 'ENTER_RESET_CODE'}
              </h2>
              <button
                type="button"
                onClick={closeForgotPasswordModal}
                className="text-bone hover:text-usc-gold transition-colors font-loud text-2xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-5">
              {resetError && (
                <div id={resetErrorId} role="alert" aria-live="assertive" className="bg-ink text-usc-cardinal p-3 border-4 border-usc-cardinal font-loud text-xs italic uppercase flex items-center">
                  <ExclamationTriangleIcon className="h-4 w-4 mr-2 shrink-0" />
                  {resetError}
                </div>
              )}

              {resetStep === 'email' ? (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-5">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-ink/60">
                    Enter your registered email to receive a reset code.
                  </p>
                  <div>
                    <label htmlFor="reset-email" className={labelClasses}>EMAIL_ADDRESS</label>
                    <input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      className={inputClasses}
                      aria-invalid={!!resetError}
                      aria-describedby={resetError ? resetErrorId : undefined}
                      required
                      placeholder="USER@USC.EDU"
                      disabled={resetLoading}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full bg-usc-gold text-ink font-loud text-base py-3 border-4 border-ink shadow-neo active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 uppercase"
                  >
                    {resetLoading ? 'TRANSMITTING...' : 'SEND_RESET_CODE'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-5">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-ink/60">
                    Enter the 6-digit code sent to {resetEmail}.
                  </p>
                  <div>
                    <label htmlFor="reset-code" className={labelClasses}>RESET_CODE</label>
                    <input
                      id="reset-code"
                      type="text"
                      value={resetCode}
                      onChange={e => setResetCode(e.target.value)}
                      className={inputClasses}
                      aria-invalid={!!resetError}
                      aria-describedby={resetError ? resetErrorId : undefined}
                      required
                      placeholder="000000"
                      maxLength={6}
                      disabled={resetLoading}
                    />
                  </div>
                  <div>
                    <label htmlFor="new-password" className={labelClasses}>NEW_PASSCODE</label>
                    <input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className={inputClasses}
                      aria-invalid={!!resetError}
                      aria-describedby={resetError ? resetErrorId : undefined}
                      required
                      placeholder="••••••••"
                      disabled={resetLoading}
                    />
                    <div className="mt-2 grid grid-cols-5 gap-1" aria-hidden="true">
                      {Array.from({ length: 5 }, (_, idx) => (
                        <div
                          key={idx}
                          className={`h-1.5 border border-ink ${idx < newPasswordScore ? 'bg-usc-gold' : 'bg-white'}`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-ink/60">
                      Must include upper, lower, number, and symbol.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full bg-usc-gold text-ink font-loud text-base py-3 border-4 border-ink shadow-neo active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 uppercase"
                  >
                    {resetLoading ? 'RESETTING...' : 'RESET_PASSCODE'}
                  </button>
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