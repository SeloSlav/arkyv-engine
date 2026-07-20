import React, { useEffect, useMemo, useRef, useState } from 'react';
import getSpacetimeClient from '@/lib/spacetimedbClient';
import {
  collectArchieWorld,
  summarizeArchieOperations,
} from '@/lib/archieWorld';

const QUICK_PROMPTS = [
  'Make a small dungeon connected to Lantern Square with a locked shortcut, treasure, and a boss.',
  'Audit the current quests for broken references or weak rewards, then improve what needs attention.',
  'Add a memorable merchant with authored non-AI dialogue and useful stock.',
];

const timestamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function providerLabel(status) {
  if (!status?.provider) return 'No provider';
  const names = { openai: 'OpenAI', grok: 'Grok', local: 'Local', custom: 'Custom' };
  return `${names[status.provider] || status.provider} · ${status.model || 'unconfigured'}`;
}

function ActivityRow({ item }) {
  return (
    <div className="flex gap-3 border-l border-cyan-400/20 pl-3">
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
        item.kind === 'error' ? 'bg-rose-400' : item.kind === 'complete' ? 'bg-emerald-400' : 'bg-cyan-300'
      }`} />
      <div className="min-w-0">
        <p className="text-xs leading-5 text-slate-300">{item.text}</p>
        {item.meta && <p className="mt-0.5 text-[0.62rem] uppercase tracking-[0.14em] text-slate-600">{item.meta}</p>}
      </div>
    </div>
  );
}

export default function ArchieAgentSidebar({
  currentProfile,
  onWorldChanged,
}) {
  const spacetime = useMemo(() => getSpacetimeClient(), []);
  const abortRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [activity, setActivity] = useState([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('idle');
  const [statusText, setStatusText] = useState('Ready to shape the archive.');
  const [pendingPatch, setPendingPatch] = useState(null);
  const [autoApply, setAutoApply] = useState(true);
  const [error, setError] = useState('');
  const [lastApplied, setLastApplied] = useState(null);

  useEffect(() => {
    let active = true;
    fetch('/api/arkyv/archie', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (active) setProvider(data);
      })
      .catch((fetchError) => {
        if (active) setProvider({ available: false, error: fetchError.message || 'Could not read Archie configuration.' });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const addActivity = (text, kind = 'tool', meta = '') => {
    setActivity((items) => [...items.slice(-39), {
      id: `${Date.now()}-${Math.random()}`,
      text: String(text || '').replace(/\s+/g, ' ').slice(0, 800),
      kind,
      meta,
    }]);
  };

  const applyPatch = async (patch, worldBundle) => {
    setPendingPatch(null);
    setError('');
    setStatus('applying');
    setStatusText('Archie is binding the new pages…');
    addActivity('Creating a pre-change world snapshot', 'tool');

    const snapshotId = `archie-before-${patch.runId}`.slice(0, 120);
    const snapshotResult = await spacetime.saveWorldSnapshot(
      snapshotId,
      `Before Archie · ${new Date().toLocaleString()}`.slice(0, 120),
      worldBundle,
    );
    if (snapshotResult.error) {
      throw new Error(`Archie did not apply the patch because the safety snapshot failed: ${snapshotResult.error.message}`);
    }

    addActivity(`Applying ${patch.summary.records} authored record change${patch.summary.records === 1 ? '' : 's'} atomically`, 'tool');
    const result = await spacetime.applyAdminPatch(patch.runId, patch.operations, patch.report);
    if (result.error) throw result.error;

    const validation = await spacetime.validateWorldContent();
    if (validation.error) throw validation.error;
    addActivity('Authoritative world validation completed', 'complete');
    setLastApplied(patch.summary);
    setStatus('complete');
    setStatusText(`Archie finished · ${patch.summary.records} record${patch.summary.records === 1 ? '' : 's'} changed.`);
    onWorldChanged?.(patch);
  };

  const handleAgentEvent = (event) => {
    if (event.type === 'status') {
      setStatus(event.status || 'thinking');
      setStatusText(event.message || 'Archie is thinking…');
      if (event.provider) {
        setProvider((value) => ({
          ...(value || {}),
          available: true,
          provider: event.provider,
          model: event.model,
        }));
      }
    } else if (event.type === 'tool') {
      setStatus('working');
      setStatusText('Archie is working through the archive…');
      addActivity(event.detail || event.name, 'tool', event.name);
    } else if (event.type === 'error') {
      throw new Error(event.error || 'Archie could not finish this task.');
    } else if (event.type === 'stopped') {
      throw new DOMException(event.error || 'Archie stopped.', 'AbortError');
    }
  };

  const runArchie = async (overridePrompt) => {
    const requestPrompt = String(overridePrompt ?? prompt).trim();
    if (!requestPrompt || running) return;
    if (!provider?.available) {
      setError(provider?.error || 'Configure an AI provider before starting Archie.');
      setOpen(true);
      return;
    }

    const previousMessages = messages;
    setMessages((items) => [...items, { role: 'user', content: requestPrompt, time: timestamp() }]);
    setPrompt('');
    setPendingPatch(null);
    setLastApplied(null);
    setError('');
    setActivity([]);
    setRunning(true);
    setStatus('loading_world');
    setStatusText('Archie is opening the world archive…');
    setOpen(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let finalResult = null;
    let worldBundle = null;

    try {
      worldBundle = await collectArchieWorld(spacetime);
      addActivity(
        `Loaded ${Object.values(worldBundle.tables).reduce((sum, rows) => sum + rows.length, 0)} authored records`,
        'complete',
        'read-only',
      );
      const response = await fetch('/api/arkyv/archie', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: requestPrompt,
          world: worldBundle,
          history: previousMessages.map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Archie request failed (${response.status}).`);
      }
      if (!response.body) throw new Error('Archie did not return a readable response.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'final') finalResult = event;
          else handleAgentEvent(event);
        }
        if (done) break;
      }
      if (buffer.trim()) {
        const event = JSON.parse(buffer);
        if (event.type === 'final') finalResult = event;
        else handleAgentEvent(event);
      }
      if (!finalResult) throw new Error('Archie stopped without producing a report.');

      const computedSummary = summarizeArchieOperations(finalResult.operations);
      finalResult.summary = computedSummary;
      setMessages((items) => [...items, {
        role: 'assistant',
        content: finalResult.report,
        time: timestamp(),
        summary: computedSummary,
      }]);

      if (!finalResult.validation?.valid) {
        const validationMessage = finalResult.validation?.errors?.slice(0, 4).join(' ') || 'The staged draft did not pass validation.';
        throw new Error(`Archie did not apply anything: ${validationMessage}`);
      }
      if (!finalResult.operations.length) {
        setStatus('complete');
        setStatusText('Archie finished without changing the world.');
        addActivity('No world changes were needed', 'complete');
      } else if (computedSummary.deletes > 0 || !autoApply) {
        setPendingPatch({ ...finalResult, worldBundle });
        setStatus('approval');
        setStatusText(
          computedSummary.deletes > 0
            ? `Archie needs approval for ${computedSummary.deletes} deletion${computedSummary.deletes === 1 ? '' : 's'}.`
            : 'Archie has a patch ready for review.',
        );
      } else {
        await applyPatch(finalResult, worldBundle);
      }
    } catch (runError) {
      const stopped = runError?.name === 'AbortError' || controller.signal.aborted;
      setError(stopped ? 'Archie stopped before applying any changes.' : (runError.message || 'Archie could not finish this task.'));
      setStatus(stopped ? 'stopped' : 'error');
      setStatusText(stopped ? 'Archie stopped. No staged changes were applied.' : 'Archie ran into a problem.');
      addActivity(stopped ? 'Run stopped safely; no changes applied' : (runError.message || 'Run failed'), stopped ? 'complete' : 'error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  };

  const approvePending = async () => {
    if (!pendingPatch || running) return;
    setRunning(true);
    setError('');
    try {
      await applyPatch(pendingPatch, pendingPatch.worldBundle);
    } catch (applyError) {
      setError(applyError.message || 'Archie could not apply the patch.');
      setStatus('error');
      setStatusText('The patch was rejected; the world was not partially changed.');
      addActivity(applyError.message || 'Patch rejected', 'error');
    } finally {
      setRunning(false);
    }
  };

  const stopArchie = () => abortRef.current?.abort();
  const summary = pendingPatch?.summary || lastApplied;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-4 z-40 flex min-h-12 items-center gap-3 rounded-full border border-cyan-300/50 bg-slate-950/95 px-4 py-3 text-left shadow-2xl shadow-cyan-500/20 backdrop-blur-xl transition hover:border-cyan-200 hover:bg-slate-900 sm:bottom-7 sm:right-7"
          aria-label="Open Archie world agent"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 font-terminal text-sm text-cyan-200">A</span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">Ask Archie</span>
            <span className="mt-0.5 block text-[0.65rem] text-slate-500">World agent</span>
          </span>
        </button>
      )}

      {open && <button type="button" aria-label="Close Archie" onClick={() => setOpen(false)} className="fixed inset-0 z-[65] bg-black/65 backdrop-blur-sm lg:hidden" />}
      <aside className={`fixed inset-y-0 right-0 z-[70] flex w-full max-w-[440px] flex-col border-l border-cyan-400/25 bg-slate-950/98 shadow-2xl shadow-black/70 backdrop-blur-xl transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`} aria-label="Archie world agent">
        <header className="border-b border-slate-800 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/10 font-terminal text-lg text-cyan-100 shadow-lg shadow-cyan-500/10">A</span>
              <div className="min-w-0">
                <h2 className="font-terminal text-sm uppercase tracking-[0.24em] text-cyan-100">Archie // Worldwright</h2>
                <p className="mt-1 truncate text-[0.65rem] uppercase tracking-[0.12em] text-slate-500">{providerLabel(provider)}</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-sm text-slate-400 transition hover:border-slate-500 hover:text-white" aria-label="Close Archie">×</button>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-800 bg-black/20 px-3 py-2">
            <span className={`h-2 w-2 rounded-full ${status === 'error' ? 'bg-rose-400' : running ? 'animate-pulse bg-cyan-300' : status === 'complete' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <p className="text-xs leading-5 text-slate-300">{running && status === 'thinking' ? 'Archie is thinking…' : statusText}</p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {!provider?.available && (
            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Archie needs a model</p>
              <p className="mt-2 text-xs leading-5 text-amber-100/70">{provider?.error || 'Configure OpenAI, Grok, a local model, or a custom OpenAI-compatible provider on the server.'}</p>
            </div>
          )}

          {messages.length === 0 && (
            <div className="mb-5 rounded-xl border border-cyan-400/15 bg-cyan-500/[0.04] p-4">
              <p className="text-sm leading-6 text-slate-300">Tell Archie what the world needs. Archie can inspect existing content, stage connected systems, validate references, and commit a bounded patch through the same rules as the visual editor.</p>
              <div className="mt-4 space-y-2">
                {QUICK_PROMPTS.map((example) => (
                  <button key={example} type="button" disabled={running} onClick={() => runArchie(example)} className="w-full rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-left text-xs leading-5 text-slate-400 transition hover:border-cyan-400/30 hover:text-slate-200 disabled:opacity-50">{example}</button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={`${message.time}-${index}`} className={`rounded-xl border p-3.5 ${message.role === 'user' ? 'ml-7 border-purple-400/20 bg-purple-500/[0.06]' : 'mr-3 border-cyan-400/20 bg-cyan-500/[0.05]'}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-[0.62rem] font-semibold uppercase tracking-[0.18em] ${message.role === 'user' ? 'text-purple-200' : 'text-cyan-200'}`}>{message.role === 'user' ? (currentProfile?.name || 'Administrator') : 'Archie'}</p>
                  <span className="text-[0.6rem] text-slate-700">{message.time}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{message.content}</p>
                {message.summary?.records > 0 && <p className="mt-2 text-[0.65rem] uppercase tracking-[0.14em] text-emerald-300">{message.summary.records} staged record changes</p>}
              </div>
            ))}
          </div>

          {activity.length > 0 && (
            <section className="mt-5 rounded-xl border border-slate-800 bg-black/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-400">Archie’s activity</h3>
                <span className="text-[0.6rem] text-slate-700">{activity.length} events</span>
              </div>
              <div className="space-y-3">{activity.map((item) => <ActivityRow key={item.id} item={item} />)}</div>
            </section>
          )}

          {summary?.records > 0 && (
            <section className="mt-4 grid grid-cols-4 gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-center">
              {[['New', summary.inserts], ['Updated', summary.updates + summary.configures], ['Deleted', summary.deletes], ['Total', summary.records]].map(([label, value]) => (
                <div key={label}><p className="text-base font-semibold text-cyan-100">{value}</p><p className="mt-0.5 text-[0.58rem] uppercase tracking-[0.12em] text-slate-600">{label}</p></div>
              ))}
            </section>
          )}

          {pendingPatch && (
            <section className={`mt-4 rounded-xl border p-4 ${pendingPatch.summary.deletes > 0 ? 'border-rose-400/35 bg-rose-500/[0.07]' : 'border-amber-400/30 bg-amber-500/[0.06]'}`}>
              <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${pendingPatch.summary.deletes > 0 ? 'text-rose-200' : 'text-amber-200'}`}>
                {pendingPatch.summary.deletes > 0 ? 'Destructive approval required' : 'Patch ready'}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                A server snapshot will be created first. The entire patch commits atomically or not at all.
              </p>
              <div className="mt-4 flex gap-2">
                <button type="button" disabled={running} onClick={approvePending} className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition disabled:opacity-50 ${pendingPatch.summary.deletes > 0 ? 'border-rose-300/50 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25' : 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20'}`}>
                  {pendingPatch.summary.deletes > 0 ? 'Approve & apply' : 'Apply patch'}
                </button>
                <button type="button" disabled={running} onClick={() => { setPendingPatch(null); setStatus('idle'); setStatusText('Staged patch discarded.'); }} className="rounded-lg border border-slate-700 px-3 py-2.5 text-xs text-slate-400 hover:text-white">Discard</button>
              </div>
            </section>
          )}

          {error && <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/[0.07] p-3 text-xs leading-5 text-rose-100">{error}</div>}
        </div>

        <footer className="border-t border-slate-800 bg-slate-950 px-4 py-4 sm:px-5">
          <label className="mb-3 flex items-center gap-2 text-[0.65rem] text-slate-500">
            <input type="checkbox" checked={autoApply} disabled={running} onChange={(event) => setAutoApply(event.target.checked)} className="accent-cyan-400" />
            Auto-apply safe additions and updates
          </label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runArchie();
            }}
            disabled={running}
            rows={3}
            maxLength={8000}
            placeholder="Ask Archie to build, connect, audit, or improve the world…"
            className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900/70 px-3.5 py-3 text-sm leading-5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/60 disabled:opacity-60"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[0.6rem] uppercase tracking-[0.12em] text-slate-700">Ctrl/⌘ + Enter</p>
            {running ? (
              <button type="button" onClick={stopArchie} className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-rose-100 hover:bg-rose-500/20">Stop Archie</button>
            ) : (
              <button type="button" disabled={!prompt.trim() || !provider?.available} onClick={() => runArchie()} className="rounded-lg border border-cyan-300/40 bg-cyan-500/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40">Send to Archie</button>
            )}
          </div>
        </footer>
      </aside>
    </>
  );
}
