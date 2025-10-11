import React from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import HamburgerIcon from '@/components/HamburgerIcon';
import Footer from '@/components/Footer';

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background Grid Effect */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20"></div>
        
        {/* Cyan Glow Effect */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        
        <div className="w-full max-w-4xl text-center relative z-10">
          {/* Logo */}
          <div className="mb-8">
            <img
              src="/arkyv_logo.jpg"
              alt="Arkyv Logo"
              className="w-48 h-48 mx-auto mb-6 drop-shadow-2xl rounded-xl border-4 border-cyan-500/30 shadow-lg shadow-cyan-500/50"
            />
          </div>
          
          {/* Title */}
          <h1 className="text-5xl sm:text-7xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-lg uppercase tracking-[0.15em]">
            ARKYV ENGINE
          </h1>
          
          {/* Subtitle */}
          <p className="text-cyan-400 font-terminal text-lg sm:text-2xl mb-2 uppercase tracking-[0.25em]">
            Open-Source Multi-User Dungeon
          </p>
          
          {/* Description */}
          <p className="text-slate-400 font-terminal text-base mb-12 max-w-2xl mx-auto leading-relaxed">
            A text-based virtual world where players explore interconnected regions, 
            interact with AI-powered NPCs, and shape emergent narratives through collaborative gameplay.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <button
              onClick={() => router.push(user ? '/play' : '/auth')}
              className="px-10 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-400 transition-all text-lg shadow-lg shadow-cyan-500/50 hover:shadow-cyan-400/60 hover:scale-105 transform uppercase tracking-[0.15em]"
            >
              {user ? 'Enter World' : 'Sign In to Play'}
            </button>
            
            <button
              onClick={() => router.push('/setup')}
              className="px-8 py-3 bg-slate-800/80 backdrop-blur-sm border-2 border-cyan-500/50 text-cyan-400 font-semibold rounded-lg hover:bg-slate-700 hover:border-cyan-400 transition-all hover:shadow-lg hover:shadow-cyan-500/30 uppercase tracking-[0.1em]"
            >
              Setup Guide & Documentation
            </button>
          </div>
          
          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center gap-3 text-slate-400 text-xs">
            <span className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full backdrop-blur-sm uppercase tracking-[0.15em]">
              Next.js 15
            </span>
            <span className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full backdrop-blur-sm uppercase tracking-[0.15em]">
              AI-Powered NPCs
            </span>
            <span className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full backdrop-blur-sm uppercase tracking-[0.15em]">
              Real-time Multiplayer
            </span>
            <span className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full backdrop-blur-sm uppercase tracking-[0.15em]">
              Open Source
            </span>
          </div>
        </div>
        
        <HamburgerIcon />
      </div>
      
      <Footer color="#000000" />
    </>
  );
}

