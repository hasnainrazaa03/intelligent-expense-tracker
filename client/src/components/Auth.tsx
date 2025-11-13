import React, { useState } from 'react';
import { WalletIcon, GoogleIcon } from './Icons';
import { registerUser, loginUser } from '../services/api'; // Import our new functions

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

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLoginView) {
        // --- Login ---
        const data = await loginUser(email, password);
        // Save the token to localStorage. This is our new "isAuthenticated"
        localStorage.setItem('authToken', data.token);
        onLoginSuccess();
      } else {
        // --- Sign Up ---
        await registerUser(email, password);
        // After successful sign-up, show a success message and switch to login view
        setError('Registration successful! Please sign in.');
        setIsLoginView(true);
        setEmail(''); // Clear email for login
        setPassword(''); // Clear password for login
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Mock Google login (we can wire this up later)
  const handleGoogleLogin = () => {
    setError('Google login is not implemented yet.');
    // In a real app, this would trigger the Google OAuth flow.
    // onLoginSuccess();
  };

  const toggleView = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoginView(!isLoginView);
    setEmail('');
    setPassword('');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-base-200 dark:bg-dark-100 flex items-center justify-center p-4 antialiased">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
            <WalletIcon className="h-12 w-12 text-brand-primary mx-auto" />
            <h1 className="text-3xl font-bold text-base-content dark:text-base-100 mt-4 tracking-tight">
                {isLoginView ? 'Welcome Back' : 'Create an Account'}
            </h1>
            <p className="text-base-content-secondary dark:text-base-300 mt-2">
                {isLoginView ? 'Sign in to manage your expenses.' : 'Get started by creating your account.'}
            </p>
        </div>
        
        <div className="bg-base-100 dark:bg-dark-200 p-8 rounded-2xl shadow-lg">
            <form onSubmit={handleFormSubmit} className="space-y-6">
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Email address</label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="mt-1 block w-full bg-base-200 dark:bg-dark-300 border-transparent focus:border-brand-primary focus:ring-brand-primary rounded-md shadow-sm text-base-content dark:text-base-200 px-4 py-3"
                        required
                        placeholder="you@example.com"
                        autoComplete="email"
                        disabled={loading}
                    />
                </div>
                 <div>
                    <label htmlFor="password"className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="mt-1 block w-full bg-base-200 dark:bg-dark-300 border-transparent focus:border-brand-primary focus:ring-brand-primary rounded-md shadow-sm text-base-content dark:text-base-200 px-4 py-3"
                        required
                        placeholder="••••••••"
                        autoComplete={isLoginView ? "current-password" : "new-password"}
                        disabled={loading}
                    />
                </div>

                {/* --- Error Message Display --- */}
                {error && (
                  <div className="text-center text-sm text-red-500">
                    {error}
                  </div>
                )}

                <button type="submit" className="w-full py-3 px-4 bg-brand-primary text-white font-semibold rounded-lg shadow-md hover:bg-brand-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary transition-colors disabled:bg-gray-400" disabled={loading}>
                    {loading ? (isLoginView ? 'Signing In...' : 'Creating Account...') : (isLoginView ? 'Sign In' : 'Sign Up')}
                </button>
            </form>
            
            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-base-300 dark:border-dark-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-base-100 dark:bg-dark-200 text-base-content-secondary dark:text-base-300">Or continue with</span>
                </div>
            </div>
            
            <a href={`${API_BASE_URL}/auth/google`} className="w-full flex items-center justify-center py-3 px-4 bg-base-100 dark:bg-dark-200 border border-base-300 dark:border-dark-300 text-base-content dark:text-base-100 font-medium rounded-lg shadow-sm hover:bg-base-200 dark:hover:bg-dark-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary transition-colors">
            <GoogleIcon className="h-5 w-5 mr-3" />
            <span>Sign in with Google</span>
            </a>

            <p className="text-center text-sm text-base-content-secondary dark:text-base-300 mt-8">
                {isLoginView ? "Don't have an account?" : "Already have an account?"}{' '}
                <a href="#" onClick={toggleView} className="font-medium text-brand-primary hover:text-brand-secondary">
                    {isLoginView ? 'Sign up' : 'Sign in'}
                </a>
            </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;