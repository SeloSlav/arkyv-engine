import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faHome, 
  faBook, 
  faGamepad, 
  faUser, 
  faShield, 
  faRightFromBracket,
  faRightToBracket,
  faCodeBranch
} from '@fortawesome/free-solid-svg-icons';

export default function HamburgerIcon() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { user, profile, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Add ESC key handler to close menu
  React.useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 right-4 z-50 p-3 bg-slate-900 border-2 border-cyan-500/30 rounded-xl hover:bg-slate-800 hover:border-cyan-400 transition-all shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 block"
        aria-label="Menu"
      >
        <div className="w-6 h-5 flex flex-col justify-between">
          <span className={`block h-0.5 bg-cyan-400 transition-all ${isOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
          <span className={`block h-0.5 bg-cyan-400 transition-all ${isOpen ? 'opacity-0' : ''}`}></span>
          <span className={`block h-0.5 bg-cyan-400 transition-all ${isOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
        </div>
      </button>

      {isOpen && (
        <div className="fixed top-16 right-4 z-40 bg-slate-900 border border-cyan-500/30 rounded-xl shadow-2xl shadow-cyan-500/20 backdrop-blur-md w-[280px] max-w-[calc(100vw-2rem)] overflow-hidden">
          <div className="p-2">
            <nav className="space-y-1">
              {/* Home */}
              <button
                onClick={() => {
                  router.push('/');
                  setIsOpen(false);
                }}
                className="flex items-center gap-3 w-full text-left px-4 py-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all font-terminal uppercase tracking-[0.1em] text-sm"
              >
                <FontAwesomeIcon icon={faHome} className="w-4 h-4 text-slate-400" />
                <span>Home</span>
              </button>
              
              {/* Setup Guide */}
              <button
                onClick={() => {
                  router.push('/setup');
                  setIsOpen(false);
                }}
                className="flex items-center gap-3 w-full text-left px-4 py-3 text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-all font-terminal uppercase tracking-[0.1em] text-sm"
              >
                <FontAwesomeIcon icon={faBook} className="w-4 h-4" />
                <span>Setup Guide</span>
              </button>
              
              {user && (
                <>
                  {/* Play - Highlighted */}
                  <button
                    onClick={() => {
                      router.push('/play');
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 rounded-lg transition-all font-terminal font-bold shadow-md shadow-cyan-500/50 uppercase tracking-[0.15em] text-sm"
                  >
                    <FontAwesomeIcon icon={faGamepad} className="w-4 h-4" />
                    <span>Play</span>
                  </button>
                  
                  {/* Profile */}
                  <button
                    onClick={() => {
                      router.push('/profile');
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all font-terminal uppercase tracking-[0.1em] text-sm"
                  >
                    <FontAwesomeIcon icon={faUser} className="w-4 h-4 text-slate-400" />
                    <span>Profile</span>
                  </button>
                  
                  {/* Admin - Only show for admins */}
                  {profile?.is_admin && (
                    <button
                      onClick={() => {
                        router.push('/admin');
                        setIsOpen(false);
                      }}
                      className="flex items-center gap-3 w-full text-left px-4 py-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all font-terminal uppercase tracking-[0.1em] text-sm"
                    >
                      <FontAwesomeIcon icon={faShield} className="w-4 h-4 text-slate-400" />
                      <span>Admin</span>
                    </button>
                  )}
                  
                  <div className="my-2 border-t border-slate-700"></div>
                  
                  {/* Sign Out */}
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded-lg transition-all font-terminal uppercase tracking-[0.1em] text-sm"
                  >
                    <FontAwesomeIcon icon={faRightFromBracket} className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </>
              )}
              
              {!user && (
                <button
                  onClick={() => {
                    router.push('/auth');
                    setIsOpen(false);
                  }}
                  className="flex items-center gap-3 w-full text-left px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 rounded-lg transition-all font-terminal font-bold shadow-md shadow-cyan-500/50 uppercase tracking-[0.15em] text-sm"
                >
                  <FontAwesomeIcon icon={faRightToBracket} className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
              )}
            </nav>
            
            {/* GitHub Link */}
            <div className="mt-2 pt-2 border-t border-slate-700">
              <a
                href="https://github.com/SeloSlav/arkyv-engine"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-4 py-3 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition-all font-terminal uppercase tracking-[0.1em] text-sm"
              >
                <FontAwesomeIcon icon={faCodeBranch} className="w-4 h-4" />
                <span>GitHub</span>
                <span className="ml-auto text-xs">↗</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-30"
        />
      )}
    </>
  );
}

