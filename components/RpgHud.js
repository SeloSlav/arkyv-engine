import React, { useCallback, useEffect, useMemo, useState } from 'react';
import getSpacetimeClient from '@/lib/spacetimedbClient';

export default function RpgHud({ actor, onExecuteCommand, className = '' }) {
    const spacetime = useMemo(() => getSpacetimeClient(), []);
    const [tab, setTab] = useState('inventory');
    const [definitions, setDefinitions] = useState(new Map());
    const [objects, setObjects] = useState([]);
    const [stats, setStats] = useState([]);

    const refresh = useCallback(async () => {
        if (!actor?.id) {
            setObjects([]);
            setStats([]);
            return;
        }
        const [definitionsResult, objectsResult, statDefinitionsResult, actorStatsResult] = await Promise.all([
            spacetime.from('object_definitions').select('*'),
            spacetime.from('world_objects').select('*').eq('location_id', actor.id),
            spacetime.from('stat_definitions').select('*'),
            spacetime.from('actor_stats').select('*').eq('actor_id', actor.id),
        ]);
        if (definitionsResult.error || objectsResult.error || statDefinitionsResult.error || actorStatsResult.error) return;
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
    }, [actor?.id, spacetime]);

    useEffect(() => {
        refresh();
        if (!actor?.id) return undefined;
        const timer = window.setInterval(refresh, 1500);
        return () => window.clearInterval(timer);
    }, [actor?.id, refresh]);

    if (!actor?.id) return null;

    return (
        <section className={`min-h-0 overflow-hidden rounded-lg border border-purple-400/30 bg-slate-950/80 ${className}`} aria-label="Character RPG status">
            <div className="flex border-b border-slate-700/70">
                {['inventory', 'stats'].map((value) => (
                    <button key={value} type="button" onClick={() => setTab(value)} className={`flex-1 px-3 py-2 text-[0.62rem] uppercase tracking-[0.2em] ${tab === value ? 'bg-purple-500/20 text-purple-200' : 'text-slate-500 hover:text-slate-300'}`}>{value}</button>
                ))}
            </div>
            <div className="max-h-44 overflow-y-auto p-3">
                {tab === 'inventory' && (
                    <div className="space-y-2">
                        {objects.length === 0 && <p className="text-xs text-slate-600">Nothing carried.</p>}
                        {objects.map((object) => {
                            const definition = definitions.get(object.definition_id);
                            return (
                                <button key={object.id} type="button" onClick={() => onExecuteCommand?.(`examine ${definition?.name || object.definition_id}`)} className="flex w-full items-center justify-between rounded border border-slate-800 bg-black/20 px-2.5 py-2 text-left text-xs hover:border-purple-400/40">
                                    <span className="truncate text-slate-200">{definition?.icon || '◇'} {definition?.name || object.definition_id}{object.quantity > 1 ? ` ×${object.quantity}` : ''}</span>
                                    <span className="ml-2 text-[0.58rem] uppercase tracking-wider text-slate-500">{object.location_kind === 'equipped' ? object.equipped_slot || 'equipped' : 'carried'}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
                {tab === 'stats' && (
                    <div className="grid grid-cols-2 gap-2">
                        {stats.length === 0 && <p className="col-span-2 text-xs text-slate-600">No visible stats configured.</p>}
                        {stats.map((stat) => (
                            <div key={stat.id} className="rounded border border-slate-800 bg-black/20 px-2.5 py-2">
                                <span className="block text-[0.58rem] uppercase tracking-wider text-slate-500">{stat.name}</span>
                                <strong className="text-sm text-purple-100">{stat.value}</strong>
                                {stat.bonus !== 0 && <span className="ml-1 text-[0.6rem] text-emerald-300">({stat.bonus > 0 ? '+' : ''}{stat.bonus})</span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
