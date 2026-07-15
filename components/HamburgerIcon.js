import React, { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import useMarketingSite from '@/lib/useMarketingSite';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHome,
  faBook,
  faGamepad,
  faUser,
  faShield,
  faRightFromBracket,
  faRightToBracket,
  faCodeBranch,
} from '@fortawesome/free-solid-svg-icons';

export default function HamburgerIcon() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const router = useRouter();
  const { user, profile, activeWorld, signOut } = useAuth();
  const marketingSite = useMarketingSite();

  React.useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return undefined;
    let closeTimer;
    const handleClickOutside = (event) => {
      if (triggerRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      closeTimer = window.setTimeout(() => setIsOpen(false), 0);
    };
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.clearTimeout(closeTimer);
    };
  }, [isOpen]);

  const go = async (path) => {
    setIsOpen(false);
    await router.push(path);
  };

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
    await router.push('/auth');
  };

  const navClass = (path, tone = 'default') => {
    const active = router.pathname === path;
    const base = 'flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-semibold transition';
    if (active) return `${base} border border-cyan-300/20 bg-cyan-300/10 text-cyan-100`;
    if (tone === 'primary') return `${base} bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-950/60 hover:from-cyan-400 hover:to-blue-500`;
    if (tone === 'danger') return `${base} text-rose-300 hover:bg-rose-400/10 hover:text-rose-200`;
    return `${base} text-slate-300 hover:bg-white/5 hover:text-white`;
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="fixed right-3 top-3 z-50 flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-300/25 bg-slate-950/90 shadow-xl shadow-black/40 backdrop-blur-xl transition hover:border-cyan-300/50 hover:bg-slate-900 sm:right-4 sm:top-4"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls="arkyv-navigation-menu"
      >
        <span className="flex h-5 w-6 flex-col justify-between" aria-hidden="true">
          <span className={`block h-0.5 rounded bg-cyan-300 transition ${isOpen ? 'translate-y-[9px] rotate-45' : ''}`} />
          <span className={`block h-0.5 rounded bg-cyan-300 transition ${isOpen ? 'opacity-0' : ''}`} />
          <span className={`block h-0.5 rounded bg-cyan-300 transition ${isOpen ? '-translate-y-[9px] -rotate-45' : ''}`} />
        </span>
      </button>

      {isOpen && (
        <aside
          ref={panelRef}
          id="arkyv-navigation-menu"
          role="menu"
          aria-label="Main navigation"
          className="arkyv-panel fixed right-3 top-[4.25rem] z-40 max-h-[calc(100dvh-5rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto p-2 shadow-2xl shadow-black/60 sm:right-4 sm:top-20"
        >
          <div className="mb-2 rounded-xl border border-slate-800 bg-black/25 p-3">
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-cyan-300/70">Arkyv Engine</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-100">{marketingSite ? 'Open-source world engine' : (activeWorld?.name || 'World maker')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{marketingSite ? 'Self-host Arkyv to build and play' : (user ? 'Saved locally in this browser' : 'Select a saved world to begin')}</p>
          </div>

          <nav className="space-y-1">
            <button type="button" onClick={() => go('/')} className={navClass('/')}><FontAwesomeIcon icon={faHome} className="h-4 w-4 text-slate-500" /><span>Home</span></button>
            <button type="button" onClick={() => go('/setup')} className={navClass('/setup')}><FontAwesomeIcon icon={faBook} className="h-4 w-4 text-slate-500" /><span>Setup guide</span></button>

            {!marketingSite && (user ? (
              <>
                <button type="button" onClick={() => go('/play')} className={navClass('/play', 'primary')}><FontAwesomeIcon icon={faGamepad} className="h-4 w-4" /><span>Play world</span></button>
                {profile?.is_admin && <button type="button" onClick={() => go('/admin')} className={navClass('/admin')}><FontAwesomeIcon icon={faShield} className="h-4 w-4 text-slate-500" /><span>World editor</span></button>}
                <button type="button" onClick={() => go('/profile')} className={navClass('/profile')}><FontAwesomeIcon icon={faUser} className="h-4 w-4 text-slate-500" /><span>Saved world</span></button>
                <button type="button" onClick={handleSignOut} className={navClass('/auth', 'danger')}><FontAwesomeIcon icon={faRightFromBracket} className="h-4 w-4" /><span>Switch world</span></button>
              </>
            ) : (
              <button type="button" onClick={() => go('/auth')} className={navClass('/auth', 'primary')}><FontAwesomeIcon icon={faRightToBracket} className="h-4 w-4" /><span>Choose saved world</span></button>
            ))}
          </nav>

          <div className="mt-2 border-t border-slate-800 pt-2">
            <a href="https://github.com/SeloSlav/arkyv-engine" target="_blank" rel="noopener noreferrer" onClick={() => setIsOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm text-slate-500 transition hover:bg-white/5 hover:text-cyan-200">
              <FontAwesomeIcon icon={faCodeBranch} className="h-4 w-4" /><span>Source on GitHub</span><span className="ml-auto" aria-hidden="true">↗</span>
            </a>
          </div>
        </aside>
      )}
    </>
  );
}
