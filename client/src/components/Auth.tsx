import React, { useState } from 'react';
import { WalletIcon, GoogleIcon, ExclamationTriangleIcon } from './Icons';
import { registerUser, loginUser } from '../services/api';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

interface AuthProps {
  onLoginSuccess: () => void;
}

const Auth: React.FC<AuthProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginView, setIsLoginView] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
        await registerUser(email, password);
        navigate('/verify', { state: { email: email } });
        setError('REGISTRATION_SUCCESSFUL // PLEASE_SIGN_IN');
        setIsLoginView(true);
        setEmail('');
        setPassword('');
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
  };

  const inputClasses = "w-full bg-white border-4 border-ink p-3 md:p-4 font-loud text-base md:text-lg focus:ring-4 md:ring-8 focus:ring-usc-gold focus:outline-none transition-all placeholder:text-ink/50 text-ink";
  const labelClasses = "font-loud text-[10px] uppercase tracking-widest text-ink/40 mb-2 block";

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
              <div className="bg-ink text-usc-cardinal p-4 border-4 border-usc-cardinal flex items-center font-loud text-xs italic uppercase">
                <ExclamationTriangleIcon className="h-5 w-5 mr-3" />
                {error}
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
                  required
                  placeholder="••••••••"
                  autoComplete={isLoginView ? "current-password" : "new-password"}
                  disabled={loading}
                />
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
    </div>
  );
};

export default Auth;