import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import getSpacetimeClient from '@/lib/spacetimedbClient';
import {
  ENGINE_SYSTEM_TABLES,
  WORLD_CONTENT_PRIMARY_KEYS,
  WORLD_CONTENT_TABLES,
  orderWorldObjectsForRestore,
  selectExportableWorldObjects,
} from '@/lib/worldContentBundle';

const inputClass = 'w-full rounded-md border border-slate-600/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none';
const buttonClass = 'rounded-md border border-cyan-400/50 bg-cyan-500/10 px-4 py-2 text-xs uppercase tracking-[0.16em] text-cyan-100 disabled:opacity-40';

const SYSTEMS = [
  { table: 'ability_unlock_rules', label: 'Ability unlocks & talents', permission: 'systems.manage', key: 'ability_id', references: { ability_id: 'ability_definitions', required_option_id: 'character_option_definitions', prerequisite_ability_id: 'ability_definitions', required_quest_id: 'quest_definitions', required_faction_id: 'faction_definitions' }, template: { ability_id: '', required_option_id: null, prerequisite_ability_id: null, required_quest_id: null, required_faction_id: null, required_reputation: 0, talent_cost: 1, exclusive_group: null } },
  { table: 'object_rules', label: 'Advanced item rules', permission: 'systems.manage', key: 'definition_id', references: { definition_id: 'object_definitions', required_option_id: 'character_option_definitions' }, options: { rarity: ['common', 'uncommon', 'rare', 'epic', 'legendary'], bind_rule: ['none', 'bound', 'bind_on_equip'] }, template: { definition_id: '', rarity: 'common', item_level: 1, required_level: 1, required_option_id: null, maximum_durability: 100, base_value: 25, repairable: true, two_handed: false, weapon_type: 'sword', damage_school: 'physical', bind_rule: 'none', tradeable: true } },
  { table: 'bank_configs', label: 'Bank policy', permission: 'economy.manage', key: 'id', references: { required_npc_id: 'npcs' }, options: { access_mode: ['anywhere', 'fixture_or_npc'] }, template: { id: 'world', access_mode: 'fixture_or_npc', required_room_tag: 'bank', required_npc_id: null, slot_limit: 40, deposit_fee: 0, withdrawal_fee: 0, shared_by_identity: false, protects_from_death: true } },
  { table: 'vendor_restock_rules', label: 'Vendor restocking', permission: 'economy.manage', key: 'vendor_stock_id', references: { vendor_stock_id: 'vendor_stocks' }, template: { vendor_stock_id: '', target_stock: 10, restock_quantity: 1, restock_seconds: 300 } },
  { table: 'profession_definitions', label: 'Professions', permission: 'economy.manage', key: 'id', template: { id: '', name: '', description: '', maximum_rank: 100, xp_per_craft: 1, active: true } },
  { table: 'recipe_rules', label: 'Recipe learning & quality', permission: 'economy.manage', key: 'recipe_id', references: { recipe_id: 'crafting_recipes', profession_id: 'profession_definitions' }, template: { recipe_id: '', profession_id: null, required_profession_rank: 0, must_be_learned: true, success_percent: 95, cooldown_seconds: 0 } },
  { table: 'dialogue_nodes', label: 'Dialogue nodes', permission: 'world.manage', key: 'id', references: { npc_id: 'npcs', required_quest_id: 'quest_definitions', required_faction_id: 'faction_definitions' }, template: { id: '', npc_id: '', text: '', entry_node: true, required_quest_id: null, required_faction_id: null, required_reputation: 0, sort_order: 100 } },
  { table: 'dialogue_choices', label: 'Dialogue choices', permission: 'world.manage', key: 'id', references: { node_id: 'dialogue_nodes', next_node_id: 'dialogue_nodes' }, options: { action_kind: ['none', 'start_quest', 'gold', 'reputation', 'give_item', 'learn_recipe', 'learn_profession'] }, template: { id: '', node_id: '', label: '', next_node_id: null, action_kind: 'none', action_reference_id: null, action_value: 0, sort_order: 100 } },
  { table: 'exit_rules', label: 'Doors, locks & traps', permission: 'world.manage', key: 'exit_id', references: { exit_id: 'exits', key_definition_id: 'object_definitions', required_quest_id: 'quest_definitions', required_option_id: 'character_option_definitions' }, template: { exit_id: '', is_door: true, closed: false, locked: false, key_definition_id: null, hidden: false, trap_damage: 0, required_quest_id: null, required_option_id: null } },
  { table: 'world_triggers', label: 'Conditions & actions', permission: 'world.manage', key: 'id', references: { source_id: 'rooms' }, options: { event_kind: ['room_enter'] }, template: { id: '', event_kind: 'room_enter', source_id: null, conditions_json: { minimum_level: 1 }, actions_json: [{ kind: 'message', text: 'A bell tolls in the distance.' }], once_per_actor: true, active: true } },
  { table: 'world_simulation_configs', label: 'World simulation', permission: 'world.manage', key: 'id', options: { mode: ['turn_driven', 'scheduled'] }, template: { id: 'world', mode: 'turn_driven', tick_seconds: 5, day_length_minutes: 60, weather_enabled: false, active: false } },
];

const REFERENCE_TABLES = [...new Set(SYSTEMS.flatMap((system) => Object.values(system.references || {})))];
const canUse = (permissions, permission) => permissions?.has?.('*') || permissions?.has?.(permission);
const pretty = (value) => JSON.stringify(value, null, 2);
const fieldLabel = (field) => field.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const referenceLabel = (row) => row.name || row.title || row.label || row.verb || row.id || row.quest_id || row.vendor_stock_id;

function ConfigField({ field, value, onChange, options, disabled = false }) {
  if (typeof value === 'boolean') {
    return <label className="flex items-center gap-3 rounded-lg border border-slate-700/70 bg-slate-950/45 px-3 py-2 text-xs text-slate-300"><input type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="accent-cyan-400" />{fieldLabel(field)}</label>;
  }
  if (options?.length) {
    return <label className="flex flex-col gap-1.5 text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">{fieldLabel(field)}<select className={inputClass} value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value || (value === null ? null : ''))}><option value="">{value === null ? 'None' : 'Choose…'}</option>{options.map((option) => <option key={option.value ?? option} value={option.value ?? option}>{option.label ?? option}</option>)}</select></label>;
  }
  if (typeof value === 'number') {
    return <label className="flex flex-col gap-1.5 text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">{fieldLabel(field)}<input type="number" className={inputClass} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></label>;
  }
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return <label className="flex flex-col gap-1.5 text-[0.65rem] uppercase tracking-[0.18em] text-slate-400 sm:col-span-2">{fieldLabel(field)}<textarea key={pretty(value)} className={`${inputClass} min-h-28 font-mono text-xs`} defaultValue={pretty(value)} onBlur={(event) => { try { onChange(JSON.parse(event.target.value)); } catch { /* The raw JSON editor below reports invalid JSON on save. */ } }} /></label>;
  }
  return <label className="flex flex-col gap-1.5 text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">{fieldLabel(field)}<input className={inputClass} value={value ?? ''} disabled={disabled} placeholder={value === null ? 'Optional — leave blank for none' : ''} onChange={(event) => onChange(value === null && event.target.value === '' ? null : event.target.value)} /></label>;
}

export default function EngineSystemsEditor({ enabled, permissions, actors = [] }) {
  const spacetime = useMemo(() => getSpacetimeClient(), []);
  const availableSystems = useMemo(() => SYSTEMS.filter((system) => canUse(permissions, system.permission)), [permissions]);
  const portableContentTables = useMemo(
    () => WORLD_CONTENT_TABLES.filter((table) => table !== 'admin_role_definitions' || canUse(permissions, 'roles.manage')),
    [permissions],
  );
  const [selectedTable, setSelectedTable] = useState(availableSystems[0]?.table || '');
  const selectedSystem = availableSystems.find((system) => system.table === selectedTable) || availableSystems[0];
  const [rowsByTable, setRowsByTable] = useState({});
  const [referenceRowsByTable, setReferenceRowsByTable] = useState({});
  const [payloadText, setPayloadText] = useState(pretty(selectedSystem?.template || {}));
  const [selectedId, setSelectedId] = useState('');
  const [issues, setIssues] = useState([]);
  const [audits, setAudits] = useState([]);
  const [reports, setReports] = useState([]);
  const [sanctions, setSanctions] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [currencyBalances, setCurrencyBalances] = useState([]);
  const [moderation, setModeration] = useState({ actor_id: '', action: 'mute', reason: '', duration_seconds: 3600 });
  const [balanceEdit, setBalanceEdit] = useState({ actor_id: '', currency_id: 'gold', amount: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const importRef = useRef(null);

  useEffect(() => {
    if (selectedSystem) return;
    if (availableSystems[0]) setSelectedTable(availableSystems[0].table);
  }, [availableSystems, selectedSystem]);

  const load = useCallback(async () => {
    if (!enabled) return;
    const [systemResults, referenceResults] = await Promise.all([
      Promise.all(availableSystems.map((system) => spacetime.from(system.table).select('*'))),
      Promise.all(REFERENCE_TABLES.map((table) => spacetime.from(table).select('*'))),
    ]);
    const next = {};
    availableSystems.forEach((system, index) => { next[system.table] = systemResults[index].data || []; });
    setRowsByTable(next);
    const nextReferences = {};
    REFERENCE_TABLES.forEach((table, index) => { nextReferences[table] = referenceResults[index].data || []; });
    setReferenceRowsByTable(nextReferences);
    const [issueResult, auditResult, reportResult, sanctionResult, snapshotResult, currencyResult, walletResult, balanceResult] = await Promise.all([
      spacetime.from('content_issues').select('*'),
      spacetime.from('admin_audit_log').select('*').order('created_at', { ascending: false }),
      spacetime.from('admin_player_reports').select('*').order('created_at', { ascending: false }),
      spacetime.from('admin_player_sanctions').select('*'),
      spacetime.from('admin_world_snapshots').select('*').order('created_at', { ascending: false }),
      spacetime.from('currency_definitions').select('*'),
      spacetime.from('actor_wallets').select('*'),
      spacetime.from('actor_currencies').select('*'),
    ]);
    setIssues(issueResult.data || []); setAudits(auditResult.data || []); setReports(reportResult.data || []); setSanctions(sanctionResult.data || []); setSnapshots(snapshotResult.data || []);
    setCurrencies(currencyResult.data || []); setWallets(walletResult.data || []); setCurrencyBalances(balanceResult.data || []);
  }, [availableSystems, enabled, spacetime]);

  useEffect(() => { load().catch((error) => setMessage({ type: 'error', text: error.message })); }, [load]);

  const run = async (operation, success) => {
    setBusy(true); setMessage(null);
    try { const result = await operation(); if (result?.error) throw result.error; await load(); setMessage({ type: 'success', text: success }); }
    catch (error) { setMessage({ type: 'error', text: error?.message || String(error) }); }
    finally { setBusy(false); }
  };

  const chooseSystem = (table) => {
    const system = availableSystems.find((value) => value.table === table);
    setSelectedTable(table); setSelectedId(''); setPayloadText(pretty(system?.template || {}));
  };

  const saveRecord = () => {
    let payload;
    try { payload = JSON.parse(payloadText); } catch { setMessage({ type: 'error', text: 'Record JSON is invalid.' }); return; }
    return run(() => spacetime.configureEngineRecord(selectedSystem.table, payload), 'Engine record saved.');
  };

  const removeRecord = () => selectedId && run(() => spacetime.deleteEngineRecord(selectedSystem.table, selectedId), 'Engine record deleted.');

  const collectWorld = async () => {
    if (SYSTEMS.some((system) => !ENGINE_SYSTEM_TABLES.includes(system.table))) {
      throw new Error('The engine-system editor and world bundle catalog are out of sync.');
    }
    const results = await Promise.all(portableContentTables.map((table) => spacetime.from(table).select('*')));
    const tables = {};
    portableContentTables.forEach((table, index) => { if (results[index].error) throw results[index].error; tables[table] = results[index].data || []; });
    tables.world_objects = selectExportableWorldObjects(tables.world_objects);
    return { format: 'arkyv-world', version: 1, exported_at: new Date().toISOString(), tables };
  };

  const createSnapshot = async () => {
    const content = await collectWorld();
    const id = `snapshot-${Date.now()}`;
    return spacetime.saveWorldSnapshot(id, `Snapshot ${new Date().toLocaleString()}`, content);
  };

  const download = (content, name = 'arkyv-world.json') => {
    const url = URL.createObjectURL(new Blob([pretty(content)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
  };

  const restoreWorld = async (bundle) => {
    if (bundle?.format !== 'arkyv-world' || !bundle.tables) throw new Error('This is not an Arkyv world bundle.');
    for (const table of portableContentTables) {
      const sourceRecords = Array.isArray(bundle.tables[table]) ? bundle.tables[table] : [];
      const records = table === 'world_objects' ? orderWorldObjectsForRestore(sourceRecords) : sourceRecords;
      const system = SYSTEMS.find((value) => value.table === table);
      for (const record of records) {
        if (system) {
          const result = await spacetime.configureEngineRecord(table, record); if (result.error) throw result.error;
        } else {
          const key = WORLD_CONTENT_PRIMARY_KEYS[table] || 'id'; const id = record[key]; if (id == null) continue;
          const existing = await spacetime.from(table).select('*').eq(key, id).maybeSingle();
          const result = existing.data ? await spacetime.from(table).update(record).eq(key, id).select() : await spacetime.from(table).insert(record).select();
          if (result.error) throw result.error;
        }
      }
    }
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { const bundle = JSON.parse(await file.text()); await run(() => restoreWorld(bundle), 'World bundle merged successfully.'); }
    catch (error) { setMessage({ type: 'error', text: error.message || String(error) }); }
  };

  const rows = rowsByTable[selectedSystem?.table] || [];
  const parsedPayload = useMemo(() => {
    try { return JSON.parse(payloadText); } catch { return null; }
  }, [payloadText]);
  const updatePayloadField = (field, value) => {
    if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) return;
    setPayloadText(pretty({ ...parsedPayload, [field]: value }));
  };
  const optionsForField = (field) => {
    const configured = selectedSystem?.options?.[field];
    if (configured) return configured;
    let referenceTable = selectedSystem?.references?.[field];
    if (selectedSystem?.table === 'dialogue_choices' && field === 'action_reference_id') {
      referenceTable = {
        start_quest: 'quest_definitions',
        reputation: 'faction_definitions',
        give_item: 'object_definitions',
        learn_recipe: 'crafting_recipes',
        learn_profession: 'profession_definitions',
      }[parsedPayload?.action_kind];
    }
    return referenceTable
      ? (referenceRowsByTable[referenceTable] || rowsByTable[referenceTable] || []).map((row) => ({
        value: String(row.id ?? row.quest_id ?? row.vendor_stock_id),
        label: `${referenceLabel(row)} · ${row.id ?? row.quest_id ?? row.vendor_stock_id}`,
      }))
      : null;
  };
  const mayModerate = canUse(permissions, 'players.moderate');
  const mayManageWorld = canUse(permissions, 'world.manage');
  const selectBalance = (actorId, currencyId) => {
    const amount = currencyId === 'gold'
      ? wallets.find((row) => row.actor_id === actorId)?.gold || 0
      : currencyBalances.find((row) => row.actor_id === actorId && row.currency_id === currencyId)?.balance || 0;
    setBalanceEdit({ actor_id: actorId, currency_id: currencyId, amount });
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {message && <div className={`rounded-lg border px-4 py-3 text-sm ${message.type === 'error' ? 'border-rose-400/40 bg-rose-500/10 text-rose-100' : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'}`}>{message.text}</div>}

      {selectedSystem && <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/35 p-4">
          <label className="block text-xs uppercase tracking-wider text-slate-400">System<select className={`${inputClass} mt-2`} value={selectedSystem.table} onChange={(event) => chooseSystem(event.target.value)}>{availableSystems.map((system) => <option key={system.table} value={system.table}>{system.label}</option>)}</select></label>
          <button type="button" className={`${buttonClass} w-full`} onClick={() => { setSelectedId(''); setPayloadText(pretty(selectedSystem.template)); }}>New record</button>
          <div className="max-h-[32rem] space-y-2 overflow-auto">{rows.map((row) => { const id = String(row[selectedSystem.key]); return <button type="button" key={id} onClick={() => { setSelectedId(id); setPayloadText(pretty(row)); }} className={`w-full rounded-lg border p-3 text-left text-sm ${selectedId === id ? 'border-cyan-300 bg-cyan-500/10 text-cyan-50' : 'border-slate-800 text-slate-300'}`}><span className="block font-medium">{row.name || row.label || row.title || id}</span><span className="mt-1 block text-xs text-slate-600">{id}</span></button>; })}{rows.length === 0 && <p className="p-4 text-center text-xs text-slate-600">No records yet.</p>}</div>
        </div>
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/35 p-4">
          <div><h3 className="text-sm uppercase tracking-[0.2em] text-cyan-200">{selectedSystem.label}</h3><p className="mt-1 text-xs leading-5 text-slate-500">Every field is validated by the authoritative module. Optional fields may be left blank. Relationship fields use the stable id shown elsewhere in the studio.</p></div>
          {parsedPayload ? <div className="grid gap-3 sm:grid-cols-2">{Object.entries(parsedPayload).filter(([field]) => !['created_at', 'updated_at', 'last_restock_at_micros'].includes(field)).map(([field, value]) => <ConfigField key={field} field={field} value={value} options={optionsForField(field)} disabled={Boolean(selectedId) && field === selectedSystem.key} onChange={(nextValue) => updatePayloadField(field, nextValue)} />)}</div> : <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">The expert JSON below is invalid. Correct it to restore the visual fields.</p>}
          <details className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><summary className="cursor-pointer text-xs uppercase tracking-[0.16em] text-slate-400">Expert JSON</summary><textarea className={`${inputClass} mt-3 min-h-64 font-mono text-xs leading-5`} spellCheck="false" value={payloadText} onChange={(event) => setPayloadText(event.target.value)} /></details>
          <div className="flex justify-end gap-2">{selectedId && <button disabled={busy} type="button" onClick={removeRecord} className="rounded-md border border-rose-400/40 px-4 py-2 text-xs uppercase text-rose-200">Delete</button>}<button disabled={busy} type="button" onClick={saveRecord} className={buttonClass}>Save record</button></div>
        </div>
      </div>}

      {mayManageWorld && <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/35 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm uppercase tracking-[0.2em] text-amber-200">Content health</h3><p className="mt-1 text-xs text-slate-500">Broken references, patrol links, empty quests, and unreachable rooms.</p></div><button type="button" disabled={busy} onClick={() => run(() => spacetime.validateWorldContent(), 'World validation completed.')} className={buttonClass}>Run validation</button></div><div className="max-h-80 space-y-2 overflow-auto">{issues.map((issue) => <div key={issue.id} className={`rounded-lg border p-3 text-xs ${issue.severity === 'error' ? 'border-rose-400/30 text-rose-100' : 'border-amber-400/20 text-amber-100'}`}><p className="font-medium uppercase">{issue.severity} · {issue.category} · {issue.record_id}</p><p className="mt-1 text-slate-400">{issue.message}</p></div>)}{issues.length === 0 && <p className="text-xs text-slate-600">No issues recorded. Run validation after editing content.</p>}</div></section>
        <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/35 p-4"><div><h3 className="text-sm uppercase tracking-[0.2em] text-emerald-200">Snapshots & portability</h3><p className="mt-1 text-xs text-slate-500">Create a server-side snapshot, export a portable JSON bundle, or merge one into this world.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => run(createSnapshot, 'Snapshot created.')} className={buttonClass}>Create snapshot</button><button type="button" disabled={busy} onClick={async () => download(await collectWorld(), `arkyv-world-${new Date().toISOString().slice(0, 10)}.json`)} className={buttonClass}>Export current</button><button type="button" disabled={busy} onClick={() => importRef.current?.click()} className={buttonClass}>Import & merge</button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importFile} /></div><div className="max-h-64 space-y-2 overflow-auto">{snapshots.map((snapshot) => <div key={snapshot.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 p-3 text-xs"><div><p className="text-slate-200">{snapshot.name}</p><p className="mt-1 text-slate-600">{new Date(snapshot.created_at).toLocaleString()}</p></div><div className="flex gap-2"><button type="button" onClick={() => run(() => restoreWorld(snapshot.content_json), 'Snapshot restored and merged.')} className="text-emerald-200">Restore</button><button type="button" onClick={() => download(snapshot.content_json, `${snapshot.id}.json`)} className="text-cyan-200">Export</button><button type="button" onClick={() => run(() => spacetime.deleteWorldSnapshot(snapshot.id), 'Snapshot deleted.')} className="text-rose-200">Delete</button></div></div>)}</div></section>
      </div>}

      {mayModerate && <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/35 p-4"><h3 className="text-sm uppercase tracking-[0.2em] text-rose-200">Sanctions</h3><select className={inputClass} value={moderation.actor_id} onChange={(event) => setModeration((value) => ({ ...value, actor_id: event.target.value }))}><option value="">Choose player…</option>{actors.filter((actor) => actor.actor_type !== 'npc').map((actor) => <option key={actor.id} value={actor.id}>{actor.label}</option>)}</select><div className="grid grid-cols-2 gap-3"><select className={inputClass} value={moderation.action} onChange={(event) => setModeration((value) => ({ ...value, action: event.target.value }))}><option value="mute">Mute</option><option value="ban">Ban</option><option value="kick">Kick</option><option value="clear">Clear sanctions</option></select><input className={inputClass} type="number" min="0" value={moderation.duration_seconds} onChange={(event) => setModeration((value) => ({ ...value, duration_seconds: event.target.value }))} placeholder="Seconds; 0 is permanent" /></div><input className={inputClass} value={moderation.reason} onChange={(event) => setModeration((value) => ({ ...value, reason: event.target.value }))} placeholder="Reason" /><button type="button" disabled={busy || !moderation.actor_id} onClick={() => run(() => spacetime.moderatePlayer(moderation.actor_id, moderation.action, moderation.reason, Number(moderation.duration_seconds) || 0), 'Moderation action applied.')} className={buttonClass}>Apply</button><div className="space-y-2">{sanctions.map((row) => <p key={row.id} className="rounded-lg border border-rose-400/20 p-3 text-xs text-rose-100">{row.sanction_kind.toUpperCase()} · {actors.find((actor) => actor.id === row.actor_id)?.label || row.actor_id} · {row.reason}</p>)}</div></section>
        <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/35 p-4"><h3 className="text-sm uppercase tracking-[0.2em] text-fuchsia-200">Player reports</h3><div className="max-h-96 space-y-2 overflow-auto">{reports.map((row) => <div key={row.id} className="rounded-lg border border-slate-800 p-3 text-xs"><p className="text-slate-200">{row.reporter_actor_id} → {row.target_actor_id}</p><p className="mt-1 text-slate-400">{row.reason}</p><div className="mt-2 flex gap-3"><span className="uppercase text-fuchsia-200">{row.status}</span>{row.status === 'open' && <><button type="button" onClick={() => run(() => spacetime.resolvePlayerReport(row.id, 'resolved'), 'Report resolved.')} className="text-emerald-200">Resolve</button><button type="button" onClick={() => run(() => spacetime.resolvePlayerReport(row.id, 'dismissed'), 'Report dismissed.')} className="text-slate-400">Dismiss</button></>}</div></div>)}{reports.length === 0 && <p className="text-xs text-slate-600">No player reports.</p>}</div></section>
      </div>}

      {mayModerate && <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/35 p-4"><div><h3 className="text-sm uppercase tracking-[0.2em] text-amber-200">Player balances</h3><p className="mt-1 text-xs text-slate-500">Set gold or any authored currency without editing replicated rows directly.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><select className={inputClass} value={balanceEdit.actor_id} onChange={(event) => selectBalance(event.target.value, balanceEdit.currency_id)}><option value="">Choose player…</option>{actors.filter((actor) => actor.actor_type !== 'npc').map((actor) => <option key={actor.id} value={actor.id}>{actor.label}</option>)}</select><select className={inputClass} value={balanceEdit.currency_id} onChange={(event) => selectBalance(balanceEdit.actor_id, event.target.value)}><option value="gold">Gold</option>{currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name}</option>)}</select><input type="number" min="0" className={inputClass} value={balanceEdit.amount} onChange={(event) => setBalanceEdit((value) => ({ ...value, amount: event.target.value }))} /><button type="button" disabled={busy || !balanceEdit.actor_id} onClick={() => run(() => spacetime.adminActorAction(balanceEdit.actor_id, 'set_currency', { currency_id: balanceEdit.currency_id, amount: Math.max(0, Number(balanceEdit.amount) || 0) }), 'Balance saved.')} className={buttonClass}>Save balance</button></div></section>}

      {mayManageWorld && <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/35 p-4"><h3 className="text-sm uppercase tracking-[0.2em] text-slate-300">Administrator audit</h3><div className="max-h-72 space-y-1 overflow-auto font-mono text-xs">{audits.slice(0, 100).map((row) => <div key={row.id} className="grid gap-1 border-b border-slate-800 py-2 sm:grid-cols-[170px_140px_1fr]"><span className="text-slate-600">{new Date(row.created_at).toLocaleString()}</span><span className="text-cyan-200">{row.action}</span><span className="text-slate-400">{row.target}</span></div>)}</div></section>}
    </div>
  );
}
