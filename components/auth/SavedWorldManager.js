import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

export default function SavedWorldManager({ onSelected, compact = false }) {
  const router = useRouter();
  const { savedWorlds, activeWorld, createWorld, selectWorld, deleteWorld, signOut, connectionError } = useAuth();
  const [name, setName] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const run = async (id, action) => {
    setBusyId(id);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = (event) => {
    event.preventDefault();
    run('create', async () => {
      await createWorld(name);
      setName('');
      onSelected?.();
      if (!onSelected) await router.push('/play');
    });
  };

  const handleSelect = (world) => run(world.id, async () => {
    await selectWorld(world.id);
    onSelected?.();
    if (!onSelected) await router.push('/play');
  });

  const handleDelete = (world) => {
    if (!window.confirm(`Permanently delete “${world.name}” and its characters? This cannot be undone.`)) return;
    run(`delete:${world.id}`, () => deleteWorld(world.id));
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {(error || connectionError) && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error || connectionError}</div>}

      {savedWorlds.length > 0 && (
        <div className="space-y-2.5">
          {savedWorlds.map((world) => (
            <div key={world.id} className={`flex items-center gap-3 rounded-xl border p-3 transition sm:p-4 ${activeWorld?.id === world.id ? 'border-cyan-300/30 bg-cyan-300/[0.07]' : 'border-slate-800 bg-black/25 hover:border-slate-700'}`}>
              <button type="button" onClick={() => handleSelect(world)} disabled={Boolean(busyId)} className="min-h-11 min-w-0 flex-1 text-left disabled:opacity-50">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-slate-100">{world.name}</span>
                  {activeWorld?.id === world.id && <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider text-emerald-300">active</span>}
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">{world.identity ? `Identity ${world.identity.slice(0, 12)}…` : 'Identity will be created on first entry'}</div>
              </button>
              <button type="button" onClick={() => handleDelete(world)} disabled={Boolean(busyId)} className="min-h-10 rounded-lg border border-red-500/25 px-3 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50">Delete</button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} className="rounded-xl border border-slate-800 bg-black/25 p-3 sm:p-4">
        <label htmlFor="saved-world-name" className="mb-2 block text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Create another world</label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input id="saved-world-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="New saved world name" className="min-h-12 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/80 px-4 text-white outline-none placeholder:text-slate-600 focus:border-cyan-300" required />
          <button type="submit" disabled={Boolean(busyId)} className="min-h-12 rounded-lg bg-cyan-300 px-5 font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">{busyId === 'create' ? 'Creating…' : 'Create world'}</button>
        </div>
      </form>

      {activeWorld && <button type="button" onClick={signOut} className="min-h-11 text-sm font-semibold text-cyan-300 hover:text-white">Log out to the saved-world picker</button>}
    </div>
  );
}
