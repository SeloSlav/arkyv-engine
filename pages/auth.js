import React from 'react';
import Head from 'next/head';
import HamburgerIcon from '@/components/HamburgerIcon';
import Footer from '@/components/Footer';
import SavedWorldManager from '@/components/auth/SavedWorldManager';

export default function AuthPage() {
  return (
    <>
      <Head><title>Saved Worlds | Arkyv Engine</title></Head>
      <div className="arkyv-app-shell flex min-h-[100dvh] items-center px-3 py-20 text-white sm:px-6">
        <HamburgerIcon />
        <main className="arkyv-panel mx-auto w-full max-w-2xl overflow-hidden">
          <div className="border-b border-slate-800 bg-gradient-to-br from-cyan-400/[0.08] via-transparent to-fuchsia-400/[0.08] px-5 py-7 text-center sm:px-10 sm:py-9">
            <img src="/arkyv_logo.jpg" alt="Arkyv" className="mx-auto mb-5 h-20 w-20 rounded-2xl border border-cyan-300/20 shadow-xl shadow-cyan-950 sm:h-24 sm:w-24" />
            <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-cyan-300/70">Local profiles</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Choose a saved world</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-400">
              Every save has its own characters, editor content, and identity. The access token stays in this browser—no email or password required.
            </p>
          </div>
          <div className="p-4 sm:p-8"><SavedWorldManager /></div>
        </main>
      </div>
      <Footer color="#050711" />
    </>
  );
}
