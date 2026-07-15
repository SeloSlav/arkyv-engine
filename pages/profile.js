import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import HamburgerIcon from '@/components/HamburgerIcon';
import Footer from '@/components/Footer';
import SavedWorldManager from '@/components/auth/SavedWorldManager';
import { useAuth } from '@/contexts/AuthContext';
import getSpacetimeClient from '@/lib/spacetimedbClient';

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, activeWorld, loading, refreshProfile } = useAuth();
  const [handle, setHandle] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => setHandle(profile?.handle || ''), [profile]);
  useEffect(() => {
    if (!loading && !user) router.replace('/auth');
  }, [loading, user, router]);

  const saveHandle = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const { error: updateError } = await getSpacetimeClient().from('profiles').update({ handle: handle.trim() }).eq('id', user.id);
    if (updateError) setError(updateError.message);
    else {
      await refreshProfile();
      setMessage('Handle updated.');
    }
  };

  if (loading || !user) return <div className="arkyv-app-shell min-h-screen p-20 text-center font-terminal text-cyan-300">Loading…</div>;

  return (
    <>
      <div className="arkyv-app-shell min-h-[100dvh] px-3 py-20 text-white sm:px-6">
        <HamburgerIcon />
        <main className="mx-auto max-w-3xl space-y-6 sm:space-y-8">
          <header className="text-center">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-cyan-300/70">Local profile</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Saved world settings</h1>
            <p className="mt-3 text-sm text-slate-500">{activeWorld?.name} · {user.id.slice(0, 16)}…</p>
          </header>
          {(message || error) && <div className={`rounded-lg border p-3 text-sm ${error ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-green-500/40 bg-green-500/10 text-green-300'}`}>{error || message}</div>}
          <section className="arkyv-panel p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-cyan-100">Display handle</h2>
            <form onSubmit={saveHandle} className="flex flex-col gap-3 sm:flex-row">
              <input value={handle} onChange={(event) => setHandle(event.target.value)} maxLength={30} className="min-h-12 min-w-0 flex-1 rounded-lg border border-slate-700 bg-black/40 px-4 focus:border-cyan-300" />
              <button className="min-h-12 rounded-lg bg-cyan-300 px-5 font-semibold text-black">Save handle</button>
            </form>
          </section>
          <section className="arkyv-panel p-4 sm:p-6">
            <h2 className="mb-2 text-lg font-semibold text-cyan-100">All local saves</h2>
            <p className="mb-5 text-sm leading-6 text-slate-500">Switching disconnects the current identity and reconnects with the selected save token.</p>
            <SavedWorldManager compact />
          </section>
        </main>
      </div>
      <Footer color="#050711" />
    </>
  );
}
