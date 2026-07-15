import React, { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { createSavedWorldsBackup } from '@/lib/savedWorlds';

export default function SavedWorldManager({ onSelected, compact = false }) {
  const router = useRouter();
  const { savedWorlds, activeWorld, createWorld, selectWorld, deleteWorld, signOut, restoreSavedWorlds, connectionError } = useAuth();
  const [name, setName] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const importRef = useRef(null);

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

  const exportBackup = () => {
    const content = JSON.stringify(createSavedWorldsBackup(savedWorlds), null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `arkyv-saved-worlds-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { setError('Saved-world backups must be smaller than 1 MB.'); return; }
    await run('import', async () => {
      const result = restoreSavedWorlds(JSON.parse(await file.text()));
      if (result.imported === 0) throw new Error('The backup contained no new saved worlds.');
    });
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

      <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-3 sm:p-4">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-amber-200">Identity recovery</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">A backup includes the private identity tokens for every saved world. Keep it secret; anyone with the file can use those identities.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={savedWorlds.length === 0 || Boolean(busyId)} onClick={exportBackup} className="min-h-10 rounded-lg border border-amber-300/30 px-3 text-xs font-semibold text-amber-100 disabled:opacity-40">Back up identities</button>
          <button type="button" disabled={Boolean(busyId)} onClick={() => importRef.current?.click()} className="min-h-10 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 disabled:opacity-40">Restore backup</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importBackup} />
        </div>
      </div>

      {activeWorld && <button type="button" onClick={signOut} className="min-h-11 text-sm font-semibold text-cyan-300 hover:text-white">Log out to the saved-world picker</button>}
    </div>
  );
}
