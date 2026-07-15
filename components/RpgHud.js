import React, { useCallback, useEffect, useMemo, useState } from 'react';
import getSpacetimeClient from '@/lib/spacetimedbClient';

const TABS = [
    { id: 'gear', label: 'Gear' },
    { id: 'stats', label: 'Stats' },
    { id: 'abilities', label: 'Abilities' },
    { id: 'adventure', label: 'Quests' },
    { id: 'combat', label: 'Combat' },
];

function xpForNextLevel(config, level) {
    let required = Math.max(1, Number(config?.base_xp) || 100);
    const growth = Math.max(0, Number(config?.growth_percent) || 0);
    for (let current = 1; current < Math.max(1, Number(level) || 1); current += 1) {
        required = Math.max(required + 1, Math.floor((required * (100 + growth)) / 100));
    }
    return required;
}

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
    const [progression, setProgression] = useState({ level: 1, experience: 0, unspent_stat_points: 0 });
    const [progressionConfig, setProgressionConfig] = useState(null);
    const [abilities, setAbilities] = useState([]);
    const [abilityGrants, setAbilityGrants] = useState([]);
    const [cooldowns, setCooldowns] = useState([]);
    const [equipmentSlots, setEquipmentSlots] = useState([]);
    const [factions, setFactions] = useState([]);
    const [reputations, setReputations] = useState([]);
    const [quests, setQuests] = useState([]);
    const [questObjectives, setQuestObjectives] = useState([]);
    const [actorQuests, setActorQuests] = useState([]);
    const [questProgress, setQuestProgress] = useState([]);
    const [wallet, setWallet] = useState({ gold: 0 });
    const [lifeState, setLifeState] = useState(null);
    const [lifecycleConfig, setLifecycleConfig] = useState(null);

    const run = useCallback((command) => onExecuteCommand?.(command), [onExecuteCommand]);

    const refresh = useCallback(async () => {
        if (!actor?.id) {
            setObjects([]);
            setStats([]);
            setNearbyNpcs([]);
            setLifeState(null);
            return;
        }
        const [definitionsResult, objectsResult, statDefinitionsResult, actorStatsResult, roomsResult, regionsResult, npcsResult, progressionResult, progressionConfigResult, abilitiesResult, grantsResult, cooldownsResult, slotsResult, factionsResult, reputationsResult, questsResult, objectivesResult, actorQuestsResult, questProgressResult, walletResult, lifeStateResult, lifecycleConfigResult] = await Promise.all([
            spacetime.from('object_definitions').select('*'),
            spacetime.from('world_objects').select('*').eq('location_id', actor.id),
            spacetime.from('stat_definitions').select('*'),
            spacetime.from('actor_stats').select('*').eq('actor_id', actor.id),
            spacetime.from('rooms').select('*'),
            spacetime.from('regions').select('*'),
            spacetime.from('npcs').select('*'),
            spacetime.from('actor_progressions').select('*').eq('actor_id', actor.id),
            spacetime.from('progression_configs').select('*'),
            spacetime.from('ability_definitions').select('*').order('required_level'),
            spacetime.from('actor_abilities').select('*').eq('actor_id', actor.id),
            spacetime.from('actor_cooldowns').select('*').eq('actor_id', actor.id),
            spacetime.from('equipment_slot_definitions').select('*').order('sort_order'),
            spacetime.from('faction_definitions').select('*').order('name'),
            spacetime.from('actor_faction_reputations').select('*').eq('actor_id', actor.id),
            spacetime.from('quest_definitions').select('*').eq('active', true).order('title'),
            spacetime.from('quest_objectives').select('*').order('sort_order'),
            spacetime.from('actor_quests').select('*').eq('actor_id', actor.id),
            spacetime.from('actor_quest_progress').select('*').eq('actor_id', actor.id),
            spacetime.from('actor_wallets').select('*').eq('actor_id', actor.id),
            spacetime.from('actor_life_states').select('*').eq('actor_id', actor.id),
            spacetime.from('world_lifecycle_configs').select('*'),
        ]);
        if ([definitionsResult, objectsResult, statDefinitionsResult, actorStatsResult, roomsResult, regionsResult, npcsResult, progressionResult, progressionConfigResult, abilitiesResult, grantsResult, cooldownsResult, slotsResult, factionsResult, reputationsResult, questsResult, objectivesResult, actorQuestsResult, questProgressResult, walletResult, lifeStateResult, lifecycleConfigResult].some((result) => result.error)) return;
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
            const rawBase = row?.base_value ?? definition.default_value;
            const updatedAt = row?.updated_at ? new Date(row.updated_at).getTime() : Date.now();
            const elapsedSeconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
            const rawValue = Math.min(rawBase, (row?.current_value ?? definition.default_value) + elapsedSeconds * Math.max(0, Number(definition.regeneration_per_second) || 0));
            const bonus = equipmentBonus(definition.id);
            return { ...definition, value: rawValue + bonus, rawValue, baseValue: rawBase + bonus, bonus };
        }));
        const room = (roomsResult.data || []).find((candidate) => candidate.id === actor.current_room);
        const region = (regionsResult.data || []).find((candidate) => candidate.name === room?.region_name);
        setZone({ pvpEnabled: Boolean(region?.pvp_enabled), name: region?.display_name || region?.name || room?.region || '' });
        setNearbyNpcs((npcsResult.data || []).filter((npc) => npc.current_room === actor.current_room));
        setProgression((progressionResult.data || [])[0] || { level: 1, experience: 0, unspent_stat_points: 0 });
        setProgressionConfig((progressionConfigResult.data || [])[0] || null);
        setAbilities(abilitiesResult.data || []);
        setAbilityGrants(grantsResult.data || []);
        setCooldowns(cooldownsResult.data || []);
        setEquipmentSlots(slotsResult.data || []);
        setFactions(factionsResult.data || []);
        setReputations(reputationsResult.data || []);
        setQuests(questsResult.data || []);
        setQuestObjectives(objectivesResult.data || []);
        setActorQuests(actorQuestsResult.data || []);
        setQuestProgress(questProgressResult.data || []);
        setWallet((walletResult.data || [])[0] || { gold: 0 });
        setLifeState((lifeStateResult.data || [])[0] || null);
        setLifecycleConfig((lifecycleConfigResult.data || [])[0] || null);
    }, [actor?.current_room, actor?.id, spacetime]);

    useEffect(() => {
        refresh();
        if (!actor?.id) return undefined;
        const timer = window.setInterval(refresh, 1500);
        return () => window.clearInterval(timer);
    }, [actor?.id, refresh]);

    const inventory = objects.filter((object) => object.location_kind === 'inventory');
    const equipped = objects.filter((object) => object.location_kind === 'equipped');
    const level = Math.max(1, Number(progression.level) || 1);
    const xpRequired = xpForNextLevel(progressionConfig, level);
    const atLevelCap = level >= Math.max(1, Number(progressionConfig?.max_level) || 60);
    const inventoryCapacity = Math.max(0, Number(progressionConfig?.base_inventory_slots ?? 20))
        + Math.max(0, level - 1) * Math.max(0, Number(progressionConfig?.inventory_slots_per_level ?? 0))
        + equipped.reduce((total, object) => total + (Number(definitions.get(object.definition_id)?.inventory_slots_bonus) || 0), 0);
    const slotCapacity = new Map(equipmentSlots.map((slot) => [slot.id, Number(slot.capacity) || 1]));
    const grantedAbilityIds = new Set(abilityGrants.map((grant) => grant.ability_id));
    const statById = new Map(stats.map((stat) => [stat.id, stat]));
    const cooldownRemaining = (abilityId) => {
        const row = cooldowns.find((cooldown) => cooldown.action_id === `ability:${abilityId}`);
        return Math.max(0, Math.ceil(((Number(row?.ready_at_micros) || 0) - Date.now() * 1000) / 1000));
    };
    const playerTargets = zone.pvpEnabled ? (environmentData.characters || []).map((name) => ({ name: cleanTargetName(name), kind: 'Player' })) : [];
    const npcTargets = nearbyNpcs
        .filter((npc) => npcDisposition(npc) !== 'friendly')
        .map((npc) => ({ name: npc.name, kind: npcDisposition(npc) === 'hostile' ? 'Enemy NPC' : 'Neutral NPC' }));
    const targets = [...npcTargets, ...playerTargets].filter((target) => target.name);
    const npcsById = new Map(nearbyNpcs.map((npc) => [npc.id, npc]));
    const factionsById = new Map(factions.map((faction) => [faction.id, faction]));
    const reputationByFaction = new Map(reputations.map((row) => [row.faction_id, Number(row.reputation) || 0]));
    const actorQuestByQuest = new Map(actorQuests.map((row) => [row.quest_id, row]));
    const progressByObjective = new Map(questProgress.map((row) => [row.objective_id, Number(row.progress) || 0]));
    const objectiveLabel = (objective) => {
        if (objective.description) return objective.description;
        if (objective.objective_type === 'explore_room') return `Explore ${objective.target_id}`;
        if (objective.objective_type === 'acquire_item') return `Acquire ${definitions.get(objective.target_id)?.name || objective.target_id}`;
        if (objective.objective_type === 'kill_faction') return `Defeat members of ${factionsById.get(objective.target_id)?.name || objective.target_id}`;
        const npc = nearbyNpcs.find((candidate) => candidate.id === objective.target_id);
        return `${objective.objective_type === 'talk_npc' ? 'Speak with' : 'Defeat'} ${npc?.name || objective.target_id}`;
    };
    const activeQuestCards = actorQuests.filter((row) => row.status !== 'completed').map((row) => ({ row, quest: quests.find((quest) => quest.id === row.quest_id) })).filter((value) => value.quest);
    const availableQuests = quests.filter((quest) => {
        if (!npcsById.has(quest.quest_giver_npc_id) || level < Number(quest.required_level || 1)) return false;
        if (quest.required_faction_id) {
            const faction = factionsById.get(quest.required_faction_id);
            const standing = reputationByFaction.has(quest.required_faction_id) ? reputationByFaction.get(quest.required_faction_id) : Number(faction?.starting_reputation) || 0;
            if (standing < Number(quest.required_reputation || 0)) return false;
        }
        const state = actorQuestByQuest.get(quest.id);
        return !state || (state.status === 'completed' && quest.repeatable);
    });
    const respawnSeconds = Math.max(0, Math.ceil(((Number(lifeState?.respawn_available_at_micros) || 0) - Date.now() * 1000) / 1_000_000));
    const protectionSeconds = Math.max(0, Math.ceil(((Number(lifeState?.protected_until_micros) || 0) - Date.now() * 1000) / 1_000_000));
    const isDead = lifeState?.state === 'dead';

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

                {actor?.id && isDead && (
                    <div className="flex min-h-full flex-col items-center justify-center px-4 py-8 text-center">
                        <span className="text-4xl text-purple-200" aria-hidden="true">◇</span>
                        <h3 className="mt-4 font-terminal text-sm uppercase tracking-[0.24em] text-rose-200">You are defeated</h3>
                        <p className="mt-2 max-w-sm text-xs leading-5 text-slate-400">Your character is between death and respawn. Movement, combat, inventory actions, and abilities are unavailable until you return.</p>
                        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 px-5 py-3 text-xs text-slate-300">
                            {respawnSeconds > 0 ? `Respawn available in ${respawnSeconds} second${respawnSeconds === 1 ? '' : 's'}.` : 'You may respawn now.'}
                        </div>
                        <button type="button" disabled={respawnSeconds > 0} onClick={() => run('respawn')} className="mt-4 min-h-11 rounded-lg border border-purple-300/40 bg-purple-500/15 px-6 text-xs font-semibold uppercase tracking-[0.18em] text-purple-100 transition hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40">Respawn</button>
                        <p className="mt-3 text-[0.65rem] text-slate-600">Deaths recorded: {lifeState.death_count || 0}{lifecycleConfig?.inventory_loss_mode && lifecycleConfig.inventory_loss_mode !== 'keep' ? ` · item rule: ${lifecycleConfig.inventory_loss_mode.replaceAll('_', ' ')}` : ''}</p>
                    </div>
                )}

                {actor?.id && !isDead && protectionSeconds > 0 && (
                    <div className="mb-3 rounded-lg border border-cyan-400/25 bg-cyan-500/[0.06] px-3 py-2 text-center text-[0.65rem] text-cyan-100">Respawn protection: {protectionSeconds}s. Attacking ends it early.</div>
                )}

                {actor?.id && !isDead && tab === 'gear' && (
                    <div className="space-y-4">
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Equipped</h3>
                                <span className="text-[0.62rem] text-slate-600">{equipped.length} items equipped</span>
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
                                                <span className="block truncate text-[0.6rem] uppercase tracking-wider text-cyan-300/70">{object.equipped_slot || definition?.equipment_slot || 'equipped'} · {equipped.filter((item) => (item.equipped_slot || definitions.get(item.definition_id)?.equipment_slot) === (object.equipped_slot || definition?.equipment_slot)).length}/{slotCapacity.get(object.equipped_slot || definition?.equipment_slot) || 1}</span>
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
                                <span className={`text-[0.62rem] ${inventory.length >= inventoryCapacity ? 'text-rose-300' : 'text-slate-500'}`}>{inventory.length} / {inventoryCapacity} slots</span>
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

                {actor?.id && !isDead && tab === 'stats' && (
                    <div className="space-y-3">
                        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3"><div className="flex items-baseline justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Level {level}</span><span className="text-xs text-slate-400">{atLevelCap ? 'Level cap' : `${progression.experience || 0} / ${xpRequired} XP`}</span></div>{!atLevelCap && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-fuchsia-500" style={{ width: `${Math.min(100, Math.max(0, ((Number(progression.experience) || 0) / xpRequired) * 100))}%` }} /></div>}{Number(progression.unspent_stat_points) > 0 && <p className="mt-2 text-[0.65rem] text-amber-100">{progression.unspent_stat_points} unspent stat point{Number(progression.unspent_stat_points) === 1 ? '' : 's'}</p>}</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {stats.length === 0 && <p className="sm:col-span-2 rounded-lg border border-dashed border-slate-800 p-5 text-center text-xs text-slate-600">No visible stats configured for this world.</p>}
                        {stats.map((stat) => {
                            const max = Math.max(Number(stat.baseValue) || Number(stat.value) || 1, 1);
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
                    </div>
                )}

                {actor?.id && !isDead && tab === 'abilities' && (
                    <div className="space-y-3">
                        <div className="rounded-xl border border-fuchsia-400/15 bg-fuchsia-400/[0.04] p-3"><p className="text-xs font-semibold text-slate-100">Abilities & magic</p><p className="mt-1 text-[0.68rem] leading-5 text-slate-500">Costs, cast pacing, scaling, targets, and damage are authored by the world administrator and enforced by the server.</p></div>
                        {abilities.filter((ability) => ability.enabled).map((ability) => {
                            const learned = (ability.auto_learn && level >= Number(ability.required_level || 1)) || grantedAbilityIds.has(ability.id);
                            const resource = ability.resource_stat_id ? statById.get(ability.resource_stat_id) : null;
                            const remaining = cooldownRemaining(ability.id);
                            const affordable = !resource || Number(resource.rawValue) >= Number(ability.resource_cost || 0);
                            const canUse = learned && remaining === 0 && affordable;
                            const usableTargets = ability.target_type === 'enemy' ? targets : ability.target_type === 'ally' ? [{ name: actor.name || 'self', kind: 'Self' }, ...playerTargets] : [{ name: actor.name || 'self', kind: 'Self' }];
                            return <article key={ability.id} className={`rounded-xl border p-3 ${learned ? 'border-slate-800 bg-black/20' : 'border-slate-800/60 bg-slate-950/20 opacity-65'}`}><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/10 text-xl">{ability.icon || '✦'}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-slate-100">{ability.name}</h3><span className="text-[0.62rem] uppercase tracking-wider text-slate-500">{ability.school} · {ability.effect_type}</span></div><p className="mt-1 text-[0.68rem] leading-5 text-slate-500">{ability.description}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.62rem] text-slate-400"><span>{ability.power_min}–{ability.power_max} power</span><span>{ability.resource_stat_id ? `${ability.resource_cost} ${resource?.name || ability.resource_stat_id}` : 'Free'}</span><span>{Math.max(ability.cooldown_ms || 0, ability.cast_time_ms || 0) / 1000}s pace</span>{ability.scaling_percent > 0 && <span>+{ability.scaling_percent}% {statById.get(ability.scales_with_stat)?.name || ability.scales_with_stat}</span>}</div>{!learned ? <p className="mt-2 text-xs text-amber-300">{ability.auto_learn ? `Unlocks at level ${ability.required_level}` : 'Requires an explicit grant'}</p> : remaining > 0 ? <p className="mt-2 text-xs text-fuchsia-300">Ready in {(remaining / 1000).toFixed(1)}s</p> : !affordable ? <p className="mt-2 text-xs text-rose-300">Not enough {resource?.name || 'resource'}</p> : <div className="mt-2 flex flex-wrap gap-1.5">{usableTargets.length === 0 && <span className="text-xs text-slate-600">No valid targets nearby.</span>}{usableTargets.slice(0, 5).map((target) => <button key={`${ability.id}-${target.kind}-${target.name}`} type="button" disabled={!canUse} onClick={() => run(ability.target_type === 'self' ? `cast ${ability.name}` : `cast ${ability.name} at ${target.name}`)} className="arkyv-chip arkyv-chip--accent">{ability.target_type === 'self' ? 'Cast' : `${ability.effect_type === 'damage' ? 'Use on' : 'Cast on'} ${target.name}`}</button>)}</div>}</div></div></article>;
                        })}
                        {abilities.filter((ability) => ability.enabled).length === 0 && <p className="rounded-lg border border-dashed border-slate-800 p-5 text-center text-xs text-slate-600">This world has no enabled abilities.</p>}
                    </div>
                )}

                {actor?.id && !isDead && tab === 'adventure' && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-amber-100">Quest journal</p><p className="mt-1 text-[0.68rem] leading-5 text-slate-500">Progress is recorded by room entry, item possession, NPC conversations, and server-resolved defeats.</p></div><strong className="shrink-0 text-sm text-amber-200">{wallet.gold || 0} gold</strong></div></div>
                        <div className="space-y-2">
                            <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Active quests</h3>
                            {activeQuestCards.length === 0 && <p className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-xs text-slate-600">No active quests. NPC offers in this room appear below.</p>}
                            {activeQuestCards.map(({ row, quest }) => {
                                const objectives = questObjectives.filter((objective) => objective.quest_id === quest.id);
                                const turnInNpc = nearbyNpcs.find((npc) => npc.id === quest.turn_in_npc_id);
                                return <article key={row.id} className={`rounded-xl border p-3 ${row.status === 'ready' ? 'border-emerald-400/30 bg-emerald-500/[0.05]' : 'border-slate-800 bg-black/20'}`}><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-semibold text-slate-100">{quest.title}</h4><p className="mt-1 text-[0.68rem] leading-5 text-slate-500">{quest.description}</p></div><span className={`text-[0.6rem] uppercase tracking-wider ${row.status === 'ready' ? 'text-emerald-300' : 'text-amber-300'}`}>{row.status}</span></div><div className="mt-3 space-y-1.5">{objectives.map((objective) => { const progress = Math.min(Number(objective.required_count) || 1, progressByObjective.get(objective.id) || 0); const done = progress >= Number(objective.required_count || 1); return <div key={objective.id} className="flex items-center justify-between gap-3 text-xs"><span className={done ? 'text-emerald-300' : 'text-slate-400'}>{done ? 'âœ“' : 'â—‹'} {objectiveLabel(objective)}</span><span className="text-slate-600">{progress}/{objective.required_count}</span></div>; })}</div>{turnInNpc && <div className="mt-3 flex justify-end"><button type="button" onClick={() => run(row.status === 'ready' ? `turn in ${quest.title}` : `quest ${turnInNpc.alias || turnInNpc.name}`)} className="arkyv-chip arkyv-chip--accent">{row.status === 'ready' ? `Turn in to ${turnInNpc.name}` : `Ask ${turnInNpc.name}`}</button></div>}</article>;
                            })}
                        </div>
                        <div className="space-y-2"><h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Available here</h3>{availableQuests.length === 0 && <p className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-xs text-slate-600">No new quests are offered in this room.</p>}{availableQuests.map((quest) => { const giver = npcsById.get(quest.quest_giver_npc_id); return <div key={quest.id} className="rounded-xl border border-slate-800 bg-black/20 p-3"><h4 className="text-sm font-semibold text-slate-100">{quest.title}</h4><p className="mt-1 text-[0.68rem] leading-5 text-slate-500">{quest.description}</p><div className="mt-2 flex items-center justify-between gap-3 text-[0.62rem] text-slate-500"><span>{quest.xp_reward} XP Â· {quest.gold_reward} gold</span><button type="button" onClick={() => run(`accept ${quest.title}`)} className="arkyv-chip arkyv-chip--accent">Accept from {giver?.name || 'NPC'}</button></div></div>; })}</div>
                        <div className="border-t border-slate-800 pt-3"><h3 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Faction standing</h3><div className="flex flex-wrap gap-2">{factions.map((faction) => { const value = reputationByFaction.has(faction.id) ? reputationByFaction.get(faction.id) : Number(faction.starting_reputation) || 0; const standing = value <= Number(faction.hostile_threshold) ? 'Hostile' : value >= Number(faction.friendly_threshold) ? 'Friendly' : 'Neutral'; return <button key={faction.id} type="button" onClick={() => run('reputation')} className={`arkyv-chip ${standing === 'Hostile' ? 'text-rose-300' : standing === 'Friendly' ? 'text-emerald-300' : ''}`}>{faction.name}: {standing} ({value >= 0 ? '+' : ''}{value})</button>; })}</div></div>
                    </div>
                )}

                {actor?.id && !isDead && tab === 'combat' && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-fuchsia-400/15 bg-fuchsia-400/[0.04] p-3">
                            <p className="text-xs font-semibold text-slate-100">Choose a target</p>
                            <p className="mt-1 text-[0.68rem] leading-5 text-slate-500">Attacks use your equipped weapon, stat scaling, the target&apos;s defense, and a server-enforced {((equipped.map((object) => definitions.get(object.definition_id)).find((definition) => Number(definition?.weapon_damage) > 0)?.attack_cooldown_ms || 2000) / 1000).toFixed(1)}s attack interval.</p>
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
