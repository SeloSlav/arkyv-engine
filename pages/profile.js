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

  if (loading || !user) return <div className="min-h-screen bg-black p-20 text-center font-terminal text-cyan-300">Loading…</div>;

  return (
    <>
      <div className="min-h-screen bg-black px-4 py-20 text-white">
        <HamburgerIcon />
        <main className="mx-auto max-w-3xl space-y-8">
          <header className="text-center">
            <h1 className="font-terminal text-4xl uppercase tracking-[0.2em] text-cyan-100">Saved World Settings</h1>
            <p className="mt-3 text-sm text-slate-500">{activeWorld?.name} · {user.id.slice(0, 16)}…</p>
          </header>
          {(message || error) && <div className={`rounded border p-3 ${error ? 'border-red-500/40 text-red-300' : 'border-green-500/40 text-green-300'}`}>{error || message}</div>}
          <section className="rounded-xl border border-cyan-400/30 bg-slate-950 p-6">
            <h2 className="mb-4 font-terminal text-xl text-cyan-100">Display handle</h2>
            <form onSubmit={saveHandle} className="flex gap-3">
              <input value={handle} onChange={(event) => setHandle(event.target.value)} maxLength={30} className="min-w-0 flex-1 rounded border border-cyan-400/30 bg-black px-4 py-2" />
              <button className="rounded bg-cyan-300 px-4 py-2 font-semibold text-black">Save</button>
            </form>
          </section>
          <section className="rounded-xl border border-cyan-400/30 bg-slate-950 p-6">
            <h2 className="mb-2 font-terminal text-xl text-cyan-100">All local saves</h2>
            <p className="mb-5 text-sm text-slate-500">Switching disconnects the current identity and reconnects with the selected save token.</p>
            <SavedWorldManager compact />
          </section>
        </main>
      </div>
      <Footer color="#000000" />
    </>
  );
}
