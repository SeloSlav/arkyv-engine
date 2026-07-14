import React from 'react';
import Head from 'next/head';
import HamburgerIcon from '@/components/HamburgerIcon';
import Footer from '@/components/Footer';
import SavedWorldManager from '@/components/auth/SavedWorldManager';

export default function AuthPage() {
  return (
    <>
      <Head><title>Saved Worlds | Arkyv Engine</title></Head>
      <div className="min-h-screen bg-black px-4 py-20 text-white">
        <HamburgerIcon />
        <main className="mx-auto max-w-xl rounded-xl border border-cyan-400/35 bg-gradient-to-br from-slate-950 via-purple-950/70 to-slate-950 p-6 shadow-[0_0_40px_rgba(34,211,238,0.15)] md:p-10">
          <img src="/arkyv_logo.jpg" alt="Arkyv" className="mx-auto mb-6 h-24 w-24 rounded-lg" />
          <h1 className="mb-3 text-center font-terminal text-3xl tracking-[0.2em] text-cyan-100 uppercase">Saved Worlds</h1>
          <p className="mb-8 text-center text-sm leading-relaxed text-slate-400">
            Each save has its own SpacetimeDB identity and character roster. Its signed token stays only in this browser—there is no email or password.
          </p>
          <SavedWorldManager />
        </main>
      </div>
      <Footer color="#000000" />
    </>
  );
}

