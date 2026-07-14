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
      {(error || connectionError) && (
        <div className="rounded-md border border-red-500/50 bg-red-500/15 p-3 text-sm text-red-200">
          {error || connectionError}
        </div>
      )}

      {savedWorlds.length > 0 && (
        <div className="space-y-3">
          {savedWorlds.map((world) => (
            <div key={world.id} className="flex items-center gap-3 rounded-lg border border-cyan-400/25 bg-black/40 p-3">
              <button
                type="button"
                onClick={() => handleSelect(world)}
                disabled={Boolean(busyId)}
                className="min-w-0 flex-1 text-left disabled:opacity-50"
              >
                <div className="truncate font-terminal text-cyan-100">{world.name}</div>
                <div className="mt-1 truncate text-xs text-slate-500">
                  {world.identity ? `Identity ${world.identity.slice(0, 12)}…` : 'Identity will be created on first entry'}
                </div>
              </button>
              {activeWorld?.id === world.id && <span className="text-xs uppercase tracking-wider text-green-300">active</span>}
              <button
                type="button"
                onClick={() => handleDelete(world)}
                disabled={Boolean(busyId)}
                className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} className="flex gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          placeholder="New saved world name"
          className="min-w-0 flex-1 rounded-md border border-cyan-400/30 bg-black/50 px-4 py-2 text-white outline-none focus:border-cyan-300"
          required
        />
        <button
          type="submit"
          disabled={Boolean(busyId)}
          className="rounded-md bg-cyan-300 px-4 py-2 font-semibold text-black hover:bg-cyan-200 disabled:opacity-50"
        >
          {busyId === 'create' ? 'Creating…' : 'Create'}
        </button>
      </form>

      {activeWorld && (
        <button type="button" onClick={signOut} className="text-sm text-cyan-300 hover:text-white">
          Log out to the saved-world picker
        </button>
      )}
    </div>
  );
}

