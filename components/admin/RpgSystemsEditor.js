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
    { id: 'abilities', label: 'Abilities & magic' },
    { id: 'combat', label: 'Combat rules' },
    { id: 'factions', label: 'Factions & reputation' },
    { id: 'quests', label: 'Quests' },
    { id: 'origins', label: 'Character creation' },
    { id: 'economy', label: 'Economy' },
    { id: 'roles', label: 'Admin roles' },
    { id: 'lifecycle', label: 'Spawn & death' },
    { id: 'progression', label: 'Levels & inventory' },
    { id: 'slots', label: 'Equipment slots' },
    { id: 'instances', label: 'Placed objects' },
    { id: 'loot', label: 'Enemy loot' },
    { id: 'actors', label: 'Actor values' },
    { id: 'moderation', label: 'Player moderation' },
];

const inputClass = 'w-full rounded-md border border-slate-600/70 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none';
const labelClass = 'text-[0.65rem] uppercase tracking-[0.22em] text-slate-400';
const buttonClass = 'rounded-md border border-cyan-400/50 bg-cyan-500/10 px-4 py-2 text-xs font-terminal uppercase tracking-[0.18em] text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40';

const emptyDefinition = () => ({
    id: '', name: '', description: '', primitive_kind: 'item', icon: '◇', image_url: '', tags: '', portable: true,
    stackable: false, max_stack: 1, capacity: 0, equipment_slot: '', weapon_damage: 0, armor_value: 0,
    scales_with_stat: '', attack_cooldown_ms: 2000, inventory_slots_bonus: 0, fuel_value: 0, burn_rate: 0, accepted_fuel_tags: '', stat_modifiers: '{}',
    use_stat_id: '', use_delta: 0, use_consume: true,
});

const emptyStat = () => ({ id: '', name: '', description: '', role: '', minimum: 0, maximum: 100, default_value: 10, per_level_gain: 0, regeneration_per_second: 0, player_allocatable: true, point_cost: 1, points_per_rank: 1, visible: true });
const emptyInstance = () => ({ id: '', definition_id: '', location_kind: 'room', location_id: '', quantity: 1, equipped_slot: '', durability: 100, fuel_remaining: 0, is_active: false, state_json: '{}' });
const emptyActorStat = () => ({ id: '', actor_id: '', stat_definition_id: '', base_value: 0, current_value: 0, invested_points: 0 });
const emptyModeration = () => ({ actor_id: '', gold: 0, room_id: '', quest_id: '', quest_status: 'active' });
const emptyCombat = () => ({ id: 'world', base_hit_chance_percent: 90, base_crit_chance_percent: 5, crit_damage_percent: 150, base_dodge_chance_percent: 3, base_parry_chance_percent: 3, base_block_chance_percent: 3, block_damage_reduction_percent: 40, armor_effectiveness_percent: 100, pvp_damage_percent: 100, global_cooldown_ms: 1000, assist_xp_percent: 50, threat_enabled: true, threat_decay_seconds: 30 });
const emptyLootEntry = () => ({ id: '', npc_id: '', definition_id: '', minimum_quantity: 1, maximum_quantity: 1, chance_percent: 100 });
const emptyProgression = () => ({ id: 'world', max_level: 60, base_xp: 100, growth_percent: 15, base_inventory_slots: 20, inventory_slots_per_level: 1, stat_points_per_level: 0 });
const emptyAbility = () => ({ id: '', name: '', description: '', icon: '✦', school: 'physical', effect_type: 'damage', target_type: 'enemy', resource_stat_id: '', resource_cost: 0, cooldown_ms: 2000, cast_time_ms: 0, power_min: 1, power_max: 4, scales_with_stat: '', scaling_percent: 0, effect_stat_id: 'health', mitigation_type: 'none', required_level: 1, auto_learn: true, enabled: true });
const emptyAbilityEffect = () => ({ id: '', ability_id: '', effect_kind: 'damage', target_scope: 'primary', stat_id: 'health', power_min: 1, power_max: 4, scales_with_stat: '', scaling_percent: 0, mitigation_type: 'none', chance_percent: 100, duration_ms: 0, tick_interval_ms: 1000, modifier_value: 0, max_stacks: 1, status_name: '', destination_room_id: '', summon_npc_id: '', sort_order: 0 });
const emptySlot = () => ({ id: '', name: '', capacity: 1, sort_order: 100 });
const emptyGrant = () => ({ actor_id: '', ability_id: '' });
const emptyFaction = () => ({ id: '', name: '', description: '', starting_reputation: 0, minimum_reputation: -3000, maximum_reputation: 3000, hostile_threshold: -1000, friendly_threshold: 1000, attack_penalty: -100, kill_penalty: -500 });
const emptyQuest = () => ({ id: '', title: '', description: '', quest_giver_npc_id: '', turn_in_npc_id: '', required_level: 1, required_faction_id: '', required_reputation: 0, repeatable: false, active: true, xp_reward: 0, gold_reward: 0, reputation_faction_id: '', reputation_reward: 0 });
const emptyObjective = () => ({ id: '', quest_id: '', objective_type: 'explore_room', target_id: '', description: '', required_count: 1, sort_order: 0, consume_on_turn_in: false });
const emptyQuestReward = () => ({ id: '', quest_id: '', definition_id: '', quantity: 1 });
const emptyQuestRule = () => ({ quest_id: '', prerequisite_quest_id: '', prerequisite_completions: 1, time_limit_seconds: 0, failure_on_death: false, next_quest_id: '', maximum_completions: 0 });
const emptyQuestChoice = () => ({ id: '', quest_id: '', label: '', description: '', next_quest_id: '', gold_reward: 0, reputation_faction_id: '', reputation_reward: 0, sort_order: 100 });
const emptyCharacterOption = () => ({ id: '', option_kind: 'class', name: '', description: '', icon: '◇', starting_room_id: '', starting_gold: 0, active: true, sort_order: 100 });
const emptyCharacterGrant = () => ({ id: '', option_id: '', grant_kind: 'stat', reference_id: '', amount: 1, equipped_slot: '', sort_order: 100 });
const emptyCurrency = () => ({ id: '', name: '', icon: '¤', maximum_balance: 1000000, tradeable: true });
const emptyVendor = () => ({ id: '', npc_id: '', name: '', currency_id: 'gold', buys_from_players: true, sell_price_percent: 50, required_faction_id: '', required_reputation: 0 });
const emptyVendorStock = () => ({ id: '', vendor_id: '', definition_id: '', price: 1, stock: -1, maximum_per_purchase: 99 });
const emptyRecipe = () => ({ id: '', name: '', description: '', output_definition_id: '', output_quantity: 1, station_tag: '', required_level: 1, currency_id: '', currency_cost: 0, active: true });
const emptyIngredient = () => ({ id: '', recipe_id: '', definition_id: '', quantity: 1, consumed: true });
const emptyRole = () => ({ id: '', name: '', description: '', permissions: ['world.manage'] });
const emptyRoleAssignment = () => ({ profile_id: '', role_id: '' });
const emptySpawnPoint = () => ({ id: '', name: '', description: '', room_id: '', allows_initial_spawn: true, allows_respawn: true, active: true, priority: 0, required_option_id: '', required_faction_id: '', required_reputation: 0, death_region_id: '' });
const emptyLifecycle = () => ({
    id: 'world', initial_spawn_policy: 'fixed', fixed_initial_spawn_point_id: '', respawn_policy: 'nearest', fixed_respawn_point_id: '',
    death_mode: 'respawn', respawn_delay_seconds: 0, inventory_loss_mode: 'keep', inventory_loss_percent: 0,
    include_equipped_in_loss: false, gold_loss_percent: 0, experience_loss_percent: 0, respawn_health_percent: 100,
    respawn_resource_percent: 100, spawn_protection_seconds: 0, reset_quests_on_death: false, clear_wanted_on_respawn: false,
    maximum_lives: 0, create_lootable_corpse: false, allow_ability_revive: true,
});

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
        attack_cooldown_ms: Math.max(0, Number(form.attack_cooldown_ms) || 0),
        inventory_slots_bonus: Math.max(0, Number(form.inventory_slots_bonus) || 0),
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
    const [profiles, setProfiles] = useState([]);
    const [npcs, setNpcs] = useState([]);
    const [actorStats, setActorStats] = useState([]);
    const [lootEntries, setLootEntries] = useState([]);
    const [progressionConfigs, setProgressionConfigs] = useState([]);
    const [actorProgressions, setActorProgressions] = useState([]);
    const [abilities, setAbilities] = useState([]);
    const [abilityEffects, setAbilityEffects] = useState([]);
    const [abilityGrants, setAbilityGrants] = useState([]);
    const [equipmentSlots, setEquipmentSlots] = useState([]);
    const [factions, setFactions] = useState([]);
    const [actorReputations, setActorReputations] = useState([]);
    const [quests, setQuests] = useState([]);
    const [questObjectives, setQuestObjectives] = useState([]);
    const [questRewards, setQuestRewards] = useState([]);
    const [questRules, setQuestRules] = useState([]);
    const [questChoices, setQuestChoices] = useState([]);
    const [characterOptions, setCharacterOptions] = useState([]);
    const [characterGrants, setCharacterGrants] = useState([]);
    const [actorCharacterOptions, setActorCharacterOptions] = useState([]);
    const [currencies, setCurrencies] = useState([]);
    const [vendors, setVendors] = useState([]);
    const [vendorStocks, setVendorStocks] = useState([]);
    const [recipes, setRecipes] = useState([]);
    const [ingredients, setIngredients] = useState([]);
    const [adminRoles, setAdminRoles] = useState([]);
    const [adminAssignments, setAdminAssignments] = useState([]);
    const [spawnPoints, setSpawnPoints] = useState([]);
    const [lifecycleConfigs, setLifecycleConfigs] = useState([]);
    const [lifeStates, setLifeStates] = useState([]);
    const [deathRecords, setDeathRecords] = useState([]);
    const [actorWallets, setActorWallets] = useState([]);
    const [actorCooldowns, setActorCooldowns] = useState([]);
    const [actorCrimes, setActorCrimes] = useState([]);
    const [actorQuests, setActorQuests] = useState([]);
    const [actorQuestProgress, setActorQuestProgress] = useState([]);
    const [combatConfigs, setCombatConfigs] = useState([]);
    const [npcThreat, setNpcThreat] = useState([]);
    const [definitionForm, setDefinitionForm] = useState(emptyDefinition);
    const [statForm, setStatForm] = useState(emptyStat);
    const [instanceForm, setInstanceForm] = useState(emptyInstance);
    const [actorStatForm, setActorStatForm] = useState(emptyActorStat);
    const [lootForm, setLootForm] = useState(emptyLootEntry);
    const [progressionForm, setProgressionForm] = useState(emptyProgression);
    const [abilityForm, setAbilityForm] = useState(emptyAbility);
    const [abilityEffectForm, setAbilityEffectForm] = useState(emptyAbilityEffect);
    const [slotForm, setSlotForm] = useState(emptySlot);
    const [grantForm, setGrantForm] = useState(emptyGrant);
    const [factionForm, setFactionForm] = useState(emptyFaction);
    const [questForm, setQuestForm] = useState(emptyQuest);
    const [objectiveForm, setObjectiveForm] = useState(emptyObjective);
    const [questRewardForm, setQuestRewardForm] = useState(emptyQuestReward);
    const [questRuleForm, setQuestRuleForm] = useState(emptyQuestRule);
    const [questChoiceForm, setQuestChoiceForm] = useState(emptyQuestChoice);
    const [characterOptionForm, setCharacterOptionForm] = useState(emptyCharacterOption);
    const [characterGrantForm, setCharacterGrantForm] = useState(emptyCharacterGrant);
    const [currencyForm, setCurrencyForm] = useState(emptyCurrency);
    const [vendorForm, setVendorForm] = useState(emptyVendor);
    const [vendorStockForm, setVendorStockForm] = useState(emptyVendorStock);
    const [recipeForm, setRecipeForm] = useState(emptyRecipe);
    const [ingredientForm, setIngredientForm] = useState(emptyIngredient);
    const [roleForm, setRoleForm] = useState(emptyRole);
    const [roleAssignmentForm, setRoleAssignmentForm] = useState(emptyRoleAssignment);
    const [spawnPointForm, setSpawnPointForm] = useState(emptySpawnPoint);
    const [lifecycleForm, setLifecycleForm] = useState(emptyLifecycle);
    const [moderationForm, setModerationForm] = useState(emptyModeration);
    const [combatForm, setCombatForm] = useState(emptyCombat);
    const [deathFilter, setDeathFilter] = useState({ query: '', mode: 'all' });
    const [editingDefinition, setEditingDefinition] = useState(null);
    const [editingStat, setEditingStat] = useState(null);
    const [editingInstance, setEditingInstance] = useState(null);
    const [editingActorStat, setEditingActorStat] = useState(null);
    const [editingLootEntry, setEditingLootEntry] = useState(null);
    const [editingAbility, setEditingAbility] = useState(null);
    const [editingAbilityEffect, setEditingAbilityEffect] = useState(null);
    const [editingSlot, setEditingSlot] = useState(null);
    const [editingFaction, setEditingFaction] = useState(null);
    const [editingQuest, setEditingQuest] = useState(null);
    const [editingObjective, setEditingObjective] = useState(null);
    const [editingQuestReward, setEditingQuestReward] = useState(null);
    const [editingCharacterOption, setEditingCharacterOption] = useState(null);
    const [editingCurrency, setEditingCurrency] = useState(null);
    const [editingVendor, setEditingVendor] = useState(null);
    const [editingRecipe, setEditingRecipe] = useState(null);
    const [editingRole, setEditingRole] = useState(null);
    const [editingSpawnPoint, setEditingSpawnPoint] = useState(null);
    const [busy, setBusy] = useState(false);
    const [generatingImage, setGeneratingImage] = useState(false);
    const [message, setMessage] = useState(null);

    const actors = useMemo(() => [
        ...characters.map((actor) => ({ ...actor, actor_type: 'character', label: `${actor.name} · Hero` })),
        ...profiles.map((actor) => ({ ...actor, actor_type: 'profile', name: actor.name || actor.handle || actor.id, label: `${actor.name || actor.handle || actor.id} · Profile hero` })),
        ...npcs.map((actor) => ({ ...actor, actor_type: 'npc', label: `${actor.name} · NPC` })),
    ].sort((left, right) => left.label.localeCompare(right.label)), [characters, npcs, profiles]);

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
            spacetime.from('rooms').select('id, name, region_name').order('name'),
            spacetime.from('characters').select('id, name').order('name'),
            spacetime.from('npcs').select('id, name').order('name'),
            spacetime.from('actor_stats').select('*'),
            spacetime.from('loot_table_entries').select('*'),
            spacetime.from('progression_configs').select('*'),
            spacetime.from('actor_progressions').select('*'),
            spacetime.from('ability_definitions').select('*').order('required_level'),
            spacetime.from('actor_abilities').select('*'),
            spacetime.from('equipment_slot_definitions').select('*').order('sort_order'),
            spacetime.from('faction_definitions').select('*').order('name'),
            spacetime.from('actor_faction_reputations').select('*'),
            spacetime.from('quest_definitions').select('*').order('title'),
            spacetime.from('quest_objectives').select('*').order('sort_order'),
            spacetime.from('quest_item_rewards').select('*'),
            spacetime.from('spawn_points').select('*').order('priority', { ascending: false }),
            spacetime.from('world_lifecycle_configs').select('*'),
            spacetime.from('actor_life_states').select('*'),
            spacetime.from('actor_death_records').select('*').order('died_at', { ascending: false }),
            spacetime.from('profiles').select('id, handle, name, current_room').neq('current_room', '__admin_all_profiles__'),
            spacetime.from('actor_wallets').select('*'),
            spacetime.from('actor_cooldowns').select('*'),
            spacetime.from('actor_crimes').select('*'),
            spacetime.from('actor_quests').select('*'),
            spacetime.from('actor_quest_progress').select('*'),
            spacetime.from('world_combat_configs').select('*'),
            spacetime.from('npc_threat').select('*'),
            spacetime.from('ability_effect_definitions').select('*').order('sort_order'),
            spacetime.from('quest_rules').select('*'),
            spacetime.from('quest_choices').select('*').order('sort_order'),
            spacetime.from('character_option_definitions').select('*').order('sort_order'),
            spacetime.from('character_option_grants').select('*').order('sort_order'),
            spacetime.from('actor_character_options').select('*'),
            spacetime.from('currency_definitions').select('*').order('name'),
            spacetime.from('vendor_definitions').select('*').order('name'),
            spacetime.from('vendor_stocks').select('*'),
            spacetime.from('crafting_recipes').select('*').order('name'),
            spacetime.from('crafting_ingredients').select('*'),
            spacetime.from('admin_role_definitions').select('*').order('name'),
            spacetime.from('admin_role_assignments').select('*'),
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
        setLootEntries(results[7].data || []);
        const nextProgressionConfigs = results[8].data || [];
        setProgressionConfigs(nextProgressionConfigs);
        setProgressionForm({ ...emptyProgression(), ...(nextProgressionConfigs[0] || {}) });
        setActorProgressions(results[9].data || []);
        setAbilities(results[10].data || []);
        setAbilityGrants(results[11].data || []);
        setEquipmentSlots(results[12].data || []);
        setFactions(results[13].data || []);
        setActorReputations(results[14].data || []);
        setQuests(results[15].data || []);
        setQuestObjectives(results[16].data || []);
        setQuestRewards(results[17].data || []);
        setSpawnPoints(results[18].data || []);
        const nextLifecycleConfigs = results[19].data || [];
        setLifecycleConfigs(nextLifecycleConfigs);
        setLifecycleForm({ ...emptyLifecycle(), ...(nextLifecycleConfigs[0] || {}), fixed_initial_spawn_point_id: nextLifecycleConfigs[0]?.fixed_initial_spawn_point_id || '', fixed_respawn_point_id: nextLifecycleConfigs[0]?.fixed_respawn_point_id || '' });
        setLifeStates(results[20].data || []);
        setDeathRecords(results[21].data || []);
        setProfiles(results[22].data || []);
        setActorWallets(results[23].data || []);
        setActorCooldowns(results[24].data || []);
        setActorCrimes(results[25].data || []);
        setActorQuests(results[26].data || []);
        setActorQuestProgress(results[27].data || []);
        const nextCombatConfigs = results[28].data || [];
        setCombatConfigs(nextCombatConfigs);
        setCombatForm({ ...emptyCombat(), ...(nextCombatConfigs[0] || {}) });
        setNpcThreat(results[29].data || []);
        setAbilityEffects(results[30].data || []);
        setQuestRules(results[31].data || []);
        setQuestChoices(results[32].data || []);
        setCharacterOptions(results[33].data || []);
        setCharacterGrants(results[34].data || []);
        setActorCharacterOptions(results[35].data || []);
        setCurrencies(results[36].data || []);
        setVendors(results[37].data || []);
        setVendorStocks(results[38].data || []);
        setRecipes(results[39].data || []);
        setIngredients(results[40].data || []);
        setAdminRoles(results[41].data || []);
        setAdminAssignments(results[42].data || []);
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
            per_level_gain: Number(statForm.per_level_gain) || 0, regeneration_per_second: Math.max(0, Number(statForm.regeneration_per_second) || 0),
            player_allocatable: Boolean(statForm.player_allocatable), point_cost: Math.max(1, Number(statForm.point_cost) || 1), points_per_rank: Math.max(1, Number(statForm.points_per_rank) || 1),
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

    const saveProgression = async () => {
        const payload = {
            ...progressionForm,
            id: progressionForm.id || 'world',
            max_level: Math.max(1, Number(progressionForm.max_level) || 1),
            base_xp: Math.max(1, Number(progressionForm.base_xp) || 1),
            growth_percent: Math.max(0, Number(progressionForm.growth_percent) || 0),
            base_inventory_slots: Math.max(0, Number(progressionForm.base_inventory_slots) || 0),
            inventory_slots_per_level: Math.max(0, Number(progressionForm.inventory_slots_per_level) || 0),
            stat_points_per_level: Math.max(0, Number(progressionForm.stat_points_per_level) || 0),
        };
        await run(
            () => progressionConfigs.length
                ? spacetime.from('progression_configs').update(payload).eq('id', progressionConfigs[0].id).select()
                : spacetime.from('progression_configs').insert(payload).select(),
            'Level curve and inventory rules saved.',
        );
    };

    const saveCombat = async () => {
        const percent = (value) => Math.min(100, Math.max(0, Number(value) || 0));
        const payload = {
            ...combatForm, id: combatForm.id || 'world',
            base_hit_chance_percent: percent(combatForm.base_hit_chance_percent),
            base_crit_chance_percent: percent(combatForm.base_crit_chance_percent),
            crit_damage_percent: Math.max(100, Number(combatForm.crit_damage_percent) || 100),
            base_dodge_chance_percent: percent(combatForm.base_dodge_chance_percent),
            base_parry_chance_percent: percent(combatForm.base_parry_chance_percent),
            base_block_chance_percent: percent(combatForm.base_block_chance_percent),
            block_damage_reduction_percent: percent(combatForm.block_damage_reduction_percent),
            armor_effectiveness_percent: Math.max(0, Number(combatForm.armor_effectiveness_percent) || 0),
            pvp_damage_percent: Math.max(0, Number(combatForm.pvp_damage_percent) || 0),
            global_cooldown_ms: Math.max(0, Number(combatForm.global_cooldown_ms) || 0),
            assist_xp_percent: percent(combatForm.assist_xp_percent),
            threat_decay_seconds: Math.max(0, Number(combatForm.threat_decay_seconds) || 0),
        };
        await run(
            () => combatConfigs.length
                ? spacetime.from('world_combat_configs').update(payload).eq('id', combatConfigs[0].id).select()
                : spacetime.from('world_combat_configs').insert(payload).select(),
            'World combat rules saved.',
        );
    };

    const saveAbility = async () => {
        const minimum = Math.max(0, Number(abilityForm.power_min) || 0);
        const payload = {
            ...abilityForm,
            id: abilityForm.id.trim(), name: abilityForm.name.trim(), description: abilityForm.description.trim(),
            resource_stat_id: abilityForm.resource_stat_id || null,
            resource_cost: Math.max(0, Number(abilityForm.resource_cost) || 0),
            cooldown_ms: Math.max(0, Number(abilityForm.cooldown_ms) || 0),
            cast_time_ms: Math.max(0, Number(abilityForm.cast_time_ms) || 0),
            power_min: minimum,
            power_max: Math.max(minimum, Number(abilityForm.power_max) || minimum),
            scales_with_stat: abilityForm.scales_with_stat || null,
            scaling_percent: Math.max(0, Number(abilityForm.scaling_percent) || 0),
            effect_stat_id: abilityForm.effect_stat_id || null,
            required_level: Math.max(1, Number(abilityForm.required_level) || 1),
        };
        if (!payload.id || !payload.name) { setMessage({ type: 'error', text: 'Ability id and name are required.' }); return; }
        const ok = await run(
            () => editingAbility
                ? spacetime.from('ability_definitions').update(payload).eq('id', editingAbility).select()
                : spacetime.from('ability_definitions').insert(payload).select(),
            editingAbility ? 'Ability updated.' : 'Ability created.',
        );
        if (ok) {
            setEditingAbility(payload.id);
            setAbilityForm({ ...emptyAbility(), ...payload, resource_stat_id: payload.resource_stat_id || '', scales_with_stat: payload.scales_with_stat || '', effect_stat_id: payload.effect_stat_id || '' });
            setAbilityEffectForm((value) => ({ ...value, ability_id: payload.id }));
        }
    };

    const saveAbilityEffect = async () => {
        const abilityId = editingAbility || abilityEffectForm.ability_id;
        const minimum = Number(abilityEffectForm.power_min) || 0;
        const payload = {
            ...abilityEffectForm,
            id: abilityEffectForm.id.trim(),
            ability_id: abilityId,
            stat_id: abilityEffectForm.stat_id || null,
            power_min: minimum,
            power_max: Math.max(minimum, Number(abilityEffectForm.power_max) || minimum),
            scales_with_stat: abilityEffectForm.scales_with_stat || null,
            scaling_percent: Number(abilityEffectForm.scaling_percent) || 0,
            chance_percent: Math.min(100, Math.max(0, Number(abilityEffectForm.chance_percent) || 0)),
            duration_ms: Math.max(0, Number(abilityEffectForm.duration_ms) || 0),
            tick_interval_ms: Math.max(1, Number(abilityEffectForm.tick_interval_ms) || 1),
            modifier_value: Number(abilityEffectForm.modifier_value) || 0,
            max_stacks: Math.max(1, Number(abilityEffectForm.max_stacks) || 1),
            status_name: abilityEffectForm.status_name.trim(),
            destination_room_id: abilityEffectForm.destination_room_id || null,
            summon_npc_id: abilityEffectForm.summon_npc_id || null,
            sort_order: Math.max(0, Number(abilityEffectForm.sort_order) || 0),
        };
        if (!payload.ability_id) { setMessage({ type: 'error', text: 'Save or select an ability before adding effects.' }); return; }
        if (!payload.id) { setMessage({ type: 'error', text: 'Effect id is required.' }); return; }
        const ok = await run(
            () => editingAbilityEffect
                ? spacetime.from('ability_effect_definitions').update(payload).eq('id', editingAbilityEffect).select()
                : spacetime.from('ability_effect_definitions').insert(payload).select(),
            editingAbilityEffect ? 'Ability effect updated.' : 'Ability effect added.',
        );
        if (ok) { setEditingAbilityEffect(null); setAbilityEffectForm({ ...emptyAbilityEffect(), ability_id: payload.ability_id }); }
    };

    const saveManagedRow = (table, payload, editing, label) => run(
        () => editing ? spacetime.from(table).update(payload).eq(editing.key, editing.value).select() : spacetime.from(table).insert(payload).select(),
        `${label} ${editing ? 'updated' : 'created'}.`,
    );

    const saveQuestRule = async () => {
        if (!questRuleForm.quest_id) { setMessage({ type: 'error', text: 'Choose a quest for these rules.' }); return; }
        const existing = questRules.find((rule) => rule.quest_id === questRuleForm.quest_id);
        await saveManagedRow('quest_rules', { ...questRuleForm, prerequisite_quest_id: questRuleForm.prerequisite_quest_id || null, next_quest_id: questRuleForm.next_quest_id || null, prerequisite_completions: Math.max(1, Number(questRuleForm.prerequisite_completions) || 1), time_limit_seconds: Math.max(0, Number(questRuleForm.time_limit_seconds) || 0), maximum_completions: Math.max(0, Number(questRuleForm.maximum_completions) || 0) }, existing ? { key: 'quest_id', value: existing.quest_id } : null, 'Quest rules');
    };
    const saveQuestChoice = async () => {
        const payload = { ...questChoiceForm, id: questChoiceForm.id.trim(), quest_id: questChoiceForm.quest_id || editingQuest || '', next_quest_id: questChoiceForm.next_quest_id || null, gold_reward: Number(questChoiceForm.gold_reward) || 0, reputation_faction_id: questChoiceForm.reputation_faction_id || null, reputation_reward: Number(questChoiceForm.reputation_reward) || 0, sort_order: Math.max(0, Number(questChoiceForm.sort_order) || 0) };
        if (!payload.id || !payload.quest_id || !payload.label.trim()) { setMessage({ type: 'error', text: 'Choice id, quest, and label are required.' }); return; }
        if (await saveManagedRow('quest_choices', payload, null, 'Quest choice')) setQuestChoiceForm({ ...emptyQuestChoice(), quest_id: payload.quest_id });
    };
    const saveCharacterOption = async () => {
        const payload = { ...characterOptionForm, id: characterOptionForm.id.trim(), name: characterOptionForm.name.trim(), starting_room_id: characterOptionForm.starting_room_id || null, starting_gold: Math.max(0, Number(characterOptionForm.starting_gold) || 0), sort_order: Math.max(0, Number(characterOptionForm.sort_order) || 0) };
        if (!payload.id || !payload.name) { setMessage({ type: 'error', text: 'Character option id and name are required.' }); return; }
        const ok = await saveManagedRow('character_option_definitions', payload, editingCharacterOption ? { key: 'id', value: editingCharacterOption } : null, 'Character option');
        if (ok) { setEditingCharacterOption(payload.id); setCharacterGrantForm((value) => ({ ...value, option_id: payload.id })); }
    };
    const saveCharacterGrant = async () => {
        const payload = { ...characterGrantForm, id: characterGrantForm.id.trim(), option_id: characterGrantForm.option_id || editingCharacterOption || '', amount: Number(characterGrantForm.amount) || 1, equipped_slot: characterGrantForm.equipped_slot || null, sort_order: Math.max(0, Number(characterGrantForm.sort_order) || 0) };
        if (!payload.id || !payload.option_id || !payload.reference_id) { setMessage({ type: 'error', text: 'Grant id, option, and reference are required.' }); return; }
        if (await saveManagedRow('character_option_grants', payload, null, 'Option grant')) setCharacterGrantForm({ ...emptyCharacterGrant(), option_id: payload.option_id });
    };
    const saveCurrency = async () => {
        const payload = { ...currencyForm, id: currencyForm.id.trim(), name: currencyForm.name.trim(), maximum_balance: Math.max(0, Number(currencyForm.maximum_balance) || 0) };
        if (!payload.id || !payload.name) { setMessage({ type: 'error', text: 'Currency id and name are required.' }); return; }
        await saveManagedRow('currency_definitions', payload, editingCurrency ? { key: 'id', value: editingCurrency } : null, 'Currency');
    };
    const saveVendor = async () => {
        const payload = { ...vendorForm, id: vendorForm.id.trim(), name: vendorForm.name.trim(), required_faction_id: vendorForm.required_faction_id || null, required_reputation: Number(vendorForm.required_reputation) || 0, sell_price_percent: Math.max(0, Number(vendorForm.sell_price_percent) || 0) };
        if (!payload.id || !payload.name || !payload.npc_id) { setMessage({ type: 'error', text: 'Vendor id, name, and NPC are required.' }); return; }
        const ok = await saveManagedRow('vendor_definitions', payload, editingVendor ? { key: 'id', value: editingVendor } : null, 'Vendor');
        if (ok) { setEditingVendor(payload.id); setVendorStockForm((value) => ({ ...value, vendor_id: payload.id })); }
    };
    const saveVendorStock = async () => {
        const payload = { ...vendorStockForm, id: vendorStockForm.id.trim(), vendor_id: vendorStockForm.vendor_id || editingVendor || '', price: Math.max(0, Number(vendorStockForm.price) || 0), stock: Math.max(-1, Number(vendorStockForm.stock) || 0), maximum_per_purchase: Math.max(1, Number(vendorStockForm.maximum_per_purchase) || 1) };
        if (!payload.id || !payload.vendor_id || !payload.definition_id) { setMessage({ type: 'error', text: 'Stock id, vendor, and item are required.' }); return; }
        if (await saveManagedRow('vendor_stocks', payload, null, 'Vendor stock')) setVendorStockForm({ ...emptyVendorStock(), vendor_id: payload.vendor_id });
    };
    const saveRecipe = async () => {
        const payload = { ...recipeForm, id: recipeForm.id.trim(), name: recipeForm.name.trim(), station_tag: recipeForm.station_tag || null, currency_id: recipeForm.currency_id || null, output_quantity: Math.max(1, Number(recipeForm.output_quantity) || 1), required_level: Math.max(1, Number(recipeForm.required_level) || 1), currency_cost: Math.max(0, Number(recipeForm.currency_cost) || 0) };
        if (!payload.id || !payload.name || !payload.output_definition_id) { setMessage({ type: 'error', text: 'Recipe id, name, and output are required.' }); return; }
        const ok = await saveManagedRow('crafting_recipes', payload, editingRecipe ? { key: 'id', value: editingRecipe } : null, 'Recipe');
        if (ok) { setEditingRecipe(payload.id); setIngredientForm((value) => ({ ...value, recipe_id: payload.id })); }
    };
    const saveIngredient = async () => {
        const payload = { ...ingredientForm, id: ingredientForm.id.trim(), recipe_id: ingredientForm.recipe_id || editingRecipe || '', quantity: Math.max(1, Number(ingredientForm.quantity) || 1) };
        if (!payload.id || !payload.recipe_id || !payload.definition_id) { setMessage({ type: 'error', text: 'Ingredient id, recipe, and item are required.' }); return; }
        if (await saveManagedRow('crafting_ingredients', payload, null, 'Ingredient')) setIngredientForm({ ...emptyIngredient(), recipe_id: payload.recipe_id });
    };
    const saveRole = async () => {
        const payload = { ...roleForm, id: roleForm.id.trim(), name: roleForm.name.trim(), permissions: roleForm.permissions };
        if (!payload.id || !payload.name) { setMessage({ type: 'error', text: 'Role id and name are required.' }); return; }
        await saveManagedRow('admin_role_definitions', payload, editingRole ? { key: 'id', value: editingRole } : null, 'Admin role');
    };
    const saveRoleAssignment = async () => {
        if (!roleAssignmentForm.profile_id || !roleAssignmentForm.role_id) { setMessage({ type: 'error', text: 'Choose a saved-world profile and role.' }); return; }
        const existing = adminAssignments.find((row) => row.profile_id === roleAssignmentForm.profile_id);
        await saveManagedRow('admin_role_assignments', roleAssignmentForm, existing ? { key: 'profile_id', value: existing.profile_id } : null, 'Role assignment');
    };

    const saveSlot = async () => {
        const payload = { ...slotForm, id: slotForm.id.trim(), name: slotForm.name.trim(), capacity: Math.max(1, Number(slotForm.capacity) || 1), sort_order: Math.max(0, Number(slotForm.sort_order) || 0) };
        if (!payload.id || !payload.name) { setMessage({ type: 'error', text: 'Slot id and name are required.' }); return; }
        const ok = await run(
            () => editingSlot
                ? spacetime.from('equipment_slot_definitions').update(payload).eq('id', editingSlot).select()
                : spacetime.from('equipment_slot_definitions').insert(payload).select(),
            editingSlot ? 'Equipment slot updated.' : 'Equipment slot created.',
        );
        if (ok) { setEditingSlot(null); setSlotForm(emptySlot()); }
    };

    const saveGrant = async () => {
        if (!grantForm.actor_id || !grantForm.ability_id) { setMessage({ type: 'error', text: 'Choose an actor and ability.' }); return; }
        const payload = { id: `${grantForm.actor_id}::${grantForm.ability_id}`, ...grantForm };
        const ok = await run(() => spacetime.from('actor_abilities').insert(payload).select(), 'Ability granted.');
        if (ok) setGrantForm(emptyGrant());
    };

    const saveActorProgression = (row) => run(
        () => spacetime.from('actor_progressions').update({
            level: Math.max(1, Number(row.level) || 1),
            experience: Math.max(0, Number(row.experience) || 0),
            unspent_stat_points: Math.max(0, Number(row.unspent_stat_points) || 0),
        }).eq('id', row.id).select(),
        `Progression saved for ${actorsById.get(row.actor_id)?.label || row.actor_id}.`,
    );

    const curvePreview = useMemo(() => {
        const levels = [];
        let required = Math.max(1, Number(progressionForm.base_xp) || 1);
        const growth = Math.max(0, Number(progressionForm.growth_percent) || 0);
        const count = Math.min(10, Math.max(1, Number(progressionForm.max_level) || 1) - 1);
        for (let level = 1; level <= count; level += 1) {
            levels.push({ level, required });
            required = Math.max(required + 1, Math.floor((required * (100 + growth)) / 100));
        }
        return levels;
    }, [progressionForm.base_xp, progressionForm.growth_percent, progressionForm.max_level]);

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
            invested_points: Math.max(0, Number(actorStatForm.invested_points) || 0),
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

    const saveLootEntry = async () => {
        const minimum = Math.max(1, Number(lootForm.minimum_quantity) || 1);
        const payload = {
            id: lootForm.id || crypto.randomUUID(),
            npc_id: lootForm.npc_id,
            definition_id: lootForm.definition_id,
            minimum_quantity: minimum,
            maximum_quantity: Math.max(minimum, Number(lootForm.maximum_quantity) || minimum),
            chance_percent: Math.min(100, Math.max(0, Number(lootForm.chance_percent) || 0)),
        };
        if (!payload.npc_id || !payload.definition_id) { setMessage({ type: 'error', text: 'Choose an enemy NPC and an object definition.' }); return; }
        const ok = await run(
            () => editingLootEntry
                ? spacetime.from('loot_table_entries').update(payload).eq('id', editingLootEntry).select()
                : spacetime.from('loot_table_entries').insert(payload).select(),
            editingLootEntry ? 'Enemy drop updated.' : 'Enemy drop added.',
        );
        if (ok) { setEditingLootEntry(null); setLootForm(emptyLootEntry()); }
    };

    const saveFaction = async () => {
        const minimum = Number(factionForm.minimum_reputation) || 0;
        const maximum = Math.max(minimum, Number(factionForm.maximum_reputation) || 0);
        const payload = {
            ...factionForm, id: factionForm.id.trim(), name: factionForm.name.trim(), description: factionForm.description.trim(),
            starting_reputation: Math.min(maximum, Math.max(minimum, Number(factionForm.starting_reputation) || 0)),
            minimum_reputation: minimum, maximum_reputation: maximum,
            hostile_threshold: Math.min(maximum, Math.max(minimum, Number(factionForm.hostile_threshold) || 0)),
            friendly_threshold: Math.min(maximum, Math.max(minimum, Number(factionForm.friendly_threshold) || 0)),
            attack_penalty: Number(factionForm.attack_penalty) || 0, kill_penalty: Number(factionForm.kill_penalty) || 0,
        };
        if (!payload.id || !payload.name) { setMessage({ type: 'error', text: 'Faction id and name are required.' }); return; }
        const ok = await run(() => editingFaction ? spacetime.from('faction_definitions').update(payload).eq('id', editingFaction).select() : spacetime.from('faction_definitions').insert(payload).select(), editingFaction ? 'Faction updated.' : 'Faction created.');
        if (ok) { setEditingFaction(null); setFactionForm(emptyFaction()); }
    };

    const saveActorReputation = (row) => run(
        () => spacetime.from('actor_faction_reputations').update({ reputation: Number(row.reputation) || 0 }).eq('id', row.id).select(),
        `Reputation saved for ${actorsById.get(row.actor_id)?.label || row.actor_id}.`,
    );

    const saveQuest = async () => {
        const payload = {
            ...questForm, id: questForm.id.trim(), title: questForm.title.trim(), description: questForm.description.trim(),
            required_level: Math.max(1, Number(questForm.required_level) || 1), required_faction_id: questForm.required_faction_id || null,
            required_reputation: Number(questForm.required_reputation) || 0, xp_reward: Math.max(0, Number(questForm.xp_reward) || 0),
            gold_reward: Math.max(0, Number(questForm.gold_reward) || 0), reputation_faction_id: questForm.reputation_faction_id || null,
            reputation_reward: Number(questForm.reputation_reward) || 0,
        };
        if (!payload.id || !payload.title || !payload.quest_giver_npc_id || !payload.turn_in_npc_id) { setMessage({ type: 'error', text: 'Quest id, title, giver, and turn-in NPC are required.' }); return; }
        const ok = await run(() => editingQuest ? spacetime.from('quest_definitions').update(payload).eq('id', editingQuest).select() : spacetime.from('quest_definitions').insert(payload).select(), editingQuest ? 'Quest updated.' : 'Quest created.');
        if (ok) { setEditingQuest(null); setQuestForm(emptyQuest()); }
    };

    const saveObjective = async () => {
        const payload = { ...objectiveForm, id: objectiveForm.id || crypto.randomUUID(), description: objectiveForm.description.trim(), required_count: Math.max(1, Number(objectiveForm.required_count) || 1), sort_order: Math.max(0, Number(objectiveForm.sort_order) || 0) };
        if (!payload.quest_id || !payload.target_id) { setMessage({ type: 'error', text: 'Choose a quest and objective target.' }); return; }
        const ok = await run(() => editingObjective ? spacetime.from('quest_objectives').update(payload).eq('id', editingObjective).select() : spacetime.from('quest_objectives').insert(payload).select(), editingObjective ? 'Quest objective updated.' : 'Quest objective added.');
        if (ok) { setEditingObjective(null); setObjectiveForm(emptyObjective()); }
    };

    const saveQuestReward = async () => {
        const payload = { ...questRewardForm, id: questRewardForm.id || crypto.randomUUID(), quantity: Math.max(1, Number(questRewardForm.quantity) || 1) };
        if (!payload.quest_id || !payload.definition_id) { setMessage({ type: 'error', text: 'Choose a quest and reward item.' }); return; }
        const ok = await run(() => editingQuestReward ? spacetime.from('quest_item_rewards').update(payload).eq('id', editingQuestReward).select() : spacetime.from('quest_item_rewards').insert(payload).select(), editingQuestReward ? 'Quest item reward updated.' : 'Quest item reward added.');
        if (ok) { setEditingQuestReward(null); setQuestRewardForm(emptyQuestReward()); }
    };

    const saveSpawnPoint = async () => {
        const payload = {
            ...spawnPointForm,
            id: spawnPointForm.id.trim(),
            name: spawnPointForm.name.trim(),
            description: spawnPointForm.description.trim(),
            priority: Number(spawnPointForm.priority) || 0,
            required_option_id: spawnPointForm.required_option_id || null,
            required_faction_id: spawnPointForm.required_faction_id || null,
            required_reputation: Number(spawnPointForm.required_reputation) || 0,
            death_region_id: spawnPointForm.death_region_id || null,
        };
        if (!payload.id || !payload.name || !payload.room_id) { setMessage({ type: 'error', text: 'Spawn point id, name, and room are required.' }); return; }
        const ok = await run(
            () => editingSpawnPoint
                ? spacetime.from('spawn_points').update(payload).eq('id', editingSpawnPoint).select()
                : spacetime.from('spawn_points').insert(payload).select(),
            editingSpawnPoint ? 'Spawn point updated.' : 'Spawn point created.',
        );
        if (ok) { setEditingSpawnPoint(null); setSpawnPointForm(emptySpawnPoint()); }
    };

    const saveLifecycle = async () => {
        const percent = (value) => Math.min(100, Math.max(0, Number(value) || 0));
        const payload = {
            ...lifecycleForm,
            id: lifecycleForm.id || 'world',
            fixed_initial_spawn_point_id: lifecycleForm.fixed_initial_spawn_point_id || null,
            fixed_respawn_point_id: lifecycleForm.fixed_respawn_point_id || null,
            respawn_delay_seconds: Math.max(0, Number(lifecycleForm.respawn_delay_seconds) || 0),
            inventory_loss_percent: percent(lifecycleForm.inventory_loss_percent),
            gold_loss_percent: percent(lifecycleForm.gold_loss_percent),
            experience_loss_percent: percent(lifecycleForm.experience_loss_percent),
            respawn_health_percent: Math.max(1, percent(lifecycleForm.respawn_health_percent)),
            respawn_resource_percent: percent(lifecycleForm.respawn_resource_percent),
            spawn_protection_seconds: Math.max(0, Number(lifecycleForm.spawn_protection_seconds) || 0),
            maximum_lives: Math.max(0, Number(lifecycleForm.maximum_lives) || 0),
        };
        await run(
            () => lifecycleConfigs.length
                ? spacetime.from('world_lifecycle_configs').update(payload).eq('id', lifecycleConfigs[0].id).select()
                : spacetime.from('world_lifecycle_configs').insert(payload).select(),
            'Spawn and death rules saved.',
        );
    };

    const objectiveTargets = useMemo(() => {
        if (objectiveForm.objective_type === 'explore_room') return rooms.map((row) => ({ id: row.id, name: row.name }));
        if (['acquire_item', 'deliver_item', 'interact_object'].includes(objectiveForm.objective_type)) return definitions.map((row) => ({ id: row.id, name: `${row.icon} ${row.name}` }));
        if (objectiveForm.objective_type === 'kill_faction') return factions.map((row) => ({ id: row.id, name: row.name }));
        if (objectiveForm.objective_type === 'pay_gold') return [{ id: 'gold', name: 'Gold' }];
        if (objectiveForm.objective_type === 'survive') return [{ id: 'timer', name: 'Elapsed time' }];
        if (objectiveForm.objective_type === 'choice') return questChoices.filter((row) => row.quest_id === objectiveForm.quest_id).map((row) => ({ id: row.id, name: row.label }));
        return npcs.map((row) => ({ id: row.id, name: row.name }));
    }, [definitions, factions, npcs, objectiveForm.objective_type, objectiveForm.quest_id, questChoices, rooms]);

    const remove = (table, id, label) => run(() => spacetime.from(table).delete().eq('id', id), `${label} deleted.`);

    const chooseModerationActor = (actorId) => {
        const actor = actorsById.get(actorId);
        const wallet = actorWallets.find((row) => row.actor_id === actorId);
        setModerationForm((value) => ({ ...value, actor_id: actorId, gold: wallet?.gold || 0, room_id: actor?.current_room || '', quest_id: '', quest_status: 'active' }));
    };

    const moderateActor = (action, payload, successText) => {
        if (!moderationForm.actor_id) {
            setMessage({ type: 'error', text: 'Choose an actor first.' });
            return Promise.resolve(false);
        }
        return run(() => spacetime.adminActorAction(moderationForm.actor_id, action, payload), successText);
    };

    const saveQuestProgress = (row) => moderateActor('set_quest_progress', { objective_id: row.objective_id, progress: Math.max(0, Number(row.progress) || 0) }, 'Quest objective progress saved.');

    const installStarterKit = () => run(() => spacetime.installRpgStarterKit(), 'Starter primitives installed. Existing definitions were preserved.');

    const locationLabel = (instance) => {
        if (instance.location_kind === 'room') return roomsById.get(instance.location_id)?.name || instance.location_id;
        if (instance.location_kind === 'container') {
            const container = instancesById.get(instance.location_id);
            return definitionsById.get(container?.definition_id)?.name || instance.location_id;
        }
        return actorsById.get(instance.location_id)?.label || instance.location_id;
    };

    const selectedActor = actorsById.get(moderationForm.actor_id);
    const selectedLifeState = lifeStates.find((row) => row.actor_id === moderationForm.actor_id);
    const selectedCooldowns = actorCooldowns.filter((row) => row.actor_id === moderationForm.actor_id);
    const selectedCrimes = actorCrimes.filter((row) => row.actor_id === moderationForm.actor_id);
    const selectedActorQuests = actorQuests.filter((row) => row.actor_id === moderationForm.actor_id);
    const selectedQuestProgress = actorQuestProgress.filter((row) => row.actor_id === moderationForm.actor_id);
    const filteredDeathRecords = deathRecords.filter((record) => {
        const query = deathFilter.query.trim().toLowerCase();
        const matchesQuery = !query || [record.actor_name, record.actor_id, record.death_room_id, record.defeated_by].some((value) => String(value || '').toLowerCase().includes(query));
        return matchesQuery && (deathFilter.mode === 'all' || record.death_mode === deathFilter.mode);
    });

    const exportDeathRecords = () => {
        const columns = ['id', 'actor_id', 'actor_name', 'death_room_id', 'spawn_point_id', 'death_mode', 'defeated_by', 'item_stacks_dropped', 'item_stacks_destroyed', 'gold_lost', 'experience_lost', 'died_at'];
        const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
        const csv = [columns.join(','), ...filteredDeathRecords.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `arkyv-deaths-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const pruneFilteredDeaths = () => {
        const ids = filteredDeathRecords.map((row) => row.id);
        if (ids.length === 0) return;
        return run(() => spacetime.from('actor_death_records').delete().in('id', ids), `${ids.length} death record${ids.length === 1 ? '' : 's'} pruned.`);
    };

    return (
        <section id="rpg-studio" className="scroll-mt-28 overflow-hidden rounded-2xl border border-purple-400/30 bg-slate-900/70 shadow-xl shadow-purple-500/10">
            <div className="flex flex-col gap-4 border-b border-purple-400/20 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h2 className="font-terminal text-sm uppercase tracking-[0.24em] text-purple-200 sm:text-base sm:tracking-[0.35em]">RPG Systems Studio</h2>
                    <p className="mt-1 max-w-3xl text-[0.65rem] uppercase leading-5 tracking-[0.14em] text-slate-400 sm:text-xs sm:tracking-[0.18em]">Definition-driven inventory, containers, chests, enemy drops, equipment, hero stats, consumables, and combat</p>
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
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            <Field label="Equipment slot"><select className={inputClass} value={definitionForm.equipment_slot} onChange={(e) => setDefinitionForm((value) => ({ ...value, equipment_slot: e.target.value }))}><option value="">Not equippable</option>{definitionForm.equipment_slot && !equipmentSlots.some((slot) => slot.id === definitionForm.equipment_slot) && <option value={definitionForm.equipment_slot}>{definitionForm.equipment_slot} (legacy)</option>}{equipmentSlots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name} · {slot.capacity} item{slot.capacity === 1 ? '' : 's'}</option>)}</select></Field>
                            <Field label="Weapon damage"><input type="number" min="0" className={inputClass} value={definitionForm.weapon_damage} onChange={(e) => setDefinitionForm((value) => ({ ...value, weapon_damage: e.target.value }))} /></Field>
                            <Field label="Armor value"><input type="number" min="0" className={inputClass} value={definitionForm.armor_value} onChange={(e) => setDefinitionForm((value) => ({ ...value, armor_value: e.target.value }))} /></Field>
                            <Field label="Scale with stat"><select className={inputClass} value={definitionForm.scales_with_stat} onChange={(e) => setDefinitionForm((value) => ({ ...value, scales_with_stat: e.target.value }))}><option value="">None</option>{stats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}</select></Field>
                            <Field label="Attack cooldown (ms)"><input type="number" min="0" step="100" className={inputClass} value={definitionForm.attack_cooldown_ms} onChange={(e) => setDefinitionForm((value) => ({ ...value, attack_cooldown_ms: e.target.value }))} /></Field>
                            <Field label="Inventory slots bonus"><input type="number" min="0" className={inputClass} value={definitionForm.inventory_slots_bonus} onChange={(e) => setDefinitionForm((value) => ({ ...value, inventory_slots_bonus: e.target.value }))} /></Field>
                        </div>
                        <Field label="Equipment stat modifiers (JSON)"><textarea className={`${inputClass} min-h-24 font-mono text-xs`} value={definitionForm.stat_modifiers} onChange={(e) => setDefinitionForm((value) => ({ ...value, stat_modifiers: e.target.value }))} placeholder={'{"strength": 2}'} /></Field>
                        <div className="rounded-lg border border-slate-700/60 p-4"><p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-300">Use behavior</p><div className="grid gap-4 md:grid-cols-3"><Field label="Target stat"><select className={inputClass} value={definitionForm.use_stat_id} onChange={(e) => setDefinitionForm((value) => ({ ...value, use_stat_id: e.target.value }))}><option value="">No use action</option>{stats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}</select></Field><Field label="Value change"><input type="number" className={inputClass} value={definitionForm.use_delta} onChange={(e) => setDefinitionForm((value) => ({ ...value, use_delta: e.target.value }))} /></Field><div className="flex items-end"><Check label="Consume one on use" checked={definitionForm.use_consume} onChange={(use_consume) => setDefinitionForm((value) => ({ ...value, use_consume }))} /></div></div></div>
                        <div className="flex flex-wrap justify-end gap-3">{editingDefinition && <button type="button" disabled={busy} onClick={() => remove('object_definitions', editingDefinition, 'Object primitive').then(() => { setEditingDefinition(null); setDefinitionForm(emptyDefinition()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200 hover:bg-rose-500/10">Delete</button>}<button type="button" disabled={busy} onClick={saveDefinition} className={buttonClass}>{busy ? 'Saving…' : 'Save primitive'}</button></div>
                    </div>
                </div>
            )}

            {activeTab === 'stats' && (
                <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[340px_1fr]">
                    <div className="space-y-2">{stats.map((stat) => <button key={stat.id} type="button" aria-pressed={editingStat === stat.id} onClick={() => { setEditingStat(stat.id); setStatForm({ ...emptyStat(), ...stat, role: stat.role || '' }); }} className={`w-full rounded-lg border p-4 text-left ${editingStat === stat.id ? 'border-purple-300 bg-purple-500/15' : 'border-slate-700/70 bg-slate-950/40 hover:border-slate-500'}`}><span className="text-sm text-slate-100">{stat.name}</span><span className="mt-1 block text-xs text-slate-500">{stat.default_value} base · +{stat.per_level_gain || 0}/level · {stat.regeneration_per_second || 0}/sec{stat.role ? ` · ${stat.role}` : ''}{stat.player_allocatable !== false ? ` · ${stat.point_cost || 1} point for +${stat.points_per_rank || 1}` : ' · fixed'}</span></button>)}</div>
                    <div className="space-y-5 rounded-xl border border-slate-700/70 bg-slate-950/35 p-5">
                        <div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.25em] text-purple-200">{editingStat ? 'Edit hero stat' : 'New hero stat'}</h3>{editingStat && <button type="button" onClick={() => { setEditingStat(null); setStatForm(emptyStat()); }} className="text-xs text-slate-400">New</button>}</div>
                        <div className="grid gap-4 md:grid-cols-2"><Field label="Name"><input className={inputClass} value={statForm.name} onChange={(e) => setStatForm((value) => ({ ...value, name: e.target.value }))} /></Field><Field label="Stable id"><input disabled={Boolean(editingStat)} className={inputClass} value={statForm.id} onChange={(e) => setStatForm((value) => ({ ...value, id: e.target.value }))} /></Field></div>
                        <Field label="Description"><textarea className={`${inputClass} min-h-24`} value={statForm.description} onChange={(e) => setStatForm((value) => ({ ...value, description: e.target.value }))} /></Field>
                        <div className="grid gap-4 md:grid-cols-3"><Field label="System role"><input list="rpg-stat-roles" className={inputClass} value={statForm.role} onChange={(e) => setStatForm((value) => ({ ...value, role: e.target.value }))} placeholder="Custom or runtime role" /><datalist id="rpg-stat-roles"><option value="health" /><option value="mana" /><option value="energy" /><option value="focus" /><option value="power" /><option value="defense" /><option value="accuracy" /><option value="crit" /><option value="dodge" /><option value="parry" /><option value="block" /><option value="resistance:physical" /><option value="resistance:fire" /><option value="resistance:frost" /><option value="resistance:arcane" /></datalist></Field><Field label="Minimum"><input type="number" className={inputClass} value={statForm.minimum} onChange={(e) => setStatForm((value) => ({ ...value, minimum: e.target.value }))} /></Field><Field label="Hard maximum"><input type="number" className={inputClass} value={statForm.maximum} onChange={(e) => setStatForm((value) => ({ ...value, maximum: e.target.value }))} /></Field><Field label="Level 1 base"><input type="number" className={inputClass} value={statForm.default_value} onChange={(e) => setStatForm((value) => ({ ...value, default_value: e.target.value }))} /></Field><Field label="Gain per level"><input type="number" className={inputClass} value={statForm.per_level_gain} onChange={(e) => setStatForm((value) => ({ ...value, per_level_gain: e.target.value }))} /></Field><Field label="Regenerate / second"><input type="number" min="0" className={inputClass} value={statForm.regeneration_per_second} onChange={(e) => setStatForm((value) => ({ ...value, regeneration_per_second: e.target.value }))} /></Field></div>
                        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Player allocation</p><div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.4fr]"><Field label="Point cost per rank"><input type="number" min="1" className={inputClass} value={statForm.point_cost} onChange={(e) => setStatForm((value) => ({ ...value, point_cost: e.target.value }))} /></Field><Field label="Value gained per rank"><input type="number" min="1" className={inputClass} value={statForm.points_per_rank} onChange={(e) => setStatForm((value) => ({ ...value, points_per_rank: e.target.value }))} /></Field><div className="flex items-end"><Check label="Players may spend stat points here" checked={statForm.player_allocatable !== false} onChange={(player_allocatable) => setStatForm((value) => ({ ...value, player_allocatable }))} /></div></div></div>
                        <Check label="Visible on the hero sheet" checked={statForm.visible} onChange={(visible) => setStatForm((value) => ({ ...value, visible }))} />
                        <div className="flex justify-end gap-3">{editingStat && <button type="button" disabled={busy} onClick={() => remove('stat_definitions', editingStat, 'Hero stat').then(() => { setEditingStat(null); setStatForm(emptyStat()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveStat} className={buttonClass}>Save stat</button></div>
                    </div>
                </div>
            )}

            {activeTab === 'abilities' && (
                <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[360px_1fr]">
                    <div className="space-y-4">
                        <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-4 text-xs leading-5 text-slate-400">Abilities are server-authoritative actions. Players use <span className="text-fuchsia-200">abilities</span> to inspect them and <span className="text-fuchsia-200">cast &lt;ability&gt; at &lt;target&gt;</span> to act.</div>
                        <div className="space-y-2">{abilities.map((ability) => <button key={ability.id} type="button" aria-pressed={editingAbility === ability.id} onClick={() => { setEditingAbility(ability.id); setAbilityForm({ ...emptyAbility(), ...ability, resource_stat_id: ability.resource_stat_id || '', scales_with_stat: ability.scales_with_stat || '', effect_stat_id: ability.effect_stat_id || '' }); }} className={`w-full rounded-xl border p-4 text-left ${editingAbility === ability.id ? 'border-fuchsia-300 bg-fuchsia-500/15' : 'border-slate-700/70 bg-slate-950/40 hover:border-fuchsia-400/40'}`}><span className="flex items-center justify-between gap-3"><span className="text-sm text-slate-100">{ability.icon} {ability.name}</span><span className={ability.enabled ? 'text-[0.6rem] uppercase tracking-wider text-emerald-300' : 'text-[0.6rem] uppercase tracking-wider text-slate-600'}>{ability.enabled ? 'Enabled' : 'Disabled'}</span></span><span className="mt-1 block text-xs text-slate-500">Level {ability.required_level} · {ability.effect_type} · {ability.target_type} · {ability.cooldown_ms}ms</span></button>)}</div>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-5 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5">
                            <div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.25em] text-fuchsia-200">{editingAbility ? 'Edit ability' : 'New ability'}</h3>{editingAbility && <button type="button" onClick={() => { setEditingAbility(null); setAbilityForm(emptyAbility()); }} className="text-xs text-slate-400">New</button>}</div>
                            <div className="grid gap-4 sm:grid-cols-[90px_1fr_1fr]"><Field label="Icon"><input className={inputClass} value={abilityForm.icon} onChange={(event) => setAbilityForm((value) => ({ ...value, icon: event.target.value }))} /></Field><Field label="Name"><input className={inputClass} value={abilityForm.name} onChange={(event) => setAbilityForm((value) => ({ ...value, name: event.target.value }))} /></Field><Field label="Stable id"><input disabled={Boolean(editingAbility)} className={inputClass} value={abilityForm.id} onChange={(event) => setAbilityForm((value) => ({ ...value, id: event.target.value }))} placeholder="firebolt" /></Field></div>
                            <Field label="Description"><textarea className={`${inputClass} min-h-20`} value={abilityForm.description} onChange={(event) => setAbilityForm((value) => ({ ...value, description: event.target.value }))} /></Field>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="School"><input className={inputClass} value={abilityForm.school} onChange={(event) => setAbilityForm((value) => ({ ...value, school: event.target.value }))} placeholder="fire, physical, arcane" /></Field><Field label="Effect"><select className={inputClass} value={abilityForm.effect_type} onChange={(event) => setAbilityForm((value) => ({ ...value, effect_type: event.target.value }))}><option value="damage">Damage</option><option value="heal">Heal</option><option value="restore">Restore resource</option></select></Field><Field label="Target"><select className={inputClass} value={abilityForm.target_type} onChange={(event) => setAbilityForm((value) => ({ ...value, target_type: event.target.value }))}><option value="enemy">Enemy</option><option value="self">Self</option><option value="ally">Ally</option></select></Field><Field label="Mitigation"><select className={inputClass} value={abilityForm.mitigation_type} onChange={(event) => setAbilityForm((value) => ({ ...value, mitigation_type: event.target.value }))}><option value="none">Direct / none</option><option value="armor">Defense + armor</option></select></Field></div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Cost resource"><select className={inputClass} value={abilityForm.resource_stat_id} onChange={(event) => setAbilityForm((value) => ({ ...value, resource_stat_id: event.target.value }))}><option value="">Free</option>{stats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}</select></Field><Field label="Resource cost"><input type="number" min="0" className={inputClass} value={abilityForm.resource_cost} onChange={(event) => setAbilityForm((value) => ({ ...value, resource_cost: event.target.value }))} /></Field><Field label="Cooldown (ms)"><input type="number" min="0" step="100" className={inputClass} value={abilityForm.cooldown_ms} onChange={(event) => setAbilityForm((value) => ({ ...value, cooldown_ms: event.target.value }))} /></Field><Field label="Cast time (ms)"><input type="number" min="0" step="100" className={inputClass} value={abilityForm.cast_time_ms} onChange={(event) => setAbilityForm((value) => ({ ...value, cast_time_ms: event.target.value }))} /></Field></div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Field label="Power minimum"><input type="number" min="0" className={inputClass} value={abilityForm.power_min} onChange={(event) => setAbilityForm((value) => ({ ...value, power_min: event.target.value }))} /></Field><Field label="Power maximum"><input type="number" min="0" className={inputClass} value={abilityForm.power_max} onChange={(event) => setAbilityForm((value) => ({ ...value, power_max: event.target.value }))} /></Field><Field label="Scale stat"><select className={inputClass} value={abilityForm.scales_with_stat} onChange={(event) => setAbilityForm((value) => ({ ...value, scales_with_stat: event.target.value }))}><option value="">No scaling</option>{stats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}</select></Field><Field label="Scaling %"><input type="number" min="0" className={inputClass} value={abilityForm.scaling_percent} onChange={(event) => setAbilityForm((value) => ({ ...value, scaling_percent: event.target.value }))} /></Field><Field label="Affected stat"><select className={inputClass} value={abilityForm.effect_stat_id} onChange={(event) => setAbilityForm((value) => ({ ...value, effect_stat_id: event.target.value }))}><option value="">Health role fallback</option>{stats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}</select></Field></div>
                            <div className="grid gap-4 sm:grid-cols-3"><Field label="Required level"><input type="number" min="1" className={inputClass} value={abilityForm.required_level} onChange={(event) => setAbilityForm((value) => ({ ...value, required_level: event.target.value }))} /></Field><div className="flex items-end"><Check label="Learn automatically at level" checked={abilityForm.auto_learn} onChange={(auto_learn) => setAbilityForm((value) => ({ ...value, auto_learn }))} /></div><div className="flex items-end"><Check label="Enabled in the world" checked={abilityForm.enabled} onChange={(enabledValue) => setAbilityForm((value) => ({ ...value, enabled: enabledValue }))} /></div></div>
                            <div className="flex justify-end gap-3">{editingAbility && <button type="button" disabled={busy} onClick={() => remove('ability_definitions', editingAbility, 'Ability').then(() => { setEditingAbility(null); setAbilityForm(emptyAbility()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveAbility} className={buttonClass}>Save ability</button></div>
                        </div>
                        <div className="space-y-5 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-4 sm:p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div><h3 className="text-sm uppercase tracking-[0.22em] text-fuchsia-200">Effect sequence</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Add ordered effects for damage, healing, resources, buffs, debuffs, status-over-time, area targeting, interrupts, cleansing, teleporting, reviving, and summoning. Once an ability has a sequence, these effects replace its legacy single effect.</p></div>
                                {editingAbilityEffect && <button type="button" onClick={() => { setEditingAbilityEffect(null); setAbilityEffectForm({ ...emptyAbilityEffect(), ability_id: editingAbility || '' }); }} className="text-xs text-slate-400">New effect</button>}
                            </div>
                            {!editingAbility && <p className="rounded-lg border border-dashed border-fuchsia-400/30 p-4 text-xs text-fuchsia-200/70">Save or select an ability to compose its effects.</p>}
                            {editingAbility && <>
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {abilityEffects.filter((effect) => effect.ability_id === editingAbility).map((effect) => <button key={effect.id} type="button" onClick={() => { setEditingAbilityEffect(effect.id); setAbilityEffectForm({ ...emptyAbilityEffect(), ...effect, stat_id: effect.stat_id || '', scales_with_stat: effect.scales_with_stat || '', destination_room_id: effect.destination_room_id || '', summon_npc_id: effect.summon_npc_id || '' }); }} className={`rounded-lg border p-3 text-left ${editingAbilityEffect === effect.id ? 'border-fuchsia-300 bg-fuchsia-500/15' : 'border-slate-700 bg-black/20 hover:border-fuchsia-400/40'}`}><span className="block text-xs font-semibold text-slate-200">{effect.sort_order}. {effect.effect_kind.replaceAll('_', ' ')}</span><span className="mt-1 block text-[0.68rem] text-slate-500">{effect.target_scope.replaceAll('_', ' ')} · {effect.chance_percent}% · {effect.power_min}–{effect.power_max}</span></button>)}
                                    {abilityEffects.every((effect) => effect.ability_id !== editingAbility) && <p className="rounded-lg border border-dashed border-slate-800 p-4 text-xs text-slate-600 sm:col-span-2 xl:col-span-3">No structured effects yet. The legacy effect fields above remain active until you add one.</p>}
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    <Field label="Stable effect id"><input disabled={Boolean(editingAbilityEffect)} className={inputClass} value={abilityEffectForm.id} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, id: event.target.value }))} placeholder={`${editingAbility}-effect-1`} /></Field>
                                    <Field label="Effect kind"><select className={inputClass} value={abilityEffectForm.effect_kind} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, effect_kind: event.target.value }))}>{['damage', 'heal', 'restore', 'buff', 'debuff', 'stun', 'damage_over_time', 'heal_over_time', 'interrupt', 'cleanse', 'teleport', 'revive', 'summon'].map((kind) => <option key={kind} value={kind}>{kind.replaceAll('_', ' ')}</option>)}</select></Field>
                                    <Field label="Target scope"><select className={inputClass} value={abilityEffectForm.target_scope} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, target_scope: event.target.value }))}><option value="primary">Primary target</option><option value="self">Caster</option><option value="all_enemies">All enemies in room</option><option value="all_allies">All allies in room</option><option value="room">Everyone in room</option></select></Field>
                                    <Field label="Order"><input type="number" min="0" className={inputClass} value={abilityEffectForm.sort_order} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, sort_order: event.target.value }))} /></Field>
                                    <Field label="Affected stat"><select className={inputClass} value={abilityEffectForm.stat_id} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, stat_id: event.target.value }))}><option value="">Health role fallback</option>{stats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}</select></Field>
                                    <Field label="Power minimum"><input type="number" className={inputClass} value={abilityEffectForm.power_min} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, power_min: event.target.value }))} /></Field>
                                    <Field label="Power maximum"><input type="number" className={inputClass} value={abilityEffectForm.power_max} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, power_max: event.target.value }))} /></Field>
                                    <Field label="Chance %"><input type="number" min="0" max="100" className={inputClass} value={abilityEffectForm.chance_percent} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, chance_percent: event.target.value }))} /></Field>
                                    <Field label="Scale with stat"><select className={inputClass} value={abilityEffectForm.scales_with_stat} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, scales_with_stat: event.target.value }))}><option value="">No scaling</option>{stats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}</select></Field>
                                    <Field label="Scaling %"><input type="number" className={inputClass} value={abilityEffectForm.scaling_percent} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, scaling_percent: event.target.value }))} /></Field>
                                    <Field label="Mitigation"><select className={inputClass} value={abilityEffectForm.mitigation_type} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, mitigation_type: event.target.value }))}><option value="none">Direct / none</option><option value="armor">Defense + armor</option></select></Field>
                                    <Field label="Status name"><input className={inputClass} value={abilityEffectForm.status_name} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, status_name: event.target.value }))} placeholder="Burning, stunned…" /></Field>
                                    <Field label="Duration (ms)"><input type="number" min="0" step="100" className={inputClass} value={abilityEffectForm.duration_ms} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, duration_ms: event.target.value }))} /></Field>
                                    <Field label="Tick every (ms)"><input type="number" min="1" step="100" className={inputClass} value={abilityEffectForm.tick_interval_ms} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, tick_interval_ms: event.target.value }))} /></Field>
                                    <Field label="Stat modifier / stack"><input type="number" className={inputClass} value={abilityEffectForm.modifier_value} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, modifier_value: event.target.value }))} /></Field>
                                    <Field label="Maximum stacks"><input type="number" min="1" className={inputClass} value={abilityEffectForm.max_stacks} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, max_stacks: event.target.value }))} /></Field>
                                    <Field label="Teleport destination"><select className={inputClass} value={abilityEffectForm.destination_room_id} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, destination_room_id: event.target.value }))}><option value="">None</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></Field>
                                    <Field label="Summon NPC"><select className={inputClass} value={abilityEffectForm.summon_npc_id} onChange={(event) => setAbilityEffectForm((value) => ({ ...value, summon_npc_id: event.target.value }))}><option value="">None</option>{npcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}</select></Field>
                                </div>
                                <div className="flex justify-end gap-3">{editingAbilityEffect && <button type="button" disabled={busy} onClick={() => remove('ability_effect_definitions', editingAbilityEffect, 'Ability effect').then(() => { setEditingAbilityEffect(null); setAbilityEffectForm({ ...emptyAbilityEffect(), ability_id: editingAbility }); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete effect</button>}<button type="button" disabled={busy} onClick={saveAbilityEffect} className={buttonClass}>Save effect</button></div>
                            </>}
                        </div>
                        <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div><h3 className="text-sm uppercase tracking-[0.22em] text-fuchsia-200">Explicit grants</h3><p className="mt-1 text-xs leading-5 text-slate-500">Grant a non-auto-learned ability, or grant one early. Level-based abilities do not need rows here.</p></div><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Field label="Actor"><select className={inputClass} value={grantForm.actor_id} onChange={(event) => setGrantForm((value) => ({ ...value, actor_id: event.target.value }))}><option value="">Choose actor…</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.label}</option>)}</select></Field><Field label="Ability"><select className={inputClass} value={grantForm.ability_id} onChange={(event) => setGrantForm((value) => ({ ...value, ability_id: event.target.value }))}><option value="">Choose ability…</option>{abilities.map((ability) => <option key={ability.id} value={ability.id}>{ability.icon} {ability.name}</option>)}</select></Field><div className="flex items-end"><button type="button" disabled={busy} onClick={saveGrant} className={buttonClass}>Grant</button></div></div><div className="flex flex-wrap gap-2">{abilityGrants.map((grant) => <button key={grant.id} type="button" disabled={busy} onClick={() => remove('actor_abilities', grant.id, 'Ability grant')} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-rose-400 hover:text-rose-200">{actorsById.get(grant.actor_id)?.name || grant.actor_id} · {abilities.find((ability) => ability.id === grant.ability_id)?.name || grant.ability_id} ×</button>)}</div></div>
                    </div>
                </div>
            )}

            {activeTab === 'combat' && (
                <div className="space-y-6 p-4 sm:p-6">
                    <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.04] p-4 sm:p-5"><div><h3 className="text-sm uppercase tracking-[0.22em] text-rose-200">World combat model</h3><p className="mt-1 text-xs leading-5 text-slate-500">These baselines are combined with actor stats by system role. Create stats with roles such as accuracy, crit, dodge, parry, block, or resistance:fire to extend the model without code changes.</p></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Base hit chance %"><input type="number" min="0" max="100" className={inputClass} value={combatForm.base_hit_chance_percent} onChange={(event) => setCombatForm((value) => ({ ...value, base_hit_chance_percent: event.target.value }))} /></Field><Field label="Base critical chance %"><input type="number" min="0" max="100" className={inputClass} value={combatForm.base_crit_chance_percent} onChange={(event) => setCombatForm((value) => ({ ...value, base_crit_chance_percent: event.target.value }))} /></Field><Field label="Critical damage %"><input type="number" min="100" className={inputClass} value={combatForm.crit_damage_percent} onChange={(event) => setCombatForm((value) => ({ ...value, crit_damage_percent: event.target.value }))} /></Field><Field label="Base dodge chance %"><input type="number" min="0" max="100" className={inputClass} value={combatForm.base_dodge_chance_percent} onChange={(event) => setCombatForm((value) => ({ ...value, base_dodge_chance_percent: event.target.value }))} /></Field><Field label="Base parry chance %"><input type="number" min="0" max="100" className={inputClass} value={combatForm.base_parry_chance_percent} onChange={(event) => setCombatForm((value) => ({ ...value, base_parry_chance_percent: event.target.value }))} /></Field><Field label="Base block chance %"><input type="number" min="0" max="100" className={inputClass} value={combatForm.base_block_chance_percent} onChange={(event) => setCombatForm((value) => ({ ...value, base_block_chance_percent: event.target.value }))} /></Field><Field label="Blocked damage reduction %"><input type="number" min="0" max="100" className={inputClass} value={combatForm.block_damage_reduction_percent} onChange={(event) => setCombatForm((value) => ({ ...value, block_damage_reduction_percent: event.target.value }))} /></Field><Field label="Armor effectiveness %"><input type="number" min="0" className={inputClass} value={combatForm.armor_effectiveness_percent} onChange={(event) => setCombatForm((value) => ({ ...value, armor_effectiveness_percent: event.target.value }))} /></Field><Field label="PvP damage scaling %"><input type="number" min="0" className={inputClass} value={combatForm.pvp_damage_percent} onChange={(event) => setCombatForm((value) => ({ ...value, pvp_damage_percent: event.target.value }))} /></Field><Field label="Global cooldown (ms)"><input type="number" min="0" step="100" className={inputClass} value={combatForm.global_cooldown_ms} onChange={(event) => setCombatForm((value) => ({ ...value, global_cooldown_ms: event.target.value }))} /></Field><Field label="Assist XP %"><input type="number" min="0" max="100" className={inputClass} value={combatForm.assist_xp_percent} onChange={(event) => setCombatForm((value) => ({ ...value, assist_xp_percent: event.target.value }))} /></Field><Field label="Threat decay (seconds)"><input type="number" min="0" className={inputClass} value={combatForm.threat_decay_seconds} onChange={(event) => setCombatForm((value) => ({ ...value, threat_decay_seconds: event.target.value }))} /></Field></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><Check label="NPC threat targeting and assist tracking" checked={combatForm.threat_enabled} onChange={(threat_enabled) => setCombatForm((value) => ({ ...value, threat_enabled }))} /><button type="button" disabled={busy} onClick={saveCombat} className={buttonClass}>Save combat rules</button></div></div>
                    <div className="rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.2em] text-slate-200">Live NPC threat</h3><span className="text-xs text-slate-600">{npcThreat.length} relationships</span></div><div className="mt-4 grid gap-2 lg:grid-cols-2">{npcThreat.slice(0, 100).map((row) => <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-3 rounded-lg border border-slate-800 bg-black/20 p-3 text-xs"><span className="text-slate-200">{npcs.find((npc) => npc.id === row.npc_id)?.name || row.npc_id}</span><span className="text-slate-400">{actorsById.get(row.actor_id)?.name || row.actor_id}</span><span className="text-rose-200">{row.threat} threat · {row.damage_contributed} dmg</span></div>)}{npcThreat.length === 0 && <p className="rounded-lg border border-dashed border-slate-800 p-5 text-center text-xs text-slate-600 lg:col-span-2">Threat appears as actors damage NPCs and expires according to the authored decay window.</p>}</div></div>
                </div>
            )}

            {activeTab === 'factions' && (
                <div className="space-y-6 p-4 sm:p-6">
                    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
                        <div className="space-y-2">{factions.map((faction) => <button key={faction.id} type="button" onClick={() => { setEditingFaction(faction.id); setFactionForm({ ...emptyFaction(), ...faction }); }} className={`w-full rounded-xl border p-4 text-left ${editingFaction === faction.id ? 'border-cyan-300 bg-cyan-500/15' : 'border-slate-700/70 bg-slate-950/40 hover:border-cyan-400/40'}`}><span className="block text-sm text-slate-100">{faction.name}</span><span className="mt-1 block text-xs text-slate-500">{faction.id} · hostile ≤ {faction.hostile_threshold} · friendly ≥ {faction.friendly_threshold}</span></button>)}</div>
                        <div className="space-y-5 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5">
                            <div className="flex items-center justify-between"><div><h3 className="text-sm uppercase tracking-[0.22em] text-cyan-200">{editingFaction ? 'Edit faction' : 'New faction'}</h3><p className="mt-1 text-xs text-slate-500">NPC faction ids connect combat consequences, guards, quest requirements, and rewards.</p></div>{editingFaction && <button type="button" onClick={() => { setEditingFaction(null); setFactionForm(emptyFaction()); }} className="text-xs text-slate-400">New</button>}</div>
                            <div className="grid gap-4 sm:grid-cols-2"><Field label="Name"><input className={inputClass} value={factionForm.name} onChange={(event) => setFactionForm((value) => ({ ...value, name: event.target.value }))} /></Field><Field label="Stable id"><input disabled={Boolean(editingFaction)} className={inputClass} value={factionForm.id} onChange={(event) => setFactionForm((value) => ({ ...value, id: event.target.value }))} placeholder="settlement-watch" /></Field></div>
                            <Field label="Description"><textarea className={`${inputClass} min-h-20`} value={factionForm.description} onChange={(event) => setFactionForm((value) => ({ ...value, description: event.target.value }))} /></Field>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Starting"><input type="number" className={inputClass} value={factionForm.starting_reputation} onChange={(event) => setFactionForm((value) => ({ ...value, starting_reputation: event.target.value }))} /></Field><Field label="Minimum"><input type="number" className={inputClass} value={factionForm.minimum_reputation} onChange={(event) => setFactionForm((value) => ({ ...value, minimum_reputation: event.target.value }))} /></Field><Field label="Maximum"><input type="number" className={inputClass} value={factionForm.maximum_reputation} onChange={(event) => setFactionForm((value) => ({ ...value, maximum_reputation: event.target.value }))} /></Field><Field label="Hostile at / below"><input type="number" className={inputClass} value={factionForm.hostile_threshold} onChange={(event) => setFactionForm((value) => ({ ...value, hostile_threshold: event.target.value }))} /></Field><Field label="Friendly at / above"><input type="number" className={inputClass} value={factionForm.friendly_threshold} onChange={(event) => setFactionForm((value) => ({ ...value, friendly_threshold: event.target.value }))} /></Field><Field label="Attack change"><input type="number" className={inputClass} value={factionForm.attack_penalty} onChange={(event) => setFactionForm((value) => ({ ...value, attack_penalty: event.target.value }))} /></Field><Field label="Kill change"><input type="number" className={inputClass} value={factionForm.kill_penalty} onChange={(event) => setFactionForm((value) => ({ ...value, kill_penalty: event.target.value }))} /></Field></div>
                            <div className="flex justify-end gap-3">{editingFaction && <button type="button" disabled={busy} onClick={() => remove('faction_definitions', editingFaction, 'Faction').then(() => { setEditingFaction(null); setFactionForm(emptyFaction()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveFaction} className={buttonClass}>Save faction</button></div>
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><h3 className="text-sm uppercase tracking-[0.22em] text-cyan-200">Actor standings</h3><p className="mt-1 text-xs text-slate-500">Rows appear after an actor first encounters a faction or receives a reputation change.</p><div className="mt-4 grid gap-3 lg:grid-cols-2">{actorReputations.map((row) => <div key={row.id} className="grid gap-3 rounded-lg border border-slate-800 bg-black/20 p-3 sm:grid-cols-[1fr_140px_auto] sm:items-end"><div><span className={labelClass}>Actor / faction</span><p className="mt-2 text-sm text-slate-200">{actorsById.get(row.actor_id)?.name || row.actor_id} · {factions.find((faction) => faction.id === row.faction_id)?.name || row.faction_id}</p></div><Field label="Reputation"><input type="number" className={inputClass} value={row.reputation} onChange={(event) => setActorReputations((values) => values.map((value) => value.id === row.id ? { ...value, reputation: event.target.value } : value))} /></Field><button type="button" disabled={busy} onClick={() => saveActorReputation(row)} className={buttonClass}>Save</button></div>)}</div></div>
                </div>
            )}

            {activeTab === 'quests' && (
                <div className="space-y-6 p-4 sm:p-6">
                    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
                        <div className="space-y-2">{quests.map((quest) => <button key={quest.id} type="button" onClick={() => { setEditingQuest(quest.id); setQuestForm({ ...emptyQuest(), ...quest, required_faction_id: quest.required_faction_id || '', reputation_faction_id: quest.reputation_faction_id || '' }); setObjectiveForm((value) => ({ ...value, quest_id: quest.id })); setQuestRewardForm((value) => ({ ...value, quest_id: quest.id })); }} className={`w-full rounded-xl border p-4 text-left ${editingQuest === quest.id ? 'border-amber-300 bg-amber-500/15' : 'border-slate-700/70 bg-slate-950/40 hover:border-amber-400/40'}`}><span className="flex items-center justify-between gap-3"><span className="text-sm text-slate-100">{quest.title}</span><span className={quest.active ? 'text-[0.6rem] uppercase text-emerald-300' : 'text-[0.6rem] uppercase text-slate-600'}>{quest.active ? 'Active' : 'Draft'}</span></span><span className="mt-1 block text-xs text-slate-500">{quest.id} · {quest.xp_reward} XP · {quest.gold_reward} gold</span></button>)}</div>
                        <div className="space-y-5 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5">
                            <div className="flex items-center justify-between"><div><h3 className="text-sm uppercase tracking-[0.22em] text-amber-200">{editingQuest ? 'Edit quest' : 'New quest'}</h3><p className="mt-1 text-xs text-slate-500">Players accept from the giver, complete server-observed objectives, and report to the turn-in NPC.</p></div>{editingQuest && <button type="button" onClick={() => { setEditingQuest(null); setQuestForm(emptyQuest()); }} className="text-xs text-slate-400">New</button>}</div>
                            <div className="grid gap-4 sm:grid-cols-2"><Field label="Title"><input className={inputClass} value={questForm.title} onChange={(event) => setQuestForm((value) => ({ ...value, title: event.target.value }))} /></Field><Field label="Stable id"><input disabled={Boolean(editingQuest)} className={inputClass} value={questForm.id} onChange={(event) => setQuestForm((value) => ({ ...value, id: event.target.value }))} placeholder="watch-first-patrol" /></Field></div>
                            <Field label="Description"><textarea className={`${inputClass} min-h-24`} value={questForm.description} onChange={(event) => setQuestForm((value) => ({ ...value, description: event.target.value }))} /></Field>
                            <div className="grid gap-4 sm:grid-cols-2"><Field label="Quest giver"><select className={inputClass} value={questForm.quest_giver_npc_id} onChange={(event) => setQuestForm((value) => ({ ...value, quest_giver_npc_id: event.target.value }))}><option value="">Choose NPC…</option>{npcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}</select></Field><Field label="Turn-in NPC"><select className={inputClass} value={questForm.turn_in_npc_id} onChange={(event) => setQuestForm((value) => ({ ...value, turn_in_npc_id: event.target.value }))}><option value="">Choose NPC…</option>{npcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}</select></Field></div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Required level"><input type="number" min="1" className={inputClass} value={questForm.required_level} onChange={(event) => setQuestForm((value) => ({ ...value, required_level: event.target.value }))} /></Field><Field label="Required faction"><select className={inputClass} value={questForm.required_faction_id} onChange={(event) => setQuestForm((value) => ({ ...value, required_faction_id: event.target.value }))}><option value="">None</option>{factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}</select></Field><Field label="Required reputation"><input type="number" className={inputClass} value={questForm.required_reputation} onChange={(event) => setQuestForm((value) => ({ ...value, required_reputation: event.target.value }))} /></Field><Field label="XP reward"><input type="number" min="0" className={inputClass} value={questForm.xp_reward} onChange={(event) => setQuestForm((value) => ({ ...value, xp_reward: event.target.value }))} /></Field><Field label="Gold reward"><input type="number" min="0" className={inputClass} value={questForm.gold_reward} onChange={(event) => setQuestForm((value) => ({ ...value, gold_reward: event.target.value }))} /></Field><Field label="Reward faction"><select className={inputClass} value={questForm.reputation_faction_id} onChange={(event) => setQuestForm((value) => ({ ...value, reputation_faction_id: event.target.value }))}><option value="">None</option>{factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}</select></Field><Field label="Reputation reward"><input type="number" className={inputClass} value={questForm.reputation_reward} onChange={(event) => setQuestForm((value) => ({ ...value, reputation_reward: event.target.value }))} /></Field></div>
                            <div className="grid gap-2 sm:grid-cols-2"><Check label="Repeatable" checked={questForm.repeatable} onChange={(repeatable) => setQuestForm((value) => ({ ...value, repeatable }))} /><Check label="Active / visible to players" checked={questForm.active} onChange={(active) => setQuestForm((value) => ({ ...value, active }))} /></div>
                            <div className="flex justify-end gap-3">{editingQuest && <button type="button" disabled={busy} onClick={() => remove('quest_definitions', editingQuest, 'Quest').then(() => { setEditingQuest(null); setQuestForm(emptyQuest()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveQuest} className={buttonClass}>Save quest</button></div>
                        </div>
                    </div>
                    <div className="grid gap-6 xl:grid-cols-2">
                        <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div><h3 className="text-sm uppercase tracking-[0.22em] text-amber-200">Objectives</h3><p className="mt-1 text-xs text-slate-500">Server-observed exploration, combat, delivery, payment, interaction, escort, choice, and survival goals.</p></div><div className="flex flex-wrap gap-2">{questObjectives.filter((row) => !editingQuest || row.quest_id === editingQuest).map((row) => <button key={row.id} type="button" onClick={() => { setEditingObjective(row.id); setObjectiveForm({ ...emptyObjective(), ...row }); }} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400">{row.description || row.objective_type} ×{row.required_count}</button>)}</div><div className="grid gap-4 sm:grid-cols-2"><Field label="Quest"><select className={inputClass} value={objectiveForm.quest_id} onChange={(event) => setObjectiveForm((value) => ({ ...value, quest_id: event.target.value }))}><option value="">Choose quest…</option>{quests.map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}</select></Field><Field label="Objective type"><select className={inputClass} value={objectiveForm.objective_type} onChange={(event) => setObjectiveForm((value) => ({ ...value, objective_type: event.target.value, target_id: '' }))}><option value="explore_room">Explore a room</option><option value="acquire_item">Acquire an item</option><option value="deliver_item">Deliver an item</option><option value="interact_object">Interact with an object</option><option value="kill_npc">Defeat an NPC</option><option value="kill_faction">Defeat faction members</option><option value="talk_npc">Speak to an NPC</option><option value="escort_npc">Escort an NPC</option><option value="pay_gold">Pay gold</option><option value="choice">Make a branch choice</option><option value="survive">Survive for seconds</option></select></Field><Field label="Target"><select className={inputClass} value={objectiveForm.target_id} onChange={(event) => setObjectiveForm((value) => ({ ...value, target_id: event.target.value }))}><option value="">Choose target…</option>{objectiveTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></Field><Field label={objectiveForm.objective_type === 'survive' ? 'Seconds' : objectiveForm.objective_type === 'pay_gold' ? 'Gold amount' : 'Required count'}><input type="number" min="1" className={inputClass} value={objectiveForm.required_count} onChange={(event) => setObjectiveForm((value) => ({ ...value, required_count: event.target.value }))} /></Field><Field label="Display order"><input type="number" min="0" className={inputClass} value={objectiveForm.sort_order} onChange={(event) => setObjectiveForm((value) => ({ ...value, sort_order: event.target.value }))} /></Field></div><Field label="Player-facing description"><input className={inputClass} value={objectiveForm.description} onChange={(event) => setObjectiveForm((value) => ({ ...value, description: event.target.value }))} placeholder="Leave blank for an automatic label" /></Field>{['acquire_item', 'deliver_item', 'pay_gold'].includes(objectiveForm.objective_type) && <Check label="Consume / collect requirement on turn-in" checked={objectiveForm.consume_on_turn_in} onChange={(consume_on_turn_in) => setObjectiveForm((value) => ({ ...value, consume_on_turn_in }))} />}<div className="flex justify-end gap-3">{editingObjective && <button type="button" disabled={busy} onClick={() => remove('quest_objectives', editingObjective, 'Quest objective').then(() => { setEditingObjective(null); setObjectiveForm({ ...emptyObjective(), quest_id: editingQuest || '' }); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveObjective} className={buttonClass}>Save objective</button></div></div>
                        <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div><h3 className="text-sm uppercase tracking-[0.22em] text-amber-200">Item rewards</h3><p className="mt-1 text-xs text-slate-500">XP, gold, and reputation are configured above; add any number of inventory item rewards here.</p></div><div className="flex flex-wrap gap-2">{questRewards.filter((row) => !editingQuest || row.quest_id === editingQuest).map((row) => <button key={row.id} type="button" onClick={() => { setEditingQuestReward(row.id); setQuestRewardForm({ ...emptyQuestReward(), ...row }); }} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400">{definitionsById.get(row.definition_id)?.name || row.definition_id} ×{row.quantity}</button>)}</div><Field label="Quest"><select className={inputClass} value={questRewardForm.quest_id} onChange={(event) => setQuestRewardForm((value) => ({ ...value, quest_id: event.target.value }))}><option value="">Choose quest…</option>{quests.map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}</select></Field><Field label="Reward item"><select className={inputClass} value={questRewardForm.definition_id} onChange={(event) => setQuestRewardForm((value) => ({ ...value, definition_id: event.target.value }))}><option value="">Choose item…</option>{definitions.filter((definition) => definition.portable).map((definition) => <option key={definition.id} value={definition.id}>{definition.icon} {definition.name}</option>)}</select></Field><Field label="Quantity"><input type="number" min="1" className={inputClass} value={questRewardForm.quantity} onChange={(event) => setQuestRewardForm((value) => ({ ...value, quantity: event.target.value }))} /></Field><div className="flex justify-end gap-3">{editingQuestReward && <button type="button" disabled={busy} onClick={() => remove('quest_item_rewards', editingQuestReward, 'Quest item reward').then(() => { setEditingQuestReward(null); setQuestRewardForm({ ...emptyQuestReward(), quest_id: editingQuest || '' }); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveQuestReward} className={buttonClass}>Save item reward</button></div></div>
                    </div>
                    <div className="grid gap-6 xl:grid-cols-2">
                        <div className="space-y-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-4 sm:p-5"><div><h3 className="text-sm uppercase tracking-[0.22em] text-amber-200">Prerequisite, timing &amp; failure rules</h3><p className="mt-1 text-xs text-slate-500">Zero time or maximum completions means unlimited. Failure-on-death affects only this quest.</p></div><Field label="Quest"><select className={inputClass} value={questRuleForm.quest_id} onChange={(event) => { const quest_id = event.target.value; const existing = questRules.find((rule) => rule.quest_id === quest_id); setQuestRuleForm({ ...emptyQuestRule(), ...(existing || {}), quest_id, prerequisite_quest_id: existing?.prerequisite_quest_id || '', next_quest_id: existing?.next_quest_id || '' }); }}><option value="">Choose quest…</option>{quests.map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Prerequisite quest"><select className={inputClass} value={questRuleForm.prerequisite_quest_id} onChange={(event) => setQuestRuleForm((value) => ({ ...value, prerequisite_quest_id: event.target.value }))}><option value="">None</option>{quests.filter((quest) => quest.id !== questRuleForm.quest_id).map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}</select></Field><Field label="Required completions"><input type="number" min="1" className={inputClass} value={questRuleForm.prerequisite_completions} onChange={(event) => setQuestRuleForm((value) => ({ ...value, prerequisite_completions: event.target.value }))} /></Field><Field label="Time limit (seconds)"><input type="number" min="0" className={inputClass} value={questRuleForm.time_limit_seconds} onChange={(event) => setQuestRuleForm((value) => ({ ...value, time_limit_seconds: event.target.value }))} /></Field><Field label="Follow-up quest"><select className={inputClass} value={questRuleForm.next_quest_id} onChange={(event) => setQuestRuleForm((value) => ({ ...value, next_quest_id: event.target.value }))}><option value="">None</option>{quests.filter((quest) => quest.id !== questRuleForm.quest_id).map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}</select></Field><Field label="Maximum completions"><input type="number" min="0" className={inputClass} value={questRuleForm.maximum_completions} onChange={(event) => setQuestRuleForm((value) => ({ ...value, maximum_completions: event.target.value }))} /></Field><div className="flex items-end"><Check label="Fail this quest on player death" checked={questRuleForm.failure_on_death} onChange={(failure_on_death) => setQuestRuleForm((value) => ({ ...value, failure_on_death }))} /></div></div><div className="flex justify-end gap-3">{questRules.some((rule) => rule.quest_id === questRuleForm.quest_id) && <button type="button" disabled={busy} onClick={() => run(() => spacetime.from('quest_rules').delete().eq('quest_id', questRuleForm.quest_id), 'Quest rules removed.').then(() => setQuestRuleForm(emptyQuestRule()))} className="rounded-md border border-rose-400/40 px-4 py-2 text-xs text-rose-200">Remove rules</button>}<button type="button" disabled={busy} onClick={saveQuestRule} className={buttonClass}>Save rules</button></div></div>
                        <div className="space-y-4 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-4 sm:p-5"><div><h3 className="text-sm uppercase tracking-[0.22em] text-fuchsia-200">Quest branches</h3><p className="mt-1 text-xs text-slate-500">Players choose once with <span className="text-fuchsia-100">choose &lt;option&gt;</span>; choices may grant gold/reputation and advertise a different follow-up.</p></div><div className="flex flex-wrap gap-2">{questChoices.filter((choice) => !editingQuest || choice.quest_id === editingQuest).map((choice) => <button key={choice.id} type="button" onClick={() => remove('quest_choices', choice.id, 'Quest choice')} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-rose-400">{choice.label} ×</button>)}</div><div className="grid gap-4 sm:grid-cols-2"><Field label="Quest"><select className={inputClass} value={questChoiceForm.quest_id || editingQuest || ''} onChange={(event) => setQuestChoiceForm((value) => ({ ...value, quest_id: event.target.value }))}><option value="">Choose quest…</option>{quests.map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}</select></Field><Field label="Stable choice id"><input className={inputClass} value={questChoiceForm.id} onChange={(event) => setQuestChoiceForm((value) => ({ ...value, id: event.target.value }))} /></Field><Field label="Label"><input className={inputClass} value={questChoiceForm.label} onChange={(event) => setQuestChoiceForm((value) => ({ ...value, label: event.target.value }))} /></Field><Field label="Follow-up quest"><select className={inputClass} value={questChoiceForm.next_quest_id} onChange={(event) => setQuestChoiceForm((value) => ({ ...value, next_quest_id: event.target.value }))}><option value="">None</option>{quests.map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}</select></Field></div><Field label="Description"><input className={inputClass} value={questChoiceForm.description} onChange={(event) => setQuestChoiceForm((value) => ({ ...value, description: event.target.value }))} /></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Gold reward"><input type="number" className={inputClass} value={questChoiceForm.gold_reward} onChange={(event) => setQuestChoiceForm((value) => ({ ...value, gold_reward: event.target.value }))} /></Field><Field label="Reputation faction"><select className={inputClass} value={questChoiceForm.reputation_faction_id} onChange={(event) => setQuestChoiceForm((value) => ({ ...value, reputation_faction_id: event.target.value }))}><option value="">None</option>{factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}</select></Field><Field label="Reputation reward"><input type="number" className={inputClass} value={questChoiceForm.reputation_reward} onChange={(event) => setQuestChoiceForm((value) => ({ ...value, reputation_reward: event.target.value }))} /></Field></div><div className="flex justify-end"><button type="button" disabled={busy} onClick={saveQuestChoice} className={buttonClass}>Add choice</button></div></div>
                    </div>
                </div>
            )}

            {activeTab === 'origins' && (
                <div className="space-y-6 p-4 sm:p-6">
                    <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-4 text-xs leading-5 text-slate-400">Define any number of races, classes, and backgrounds. Players may choose one per category while creating a level-one character with <span className="text-cyan-200">create Name | race-id | class-id | background-id</span>. Grants are applied atomically by the server.</div>
                    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
                        <div className="space-y-2">{characterOptions.map((option) => <button key={option.id} type="button" onClick={() => { setEditingCharacterOption(option.id); setCharacterOptionForm({ ...emptyCharacterOption(), ...option, starting_room_id: option.starting_room_id || '' }); setCharacterGrantForm({ ...emptyCharacterGrant(), option_id: option.id }); }} className={`w-full rounded-xl border p-4 text-left ${editingCharacterOption === option.id ? 'border-cyan-300 bg-cyan-500/15' : 'border-slate-700 bg-slate-950/40'}`}><span className="block text-sm text-slate-100">{option.icon} {option.name}</span><span className="mt-1 block text-xs text-slate-500">{option.option_kind} · {option.id} · {characterGrants.filter((grant) => grant.option_id === option.id).length} grants</span></button>)}</div>
                        <div className="space-y-5 rounded-xl border border-slate-700 bg-slate-950/35 p-4 sm:p-5"><div className="flex justify-between gap-3"><h3 className="text-sm uppercase tracking-[0.22em] text-cyan-200">{editingCharacterOption ? 'Edit character option' : 'New character option'}</h3>{editingCharacterOption && <button type="button" onClick={() => { setEditingCharacterOption(null); setCharacterOptionForm(emptyCharacterOption()); setCharacterGrantForm(emptyCharacterGrant()); }} className="text-xs text-slate-400">New</button>}</div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Kind"><select className={inputClass} value={characterOptionForm.option_kind} onChange={(event) => setCharacterOptionForm((value) => ({ ...value, option_kind: event.target.value }))}><option value="race">Race</option><option value="class">Class</option><option value="background">Background</option></select></Field><Field label="Icon"><input className={inputClass} value={characterOptionForm.icon} onChange={(event) => setCharacterOptionForm((value) => ({ ...value, icon: event.target.value }))} /></Field><Field label="Name"><input className={inputClass} value={characterOptionForm.name} onChange={(event) => setCharacterOptionForm((value) => ({ ...value, name: event.target.value }))} /></Field><Field label="Stable id"><input disabled={Boolean(editingCharacterOption)} className={inputClass} value={characterOptionForm.id} onChange={(event) => setCharacterOptionForm((value) => ({ ...value, id: event.target.value }))} /></Field></div><Field label="Description"><textarea className={`${inputClass} min-h-20`} value={characterOptionForm.description} onChange={(event) => setCharacterOptionForm((value) => ({ ...value, description: event.target.value }))} /></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Starting room override"><select className={inputClass} value={characterOptionForm.starting_room_id} onChange={(event) => setCharacterOptionForm((value) => ({ ...value, starting_room_id: event.target.value }))}><option value="">World spawn policy</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></Field><Field label="Starting gold"><input type="number" min="0" className={inputClass} value={characterOptionForm.starting_gold} onChange={(event) => setCharacterOptionForm((value) => ({ ...value, starting_gold: event.target.value }))} /></Field><Field label="Display order"><input type="number" min="0" className={inputClass} value={characterOptionForm.sort_order} onChange={(event) => setCharacterOptionForm((value) => ({ ...value, sort_order: event.target.value }))} /></Field></div><Check label="Available during character creation" checked={characterOptionForm.active} onChange={(active) => setCharacterOptionForm((value) => ({ ...value, active }))} /><div className="flex justify-end gap-3">{editingCharacterOption && <button type="button" disabled={busy} onClick={() => remove('character_option_definitions', editingCharacterOption, 'Character option').then(() => { setEditingCharacterOption(null); setCharacterOptionForm(emptyCharacterOption()); })} className="rounded-md border border-rose-400/40 px-4 py-2 text-xs text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveCharacterOption} className={buttonClass}>Save option</button></div></div>
                    </div>
                    <div className="grid gap-6 xl:grid-cols-[1fr_420px]"><div className="rounded-xl border border-slate-700 bg-slate-950/35 p-4 sm:p-5"><h3 className="text-sm uppercase tracking-[0.22em] text-cyan-200">Structured grants</h3><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{characterGrants.filter((grant) => !editingCharacterOption || grant.option_id === editingCharacterOption).map((grant) => <button key={grant.id} type="button" onClick={() => remove('character_option_grants', grant.id, 'Option grant')} className="rounded-lg border border-slate-800 p-3 text-left text-xs text-slate-300 hover:border-rose-400">{grant.grant_kind}: {grant.reference_id} · {grant.amount >= 0 ? '+' : ''}{grant.amount} ×</button>)}</div></div><div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/35 p-4 sm:p-5"><Field label="Option"><select className={inputClass} value={characterGrantForm.option_id || editingCharacterOption || ''} onChange={(event) => setCharacterGrantForm((value) => ({ ...value, option_id: event.target.value }))}><option value="">Choose option…</option>{characterOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Grant kind"><select className={inputClass} value={characterGrantForm.grant_kind} onChange={(event) => setCharacterGrantForm((value) => ({ ...value, grant_kind: event.target.value, reference_id: '' }))}><option value="stat">Stat modifier</option><option value="item">Starting item</option><option value="ability">Ability grant</option></select></Field><Field label="Stable grant id"><input className={inputClass} value={characterGrantForm.id} onChange={(event) => setCharacterGrantForm((value) => ({ ...value, id: event.target.value }))} /></Field></div><Field label="Reference"><select className={inputClass} value={characterGrantForm.reference_id} onChange={(event) => setCharacterGrantForm((value) => ({ ...value, reference_id: event.target.value }))}><option value="">Choose…</option>{(characterGrantForm.grant_kind === 'stat' ? stats : characterGrantForm.grant_kind === 'ability' ? abilities : definitions).map((row) => <option key={row.id} value={row.id}>{row.icon || ''} {row.name}</option>)}</select></Field><div className="grid grid-cols-2 gap-4"><Field label="Amount"><input type="number" className={inputClass} value={characterGrantForm.amount} onChange={(event) => setCharacterGrantForm((value) => ({ ...value, amount: event.target.value }))} /></Field><Field label="Equip slot (item only)"><select className={inputClass} value={characterGrantForm.equipped_slot} onChange={(event) => setCharacterGrantForm((value) => ({ ...value, equipped_slot: event.target.value }))}><option value="">Inventory</option>{equipmentSlots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}</select></Field></div><button type="button" disabled={busy} onClick={saveCharacterGrant} className={buttonClass}>Add grant</button></div></div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/35 p-4"><h3 className="text-sm uppercase tracking-[0.22em] text-slate-200">Live character selections</h3><div className="mt-3 flex flex-wrap gap-2">{actorCharacterOptions.map((row) => <span key={row.id} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400">{actorsById.get(row.actor_id)?.name || row.actor_id}: {characterOptions.find((option) => option.id === row.option_id)?.name || row.option_id}</span>)}</div></div>
                </div>
            )}

            {activeTab === 'economy' && (
                <div className="space-y-6 p-4 sm:p-6">
                    <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.04] p-4 text-xs leading-5 text-slate-400">Currencies, shops, banking, direct player transfers, and crafting are server-authoritative. Players use <span className="text-emerald-200">shop / buy / sell / bank / give / pay / recipes / craft</span>.</div>
                    <div className="grid gap-6 xl:grid-cols-3">
                        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/35 p-4"><h3 className="text-sm uppercase tracking-[0.22em] text-emerald-200">Currencies</h3><div className="flex flex-wrap gap-2"><span className="rounded-full border border-amber-400/30 px-3 py-1 text-xs text-amber-200">gold · built in</span>{currencies.map((currency) => <button key={currency.id} type="button" onClick={() => { setEditingCurrency(currency.id); setCurrencyForm({ ...emptyCurrency(), ...currency }); }} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{currency.icon} {currency.name}</button>)}</div><div className="grid grid-cols-[70px_1fr] gap-3"><Field label="Icon"><input className={inputClass} value={currencyForm.icon} onChange={(event) => setCurrencyForm((value) => ({ ...value, icon: event.target.value }))} /></Field><Field label="Name"><input className={inputClass} value={currencyForm.name} onChange={(event) => setCurrencyForm((value) => ({ ...value, name: event.target.value }))} /></Field></div><Field label="Stable id"><input disabled={Boolean(editingCurrency)} className={inputClass} value={currencyForm.id} onChange={(event) => setCurrencyForm((value) => ({ ...value, id: event.target.value }))} /></Field><Field label="Maximum balance"><input type="number" min="0" className={inputClass} value={currencyForm.maximum_balance} onChange={(event) => setCurrencyForm((value) => ({ ...value, maximum_balance: event.target.value }))} /></Field><Check label="Players may transfer this currency" checked={currencyForm.tradeable} onChange={(tradeable) => setCurrencyForm((value) => ({ ...value, tradeable }))} /><div className="flex justify-end gap-2">{editingCurrency && <button type="button" onClick={() => remove('currency_definitions', editingCurrency, 'Currency')} className="text-xs text-rose-300">Delete</button>}<button type="button" onClick={saveCurrency} className={buttonClass}>Save</button></div></div>
                        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/35 p-4"><h3 className="text-sm uppercase tracking-[0.22em] text-emerald-200">NPC vendors</h3><div className="flex flex-wrap gap-2">{vendors.map((vendor) => <button key={vendor.id} type="button" onClick={() => { setEditingVendor(vendor.id); setVendorForm({ ...emptyVendor(), ...vendor, required_faction_id: vendor.required_faction_id || '' }); setVendorStockForm({ ...emptyVendorStock(), vendor_id: vendor.id }); }} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{vendor.name}</button>)}</div><div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><input className={inputClass} value={vendorForm.name} onChange={(event) => setVendorForm((value) => ({ ...value, name: event.target.value }))} /></Field><Field label="Stable id"><input disabled={Boolean(editingVendor)} className={inputClass} value={vendorForm.id} onChange={(event) => setVendorForm((value) => ({ ...value, id: event.target.value }))} /></Field><Field label="NPC"><select className={inputClass} value={vendorForm.npc_id} onChange={(event) => setVendorForm((value) => ({ ...value, npc_id: event.target.value }))}><option value="">Choose NPC…</option>{npcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}</select></Field><Field label="Currency"><select className={inputClass} value={vendorForm.currency_id} onChange={(event) => setVendorForm((value) => ({ ...value, currency_id: event.target.value }))}><option value="gold">Gold</option>{currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name}</option>)}</select></Field><Field label="Player sell value %"><input type="number" min="0" className={inputClass} value={vendorForm.sell_price_percent} onChange={(event) => setVendorForm((value) => ({ ...value, sell_price_percent: event.target.value }))} /></Field><Field label="Required faction"><select className={inputClass} value={vendorForm.required_faction_id} onChange={(event) => setVendorForm((value) => ({ ...value, required_faction_id: event.target.value }))}><option value="">None</option>{factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}</select></Field></div><Check label="Vendor buys from players" checked={vendorForm.buys_from_players} onChange={(buys_from_players) => setVendorForm((value) => ({ ...value, buys_from_players }))} /><button type="button" onClick={saveVendor} className={buttonClass}>Save vendor</button><div className="border-t border-slate-800 pt-3"><div className="flex flex-wrap gap-2">{vendorStocks.filter((stock) => stock.vendor_id === editingVendor).map((stock) => <button key={stock.id} type="button" onClick={() => remove('vendor_stocks', stock.id, 'Stock')} className="rounded-full border border-slate-700 px-2 py-1 text-[0.65rem] text-slate-400">{definitionsById.get(stock.definition_id)?.name || stock.definition_id} · {stock.price} ×</button>)}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Stock id"><input className={inputClass} value={vendorStockForm.id} onChange={(event) => setVendorStockForm((value) => ({ ...value, id: event.target.value }))} /></Field><Field label="Item"><select className={inputClass} value={vendorStockForm.definition_id} onChange={(event) => setVendorStockForm((value) => ({ ...value, definition_id: event.target.value }))}><option value="">Choose…</option>{definitions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Price"><input type="number" min="0" className={inputClass} value={vendorStockForm.price} onChange={(event) => setVendorStockForm((value) => ({ ...value, price: event.target.value }))} /></Field><Field label="Stock (-1 unlimited)"><input type="number" min="-1" className={inputClass} value={vendorStockForm.stock} onChange={(event) => setVendorStockForm((value) => ({ ...value, stock: event.target.value }))} /></Field></div><button type="button" onClick={saveVendorStock} className={`${buttonClass} mt-3`}>Add stock</button></div></div>
                        <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/35 p-4"><h3 className="text-sm uppercase tracking-[0.22em] text-emerald-200">Crafting recipes</h3><div className="flex flex-wrap gap-2">{recipes.map((recipe) => <button key={recipe.id} type="button" onClick={() => { setEditingRecipe(recipe.id); setRecipeForm({ ...emptyRecipe(), ...recipe, station_tag: recipe.station_tag || '', currency_id: recipe.currency_id || '' }); setIngredientForm({ ...emptyIngredient(), recipe_id: recipe.id }); }} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{recipe.name}</button>)}</div><div className="grid gap-3 sm:grid-cols-2"><Field label="Name"><input className={inputClass} value={recipeForm.name} onChange={(event) => setRecipeForm((value) => ({ ...value, name: event.target.value }))} /></Field><Field label="Stable id"><input disabled={Boolean(editingRecipe)} className={inputClass} value={recipeForm.id} onChange={(event) => setRecipeForm((value) => ({ ...value, id: event.target.value }))} /></Field><Field label="Output"><select className={inputClass} value={recipeForm.output_definition_id} onChange={(event) => setRecipeForm((value) => ({ ...value, output_definition_id: event.target.value }))}><option value="">Choose…</option>{definitions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Output quantity"><input type="number" min="1" className={inputClass} value={recipeForm.output_quantity} onChange={(event) => setRecipeForm((value) => ({ ...value, output_quantity: event.target.value }))} /></Field><Field label="Station object tag"><input className={inputClass} value={recipeForm.station_tag} onChange={(event) => setRecipeForm((value) => ({ ...value, station_tag: event.target.value }))} placeholder="forge (blank = anywhere)" /></Field><Field label="Required level"><input type="number" min="1" className={inputClass} value={recipeForm.required_level} onChange={(event) => setRecipeForm((value) => ({ ...value, required_level: event.target.value }))} /></Field></div><Field label="Description"><input className={inputClass} value={recipeForm.description} onChange={(event) => setRecipeForm((value) => ({ ...value, description: event.target.value }))} /></Field><button type="button" onClick={saveRecipe} className={buttonClass}>Save recipe</button><div className="border-t border-slate-800 pt-3"><div className="flex flex-wrap gap-2">{ingredients.filter((row) => row.recipe_id === editingRecipe).map((row) => <button key={row.id} type="button" onClick={() => remove('crafting_ingredients', row.id, 'Ingredient')} className="rounded-full border border-slate-700 px-2 py-1 text-[0.65rem] text-slate-400">{definitionsById.get(row.definition_id)?.name || row.definition_id} ×{row.quantity} ×</button>)}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Ingredient id"><input className={inputClass} value={ingredientForm.id} onChange={(event) => setIngredientForm((value) => ({ ...value, id: event.target.value }))} /></Field><Field label="Item"><select className={inputClass} value={ingredientForm.definition_id} onChange={(event) => setIngredientForm((value) => ({ ...value, definition_id: event.target.value }))}><option value="">Choose…</option>{definitions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Quantity"><input type="number" min="1" className={inputClass} value={ingredientForm.quantity} onChange={(event) => setIngredientForm((value) => ({ ...value, quantity: event.target.value }))} /></Field><div className="flex items-end"><Check label="Consumed when crafted" checked={ingredientForm.consumed} onChange={(consumed) => setIngredientForm((value) => ({ ...value, consumed }))} /></div></div><button type="button" onClick={saveIngredient} className={`${buttonClass} mt-3`}>Add ingredient</button></div></div>
                    </div>
                </div>
            )}

            {activeTab === 'roles' && (
                <div className="space-y-6 p-4 sm:p-6"><div className="rounded-xl border border-purple-400/20 bg-purple-500/[0.04] p-4 text-xs leading-5 text-slate-400">The first saved-world administrator remains an unrestricted owner unless assigned a role. Assigned profiles receive only the checked permission keys, enforced inside SpacetimeDB.</div><div className="grid gap-6 xl:grid-cols-[1fr_420px]"><div className="space-y-3">{adminRoles.map((role) => <button key={role.id} type="button" onClick={() => { setEditingRole(role.id); setRoleForm({ ...emptyRole(), ...role, permissions: Array.isArray(role.permissions) ? role.permissions : [] }); }} className={`w-full rounded-xl border p-4 text-left ${editingRole === role.id ? 'border-purple-300 bg-purple-500/15' : 'border-slate-700 bg-slate-950/35'}`}><span className="text-sm text-slate-100">{role.name}</span><span className="mt-1 block text-xs text-slate-500">{role.permissions?.join?.(', ') || 'No permissions'}</span></button>)}</div><div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950/35 p-4"><Field label="Role name"><input className={inputClass} value={roleForm.name} onChange={(event) => setRoleForm((value) => ({ ...value, name: event.target.value }))} /></Field><Field label="Stable id"><input disabled={Boolean(editingRole)} className={inputClass} value={roleForm.id} onChange={(event) => setRoleForm((value) => ({ ...value, id: event.target.value }))} /></Field><Field label="Description"><textarea className={`${inputClass} min-h-20`} value={roleForm.description} onChange={(event) => setRoleForm((value) => ({ ...value, description: event.target.value }))} /></Field><div className="grid gap-2">{[['world.manage','World, rooms, NPCs, objects'],['systems.manage','Stats, abilities, combat, origins'],['quests.manage','Quests and rewards'],['economy.manage','Currencies, vendors, crafting'],['lifecycle.manage','Spawn and death rules'],['players.moderate','Players and runtime state'],['roles.manage','Admin roles and assignments'],['*','Full access']].map(([permission,label]) => <Check key={permission} label={label} checked={roleForm.permissions.includes(permission)} onChange={(checked) => setRoleForm((value) => ({ ...value, permissions: checked ? [...new Set([...value.permissions, permission])] : value.permissions.filter((item) => item !== permission) }))} />)}</div><div className="flex justify-end gap-3">{editingRole && <button type="button" onClick={() => remove('admin_role_definitions', editingRole, 'Admin role')} className="text-xs text-rose-300">Delete</button>}<button type="button" onClick={saveRole} className={buttonClass}>Save role</button></div></div></div><div className="rounded-xl border border-slate-700 bg-slate-950/35 p-4"><h3 className="text-sm uppercase tracking-[0.22em] text-purple-200">Assignments</h3><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Field label="Saved-world profile"><select className={inputClass} value={roleAssignmentForm.profile_id} onChange={(event) => setRoleAssignmentForm((value) => ({ ...value, profile_id: event.target.value }))}><option value="">Choose profile…</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name || profile.handle || profile.id}</option>)}</select></Field><Field label="Role"><select className={inputClass} value={roleAssignmentForm.role_id} onChange={(event) => setRoleAssignmentForm((value) => ({ ...value, role_id: event.target.value }))}><option value="">Choose role…</option>{adminRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field><div className="flex items-end"><button type="button" onClick={saveRoleAssignment} className={buttonClass}>Assign</button></div></div><div className="mt-3 flex flex-wrap gap-2">{adminAssignments.map((row) => <button key={row.profile_id} type="button" onClick={() => run(() => spacetime.from('admin_role_assignments').delete().eq('profile_id', row.profile_id), 'Role assignment removed.')} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-rose-400">{profiles.find((profile) => profile.id === row.profile_id)?.name || row.profile_id} · {adminRoles.find((role) => role.id === row.role_id)?.name || row.role_id} ×</button>)}</div></div></div>
            )}

            {activeTab === 'lifecycle' && (
                <div className="space-y-6 p-4 sm:p-6">
                    <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-4 text-xs leading-5 text-slate-400">
                        Spawn points are named world locations such as graveyards, cairns, temples, or portals. Nearest respawn follows the authored room-and-exit graph in both directions; screen coordinates do not affect distance.
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
                        <div className="space-y-3">
                            {spawnPoints.length === 0 && <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-600">No spawn points authored yet.</p>}
                            {spawnPoints.map((point) => (
                                <button key={point.id} type="button" onClick={() => { setEditingSpawnPoint(point.id); setSpawnPointForm({ ...emptySpawnPoint(), ...point }); }} className={`grid w-full gap-2 rounded-xl border p-4 text-left sm:grid-cols-[1fr_auto] ${editingSpawnPoint === point.id ? 'border-cyan-300 bg-cyan-500/15' : 'border-slate-700/70 bg-slate-950/40 hover:border-cyan-400/40'}`}>
                                    <span><span className="block text-sm text-slate-100">{point.name}</span><span className="mt-1 block text-xs text-slate-500">{roomsById.get(point.room_id)?.name || point.room_id} · priority {point.priority}</span></span>
                                    <span className="flex flex-wrap gap-2 text-[0.6rem] uppercase tracking-wider sm:justify-end">{point.active ? <span className="text-emerald-300">Active</span> : <span className="text-slate-600">Disabled</span>}{point.allows_initial_spawn && <span className="text-cyan-300">Initial</span>}{point.allows_respawn && <span className="text-purple-300">Respawn</span>}</span>
                                </button>
                            ))}
                        </div>
                        <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5">
                            <div className="flex items-center justify-between"><div><h3 className="text-sm uppercase tracking-[0.22em] text-cyan-200">{editingSpawnPoint ? 'Edit spawn point' : 'New spawn point'}</h3><p className="mt-1 text-xs text-slate-500">One room can contain more than one differently named point.</p></div>{editingSpawnPoint && <button type="button" onClick={() => { setEditingSpawnPoint(null); setSpawnPointForm(emptySpawnPoint()); }} className="text-xs text-slate-400">New</button>}</div>
                            <div className="grid gap-4 sm:grid-cols-2"><Field label="Name"><input className={inputClass} value={spawnPointForm.name} onChange={(event) => setSpawnPointForm((value) => ({ ...value, name: event.target.value }))} placeholder="Old North Cairn" /></Field><Field label="Stable id"><input disabled={Boolean(editingSpawnPoint)} className={inputClass} value={spawnPointForm.id} onChange={(event) => setSpawnPointForm((value) => ({ ...value, id: event.target.value }))} placeholder="old-north-cairn" /></Field></div>
                            <Field label="Room"><select className={inputClass} value={spawnPointForm.room_id} onChange={(event) => setSpawnPointForm((value) => ({ ...value, room_id: event.target.value }))}><option value="">Choose room…</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></Field>
                            <Field label="Description"><textarea className={`${inputClass} min-h-20`} value={spawnPointForm.description} onChange={(event) => setSpawnPointForm((value) => ({ ...value, description: event.target.value }))} /></Field>
                            <Field label="Priority"><input type="number" className={inputClass} value={spawnPointForm.priority} onChange={(event) => setSpawnPointForm((value) => ({ ...value, priority: event.target.value }))} /></Field>
                            <div className="grid gap-4 sm:grid-cols-2"><Field label="Required race/class/background"><select className={inputClass} value={spawnPointForm.required_option_id} onChange={(event) => setSpawnPointForm((value) => ({ ...value, required_option_id: event.target.value }))}><option value="">Any character</option>{characterOptions.map((option) => <option key={option.id} value={option.id}>{option.option_kind}: {option.name}</option>)}</select></Field><Field label="Death region override"><select className={inputClass} value={spawnPointForm.death_region_id} onChange={(event) => setSpawnPointForm((value) => ({ ...value, death_region_id: event.target.value }))}><option value="">Any death region</option>{[...new Set(rooms.map((room) => room.region_name).filter(Boolean))].map((region) => <option key={region} value={region}>{region}</option>)}</select></Field><Field label="Required faction"><select className={inputClass} value={spawnPointForm.required_faction_id} onChange={(event) => setSpawnPointForm((value) => ({ ...value, required_faction_id: event.target.value }))}><option value="">Any standing</option>{factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}</select></Field><Field label="Required reputation"><input type="number" className={inputClass} value={spawnPointForm.required_reputation} onChange={(event) => setSpawnPointForm((value) => ({ ...value, required_reputation: event.target.value }))} /></Field></div>
                            <div className="grid gap-2 sm:grid-cols-2"><Check label="Initial character spawn" checked={spawnPointForm.allows_initial_spawn} onChange={(allows_initial_spawn) => setSpawnPointForm((value) => ({ ...value, allows_initial_spawn }))} /><Check label="Death respawn" checked={spawnPointForm.allows_respawn} onChange={(allows_respawn) => setSpawnPointForm((value) => ({ ...value, allows_respawn }))} /><Check label="Active" checked={spawnPointForm.active} onChange={(active) => setSpawnPointForm((value) => ({ ...value, active }))} /></div>
                            <div className="flex justify-end gap-3">{editingSpawnPoint && <button type="button" disabled={busy} onClick={() => remove('spawn_points', editingSpawnPoint, 'Spawn point').then(() => { setEditingSpawnPoint(null); setSpawnPointForm(emptySpawnPoint()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveSpawnPoint} className={buttonClass}>Save point</button></div>
                        </div>
                    </div>

                    <div className="space-y-5 rounded-xl border border-purple-400/20 bg-slate-950/35 p-4 sm:p-5">
                        <div><h3 className="text-sm uppercase tracking-[0.22em] text-purple-200">World lifecycle rules</h3><p className="mt-1 text-xs leading-5 text-slate-500">These rules apply server-side to every character. A saved world remains available even when a character is permanently lost.</p></div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <Field label="Initial spawn rule"><select className={inputClass} value={lifecycleForm.initial_spawn_policy} onChange={(event) => setLifecycleForm((value) => ({ ...value, initial_spawn_policy: event.target.value }))}><option value="fixed">Specific point</option><option value="highest_priority">Highest priority</option><option value="random">Random eligible point</option></select></Field>
                            <Field label="Specific initial point"><select disabled={lifecycleForm.initial_spawn_policy !== 'fixed'} className={inputClass} value={lifecycleForm.fixed_initial_spawn_point_id} onChange={(event) => setLifecycleForm((value) => ({ ...value, fixed_initial_spawn_point_id: event.target.value }))}><option value="">Highest-priority fallback</option>{spawnPoints.filter((point) => point.active && point.allows_initial_spawn).map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}</select></Field>
                            <Field label="Respawn rule"><select className={inputClass} value={lifecycleForm.respawn_policy} onChange={(event) => setLifecycleForm((value) => ({ ...value, respawn_policy: event.target.value }))}><option value="nearest">Nearest by room graph</option><option value="region_nearest">Nearest in same region</option><option value="fixed">Specific point</option><option value="highest_priority">Highest priority</option><option value="random">Random eligible point</option></select></Field>
                            <Field label="Specific respawn point"><select disabled={lifecycleForm.respawn_policy !== 'fixed'} className={inputClass} value={lifecycleForm.fixed_respawn_point_id} onChange={(event) => setLifecycleForm((value) => ({ ...value, fixed_respawn_point_id: event.target.value }))}><option value="">Highest-priority fallback</option>{spawnPoints.filter((point) => point.active && point.allows_respawn).map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}</select></Field>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <Field label="Death mode"><select className={inputClass} value={lifecycleForm.death_mode} onChange={(event) => setLifecycleForm((value) => ({ ...value, death_mode: event.target.value }))}><option value="respawn">Respawn</option><option value="hardcore">Hardcore permanent death</option></select></Field>
                            <Field label="Respawn delay (seconds)"><input type="number" min="0" className={inputClass} value={lifecycleForm.respawn_delay_seconds} onChange={(event) => setLifecycleForm((value) => ({ ...value, respawn_delay_seconds: event.target.value }))} /></Field>
                            <Field label="Inventory consequence"><select className={inputClass} value={lifecycleForm.inventory_loss_mode} onChange={(event) => setLifecycleForm((value) => ({ ...value, inventory_loss_mode: event.target.value }))}><option value="keep">Keep everything</option><option value="drop_inventory">Drop inventory</option><option value="drop_all">Drop inventory + equipment</option><option value="destroy_inventory">Destroy inventory</option><option value="destroy_all">Destroy inventory + equipment</option><option value="drop_percentage">Drop a percentage</option><option value="destroy_percentage">Destroy a percentage</option></select></Field>
                            <Field label="Inventory loss chance %"><input type="number" min="0" max="100" disabled={!['drop_percentage', 'destroy_percentage'].includes(lifecycleForm.inventory_loss_mode)} className={inputClass} value={lifecycleForm.inventory_loss_percent} onChange={(event) => setLifecycleForm((value) => ({ ...value, inventory_loss_percent: event.target.value }))} /></Field>
                            <Field label="Gold lost %"><input type="number" min="0" max="100" className={inputClass} value={lifecycleForm.gold_loss_percent} onChange={(event) => setLifecycleForm((value) => ({ ...value, gold_loss_percent: event.target.value }))} /></Field>
                            <Field label="Current-level XP lost %"><input type="number" min="0" max="100" className={inputClass} value={lifecycleForm.experience_loss_percent} onChange={(event) => setLifecycleForm((value) => ({ ...value, experience_loss_percent: event.target.value }))} /></Field>
                            <Field label="Health restored %"><input type="number" min="1" max="100" className={inputClass} value={lifecycleForm.respawn_health_percent} onChange={(event) => setLifecycleForm((value) => ({ ...value, respawn_health_percent: event.target.value }))} /></Field>
                            <Field label="Mana / energy / focus %"><input type="number" min="0" max="100" className={inputClass} value={lifecycleForm.respawn_resource_percent} onChange={(event) => setLifecycleForm((value) => ({ ...value, respawn_resource_percent: event.target.value }))} /></Field>
                            <Field label="Spawn protection (seconds)"><input type="number" min="0" className={inputClass} value={lifecycleForm.spawn_protection_seconds} onChange={(event) => setLifecycleForm((value) => ({ ...value, spawn_protection_seconds: event.target.value }))} /></Field>
                            <Field label="Maximum lives (0 = unlimited)"><input type="number" min="0" className={inputClass} value={lifecycleForm.maximum_lives} onChange={(event) => setLifecycleForm((value) => ({ ...value, maximum_lives: event.target.value }))} /></Field>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><Check label="Include equipped items in percentage loss" checked={lifecycleForm.include_equipped_in_loss} onChange={(include_equipped_in_loss) => setLifecycleForm((value) => ({ ...value, include_equipped_in_loss }))} /><Check label="Reset active quests on death" checked={lifecycleForm.reset_quests_on_death} onChange={(reset_quests_on_death) => setLifecycleForm((value) => ({ ...value, reset_quests_on_death }))} /><Check label="Clear wanted status on respawn" checked={lifecycleForm.clear_wanted_on_respawn} onChange={(clear_wanted_on_respawn) => setLifecycleForm((value) => ({ ...value, clear_wanted_on_respawn }))} /><Check label="Create a lootable corpse container" checked={lifecycleForm.create_lootable_corpse} onChange={(create_lootable_corpse) => setLifecycleForm((value) => ({ ...value, create_lootable_corpse }))} /><Check label="Allow ability-based revival" checked={lifecycleForm.allow_ability_revive !== false} onChange={(allow_ability_revive) => setLifecycleForm((value) => ({ ...value, allow_ability_revive }))} /></div>
                        {lifecycleForm.death_mode === 'hardcore' && <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs leading-5 text-rose-200">Hardcore death deletes the character and all runtime state still attached to it. Dropped items remain in the death room; everything still owned is destroyed. The player’s saved world/account and death history remain so they can create another character.</p>}
                        <p className="text-xs leading-5 text-slate-500">Object definitions tagged <span className="text-slate-300">soulbound</span> or <span className="text-slate-300">keep-on-death</span> are exempt from ordinary loss rules. Protection ends early if the recovered character attacks.</p>
                        <div className="flex justify-end"><button type="button" disabled={busy} onClick={saveLifecycle} className={buttonClass}>Save lifecycle rules</button></div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <div className="rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><h3 className="text-sm uppercase tracking-[0.22em] text-slate-200">Current life states</h3><div className="mt-4 space-y-2">{lifeStates.filter((state) => actorsById.has(state.actor_id) || state.state === 'dead').map((state) => <div key={state.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-black/20 px-3 py-2 text-xs"><span className="text-slate-300">{actorsById.get(state.actor_id)?.name || state.actor_id}</span><span className={state.state === 'dead' ? 'uppercase text-rose-300' : 'uppercase text-emerald-300'}>{state.state} · {state.death_count} deaths{Number(lifecycleForm.maximum_lives) > 0 ? ` · ${state.lives_remaining} lives` : ''}</span></div>)}</div></div>
                        <div className="rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm uppercase tracking-[0.22em] text-slate-200">Death history</h3><span className="text-xs text-slate-600">{filteredDeathRecords.length} shown · {deathRecords.length} total</span></div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_130px_auto_auto]"><input className={inputClass} value={deathFilter.query} onChange={(event) => setDeathFilter((value) => ({ ...value, query: event.target.value }))} placeholder="Filter actor, room, or killer" /><select className={inputClass} value={deathFilter.mode} onChange={(event) => setDeathFilter((value) => ({ ...value, mode: event.target.value }))}><option value="all">All modes</option><option value="respawn">Respawn</option><option value="hardcore">Hardcore</option></select><button type="button" disabled={filteredDeathRecords.length === 0} onClick={exportDeathRecords} className="rounded-md border border-slate-600 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Export CSV</button><button type="button" disabled={busy || filteredDeathRecords.length === 0} onClick={pruneFilteredDeaths} className="rounded-md border border-rose-400/40 px-3 py-2 text-xs text-rose-200 disabled:opacity-40">Prune shown</button></div><div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{filteredDeathRecords.slice(0, 100).map((record) => <div key={record.id} className="rounded-lg border border-slate-800 bg-black/20 p-3 text-xs"><div className="flex justify-between gap-3"><span className="text-slate-200">{record.actor_name}</span><span className={record.death_mode === 'hardcore' ? 'uppercase text-rose-300' : 'uppercase text-purple-300'}>{record.death_mode}</span></div><p className="mt-1 text-slate-500">{roomsById.get(record.death_room_id)?.name || record.death_room_id}{record.defeated_by ? ` · defeated by ${record.defeated_by}` : ''} · dropped {record.item_stacks_dropped}, destroyed {record.item_stacks_destroyed}, lost {record.gold_lost} gold / {record.experience_lost} XP</p><p className="mt-1 text-[0.65rem] text-slate-600">{new Date(record.died_at).toLocaleString()}</p></div>)}{filteredDeathRecords.length === 0 && <p className="rounded-lg border border-dashed border-slate-800 p-5 text-center text-xs text-slate-600">No death records match this filter.</p>}</div></div>
                    </div>
                </div>
            )}

            {activeTab === 'progression' && (
                <div className="space-y-6 p-4 sm:p-6">
                    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
                        <div className="space-y-5 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div><h3 className="text-sm uppercase tracking-[0.24em] text-amber-200">World progression curve</h3><p className="mt-1 text-xs leading-5 text-slate-500">XP is progress within the current level. Each next threshold grows by the configured percentage, so changing the formula does not rewrite accumulated character history.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Maximum level"><input type="number" min="1" className={inputClass} value={progressionForm.max_level} onChange={(event) => setProgressionForm((value) => ({ ...value, max_level: event.target.value }))} /></Field><Field label="XP for level 2"><input type="number" min="1" className={inputClass} value={progressionForm.base_xp} onChange={(event) => setProgressionForm((value) => ({ ...value, base_xp: event.target.value }))} /></Field><Field label="Threshold growth %"><input type="number" min="0" className={inputClass} value={progressionForm.growth_percent} onChange={(event) => setProgressionForm((value) => ({ ...value, growth_percent: event.target.value }))} /></Field><Field label="Base inventory slots"><input type="number" min="0" className={inputClass} value={progressionForm.base_inventory_slots} onChange={(event) => setProgressionForm((value) => ({ ...value, base_inventory_slots: event.target.value }))} /></Field><Field label="Slots gained / level"><input type="number" min="0" className={inputClass} value={progressionForm.inventory_slots_per_level} onChange={(event) => setProgressionForm((value) => ({ ...value, inventory_slots_per_level: event.target.value }))} /></Field><Field label="Stat points / level"><input type="number" min="0" className={inputClass} value={progressionForm.stat_points_per_level} onChange={(event) => setProgressionForm((value) => ({ ...value, stat_points_per_level: event.target.value }))} /></Field></div><div className="flex justify-end"><button type="button" disabled={busy} onClick={saveProgression} className={buttonClass}>Save progression rules</button></div></div>
                        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4 sm:p-5"><h3 className="text-xs uppercase tracking-[0.22em] text-amber-200">Curve preview</h3><div className="mt-3 space-y-2">{curvePreview.length === 0 && <p className="text-xs text-slate-500">Level cap is 1.</p>}{curvePreview.map((entry) => <div key={entry.level} className="flex items-center justify-between rounded-lg border border-slate-800 bg-black/20 px-3 py-2 text-xs"><span className="text-slate-400">Level {entry.level} → {entry.level + 1}</span><strong className="text-amber-100">{entry.required.toLocaleString()} XP</strong></div>)}</div></div>
                    </div>
                    <div className="rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div><h3 className="text-sm uppercase tracking-[0.22em] text-purple-200">Actor levels</h3><p className="mt-1 text-xs leading-5 text-slate-500">Runtime XP advances these automatically. Direct editing is useful for testing, moderation, and imported worlds.</p></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{actorProgressions.filter((row) => actorsById.has(row.actor_id)).map((row) => <div key={row.id} className="grid gap-3 rounded-xl border border-slate-800 bg-black/20 p-3 sm:grid-cols-[1fr_90px_110px_110px_auto] sm:items-end"><div><span className={labelClass}>Actor</span><p className="mt-2 truncate text-sm text-slate-100">{actorsById.get(row.actor_id)?.label || row.actor_id}</p></div><Field label="Level"><input type="number" min="1" className={inputClass} value={row.level} onChange={(event) => setActorProgressions((values) => values.map((value) => value.id === row.id ? { ...value, level: event.target.value } : value))} /></Field><Field label="Current XP"><input type="number" min="0" className={inputClass} value={row.experience} onChange={(event) => setActorProgressions((values) => values.map((value) => value.id === row.id ? { ...value, experience: event.target.value } : value))} /></Field><Field label="Stat points"><input type="number" min="0" className={inputClass} value={row.unspent_stat_points} onChange={(event) => setActorProgressions((values) => values.map((value) => value.id === row.id ? { ...value, unspent_stat_points: event.target.value } : value))} /></Field><button type="button" disabled={busy} onClick={() => saveActorProgression(row)} className={buttonClass}>Save</button></div>)}</div></div>
                </div>
            )}

            {activeTab === 'slots' && (
                <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_420px]">
                    <div><div className="mb-4 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-4 text-xs leading-5 text-slate-400">Each wearable primitive points to one slot id. Capacity controls multiplicity—use 2 for rings or trinkets and 1 for ordinary armor and weapons.</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{equipmentSlots.map((slot) => <button key={slot.id} type="button" aria-pressed={editingSlot === slot.id} onClick={() => { setEditingSlot(slot.id); setSlotForm({ ...emptySlot(), ...slot }); }} className={`rounded-xl border p-4 text-left ${editingSlot === slot.id ? 'border-cyan-300 bg-cyan-500/15' : 'border-slate-700/70 bg-slate-950/40 hover:border-cyan-400/40'}`}><span className="block text-sm text-slate-100">{slot.name}</span><span className="mt-1 block text-xs text-slate-500">{slot.id} · capacity {slot.capacity} · order {slot.sort_order}</span></button>)}</div></div>
                    <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.22em] text-cyan-200">{editingSlot ? 'Edit equipment slot' : 'New equipment slot'}</h3>{editingSlot && <button type="button" onClick={() => { setEditingSlot(null); setSlotForm(emptySlot()); }} className="text-xs text-slate-400">New</button>}</div><Field label="Display name"><input className={inputClass} value={slotForm.name} onChange={(event) => setSlotForm((value) => ({ ...value, name: event.target.value }))} placeholder="Finger" /></Field><Field label="Stable id"><input disabled={Boolean(editingSlot)} className={inputClass} value={slotForm.id} onChange={(event) => setSlotForm((value) => ({ ...value, id: event.target.value }))} placeholder="finger" /></Field><div className="grid grid-cols-2 gap-4"><Field label="Capacity"><input type="number" min="1" className={inputClass} value={slotForm.capacity} onChange={(event) => setSlotForm((value) => ({ ...value, capacity: event.target.value }))} /></Field><Field label="Display order"><input type="number" min="0" className={inputClass} value={slotForm.sort_order} onChange={(event) => setSlotForm((value) => ({ ...value, sort_order: event.target.value }))} /></Field></div><div className="flex justify-end gap-3">{editingSlot && <button type="button" disabled={busy} onClick={() => remove('equipment_slot_definitions', editingSlot, 'Equipment slot').then(() => { setEditingSlot(null); setSlotForm(emptySlot()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveSlot} className={buttonClass}>Save slot</button></div></div>
                </div>
            )}

            {activeTab === 'instances' && (
                <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[1fr_420px]">
                    <div className="overflow-x-auto rounded-xl border border-slate-700/70"><div className="grid min-w-[680px] grid-cols-[1.2fr_1fr_1fr_auto] gap-3 border-b border-slate-700 bg-slate-950/60 px-4 py-3 text-[0.62rem] uppercase tracking-[0.16em] text-slate-500"><span>Object</span><span>Location</span><span>State</span><span /></div><div className="max-h-[560px] min-w-[680px] overflow-y-auto">{instances.map((instance) => { const definition = definitionsById.get(instance.definition_id); return <button key={instance.id} type="button" aria-pressed={editingInstance === instance.id} onClick={() => { setEditingInstance(instance.id); setInstanceForm({ ...emptyInstance(), ...instance, state_json: JSON.stringify(jsonObject(instance.state_json), null, 2), equipped_slot: instance.equipped_slot || '' }); }} className={`grid w-full grid-cols-[1.2fr_1fr_1fr_auto] gap-3 border-b border-slate-800 px-4 py-3 text-left text-xs ${editingInstance === instance.id ? 'bg-purple-500/15' : 'hover:bg-slate-800/50'}`}><span className="text-slate-100">{definition?.icon} {definition?.name || instance.definition_id} {instance.quantity > 1 ? `×${instance.quantity}` : ''}</span><span className="text-slate-400">{instance.location_kind} · {locationLabel(instance)}</span><span className="text-slate-400">{instance.is_active ? 'active' : 'idle'}{instance.fuel_remaining > 0 ? ` · fuel ${instance.fuel_remaining}` : ''}</span><span className="text-purple-300">Edit</span></button>; })}</div></div>
                    <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.22em] text-purple-200">{editingInstance ? 'Edit instance' : 'Place object'}</h3>{editingInstance && <button type="button" onClick={() => { setEditingInstance(null); setInstanceForm(emptyInstance()); }} className="text-xs text-slate-400">New</button>}</div><Field label="Definition"><select className={inputClass} value={instanceForm.definition_id} onChange={(e) => setInstanceForm((value) => ({ ...value, definition_id: e.target.value }))}><option value="">Choose primitive…</option>{definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.icon} {definition.name}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Location type"><select className={inputClass} value={instanceForm.location_kind} onChange={(e) => setInstanceForm((value) => ({ ...value, location_kind: e.target.value, location_id: '' }))}><option value="room">Room</option><option value="inventory">Actor inventory</option><option value="equipped">Equipped by actor</option><option value="container">Inside container</option></select></Field><Field label="Location"><select className={inputClass} value={instanceForm.location_id} onChange={(e) => setInstanceForm((value) => ({ ...value, location_id: e.target.value }))}><option value="">Choose…</option>{validLocationTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></Field></div><div className="grid gap-4 sm:grid-cols-3"><Field label="Quantity"><input type="number" min="1" className={inputClass} value={instanceForm.quantity} onChange={(e) => setInstanceForm((value) => ({ ...value, quantity: e.target.value }))} /></Field><Field label="Durability"><input type="number" min="0" className={inputClass} value={instanceForm.durability} onChange={(e) => setInstanceForm((value) => ({ ...value, durability: e.target.value }))} /></Field><Field label="Fuel"><input type="number" min="0" className={inputClass} value={instanceForm.fuel_remaining} onChange={(e) => setInstanceForm((value) => ({ ...value, fuel_remaining: e.target.value }))} /></Field></div>{instanceForm.location_kind === 'equipped' && <Field label="Equipment slot"><select className={inputClass} value={instanceForm.equipped_slot} onChange={(e) => setInstanceForm((value) => ({ ...value, equipped_slot: e.target.value }))}><option value="">Use primitive default</option>{equipmentSlots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}</select></Field>}<Check label="Active / burning" checked={instanceForm.is_active} onChange={(is_active) => setInstanceForm((value) => ({ ...value, is_active }))} /><Field label="Custom state (JSON)"><textarea className={`${inputClass} min-h-24 font-mono text-xs`} value={instanceForm.state_json} onChange={(e) => setInstanceForm((value) => ({ ...value, state_json: e.target.value }))} /></Field><div className="flex justify-end gap-3">{editingInstance && <button type="button" disabled={busy} onClick={() => remove('world_objects', editingInstance, 'Object instance').then(() => { setEditingInstance(null); setInstanceForm(emptyInstance()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveInstance} className={buttonClass}>Save placement</button></div></div>
                </div>
            )}

            {activeTab === 'loot' && (
                <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[1fr_420px]">
                    <div className="space-y-3">
                        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4 text-xs leading-5 text-slate-400">
                            Each entry rolls independently when its NPC is defeated. Successful drops appear in the room and use the normal <span className="text-amber-200">loot</span> and <span className="text-amber-200">take</span> commands. For chests, place a container in a room, then place objects inside that container from the Placed objects tab.
                        </div>
                        {lootEntries.length === 0 && <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-600">No enemy drops authored yet.</p>}
                        {lootEntries.map((entry) => {
                            const npc = actorsById.get(entry.npc_id);
                            const definition = definitionsById.get(entry.definition_id);
                            return (
                                <button key={entry.id} type="button" aria-pressed={editingLootEntry === entry.id} onClick={() => { setEditingLootEntry(entry.id); setLootForm({ ...emptyLootEntry(), ...entry }); }} className={`grid w-full gap-2 rounded-xl border p-4 text-left sm:grid-cols-[1fr_1fr_auto] sm:items-center ${editingLootEntry === entry.id ? 'border-amber-300 bg-amber-500/10' : 'border-slate-700/70 bg-slate-950/40 hover:border-amber-400/40'}`}>
                                    <span><span className="block text-sm text-slate-100">{npc?.name || entry.npc_id}</span><span className="text-[0.62rem] uppercase tracking-wider text-slate-600">Enemy source</span></span>
                                    <span><span className="block text-sm text-slate-200">{definition?.icon} {definition?.name || entry.definition_id}</span><span className="text-[0.62rem] uppercase tracking-wider text-slate-600">{entry.minimum_quantity}–{entry.maximum_quantity} quantity</span></span>
                                    <span className="text-sm font-semibold text-amber-200 sm:text-right">{entry.chance_percent}%</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5">
                        <div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.22em] text-amber-200">{editingLootEntry ? 'Edit enemy drop' : 'Add enemy drop'}</h3>{editingLootEntry && <button type="button" onClick={() => { setEditingLootEntry(null); setLootForm(emptyLootEntry()); }} className="text-xs text-slate-400 hover:text-white">New</button>}</div>
                        <Field label="Enemy NPC"><select className={inputClass} value={lootForm.npc_id} onChange={(event) => setLootForm((value) => ({ ...value, npc_id: event.target.value }))}><option value="">Choose NPC…</option>{npcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}{npc.disposition === 'hostile' ? ' · Hostile' : ''}</option>)}</select></Field>
                        <Field label="Dropped object"><select className={inputClass} value={lootForm.definition_id} onChange={(event) => setLootForm((value) => ({ ...value, definition_id: event.target.value }))}><option value="">Choose object…</option>{definitions.filter((definition) => definition.portable).map((definition) => <option key={definition.id} value={definition.id}>{definition.icon} {definition.name}</option>)}</select></Field>
                        <div className="grid grid-cols-3 gap-3"><Field label="Minimum"><input type="number" min="1" className={inputClass} value={lootForm.minimum_quantity} onChange={(event) => setLootForm((value) => ({ ...value, minimum_quantity: event.target.value }))} /></Field><Field label="Maximum"><input type="number" min="1" className={inputClass} value={lootForm.maximum_quantity} onChange={(event) => setLootForm((value) => ({ ...value, maximum_quantity: event.target.value }))} /></Field><Field label="Chance %"><input type="number" min="0" max="100" className={inputClass} value={lootForm.chance_percent} onChange={(event) => setLootForm((value) => ({ ...value, chance_percent: event.target.value }))} /></Field></div>
                        <p className="text-xs leading-5 text-slate-500">Add multiple entries for multiple possible drops. A 100% entry is guaranteed; lower percentages are rolled independently on each defeat.</p>
                        <div className="flex justify-end gap-3">{editingLootEntry && <button type="button" disabled={busy} onClick={() => remove('loot_table_entries', editingLootEntry, 'Enemy drop').then(() => { setEditingLootEntry(null); setLootForm(emptyLootEntry()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveLootEntry} className={buttonClass}>Save drop</button></div>
                    </div>
                </div>
            )}

            {activeTab === 'actors' && (
                <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[1fr_420px]">
                    <div className="space-y-2">{actorStats.map((row) => <button key={row.id} type="button" aria-pressed={editingActorStat === row.id} onClick={() => { setEditingActorStat(row.id); setActorStatForm({ ...emptyActorStat(), ...row }); }} className={`grid w-full gap-2 rounded-lg border p-4 text-left text-sm sm:grid-cols-3 sm:gap-3 ${editingActorStat === row.id ? 'border-purple-300 bg-purple-500/15' : 'border-slate-700/70 bg-slate-950/40 hover:border-purple-400/50'}`}><span className="text-slate-100">{actorsById.get(row.actor_id)?.label || row.actor_id}</span><span className="text-slate-300">{stats.find((stat) => stat.id === row.stat_definition_id)?.name || row.stat_definition_id}</span><span className="text-purple-200 sm:text-right">{row.current_value} / base {row.base_value} · {row.invested_points || 0} invested</span></button>)}</div>
                    <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-5"><div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.22em] text-purple-200">{editingActorStat ? 'Edit actor value' : 'Set actor value'}</h3>{editingActorStat && <button type="button" onClick={() => { setEditingActorStat(null); setActorStatForm(emptyActorStat()); }} className="text-xs text-slate-400">New</button>}</div><Field label="Actor"><select disabled={Boolean(editingActorStat)} className={inputClass} value={actorStatForm.actor_id} onChange={(e) => setActorStatForm((value) => ({ ...value, actor_id: e.target.value }))}><option value="">Choose actor…</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.label}</option>)}</select></Field><Field label="Stat"><select disabled={Boolean(editingActorStat)} className={inputClass} value={actorStatForm.stat_definition_id} onChange={(e) => { const definition = stats.find((stat) => stat.id === e.target.value); setActorStatForm((value) => ({ ...value, stat_definition_id: e.target.value, base_value: definition?.default_value ?? 0, current_value: definition?.default_value ?? 0, invested_points: 0 })); }}><option value="">Choose stat…</option>{stats.map((stat) => <option key={stat.id} value={stat.id}>{stat.name}</option>)}</select></Field><div className="grid grid-cols-3 gap-4"><Field label="Base value"><input type="number" className={inputClass} value={actorStatForm.base_value} onChange={(e) => setActorStatForm((value) => ({ ...value, base_value: e.target.value }))} /></Field><Field label="Current value"><input type="number" className={inputClass} value={actorStatForm.current_value} onChange={(e) => setActorStatForm((value) => ({ ...value, current_value: e.target.value }))} /></Field><Field label="Invested points"><input type="number" min="0" className={inputClass} value={actorStatForm.invested_points} onChange={(e) => setActorStatForm((value) => ({ ...value, invested_points: e.target.value }))} /></Field></div><p className="text-xs leading-5 text-slate-500">Actors without an override inherit the stat definition default. Equipment modifiers are applied at runtime without replacing these values. Invested points are tracked separately from level and administrator adjustments.</p><div className="flex justify-end gap-3">{editingActorStat && <button type="button" disabled={busy} onClick={() => remove('actor_stats', editingActorStat, 'Actor stat').then(() => { setEditingActorStat(null); setActorStatForm(emptyActorStat()); })} className="rounded-md border border-rose-400/50 px-4 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Delete</button>}<button type="button" disabled={busy} onClick={saveActorStat} className={buttonClass}>Save value</button></div></div>
                </div>
            )}

            {activeTab === 'moderation' && (
                <div className="space-y-6 p-4 sm:p-6">
                    <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-4 sm:p-5">
                        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]"><Field label="Actor"><select className={inputClass} value={moderationForm.actor_id} onChange={(event) => chooseModerationActor(event.target.value)}><option value="">Choose a hero, profile, or NPC…</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.label}</option>)}</select></Field><div><span className={labelClass}>Current room</span><p className="mt-2 text-sm text-slate-200">{roomsById.get(selectedActor?.current_room)?.name || selectedActor?.current_room || '—'}</p></div><div><span className={labelClass}>Life state</span><p className={`mt-2 text-sm uppercase ${selectedLifeState?.state === 'dead' ? 'text-rose-300' : 'text-emerald-300'}`}>{selectedLifeState?.state || 'not initialized'}{selectedLifeState ? ` · ${selectedLifeState.death_count} deaths` : ''}</p></div></div>
                    </div>

                    {moderationForm.actor_id && <>
                        <div className="grid gap-6 xl:grid-cols-3">
                            <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><h3 className="text-sm uppercase tracking-[0.2em] text-amber-200">Wallet & rescue</h3><Field label="Gold"><input type="number" min="0" className={inputClass} value={moderationForm.gold} onChange={(event) => setModerationForm((value) => ({ ...value, gold: event.target.value }))} /></Field><button type="button" disabled={busy} onClick={() => moderateActor('set_gold', { gold: Math.max(0, Number(moderationForm.gold) || 0) }, 'Gold balance saved.')} className={buttonClass}>Save gold</button><Field label="Destination room"><select className={inputClass} value={moderationForm.room_id} onChange={(event) => setModerationForm((value) => ({ ...value, room_id: event.target.value }))}><option value="">Automatic respawn destination</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></Field><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !moderationForm.room_id} onClick={() => moderateActor('move', { room_id: moderationForm.room_id }, 'Actor moved.')} className={buttonClass}>Move</button><button type="button" disabled={busy} onClick={() => moderateActor('rescue', { room_id: moderationForm.room_id || null }, 'Actor rescued and restored.')} className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-xs uppercase tracking-[0.16em] text-emerald-200">Rescue / respawn</button></div></div>
                            <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.2em] text-fuchsia-200">Cooldowns</h3><button type="button" disabled={busy || selectedCooldowns.length === 0} onClick={() => moderateActor('clear_cooldowns', {}, 'All actor cooldowns cleared.')} className="text-xs text-fuchsia-200 disabled:opacity-40">Clear all</button></div>{selectedCooldowns.length === 0 ? <p className="text-xs text-slate-600">No active or recorded cooldowns.</p> : <div className="space-y-2">{selectedCooldowns.map((row) => <div key={row.id} className="rounded-lg border border-slate-800 bg-black/20 p-3 text-xs"><p className="text-slate-200">{row.action_id}</p><p className="mt-1 text-slate-500">Ready {Number(row.ready_at_micros) <= Date.now() * 1000 ? 'now' : new Date(Number(row.ready_at_micros) / 1000).toLocaleString()}</p></div>)}</div>}</div>
                            <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div className="flex items-center justify-between"><h3 className="text-sm uppercase tracking-[0.2em] text-rose-200">Wanted & crimes</h3><button type="button" disabled={busy || selectedCrimes.length === 0} onClick={() => moderateActor('clear_crimes', {}, 'Wanted status and crimes cleared.')} className="text-xs text-rose-200 disabled:opacity-40">Clear all</button></div>{selectedCrimes.length === 0 ? <p className="text-xs text-slate-600">No recorded safe-zone crimes.</p> : <div className="space-y-2">{selectedCrimes.map((row) => <div key={row.id} className="rounded-lg border border-rose-400/15 bg-rose-500/[0.04] p-3 text-xs"><p className="text-rose-100">Severity {row.severity} · {row.region_id}</p><p className="mt-1 text-slate-500">Wanted until {new Date(Number(row.wanted_until_micros) / 1000).toLocaleString()}{row.faction_id ? ` · ${row.faction_id}` : ''}</p></div>)}</div>}</div>
                        </div>

                        <div className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-4 sm:p-5"><div><h3 className="text-sm uppercase tracking-[0.2em] text-cyan-200">Quest moderation</h3><p className="mt-1 text-xs text-slate-500">Start, ready, complete, reset, or repair individual objective progress without impersonating the player.</p></div><div className="grid gap-3 md:grid-cols-[1fr_180px_auto]"><Field label="Quest"><select className={inputClass} value={moderationForm.quest_id} onChange={(event) => setModerationForm((value) => ({ ...value, quest_id: event.target.value }))}><option value="">Choose quest…</option>{quests.map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}</select></Field><Field label="Status"><select className={inputClass} value={moderationForm.quest_status} onChange={(event) => setModerationForm((value) => ({ ...value, quest_status: event.target.value }))}><option value="active">Active</option><option value="ready">Ready to turn in</option><option value="completed">Completed</option></select></Field><div className="flex items-end"><button type="button" disabled={busy || !moderationForm.quest_id} onClick={() => moderateActor('set_quest_status', { quest_id: moderationForm.quest_id, status: moderationForm.quest_status }, 'Quest status saved.')} className={buttonClass}>Set status</button></div></div><div className="grid gap-4 lg:grid-cols-2">{selectedActorQuests.map((row) => { const quest = quests.find((value) => value.id === row.quest_id); const progressRows = selectedQuestProgress.filter((value) => value.quest_id === row.quest_id); return <article key={row.id} className="rounded-xl border border-slate-800 bg-black/20 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-slate-100">{quest?.title || row.quest_id}</p><p className="mt-1 text-xs uppercase text-cyan-300">{row.status} · completed {row.completion_count}×</p></div><button type="button" disabled={busy} onClick={() => remove('actor_quests', row.id, 'Actor quest')} className="text-xs text-rose-300">Reset</button></div><div className="mt-3 space-y-2">{progressRows.map((progressRow) => { const objective = questObjectives.find((value) => value.id === progressRow.objective_id); return <div key={progressRow.id} className="grid grid-cols-[1fr_90px_auto] items-end gap-2"><div><span className={labelClass}>{objective?.description || objective?.objective_type || progressRow.objective_id}</span><p className="mt-1 text-xs text-slate-500">Required {objective?.required_count || '?'}</p></div><input type="number" min="0" max={objective?.required_count} className={inputClass} value={progressRow.progress} onChange={(event) => setActorQuestProgress((values) => values.map((value) => value.id === progressRow.id ? { ...value, progress: event.target.value } : value))} /><button type="button" disabled={busy} onClick={() => saveQuestProgress(progressRow)} className="rounded-md border border-cyan-400/30 px-3 py-2 text-xs text-cyan-200">Save</button></div>; })}</div></article>; })}{selectedActorQuests.length === 0 && <p className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-xs text-slate-600 lg:col-span-2">This actor has no quest state.</p>}</div></div>
                    </>}
                </div>
            )}
        </section>
    );
}
