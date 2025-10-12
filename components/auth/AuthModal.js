import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import getSupabaseClient from '@/lib/supabaseClient';

const AuthModal = ({ isOpen, onClose, mode: initialMode = 'signin', onAuthSuccess, subtitle }) => {
  const [mode, setMode] = useState(initialMode); // 'signin', 'signup', or 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { signIn, signUp } = useAuth();
  const supabase = getSupabaseClient();

  // ESC key handler
  React.useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        await signIn(email, password);
        setMessage('Successfully signed in!');
        setTimeout(() => {
          onClose();
          if (onAuthSuccess) {
            onAuthSuccess();
          }
        }, 500);
      } else if (mode === 'signup') {
        // Validate password confirmation
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        
        await signUp(email, password);
        setMessage('Account created! Please check your email to verify your account.');
        setTimeout(() => {
          onClose();
          if (onAuthSuccess) {
            onAuthSuccess();
          }
        }, 2000);
      } else if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: `${window.location.origin}/profile`,
          }
        );
        if (resetError) throw resetError;
        setMessage('Password reset email sent! Check your inbox for instructions.');
        setTimeout(() => {
          setMode('signin');
          setMessage('');
        }, 3000);
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md mx-4 p-8 rounded-xl border border-cyan-400/40 bg-gradient-to-br from-slate-900/95 via-purple-900/90 to-slate-900/95 shadow-[0_0_40px_rgba(0,255,255,0.3)]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-cyan-300 hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="font-terminal text-2xl text-center text-cyan-100 tracking-[0.35em] uppercase mb-4">
          {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Join the Babushkaverse' : 'Reset Password'}
        </h2>

        {mode === 'signup' && (
          <p className="text-slate-300 text-center text-sm mb-6 leading-relaxed">
            Get early access to new chapters, exclusive content, and be the first to know about upcoming releases in the Babushka universe.
          </p>
        )}

        {subtitle && (
          <p className="text-slate-300 text-center text-sm mb-6 leading-relaxed">
            {subtitle}
          </p>
        )}

        {mode === 'forgot' && (
          <p className="text-slate-300 text-center text-sm mb-6">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="block text-cyan-200 text-sm font-terminal tracking-wider mb-2">
              Email
            </label>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-black/50 border border-cyan-400/30 rounded-md text-white focus:outline-none focus:border-hot-pink/60 transition-colors"
              placeholder="your@email.com"
              required
            />
          </div>

          {mode !== 'forgot' && (
            <>
              <div>
                <label htmlFor="auth-password" className="block text-cyan-200 text-sm font-terminal tracking-wider mb-2">
                  Password
                </label>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-black/50 border border-cyan-400/30 rounded-md text-white focus:outline-none focus:border-hot-pink/60 transition-colors"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              
              {mode === 'signup' && (
                <div>
                  <label htmlFor="auth-confirm-password" className="block text-cyan-200 text-sm font-terminal tracking-wider mb-2">
                    Confirm Password
                  </label>
                  <input
                    id="auth-confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2 bg-black/50 border border-cyan-400/30 rounded-md text-white focus:outline-none focus:border-hot-pink/60 transition-colors"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
              )}
            </>
          )}

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-md text-red-200 text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-md text-green-200 text-sm">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-md bg-gradient-to-r from-hot-pink/80 via-cyber-purple/80 to-electric-blue/70 text-white font-semibold text-sm tracking-[0.3em] uppercase shadow-[0_0_25px_rgba(255,20,147,0.25)] hover:shadow-[0_0_35px_rgba(255,20,147,0.4)] transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-3">
          {mode === 'signin' && (
            <div>
              <button
                onClick={() => {
                  setMode('forgot');
                  setError('');
                  setMessage('');
                  setConfirmPassword('');
                }}
                className="text-cyan-300 hover:text-white text-sm transition-colors underline underline-offset-2"
              >
                Forgot your password?
              </button>
            </div>
          )}
          
          <button
            onClick={() => {
              if (mode === 'forgot') {
                setMode('signin');
              } else {
                setMode(mode === 'signin' ? 'signup' : 'signin');
              }
              setError('');
              setMessage('');
              setConfirmPassword('');
            }}
            className="text-cyan-300 hover:text-white text-sm transition-colors"
          >
            {mode === 'signin' 
              ? "Don't have an account? Sign up" 
              : mode === 'signup'
              ? 'Already have an account? Sign in'
              : 'Back to sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;

