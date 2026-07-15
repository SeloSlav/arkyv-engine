import React, { useCallback, useEffect, useMemo, useState } from 'react';
import getSpacetimeClient from '@/lib/spacetimedbClient';

const TABS = [
    { id: 'gear', label: 'Gear' },
    { id: 'stats', label: 'Stats' },
    { id: 'combat', label: 'Combat' },
];

function cleanTargetName(value = '') {
    return String(value).split(' [')[0].split(' (talk ')[0].split(' - ')[0].trim();
}

function npcDisposition(npc) {
    if (npc?.disposition) return npc.disposition;
    return npc?.alias?.toLowerCase() === 'archie' ? 'friendly' : 'neutral';
}

function ItemArt({ definition, size = 'md' }) {
    const dimension = size === 'sm' ? 'h-9 w-9' : 'h-12 w-12';
    if (definition?.image_url) {
        return (
            <img
                src={definition.image_url}
                alt=""
                className={`${dimension} flex-none rounded-lg border border-cyan-300/15 bg-slate-950 object-cover [image-rendering:pixelated]`}
            />
        );
    }
    return (
        <span className={`${dimension} flex flex-none items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-xl`} aria-hidden="true">
            {definition?.icon || '◇'}
        </span>
    );
}

export default function RpgHud({ actor, environmentData = {}, onExecuteCommand, className = '' }) {
    const spacetime = useMemo(() => getSpacetimeClient(), []);
    const [tab, setTab] = useState('gear');
    const [definitions, setDefinitions] = useState(new Map());
    const [objects, setObjects] = useState([]);
    const [stats, setStats] = useState([]);
    const [zone, setZone] = useState({ pvpEnabled: false, name: '' });
    const [nearbyNpcs, setNearbyNpcs] = useState([]);

    const run = useCallback((command) => onExecuteCommand?.(command), [onExecuteCommand]);

    const refresh = useCallback(async () => {
        if (!actor?.id) {
            setObjects([]);
            setStats([]);
            setNearbyNpcs([]);
            return;
        }
        const [definitionsResult, objectsResult, statDefinitionsResult, actorStatsResult, roomsResult, regionsResult, npcsResult] = await Promise.all([
            spacetime.from('object_definitions').select('*'),
            spacetime.from('world_objects').select('*').eq('location_id', actor.id),
            spacetime.from('stat_definitions').select('*'),
            spacetime.from('actor_stats').select('*').eq('actor_id', actor.id),
            spacetime.from('rooms').select('*'),
            spacetime.from('regions').select('*'),
            spacetime.from('npcs').select('*'),
        ]);
        if (definitionsResult.error || objectsResult.error || statDefinitionsResult.error || actorStatsResult.error || roomsResult.error || regionsResult.error || npcsResult.error) return;
        const nextDefinitions = new Map((definitionsResult.data || []).map((definition) => [definition.id, definition]));
        const overrides = new Map((actorStatsResult.data || []).map((row) => [row.stat_definition_id, row]));
        const equipped = (objectsResult.data || []).filter((object) => object.location_kind === 'equipped');
        const equipmentBonus = (statId) => equipped.reduce((total, object) => {
            const modifier = nextDefinitions.get(object.definition_id)?.stat_modifiers?.[statId];
            return total + (Number(modifier) || 0);
        }, 0);
        setDefinitions(nextDefinitions);
        setObjects((objectsResult.data || []).filter((object) => ['inventory', 'equipped'].includes(object.location_kind)));
        setStats((statDefinitionsResult.data || []).filter((definition) => definition.visible).map((definition) => {
            const row = overrides.get(definition.id);
            const rawValue = row?.current_value ?? definition.default_value;
            const bonus = equipmentBonus(definition.id);
            return { ...definition, value: rawValue + bonus, rawValue, bonus };
        }));
        const room = (roomsResult.data || []).find((candidate) => candidate.id === actor.current_room);
        const region = (regionsResult.data || []).find((candidate) => candidate.name === room?.region_name);
        setZone({ pvpEnabled: Boolean(region?.pvp_enabled), name: region?.display_name || region?.name || room?.region || '' });
        setNearbyNpcs((npcsResult.data || []).filter((npc) => npc.current_room === actor.current_room));
    }, [actor?.current_room, actor?.id, spacetime]);

    useEffect(() => {
        refresh();
        if (!actor?.id) return undefined;
        const timer = window.setInterval(refresh, 1500);
        return () => window.clearInterval(timer);
    }, [actor?.id, refresh]);

    const inventory = objects.filter((object) => object.location_kind === 'inventory');
    const equipped = objects.filter((object) => object.location_kind === 'equipped');
    const playerTargets = zone.pvpEnabled ? (environmentData.characters || []).map((name) => ({ name: cleanTargetName(name), kind: 'Player' })) : [];
    const npcTargets = nearbyNpcs
        .filter((npc) => npcDisposition(npc) !== 'friendly')
        .map((npc) => ({ name: npc.name, kind: npcDisposition(npc) === 'hostile' ? 'Enemy NPC' : 'Neutral NPC' }));
    const targets = [...npcTargets, ...playerTargets].filter((target) => target.name);

    return (
        <section className={`arkyv-panel flex min-h-0 flex-col overflow-hidden ${className}`} aria-label="Character status and actions">
            <div className="flex min-h-[3rem] items-center border-b border-slate-700/70 bg-slate-950/75 px-2">
                {TABS.map((value) => (
                    <button
                        key={value.id}
                        type="button"
                        onClick={() => setTab(value.id)}
                        className={`min-h-11 flex-1 rounded-md px-2 text-[0.65rem] font-semibold uppercase tracking-[0.17em] transition ${tab === value.id ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'}`}
                    >
                        {value.label}
                    </button>
                ))}
            </div>

            <div className="terminal-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                {!actor?.id && (
                    <div className="flex h-full min-h-32 flex-col items-center justify-center px-4 text-center">
                        <span className="mb-2 text-2xl text-cyan-200" aria-hidden="true">◇</span>
                        <p className="text-sm font-semibold text-slate-200">No active character</p>
                        <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Use the terminal to create or select a character. Their gear, stats, and combat actions will appear here.</p>
                    </div>
                )}

                {actor?.id && tab === 'gear' && (
                    <div className="space-y-4">
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Equipped</h3>
                                <span className="text-[0.62rem] text-slate-600">{equipped.length} slots used</span>
                            </div>
                            <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                                {equipped.length === 0 && <p className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-xs text-slate-600">No equipment worn.</p>}
                                {equipped.map((object) => {
                                    const definition = definitions.get(object.definition_id);
                                    return (
                                        <div key={object.id} className="flex items-center gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-2.5">
                                            <ItemArt definition={definition} size="sm" />
                                            <button type="button" onClick={() => run(`examine ${definition?.name || object.definition_id}`)} className="min-w-0 flex-1 text-left">
                                                <span className="block truncate text-xs font-semibold text-slate-100">{definition?.name || object.definition_id}</span>
                                                <span className="block truncate text-[0.6rem] uppercase tracking-wider text-cyan-300/70">{object.equipped_slot || definition?.equipment_slot || 'equipped'}</span>
                                            </button>
                                            <button type="button" onClick={() => run(`unequip ${definition?.name || object.definition_id}`)} className="arkyv-chip">Remove</button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Inventory</h3>
                                <span className="text-[0.62rem] text-slate-600">{inventory.length} item types</span>
                            </div>
                            <div className="space-y-2">
                                {inventory.length === 0 && <p className="rounded-lg border border-dashed border-slate-800 px-3 py-5 text-center text-xs text-slate-600">Your pack is empty. Use <span className="text-slate-400">take</span> to pick up nearby objects.</p>}
                                {inventory.map((object) => {
                                    const definition = definitions.get(object.definition_id);
                                    const name = definition?.name || object.definition_id;
                                    const canEquip = Boolean(definition?.equipment_slot);
                                    const canUse = Boolean(definition?.on_use && Object.keys(definition.on_use).length);
                                    return (
                                        <article key={object.id} className="flex gap-3 rounded-xl border border-slate-800 bg-black/20 p-2.5 hover:border-slate-700">
                                            <button type="button" onClick={() => run(`examine ${name}`)} aria-label={`Examine ${name}`}><ItemArt definition={definition} /></button>
                                            <div className="min-w-0 flex-1">
                                                <button type="button" onClick={() => run(`examine ${name}`)} className="block max-w-full truncate text-left text-xs font-semibold text-slate-100">{name}{object.quantity > 1 ? ` ×${object.quantity}` : ''}</button>
                                                <p className="mt-0.5 truncate text-[0.65rem] text-slate-500">{definition?.description || definition?.primitive_kind || 'Inventory item'}</p>
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {canEquip && <button type="button" onClick={() => run(`equip ${name}`)} className="arkyv-chip arkyv-chip--accent">Equip</button>}
                                                    {canUse && <button type="button" onClick={() => run(`use ${name}`)} className="arkyv-chip arkyv-chip--accent">Use</button>}
                                                    <button type="button" onClick={() => run(`drop ${name}`)} className="arkyv-chip">Drop</button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {actor?.id && tab === 'stats' && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {stats.length === 0 && <p className="sm:col-span-2 rounded-lg border border-dashed border-slate-800 p-5 text-center text-xs text-slate-600">No visible stats configured for this world.</p>}
                        {stats.map((stat) => {
                            const max = Math.max(Number(stat.maximum) || Number(stat.value) || 1, 1);
                            const progress = Math.min(100, Math.max(0, (Number(stat.value) / max) * 100));
                            return (
                                <article key={stat.id} className="rounded-xl border border-slate-800 bg-black/20 p-3">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">{stat.name}</span>
                                        <strong className="text-base text-cyan-100">{stat.value}<span className="text-xs font-normal text-slate-600"> / {max}</span></strong>
                                    </div>
                                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500" style={{ width: `${progress}%` }} /></div>
                                    {stat.bonus !== 0 && <p className="mt-1.5 text-[0.62rem] text-emerald-300">Equipment {stat.bonus > 0 ? '+' : ''}{stat.bonus}</p>}
                                </article>
                            );
                        })}
                    </div>
                )}

                {actor?.id && tab === 'combat' && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-fuchsia-400/15 bg-fuchsia-400/[0.04] p-3">
                            <p className="text-xs font-semibold text-slate-100">Choose a target</p>
                            <p className="mt-1 text-[0.68rem] leading-5 text-slate-500">Attacks use your equipped weapon, strength scaling, and the target&apos;s defense.</p>
                            <p className={`mt-2 text-[0.65rem] font-semibold uppercase tracking-wider ${zone.pvpEnabled ? 'text-rose-300' : 'text-emerald-300'}`}>{zone.name || 'Current region'} · PvP {zone.pvpEnabled ? 'enabled' : 'disabled'}</p>
                        </div>
                        <div className="space-y-2">
                            {targets.length === 0 && <p className="rounded-lg border border-dashed border-slate-800 p-5 text-center text-xs text-slate-600">No attackable characters or NPCs are visible here. Try <span className="text-slate-400">look</span>.</p>}
                            {targets.map((target) => (
                                <div key={`${target.kind}-${target.name}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-black/20 p-3">
                                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{target.name}</p><p className="text-[0.62rem] uppercase tracking-wider text-slate-600">{target.kind}</p></div>
                                    <button type="button" onClick={() => run(`attack ${target.name}`)} className="min-h-10 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 text-xs font-semibold uppercase tracking-wider text-rose-200 hover:bg-rose-500/20">Attack</button>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                            {['look', 'combat', 'loot', 'rest', 'wait'].map((command) => <button key={command} type="button" onClick={() => run(command)} className="arkyv-chip">/{command}</button>)}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
