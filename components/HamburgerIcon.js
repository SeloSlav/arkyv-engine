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

export default function HamburgerIcon({ mobileOnly = false }) {
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

  React.useEffect(() => {
    if (!isOpen || !window.matchMedia('(max-width: 1023px)').matches) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const go = async (path) => {
    setIsOpen(false);
    await router.push(path);
  };

  const goToSection = (sectionId) => {
    setIsOpen(false);
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
    await router.push('/auth');
  };

  const navClass = (path, tone = 'default') => {
    const active = router.pathname === path;
    const base = 'flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-base font-semibold transition lg:min-h-12 lg:px-3.5 lg:text-sm';
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
        className={`fixed right-3 top-3 z-[60] flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-300/25 bg-black/95 shadow-xl shadow-black/40 backdrop-blur-xl transition hover:border-cyan-300/50 hover:bg-slate-900 sm:right-4 sm:top-4 ${mobileOnly ? 'lg:hidden' : ''}`}
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
          className={`arkyv-navigation-panel fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-y-auto bg-[#02040a] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-20 shadow-2xl shadow-black/60 sm:px-6 lg:inset-auto lg:right-4 lg:top-20 lg:block lg:h-auto lg:max-h-[calc(100dvh-5rem)] lg:w-[min(22rem,calc(100vw-2rem))] lg:rounded-2xl lg:border lg:border-slate-700/80 lg:bg-slate-950/95 lg:p-2 lg:backdrop-blur-xl ${mobileOnly ? 'lg:hidden' : ''}`}
        >
          <div className="mb-5 rounded-2xl border border-slate-800 bg-white/[0.025] p-5 lg:mb-2 lg:rounded-xl lg:p-3">
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-cyan-300/70">Arkyv Engine</p>
            <p className="mt-2 truncate text-xl font-bold text-slate-100 lg:mt-1 lg:text-sm lg:font-semibold">{marketingSite ? 'Open-source world engine' : (activeWorld?.name || 'World maker')}</p>
            <p className="mt-1 text-sm text-slate-500 lg:mt-0.5 lg:text-xs">{marketingSite ? 'Self-host Arkyv to build and play' : (user ? 'Saved locally in this browser' : 'Select a saved world to begin')}</p>
          </div>

          <nav className="space-y-2 lg:space-y-1">
            <button type="button" onClick={() => go('/')} className={navClass('/')}><FontAwesomeIcon icon={faHome} className="h-4 w-4 text-slate-500" /><span>Home</span></button>
            {mobileOnly && (
              <>
                <button type="button" onClick={() => goToSection('builder')} className={navClass('#builder')}><span className="grid h-4 w-4 place-items-center text-[0.55rem] font-black text-cyan-300/60" aria-hidden="true">01</span><span>World builder</span></button>
                <button type="button" onClick={() => goToSection('features')} className={navClass('#features')}><span className="grid h-4 w-4 place-items-center text-[0.55rem] font-black text-cyan-300/60" aria-hidden="true">02</span><span>Features</span></button>
                <button type="button" onClick={() => goToSection('architecture')} className={navClass('#architecture')}><span className="grid h-4 w-4 place-items-center text-[0.55rem] font-black text-cyan-300/60" aria-hidden="true">03</span><span>How it works</span></button>
              </>
            )}
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

          <div className="mt-auto border-t border-slate-800 pt-4 lg:mt-2 lg:pt-2">
            <a href="https://github.com/SeloSlav/arkyv-engine" target="_blank" rel="noopener noreferrer" onClick={() => setIsOpen(false)} className="flex min-h-14 items-center gap-3 rounded-xl px-4 text-base text-slate-400 transition hover:bg-white/5 hover:text-cyan-200 lg:min-h-11 lg:px-3.5 lg:text-sm lg:text-slate-500">
              <FontAwesomeIcon icon={faCodeBranch} className="h-4 w-4" /><span>Source on GitHub</span><span className="ml-auto" aria-hidden="true">↗</span>
            </a>
          </div>
        </aside>
      )}
    </>
  );
}
