import React, { useCallback, useEffect, useMemo, useState } from 'react';
import getSpacetimeClient from '@/lib/spacetimedbClient';

const PRIMITIVE_PRESETS = [
    { kind: 'item', label: 'Item', icon: '◇', description: 'Portable building block or crafting material.', portable: true, stackable: true, max_stack: 20 },
    { kind: 'container', label: 'Container', icon: '📦', description: 'Stores other object instances.', portable: true, capacity: 12 },
    { kind: 'fixture', label: 'Fuel burner', icon: '🔥', description: 'Burns accepted fuel over elapsed real time.', portable: false, burn_rate: 1, accepted_fuel_tags: 'fuel' },
    { kind: 'weapon', label: 'Weapon', icon: '⚔️', description: 'Equippable object that contributes attack damage.', portable: true, equipment_slot: 'main-hand', weapon_damage: 4 },
    { kind: 'armor', label: 'Armor', icon: '🛡️', description: 'Equippable object that reduces incoming damage.', portable: true, equipment_slot: 'body', armor_value: 2 },
    { kind: 'consumable', label: 'Consumable', icon: '🧪', description: 'Applies a configured stat change when used.', portable: true, stackable: true, max_stack: 10 },
];

const TAB_OPTIONS = [
    { id: 'objects', label: 'Object primitives' },
    { id: 'stats', label: 'Hero stats' },
    { id: 'instances', label: 'Placed objects' },
    { id: 'actors', label: 'Actor values' },
];

const inputClass = 'w-full rounded-md border border-slate-600/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none';
const labelClass = 'text-[0.65rem] uppercase tracking-[0.22em] text-slate-400';
const buttonClass = 'rounded-md border border-cyan-400/50 bg-cyan-500/10 px-4 py-2 text-xs font-terminal uppercase tracking-[0.18em] text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40';

const emptyDefinition = () => ({
    id: '', name: '', description: '', primitive_kind: 'item', icon: '◇', image_url: '', tags: '', portable: true,
    stackable: false, max_stack: 1, capacity: 0, equipment_slot: '', weapon_damage: 0, armor_value: 0,
    scales_with_stat: '', fuel_value: 0, burn_rate: 0, accepted_fuel_tags: '', stat_modifiers: '{}',
    use_stat_id: '', use_delta: 0, use_consume: true,
});

const emptyStat = () => ({ id: '', name: '', description: '', role: '', minimum: 0, maximum: 100, default_value: 10, visible: true });
const emptyInstance = () => ({ id: '', definition_id: '', location_kind: 'room', location_id: '', quantity: 1, equipped_slot: '', durability: 100, fuel_remaining: 0, is_active: false, state_json: '{}' });
const emptyActorStat = () => ({ id: '', actor_id: '', stat_definition_id: '', base_value: 0, current_value: 0 });

function csvToArray(value) {
    return String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
}

function arrayToCsv(value) {
    return Array.isArray(value) ? value.join(', ') : '';
}

function jsonObject(value, fallback = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return fallback; }
    }
    return fallback;
}

function definitionToForm(definition) {
    const onUse = jsonObject(definition.on_use);
    return {
        ...emptyDefinition(),
        ...definition,
        image_url: definition.image_url || '',
        tags: arrayToCsv(definition.tags),
        accepted_fuel_tags: arrayToCsv(definition.accepted_fuel_tags),
        equipment_slot: definition.equipment_slot || '',
        scales_with_stat: definition.scales_with_stat || '',
        stat_modifiers: JSON.stringify(jsonObject(definition.stat_modifiers), null, 2),
        use_stat_id: onUse.stat_id || '',
        use_delta: onUse.delta || 0,
        use_consume: onUse.consume !== false,
    };
}

function definitionPayload(form) {
    let modifiers = {};
    try { modifiers = JSON.parse(form.stat_modifiers || '{}'); } catch { throw new Error('Stat modifiers must be valid JSON.'); }
    const onUse = form.use_stat_id ? { stat_id: form.use_stat_id, delta: Number(form.use_delta) || 0, consume: form.use_consume } : {};
    return {
        id: form.id.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        primitive_kind: form.primitive_kind,
        icon: form.icon || '◇',
        image_url: form.image_url || null,
        tags: csvToArray(form.tags),
        portable: Boolean(form.portable),
        stackable: Boolean(form.stackable),
        max_stack: Math.max(1, Number(form.max_stack) || 1),
        capacity: Math.max(0, Number(form.capacity) || 0),
        equipment_slot: form.equipment_slot || null,
        weapon_damage: Math.max(0, Number(form.weapon_damage) || 0),
        armor_value: Math.max(0, Number(form.armor_value) || 0),
        scales_with_stat: form.scales_with_stat || null,
        fuel_value: Math.max(0, Number(form.fuel_value) || 0),
        burn_rate: Math.max(0, Number(form.burn_rate) || 0),
        accepted_fuel_tags: csvToArray(form.accepted_fuel_tags),
        stat_modifiers: modifiers,
        on_use: onUse,
    };
}

function Field({ label, children, className = '' }) {
    return <label className={`flex flex-col gap-1.5 ${className}`}><span className={labelClass}>{label}</span>{children}</label>;
}

function Check({ label, checked, onChange }) {
    return (
        <label className="flex items-center gap-2 rounded-md border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-cyan-400" />
            {label}
        </label>
    );
}

export default function RpgSystemsEditor({ enabled }) {
    const spacetime = useMemo(() => getSpacetimeClient(), []);
    const [activeTab, setActiveTab] = useState('objects');
    const [definitions, setDefinitions] = useState([]);
    const [stats, setStats] = useState([]);
    const [instances, setInstances] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [characters, setCharacters] = useState([]);
    const [npcs, setNpcs] = useState([]);
    const [actorStats, setActorStats] = useState([]);
    const [definitionForm, setDefinitionForm] = useState(emptyDefinition);
    const [statForm, setStatForm] = useState(emptyStat);
    const [instanceForm, setInstanceForm] = useState(emptyInstance);
    const [actorStatForm, setActorStatForm] = useState(emptyActorStat);
    const [editingDefinition, setEditingDefinition] = useState(null);
    const [editingStat, setEditingStat] = useState(null);
    const [editingInstance, setEditingInstance] = useState(null);
    const [editingActorStat, setEditingActorStat] = useState(null);
    const [busy, setBusy] = useState(false);
    const [generatingImage, setGeneratingImage] = useState(false);
    const [message, setMessage] = useState(null);

    const actors = useMemo(() => [
        ...characters.map((actor) => ({ ...actor, actor_type: 'character', label: `${actor.name} · Hero` })),
        ...npcs.map((actor) => ({ ...actor, actor_type: 'npc', label: `${actor.name} · NPC` })),
    ].sort((left, right) => left.label.localeCompare(right.label)), [characters, npcs]);

    const definitionsById = useMemo(() => new Map(definitions.map((definition) => [definition.id, definition])), [definitions]);
    const roomsById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);
    const actorsById = useMemo(() => new Map(actors.map((actor) => [actor.id, actor])), [actors]);
    const instancesById = useMemo(() => new Map(instances.map((instance) => [instance.id, instance])), [instances]);

    const load = useCallback(async () => {
        if (!enabled) return;
        const results = await Promise.all([
            spacetime.from('object_definitions').select('*').order('name'),
            spacetime.from('stat_definitions').select('*').order('name'),
            spacetime.from('world_objects').select('*'),
            spacetime.from('rooms').select('id, name').order('name'),
            spacetime.from('characters').select('id, name').order('name'),
            spacetime.from('npcs').select('id, name').order('name'),
            spacetime.from('actor_stats').select('*'),
        ]);
        const firstError = results.find((result) => result.error)?.error;
        if (firstError) throw firstError;
        setDefinitions(results[0].data || []);
        setStats(results[1].data || []);
        setInstances(results[2].data || []);
        setRooms(results[3].data || []);
        setCharacters(results[4].data || []);
        setNpcs(results[5].data || []);
        setActorStats(results[6].data || []);
    }, [enabled, spacetime]);

    useEffect(() => {
        load().catch((error) => setMessage({ type: 'error', text: error.message || String(error) }));
    }, [load]);

    const run = useCallback(async (operation, successText) => {
        setBusy(true);
        setMessage(null);
        try {
            const result = await operation();
            if (result?.error) throw result.error;
            await load();
            setMessage({ type: 'success', text: successText });
            return true;
        } catch (error) {
            setMessage({ type: 'error', text: error?.message || String(error) });
            return false;
        } finally {
            setBusy(false);
        }
    }, [load]);

    const choosePreset = (preset) => {
        setEditingDefinition(null);
        setDefinitionForm({ ...emptyDefinition(), ...preset, primitive_kind: preset.kind, name: '', id: '' });
        setActiveTab('objects');
    };

    const generateItemImage = async () => {
        if (!definitionForm.name.trim() || !definitionForm.description.trim()) {
            setMessage({ type: 'error', text: 'Add a name and description before generating item art.' });
            return;
        }
        setGeneratingImage(true);
        setMessage(null);
        try {
            const response = await fetch('/api/arkyv/generate-item-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: definitionForm.name,
                    description: definitionForm.description,
                    primitiveKind: definitionForm.primitive_kind,
                    tags: csvToArray(definitionForm.tags),
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || data.error || 'Item image generation failed.');
            setDefinitionForm((value) => ({ ...value, image_url: data.imageUrl }));
            const credits = Number.isFinite(Number(data.creditsRemaining)) ? ` ${data.creditsRemaining} credits remain.` : '';
            setMessage({ type: 'success', text: `Generated a ${data.width}×${data.height} inventory image.${credits}` });
        } catch (error) {
            setMessage({ type: 'error', text: error?.message || String(error) });
        } finally {
            setGeneratingImage(false);
        }
    };

    const saveDefinition = async () => {
        let payload;
        try { payload = definitionPayload(definitionForm); } catch (error) { setMessage({ type: 'error', text: error.message }); return; }
        if (!payload.id || !payload.name) { setMessage({ type: 'error', text: 'Object id and name are required.' }); return; }
        const ok = await run(
            () => editingDefinition
                ? spacetime.from('object_definitions').update(payload).eq('id', editingDefinition).select()
                : spacetime.from('object_definitions').insert(payload).select(),
            editingDefinition ? 'Object primitive updated.' : 'Object primitive created.',
        );
        if (ok) { setEditingDefinition(null); setDefinitionForm(emptyDefinition()); }
    };

    const saveStat = async () => {
        const payload = {
            ...statForm,
            id: statForm.id.trim(), name: statForm.name.trim(), description: statForm.description.trim(), role: statForm.role || null,
            minimum: Number(statForm.minimum) || 0, maximum: Number(statForm.maximum) || 0, default_value: Number(statForm.default_value) || 0,
        };
        if (!payload.id || !payload.name) { setMessage({ type: 'error', text: 'Stat id and name are required.' }); return; }
        const ok = await run(
            () => editingStat
                ? spacetime.from('stat_definitions').update(payload).eq('id', editingStat).select()
                : spacetime.from('stat_definitions').insert(payload).select(),
            editingStat ? 'Hero stat updated.' : 'Hero stat created.',
        );
        if (ok) { setEditingStat(null); setStatForm(emptyStat()); }
    };

    const validLocationTargets = useMemo(() => {
        if (instanceForm.location_kind === 'room') return rooms.map((room) => ({ id: room.id, label: room.name }));
        if (instanceForm.location_kind === 'container') return instances.filter((instance) => definitionsById.get(instance.definition_id)?.capacity > 0).map((instance) => ({ id: instance.id, label: definitionsById.get(instance.definition_id)?.name || instance.id }));
        return actors;
    }, [actors, definitionsById, instanceForm.location_kind, instances, rooms]);

    const saveInstance = async () => {
        const definition = definitionsById.get(instanceForm.definition_id);
        const payload = {
            ...instanceForm,
            id: instanceForm.id || crypto.randomUUID(),
            quantity: Math.max(1, Number(instanceForm.quantity) || 1),
            equipped_slot: instanceForm.location_kind === 'equipped' ? (instanceForm.equipped_slot || definition?.equipment_slot || null) : null,
            durability: Math.max(0, Number(instanceForm.durability) || 0),
            fuel_remaining: Math.max(0, Number(instanceForm.fuel_remaining) || 0),
            state_json: jsonObject(instanceForm.state_json),
        };
        if (!payload.definition_id || !payload.location_id) { setMessage({ type: 'error', text: 'Choose a definition and location.' }); return; }
        const ok = await run(
            () => editingInstance
                ? spacetime.from('world_objects').update(payload).eq('id', editingInstance).select()
                : spacetime.from('world_objects').insert(payload).select(),
            editingInstance ? 'Object instance updated.' : 'Object instance placed.',
        );
        if (ok) { setEditingInstance(null); setInstanceForm(emptyInstance()); }
    };

    const saveActorStat = async () => {
        const definition = stats.find((stat) => stat.id === actorStatForm.stat_definition_id);
        const payload = {
            ...actorStatForm,
            id: `${actorStatForm.actor_id}::${actorStatForm.stat_definition_id}`,
            base_value: Number(actorStatForm.base_value ?? definition?.default_value ?? 0),
            current_value: Number(actorStatForm.current_value ?? definition?.default_value ?? 0),
        };
        if (!payload.actor_id || !payload.stat_definition_id) { setMessage({ type: 'error', text: 'Choose an actor and stat.' }); return; }
        const ok = await run(
            () => editingActorStat
                ? spacetime.from('actor_stats').update(payload).eq('id', editingActorStat).select()
                : spacetime.from('actor_stats').insert(payload).select(),
            editingActorStat ? 'Actor stat updated.' : 'Actor stat override created.',
        );
        if (ok) { setEditingActorStat(null); setActorStatForm(emptyActorStat()); }
    };

    const remove = (table, id, label) => run(() => spacetime.from(table).delete().eq('id', id), `${label} deleted.`);

    const installStarterKit = () => run(() => spacetime.installRpgStarterKit(), 'Starter primitives installed. Existing definitions were preserved.');

    const locationLabel = (instance) => {
        if (instance.location_kind === 'room') return roomsById.get(instance.location_id)?.name || instance.location_id;
        if (instance.location_kind === 'container') {
            const container = instancesById.get(instance.location_id);
            return definitionsById.get(container?.definition_id)?.name || instance.location_id;
        }
        return actorsById.get(instance.location_id)?.label || instance.location_id;
    };

    return (
        <section id="rpg-studio" className="scroll-mt-28 overflow-hidden rounded-2xl border border-purple-400/30 bg-slate-900/70 shadow-xl shadow-purple-500/10">
            <div className="flex flex-col gap-4 border-b border-purple-400/20 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h2 className="font-terminal text-sm uppercase tracking-[0.24em] text-purple-200 sm:text-base sm:tracking-[0.35em]">RPG Systems Studio</h2>
                    <p className="mt-1 max-w-3xl text-[0.65rem] uppercase leading-5 tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.18em]">Definition-driven inventory, containers, fuel, equipment, hero stats, consumables, and combat</p>
                </div>
                <button type="button" onClick={installStarterKit} disabled={busy} className={buttonClass}>Install starter kit</button>
            </div>

            <div className="flex gap-2 overflow-x-auto border-b border-slate-700/50 px-4 py-3 sm:flex-wrap sm:px-6 sm:py-4" role="tablist" aria-label="RPG editor sections">
                {TAB_OPTIONS.map((tab) => (
                    <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`shrink-0 rounded-full border px-4 py-2 text-[0.65rem] uppercase tracking-[0.18em] transition ${activeTab === tab.id ? 'border-purple-300 bg-purple-400/20 text-purple-100' : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {message && <div className={`mx-4 mt-4 rounded-lg border px-4 py-3 text-sm sm:mx-6 sm:mt-5 ${message.type === 'error' ? 'border-rose-400/50 bg-rose-500/10 text-rose-200' : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200'}`}>{message.text}</div>}

            {activeTab === 'objects' && (
                <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-[340px_1fr]">
                    <div className="space-y-5">
                        <div>
                            <h3 className="mb-3 text-xs uppercase tracking-[0.24em] text-slate-300">Start from a primitive</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {PRIMITIVE_PRESETS.map((preset) => (
                                    <button key={preset.kind} type="button" onClick={() => choosePreset(preset)} className="rounded-lg border border-slate-700/70 bg-slate-950/50 p-3 text-left transition hover:border-purple-400/60 hover:bg-purple-500/10">
                                        <span className="block text-xl">{preset.icon}</span><span className="mt-1 block text-xs uppercase tracking-[0.14em] text-slate-200">{preset.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="mb-3 flex items-center justify-between"><h3 className="text-xs uppercase tracking-[0.24em] text-slate-300">Definitions</h3><span className="text-xs text-slate-500">{definitions.length}</span></div>
                            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                                {definitions.map((definition) => (
                                    <button key={definition.id} type="button" aria-pressed={editingDefinition === definition.id} onClick={() => { setEditingDefinition(definition.id); setDefinitionForm(definitionToForm(definition)); }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${editingDefinition === definition.id ? 'border-purple-300 bg-purple-500/15' : 'border-slate-700/70 bg-slate-950/40 hover:border-slate-500'}`}>
                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-black/40 text-xl">{definition.image_url ? <img src={definition.image_url} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" /> : definition.icon}</span><span className="min-w-0"><span className="block truncate text-sm text-slate-100">{definition.name}</span><span className="mt-1 block truncate text-[0.62rem] uppercase tracking-[0.18em] text-slate-500">{definition.primitive_kind} · {definition.id}</span></span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5">
                        <div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.25em] text-purple-200">{editingDefinition ? 'Edit primitive' : 'New primitive'}</h3>{editingDefinition && <button type="button" onClick={() => { setEditingDefinition(null); setDefinitionForm(emptyDefinition()); }} className="text-xs text-slate-400 hover:text-white">New</button>}</div>
                        <div className="grid gap-4 md:grid-cols-[90px_1fr_1fr]">
                            <Field label="Icon"><input className={inputClass} value={definitionForm.icon} onChange={(e) => setDefinitionForm((value) => ({ ...value, icon: e.target.value }))} /></Field>
                            <Field label="Name"><input className={inputClass} value={definitionForm.name} onChange={(e) => setDefinitionForm((value) => ({ ...value, name: e.target.value }))} /></Field>
                            <Field label="Stable id"><input className={inputClass} disabled={Boolean(editingDefinition)} value={definitionForm.id} onChange={(e) => setDefinitionForm((value) => ({ ...value, id: e.target.value }))} placeholder="iron-sword" /></Field>
                        </div>
                        <Field label="Description"><textarea className={`${inputClass} min-h-24`} value={definitionForm.description} onChange={(e) => setDefinitionForm((value) => ({ ...value, description: e.target.value }))} /></Field>
                        <div className="grid gap-4 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-4 sm:grid-cols-[128px_1fr]">
                            <div className="flex aspect-square h-32 w-32 items-center justify-center overflow-hidden rounded-xl border border-cyan-400/30 bg-slate-950 text-4xl shadow-inner">
                                {definitionForm.image_url ? <img src={definitionForm.image_url} alt={`${definitionForm.name || 'Object'} preview`} className="h-full w-full object-cover [image-rendering:pixelated]" /> : definitionForm.icon || '◇'}
                            </div>
                            <div className="min-w-0 space-y-3">
                                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Inventory artwork</p><p className="mt-1 text-xs leading-5 text-slate-500">RetroDiffusion generates a crisp 128×128 item icon, suitable for inventory cards and pixel-perfect scaling.</p></div>
                                <Field label="Image URL or generated data"><input className={inputClass} value={definitionForm.image_url} onChange={(event) => setDefinitionForm((value) => ({ ...value, image_url: event.target.value }))} placeholder="Generate art or paste an image URL" /></Field>
                                <div className="flex flex-wrap gap-2"><button type="button" onClick={generateItemImage} disabled={generatingImage || busy} className={buttonClass}>{generatingImage ? 'Generating…' : 'Generate item art'}</button>{definitionForm.image_url && <button type="button" onClick={() => setDefinitionForm((value) => ({ ...value, image_url: '' }))} className="rounded-md border border-slate-600 px-3 py-2 text-xs uppercase tracking-[0.16em] text-slate-400 hover:text-white">Remove</button>}</div>
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Primitive type"><select className={inputClass} value={definitionForm.primitive_kind} onChange={(e) => setDefinitionForm((value) => ({ ...value, primitive_kind: e.target.value }))}>{PRIMITIVE_PRESETS.map((preset) => <option key={preset.kind} value={preset.kind}>{preset.label}</option>)}</select></Field>
                            <Field label="Tags (comma separated)"><input className={inputClass} value={definitionForm.tags} onChange={(e) => setDefinitionForm((value) => ({ ...value, tags: e.target.value }))} placeholder="fuel, wood, crafting" /></Field>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2"><Check label="Portable" checked={definitionForm.portable} onChange={(portable) => setDefinitionForm((value) => ({ ...value, portable }))} /><Check label="Stackable" checked={definitionForm.stackable} onChange={(stackable) => setDefinitionForm((value) => ({ ...value, stackable }))} /></div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <Field label="Max stack"><input type="number" min="1" className={inputClass} value={definitionForm.max_stack} onChange={(e) => setDefinitionForm((value) => ({ ...value, max_stack: e.target.value }))} /></Field>
                            <Field label="Container slots"><input type="number" min="0" className={inputClass} value={definitionForm.capacity} onChange={(e) => setDefinitionForm((value) => ({ ...value, capacity: e.target.value }))} /></Field>
                            <Field label="Fuel value (seconds)"><input type="number" min="0" className={inputClass} value={definitionForm.fuel_value} onChange={(e) => setDefinitionForm((value) => ({ ...value, fuel_value: e.target.value }))} /></Field>
                            <Field label="Burn rate / second"><input type="number" min="0" className={inputClass} value={definitionForm.burn_rate} onChange={(e) => setDefinitionForm((value) => ({ ...value, burn_rate: e.target.value }))} /></Field>
                        </div>
                        <Field label="Accepted fuel tags"><input className={inputClass} value={definitionForm.accepted_fuel_tags} onChange={(e) => setDefinitionForm((value) => ({ ...value, accepted_fuel_tags: e.target.value }))} placeholder="fuel, oil" /></Field>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <Field label="Equipment slot"><input className={inputClass} value={definitionForm.equipment_slot} onChange={(e) => setDefinitionForm((value) => ({ ...value, equipment_slot: e.target.value }))} placeholder="main-hand" /></Field>
                            <Field label="Weapon damage"><input type="number" min="0" className={inputClass} value={definitionForm.weapon_damage} onChange={(e) => setDefinitionForm((value) => ({ ...value, weapon_damage: e.target.value }))} /></Field>
                            <Field label="Armor value"><input type="number" min="0" className={inputClass} value={definitionForm.armor_value} onChange={(e) => setDefinitionForm((value) => ({ ...value, armor_value: e.target.value }))} /></Field>
                            <Field label="Scale with stat"><select className={inputClass} value={definitionForm.scales_with_stat} onChange={(e) => setDefinitionForm((value) => ({ ...value, scales_with_stat: e.target.value }))}><option value="">None</option>{stats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}</select></Field>
                        </div>
                        <Field label="Equipment stat modifiers (JSON)"><textarea className={`${inputClass} min-h-24 font-mono text-xs`} value={definitionForm.stat_modifiers} onChange={(e) => setDefinitionForm((value) => ({ ...value, stat_modifiers: e.target.value }))} placeholder={'{"strength": 2}'} /></Field>
                        <div className="rounded-lg border border-slate-700/60 p-4"><p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-300">Use behavior</p><div className="grid gap-4 md:grid-cols-3"><Field label="Target stat"><select className={inputClass} value={definitionForm.use_stat_id} onChange={(e) => setDefinitionForm((value) => ({ ...value, use_stat_id: e.target.value }))}><option value="">No use action</option>{stats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}</select></Field><Field label="Value change"><input type="number" className={inputClass} value={definitionForm.use_delta} onChange={(e) => setDefinitionForm((value) => ({ ...value, use_delta: e.target.value }))} /></Field><div className="flex items-end"><Check label="Consume one on use" checked={definitionForm.use_consume} onChange={(use_consume) => setDefinitionForm((value) => ({ ...value, use_consume }))} /></div></div></div>
                        <div className="flex flex-wrap justify-end gap-3">{editingDefinition && <button type="button" disabled={busy} onClick={() => remove('object_definitions', editingDefinition, 'Object primitive').then(() => { setEditingDefinition(null); setDefinitionForm(emptyDefinition()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200 hover:bg-rose-500/10">Delete</button>}<button type="button" disabled={busy} onClick={saveDefinition} className={buttonClass}>{busy ? 'Saving…' : 'Save primitive'}</button></div>
                    </div>
                </div>
            )}

            {activeTab === 'stats' && (
                <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[340px_1fr]">
                    <div className="space-y-2">{stats.map((stat) => <button key={stat.id} type="button" aria-pressed={editingStat === stat.id} onClick={() => { setEditingStat(stat.id); setStatForm({ ...emptyStat(), ...stat, role: stat.role || '' }); }} className={`w-full rounded-lg border p-4 text-left ${editingStat === stat.id ? 'border-purple-300 bg-purple-500/15' : 'border-slate-700/70 bg-slate-950/40 hover:border-slate-500'}`}><span className="text-sm text-slate-100">{stat.name}</span><span className="mt-1 block text-xs text-slate-500">{stat.default_value} default · {stat.minimum}–{stat.maximum}{stat.role ? ` · ${stat.role}` : ''}</span></button>)}</div>
                    <div className="space-y-5 rounded-xl border border-slate-700/70 bg-slate-950/35 p-5">
                        <div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.25em] text-purple-200">{editingStat ? 'Edit hero stat' : 'New hero stat'}</h3>{editingStat && <button type="button" onClick={() => { setEditingStat(null); setStatForm(emptyStat()); }} className="text-xs text-slate-400">New</button>}</div>
                        <div className="grid gap-4 md:grid-cols-2"><Field label="Name"><input className={inputClass} value={statForm.name} onChange={(e) => setStatForm((value) => ({ ...value, name: e.target.value }))} /></Field><Field label="Stable id"><input disabled={Boolean(editingStat)} className={inputClass} value={statForm.id} onChange={(e) => setStatForm((value) => ({ ...value, id: e.target.value }))} /></Field></div>
                        <Field label="Description"><textarea className={`${inputClass} min-h-24`} value={statForm.description} onChange={(e) => setStatForm((value) => ({ ...value, description: e.target.value }))} /></Field>
                        <div className="grid gap-4 md:grid-cols-4"><Field label="System role"><select className={inputClass} value={statForm.role} onChange={(e) => setStatForm((value) => ({ ...value, role: e.target.value }))}><option value="">Custom</option><option value="health">Health</option><option value="power">Combat power</option><option value="defense">Defense</option></select></Field><Field label="Minimum"><input type="number" className={inputClass} value={statForm.minimum} onChange={(e) => setStatForm((value) => ({ ...value, minimum: e.target.value }))} /></Field><Field label="Maximum"><input type="number" className={inputClass} value={statForm.maximum} onChange={(e) => setStatForm((value) => ({ ...value, maximum: e.target.value }))} /></Field><Field label="Default"><input type="number" className={inputClass} value={statForm.default_value} onChange={(e) => setStatForm((value) => ({ ...value, default_value: e.target.value }))} /></Field></div>
                        <Check label="Visible on the hero sheet" checked={statForm.visible} onChange={(visible) => setStatForm((value) => ({ ...value, visible }))} />
                        <div className="flex justify-end gap-3">{editingStat && <button type="button" disabled={busy} onClick={() => remove('stat_definitions', editingStat, 'Hero stat').then(() => { setEditingStat(null); setStatForm(emptyStat()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveStat} className={buttonClass}>Save stat</button></div>
                    </div>
                </div>
            )}

            {activeTab === 'instances' && (
                <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[1fr_420px]">
                    <div className="overflow-x-auto rounded-xl border border-slate-700/70"><div className="grid min-w-[680px] grid-cols-[1.2fr_1fr_1fr_auto] gap-3 border-b border-slate-700 bg-slate-950/60 px-4 py-3 text-[0.62rem] uppercase tracking-[0.16em] text-slate-500"><span>Object</span><span>Location</span><span>State</span><span /></div><div className="max-h-[560px] min-w-[680px] overflow-y-auto">{instances.map((instance) => { const definition = definitionsById.get(instance.definition_id); return <button key={instance.id} type="button" aria-pressed={editingInstance === instance.id} onClick={() => { setEditingInstance(instance.id); setInstanceForm({ ...emptyInstance(), ...instance, state_json: JSON.stringify(jsonObject(instance.state_json), null, 2), equipped_slot: instance.equipped_slot || '' }); }} className={`grid w-full grid-cols-[1.2fr_1fr_1fr_auto] gap-3 border-b border-slate-800 px-4 py-3 text-left text-xs ${editingInstance === instance.id ? 'bg-purple-500/15' : 'hover:bg-slate-800/50'}`}><span className="text-slate-100">{definition?.icon} {definition?.name || instance.definition_id} {instance.quantity > 1 ? `×${instance.quantity}` : ''}</span><span className="text-slate-400">{instance.location_kind} · {locationLabel(instance)}</span><span className="text-slate-400">{instance.is_active ? 'active' : 'idle'}{instance.fuel_remaining > 0 ? ` · fuel ${instance.fuel_remaining}` : ''}</span><span className="text-purple-300">Edit</span></button>; })}</div></div>
                    <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.22em] text-purple-200">{editingInstance ? 'Edit instance' : 'Place object'}</h3>{editingInstance && <button type="button" onClick={() => { setEditingInstance(null); setInstanceForm(emptyInstance()); }} className="text-xs text-slate-400">New</button>}</div><Field label="Definition"><select className={inputClass} value={instanceForm.definition_id} onChange={(e) => setInstanceForm((value) => ({ ...value, definition_id: e.target.value }))}><option value="">Choose primitive…</option>{definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.icon} {definition.name}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Location type"><select className={inputClass} value={instanceForm.location_kind} onChange={(e) => setInstanceForm((value) => ({ ...value, location_kind: e.target.value, location_id: '' }))}><option value="room">Room</option><option value="inventory">Actor inventory</option><option value="equipped">Equipped by actor</option><option value="container">Inside container</option></select></Field><Field label="Location"><select className={inputClass} value={instanceForm.location_id} onChange={(e) => setInstanceForm((value) => ({ ...value, location_id: e.target.value }))}><option value="">Choose…</option>{validLocationTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></Field></div><div className="grid gap-4 sm:grid-cols-3"><Field label="Quantity"><input type="number" min="1" className={inputClass} value={instanceForm.quantity} onChange={(e) => setInstanceForm((value) => ({ ...value, quantity: e.target.value }))} /></Field><Field label="Durability"><input type="number" min="0" className={inputClass} value={instanceForm.durability} onChange={(e) => setInstanceForm((value) => ({ ...value, durability: e.target.value }))} /></Field><Field label="Fuel"><input type="number" min="0" className={inputClass} value={instanceForm.fuel_remaining} onChange={(e) => setInstanceForm((value) => ({ ...value, fuel_remaining: e.target.value }))} /></Field></div>{instanceForm.location_kind === 'equipped' && <Field label="Equipment slot"><input className={inputClass} value={instanceForm.equipped_slot} onChange={(e) => setInstanceForm((value) => ({ ...value, equipped_slot: e.target.value }))} /></Field>}<Check label="Active / burning" checked={instanceForm.is_active} onChange={(is_active) => setInstanceForm((value) => ({ ...value, is_active }))} /><Field label="Custom state (JSON)"><textarea className={`${inputClass} min-h-24 font-mono text-xs`} value={instanceForm.state_json} onChange={(e) => setInstanceForm((value) => ({ ...value, state_json: e.target.value }))} /></Field><div className="flex justify-end gap-3">{editingInstance && <button type="button" disabled={busy} onClick={() => remove('world_objects', editingInstance, 'Object instance').then(() => { setEditingInstance(null); setInstanceForm(emptyInstance()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveInstance} className={buttonClass}>Save placement</button></div></div>
                </div>
            )}

            {activeTab === 'actors' && (
                <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[1fr_420px]">
                    <div className="space-y-2">{actorStats.map((row) => <button key={row.id} type="button" aria-pressed={editingActorStat === row.id} onClick={() => { setEditingActorStat(row.id); setActorStatForm({ ...emptyActorStat(), ...row }); }} className={`grid w-full gap-2 rounded-lg border p-4 text-left text-sm sm:grid-cols-3 sm:gap-3 ${editingActorStat === row.id ? 'border-purple-300 bg-purple-500/15' : 'border-slate-700/70 bg-slate-950/40 hover:border-purple-400/50'}`}><span className="text-slate-100">{actorsById.get(row.actor_id)?.label || row.actor_id}</span><span className="text-slate-300">{stats.find((stat) => stat.id === row.stat_definition_id)?.name || row.stat_definition_id}</span><span className="text-purple-200 sm:text-right">{row.current_value} / base {row.base_value}</span></button>)}</div>
                    <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-5"><div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.22em] text-purple-200">{editingActorStat ? 'Edit actor value' : 'Set actor value'}</h3>{editingActorStat && <button type="button" onClick={() => { setEditingActorStat(null); setActorStatForm(emptyActorStat()); }} className="text-xs text-slate-400">New</button>}</div><Field label="Actor"><select disabled={Boolean(editingActorStat)} className={inputClass} value={actorStatForm.actor_id} onChange={(e) => setActorStatForm((value) => ({ ...value, actor_id: e.target.value }))}><option value="">Choose actor…</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.label}</option>)}</select></Field><Field label="Stat"><select disabled={Boolean(editingActorStat)} className={inputClass} value={actorStatForm.stat_definition_id} onChange={(e) => { const definition = stats.find((stat) => stat.id === e.target.value); setActorStatForm((value) => ({ ...value, stat_definition_id: e.target.value, base_value: definition?.default_value ?? 0, current_value: definition?.default_value ?? 0 })); }}><option value="">Choose stat…</option>{stats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}</select></Field><div className="grid grid-cols-2 gap-4"><Field label="Base value"><input type="number" className={inputClass} value={actorStatForm.base_value} onChange={(e) => setActorStatForm((value) => ({ ...value, base_value: e.target.value }))} /></Field><Field label="Current value"><input type="number" className={inputClass} value={actorStatForm.current_value} onChange={(e) => setActorStatForm((value) => ({ ...value, current_value: e.target.value }))} /></Field></div><p className="text-xs leading-5 text-slate-500">Actors without an override inherit the stat definition default. Equipment modifiers are applied at runtime without replacing these values.</p><div className="flex justify-end gap-3">{editingActorStat && <button type="button" disabled={busy} onClick={() => remove('actor_stats', editingActorStat, 'Actor stat').then(() => { setEditingActorStat(null); setActorStatForm(emptyActorStat()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveActorStat} className={buttonClass}>Save value</button></div></div>
                </div>
            )}
        </section>
    );
}
