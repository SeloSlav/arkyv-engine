import React, { useState, useEffect } from 'react';

const ConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmStyle = 'danger', // 'danger' or 'primary'
  loading = false,
  requiresEmailConfirmation = false,
  userEmail = ''
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEmailInput('');
      setEmailError('');
    }
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  const handleConfirm = () => {
    if (requiresEmailConfirmation) {
      if (emailInput.trim() !== userEmail.trim()) {
        setEmailError('Email address does not match. Please try again.');
        return;
      }
    }
    onConfirm();
  };

  const confirmButtonClasses = confirmStyle === 'danger'
    ? 'bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 shadow-[0_0_25px_rgba(239,68,68,0.3)] hover:shadow-[0_0_35px_rgba(239,68,68,0.5)]'
    : 'bg-gradient-to-r from-hot-pink via-cyber-purple to-electric-blue hover:shadow-[0_0_35px_rgba(255,20,147,0.4)] shadow-[0_0_25px_rgba(255,20,147,0.25)]';

  const isConfirmDisabled = loading || (requiresEmailConfirmation && emailInput.trim() !== userEmail.trim());

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md mx-4 p-8 rounded-xl border border-cyan-400/40 bg-gradient-to-br from-slate-900/95 via-purple-900/90 to-slate-900/95 shadow-[0_0_40px_rgba(0,255,255,0.3)]">
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 text-cyan-300 hover:text-white transition-colors disabled:opacity-50"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="font-terminal text-xl text-center text-cyan-100 tracking-[0.25em] uppercase mb-6">
          {title}
        </h2>

        <p className="text-slate-300 text-center leading-relaxed mb-6">
          {message}
        </p>

        {requiresEmailConfirmation && (
          <div className="mb-6">
            <label className="block text-cyan-200 text-sm font-terminal tracking-wider mb-2">
              Type your email to confirm
            </label>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                setEmailError('');
              }}
              placeholder={userEmail}
              className="w-full px-4 py-3 bg-black/50 border border-cyan-400/30 rounded-md text-white focus:outline-none focus:border-red-500/60 transition-colors"
              disabled={loading}
            />
            {emailError && (
              <p className="mt-2 text-red-400 text-sm">{emailError}</p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-md border border-cyan-400/40 bg-black/50 text-cyan-300 hover:text-white hover:border-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`flex-1 py-3 rounded-md text-white font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${confirmButtonClasses}`}
          >
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;

