import React from 'react';
import SavedWorldManager from '@/components/auth/SavedWorldManager';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, subtitle }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="relative w-full max-w-lg rounded-xl border border-cyan-400/40 bg-slate-950 p-8 shadow-[0_0_40px_rgba(0,255,255,0.25)]">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-cyan-300 hover:text-white" aria-label="Close">✕</button>
        <h2 className="mb-3 text-center font-terminal text-2xl uppercase tracking-[0.25em] text-cyan-100">Saved Worlds</h2>
        <p className="mb-6 text-center text-sm text-slate-400">{subtitle || 'Choose a local save or create a new SpacetimeDB identity.'}</p>
        <SavedWorldManager compact onSelected={() => { onClose?.(); onAuthSuccess?.(); }} />
      </div>
    </div>
  );
}

