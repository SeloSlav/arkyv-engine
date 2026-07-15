//! Arkyv Engine's authoritative SpacetimeDB module.
//!
//! Browser identities are issued by SpacetimeDB and persisted in localStorage by
//! the client. All persistent game state and mutations live in this module.

use serde_json::Value;
use spacetimedb::{reducer, Identity, ReducerContext, ScheduleAt, Table, TimeDuration, Timestamp};
use std::collections::{BTreeMap, VecDeque};

const CREATION_ROOM_ID: &str = "e58caed0-8268-419e-abe8-faa3833a1de6";
const STARTING_ROOM_ID: &str = "a1b2c3d4-5678-90ab-cdef-123456789abc";

#[spacetimedb::table(accessor = region, public)]
#[derive(Clone)]
pub struct Region {
    #[primary_key]
    pub name: String,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub color_scheme: String,
    #[default(false)]
    pub pvp_enabled: bool,
    #[default(None::<String>)]
    pub respawn_room_id: Option<String>,
}

#[spacetimedb::table(accessor = room, public)]
#[derive(Clone)]
pub struct Room {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub description: String,
    pub region: String,
    pub region_name: Option<String>,
    pub height: i32,
    pub image_url: Option<String>,
}

#[spacetimedb::table(accessor = character, public, index(accessor = owner, btree(columns = [owner])))]
#[derive(Clone)]
pub struct Character {
    #[primary_key]
    pub id: String,
    pub owner: Identity,
    pub user_id: String,
    pub name: String,
    pub current_room: Option<String>,
    pub created_at: Timestamp,
    pub description: Option<String>,
}

#[spacetimedb::table(accessor = profile, public, index(accessor = owner, btree(columns = [owner])))]
#[derive(Clone)]
pub struct Profile {
    #[primary_key]
    pub id: String,
    pub owner: Identity,
    pub user_id: String,
    pub created_at: Timestamp,
    pub description: Option<String>,
    pub current_room: Option<String>,
    pub handle: Option<String>,
    pub name: Option<String>,
    pub membership_tier: Option<String>,
    pub is_admin: bool,
}

#[spacetimedb::table(accessor = npc, public)]
#[derive(Clone)]
pub struct Npc {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub current_room: Option<String>,
    pub dialogue_tree: Option<String>,
    pub faction: Option<String>,
    pub behavior_type: String,
    pub created_at: Timestamp,
    pub alias: Option<String>,
    pub greeting_behavior: String,
    pub portrait_url: Option<String>,
    #[default(None::<String>)]
    pub disposition: Option<String>,
    #[default(false)]
    pub attack_on_sight: bool,
    #[default(None::<String>)]
    pub patrol_route: Option<String>,
    #[default(20)]
    pub patrol_interval_seconds: u32,
    #[default(0)]
    pub patrol_index: u32,
    #[default(None::<Timestamp>)]
    pub last_patrol_at: Option<Timestamp>,
    #[default(6)]
    pub attack_interval_seconds: u32,
    #[default(None::<Timestamp>)]
    pub last_attack_at: Option<Timestamp>,
    #[default(60)]
    pub respawn_seconds: u32,
    #[default(None::<String>)]
    pub spawn_room: Option<String>,
    #[default(None::<Timestamp>)]
    pub defeated_at: Option<Timestamp>,
    #[default(25)]
    pub xp_reward: u32,
    #[default(false)]
    pub is_guard: bool,
    #[default(None::<String>)]
    pub guard_greeting: Option<String>,
    #[default(true)]
    pub protect_players: bool,
    #[default(true)]
    pub protect_faction_members: bool,
    #[default(120)]
    pub guard_wanted_seconds: u32,
}

#[spacetimedb::table(accessor = exit, public)]
#[derive(Clone)]
pub struct Exit {
    #[primary_key]
    pub id: String,
    pub from_room: Option<String>,
    pub to_room: Option<String>,
    pub verb: String,
}

#[spacetimedb::table(accessor = command, index(accessor = owner, btree(columns = [owner])))]
#[derive(Clone)]
pub struct Command {
    #[primary_key]
    pub id: String,
    pub owner: Identity,
    pub character_id: Option<String>,
    pub room_id: Option<String>,
    pub raw: String,
    pub created_at: Timestamp,
    pub processed_at: Option<Timestamp>,
    pub conversation_history: Option<String>,
    pub user_id: Option<String>,
}

#[spacetimedb::table(accessor = room_message, public)]
#[derive(Clone)]
pub struct RoomMessage {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub room_id: Option<String>,
    pub character_id: Option<String>,
    pub kind: String,
    pub body: String,
    pub created_at: Timestamp,
    pub character_name: Option<String>,
    pub target_character_id: Option<String>,
    pub region: Option<String>,
    pub region_name: Option<String>,
}

#[spacetimedb::table(accessor = region_chat, public)]
#[derive(Clone)]
pub struct RegionChat {
    #[primary_key]
    pub id: String,
    pub region: String,
    pub room_id: Option<String>,
    pub character_id: Option<String>,
    pub character_name: String,
    pub body: String,
    pub kind: String,
    pub created_at: Timestamp,
    pub region_name: Option<String>,
}

/// Admin-authored numeric attributes. The optional role lets runtime systems
/// discover health, power, and defense without hard-coding a particular name.
#[spacetimedb::table(accessor = stat_definition, public)]
#[derive(Clone)]
pub struct StatDefinition {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub description: String,
    pub role: Option<String>,
    pub minimum: i32,
    pub maximum: i32,
    pub default_value: i32,
    pub visible: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    /// Amount added to an actor's base value whenever they gain a level.
    #[default(0)]
    pub per_level_gain: i32,
    /// Passive recovery per elapsed real-time second. Zero disables regeneration.
    #[default(0)]
    pub regeneration_per_second: i32,
    /// Whether players may spend earned stat points on this attribute.
    #[default(true)]
    pub player_allocatable: bool,
    /// Number of unspent stat points consumed for one purchased rank.
    #[default(1)]
    pub point_cost: u32,
    /// Base-value increase granted by one purchased rank.
    #[default(1)]
    pub points_per_rank: i32,
}

/// A reusable RPG primitive authored in the admin editor. Behaviour is stored
/// as explicit columns for the common runtime contracts plus JSON extension
/// points for game-specific data.
#[spacetimedb::table(accessor = object_definition, public)]
#[derive(Clone)]
pub struct ObjectDefinition {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub description: String,
    pub primitive_kind: String,
    pub icon: String,
    pub tags: String,
    pub portable: bool,
    pub stackable: bool,
    pub max_stack: u32,
    pub capacity: u32,
    pub equipment_slot: Option<String>,
    pub weapon_damage: i32,
    pub armor_value: i32,
    pub scales_with_stat: Option<String>,
    pub fuel_value: i32,
    pub burn_rate: i32,
    pub accepted_fuel_tags: String,
    pub stat_modifiers: String,
    pub on_use: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    #[default(None::<String>)]
    pub image_url: Option<String>,
    /// Time before another basic attack can be made while this weapon is equipped.
    #[default(2000)]
    pub attack_cooldown_ms: u32,
    /// Additional top-level inventory stacks granted while this object is equipped.
    #[default(0)]
    pub inventory_slots_bonus: u32,
}

/// A concrete object. `location_kind` is one of room, inventory, equipped, or
/// container; `location_id` points at the room, actor, or containing instance.
#[spacetimedb::table(accessor = world_object, public)]
#[derive(Clone)]
pub struct WorldObject {
    #[primary_key]
    pub id: String,
    pub definition_id: String,
    pub location_kind: String,
    pub location_id: String,
    pub quantity: u32,
    pub equipped_slot: Option<String>,
    pub durability: i32,
    pub fuel_remaining: i32,
    pub is_active: bool,
    pub state_json: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Sparse per-actor stat overrides. Missing rows inherit the definition's
/// default value, which makes newly-created heroes immediately usable.
#[spacetimedb::table(accessor = actor_stat, public)]
#[derive(Clone)]
pub struct ActorStat {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub stat_definition_id: String,
    pub base_value: i32,
    pub current_value: i32,
    /// Total progression points deliberately invested by the player.
    #[default(0)]
    pub invested_points: u32,
    pub updated_at: Timestamp,
}

/// An independently rolled drop authored for an enemy NPC. Chests use regular
/// world objects placed inside container instances, while these rows create
/// fresh room loot whenever their NPC is defeated.
#[spacetimedb::table(accessor = loot_table_entry, public)]
#[derive(Clone)]
pub struct LootTableEntry {
    #[primary_key]
    pub id: String,
    pub npc_id: String,
    pub definition_id: String,
    pub minimum_quantity: u32,
    pub maximum_quantity: u32,
    pub chance_percent: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Singleton world-wide progression and carrying rules. The starter kit uses
/// the id `world`, but keeping an id makes this table migration-friendly.
#[spacetimedb::table(accessor = progression_config, public)]
#[derive(Clone)]
pub struct ProgressionConfig {
    #[primary_key]
    pub id: String,
    pub max_level: u32,
    pub base_xp: u32,
    pub growth_percent: u32,
    pub base_inventory_slots: u32,
    pub inventory_slots_per_level: u32,
    pub stat_points_per_level: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Per-actor level state. Experience is progress within the current level,
/// which keeps the curve editable without rewriting historical totals.
#[spacetimedb::table(accessor = actor_progression, public)]
#[derive(Clone)]
pub struct ActorProgression {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub level: u32,
    pub experience: u32,
    pub unspent_stat_points: u32,
    pub updated_at: Timestamp,
}

/// Defines wearable locations and how many objects each location accepts.
#[spacetimedb::table(accessor = equipment_slot_definition, public)]
#[derive(Clone)]
pub struct EquipmentSlotDefinition {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub capacity: u32,
    pub sort_order: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Admin-authored combat and utility action. The initial runtime supports
/// damage, healing, and resource restoration without trusting the client.
#[spacetimedb::table(accessor = ability_definition, public)]
#[derive(Clone)]
pub struct AbilityDefinition {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub school: String,
    pub effect_type: String,
    pub target_type: String,
    pub resource_stat_id: Option<String>,
    pub resource_cost: i32,
    pub cooldown_ms: u32,
    pub cast_time_ms: u32,
    pub power_min: i32,
    pub power_max: i32,
    pub scales_with_stat: Option<String>,
    pub scaling_percent: i32,
    pub effect_stat_id: Option<String>,
    /// `armor` applies defense and equipped armor; `none` deals authored power directly.
    pub mitigation_type: String,
    pub required_level: u32,
    pub auto_learn: bool,
    pub enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Explicit grants supplement abilities learned automatically by level.
#[spacetimedb::table(accessor = actor_ability, public)]
#[derive(Clone)]
pub struct ActorAbility {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub ability_id: String,
    pub granted_at: Timestamp,
}

/// Server-authoritative readiness for attacks and abilities. Microseconds are
/// stored directly so the generated browser client can compare them cheaply.
#[spacetimedb::table(accessor = actor_cooldown, public)]
#[derive(Clone)]
pub struct ActorCooldown {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub action_id: String,
    pub ready_at_micros: i64,
    pub updated_at: Timestamp,
}

/// A cast with a non-zero cast time is resolved by SpacetimeDB's scheduler,
/// rather than pretending that cast time is merely additional cooldown.
#[spacetimedb::table(accessor = scheduled_cast, public, scheduled(resolve_scheduled_cast))]
#[derive(Clone)]
pub struct ScheduledCast {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
    pub actor_id: String,
    pub actor_name: String,
    pub room_id: String,
    pub ability_id: String,
    pub target_query: Option<String>,
}

/// An admin-authored political or social group. Reputation thresholds are
/// inclusive: values at or below hostile are treated as hostile, while values
/// at or above friendly are treated as friendly.
#[spacetimedb::table(accessor = faction_definition, public)]
#[derive(Clone)]
pub struct FactionDefinition {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub description: String,
    pub starting_reputation: i32,
    pub minimum_reputation: i32,
    pub maximum_reputation: i32,
    pub hostile_threshold: i32,
    pub friendly_threshold: i32,
    pub attack_penalty: i32,
    pub kill_penalty: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_faction_reputation, public)]
#[derive(Clone)]
pub struct ActorFactionReputation {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub faction_id: String,
    pub reputation: i32,
    pub updated_at: Timestamp,
}

/// Safe-region offenses persist briefly so guards can pursue an offender
/// across rooms in the same region rather than responding only to one command.
#[spacetimedb::table(accessor = actor_crime, public)]
#[derive(Clone)]
pub struct ActorCrime {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub region_id: String,
    pub faction_id: Option<String>,
    pub severity: u32,
    pub wanted_until_micros: i64,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = quest_definition, public)]
#[derive(Clone)]
pub struct QuestDefinition {
    #[primary_key]
    pub id: String,
    pub title: String,
    pub description: String,
    pub quest_giver_npc_id: String,
    pub turn_in_npc_id: String,
    pub required_level: u32,
    pub required_faction_id: Option<String>,
    pub required_reputation: i32,
    pub repeatable: bool,
    pub active: bool,
    pub xp_reward: u32,
    pub gold_reward: i32,
    pub reputation_faction_id: Option<String>,
    pub reputation_reward: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = quest_objective, public)]
#[derive(Clone)]
pub struct QuestObjective {
    #[primary_key]
    pub id: String,
    pub quest_id: String,
    pub objective_type: String,
    pub target_id: String,
    pub description: String,
    pub required_count: u32,
    pub sort_order: u32,
    pub consume_on_turn_in: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = quest_item_reward, public)]
#[derive(Clone)]
pub struct QuestItemReward {
    #[primary_key]
    pub id: String,
    pub quest_id: String,
    pub definition_id: String,
    pub quantity: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_quest, public)]
#[derive(Clone)]
pub struct ActorQuest {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub quest_id: String,
    pub status: String,
    pub completion_count: u32,
    pub accepted_at: Timestamp,
    pub updated_at: Timestamp,
    pub completed_at: Option<Timestamp>,
}

#[spacetimedb::table(accessor = actor_quest_progress, public)]
#[derive(Clone)]
pub struct ActorQuestProgress {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub quest_id: String,
    pub objective_id: String,
    pub progress: u32,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_wallet, public)]
#[derive(Clone)]
pub struct ActorWallet {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub gold: i32,
    pub updated_at: Timestamp,
}

/// An authored point where new or defeated characters may enter the world.
/// Multiple points may target the same room with different roles and priority.
#[spacetimedb::table(accessor = spawn_point, public)]
#[derive(Clone)]
pub struct SpawnPoint {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub description: String,
    pub room_id: String,
    pub allows_initial_spawn: bool,
    pub allows_respawn: bool,
    pub active: bool,
    pub priority: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Singleton policy for character creation, defeat consequences, and recovery.
#[spacetimedb::table(accessor = world_lifecycle_config, public)]
#[derive(Clone)]
pub struct WorldLifecycleConfig {
    #[primary_key]
    pub id: String,
    pub initial_spawn_policy: String,
    pub fixed_initial_spawn_point_id: Option<String>,
    pub respawn_policy: String,
    pub fixed_respawn_point_id: Option<String>,
    pub death_mode: String,
    pub respawn_delay_seconds: u32,
    pub inventory_loss_mode: String,
    pub inventory_loss_percent: u32,
    pub include_equipped_in_loss: bool,
    pub gold_loss_percent: u32,
    pub experience_loss_percent: u32,
    pub respawn_health_percent: u32,
    pub respawn_resource_percent: u32,
    pub spawn_protection_seconds: u32,
    pub reset_quests_on_death: bool,
    pub clear_wanted_on_respawn: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Runtime state separates being defeated from being eligible to re-enter.
#[spacetimedb::table(accessor = actor_life_state, public)]
#[derive(Clone)]
pub struct ActorLifeState {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub state: String,
    pub death_room_id: Option<String>,
    pub pending_spawn_point_id: Option<String>,
    pub death_count: u32,
    pub died_at: Option<Timestamp>,
    pub respawn_available_at_micros: i64,
    pub protected_until_micros: i64,
    pub updated_at: Timestamp,
}

/// Immutable audit trail retained even when hardcore mode deletes a character.
#[spacetimedb::table(accessor = actor_death_record, public)]
#[derive(Clone)]
pub struct ActorDeathRecord {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub actor_name: String,
    pub death_room_id: String,
    pub spawn_point_id: Option<String>,
    pub death_mode: String,
    pub defeated_by: Option<String>,
    pub item_stacks_dropped: u32,
    pub item_stacks_destroyed: u32,
    pub gold_lost: i32,
    pub experience_lost: u32,
    pub died_at: Timestamp,
}

fn identity_id(identity: Identity) -> String {
    identity.to_string()
}

fn profile_for(ctx: &ReducerContext, owner: Identity) -> Option<Profile> {
    ctx.db.profile().iter().find(|profile| profile.owner == owner)
}

fn require_profile(ctx: &ReducerContext) -> Result<Profile, String> {
    profile_for(ctx, ctx.sender()).ok_or_else(|| "No profile exists for this identity.".to_string())
}

fn require_admin(ctx: &ReducerContext) -> Result<(), String> {
    if require_profile(ctx)?.is_admin {
        Ok(())
    } else {
        Err("Administrator access is required.".to_string())
    }
}

fn ensure_profile(ctx: &ReducerContext) {
    if let Some(profile) = profile_for(ctx, ctx.sender()) {
        ensure_actor_progression(ctx, &profile.id);
        ensure_actor_life_state(ctx, &profile.id);
        return;
    }

    let id = identity_id(ctx.sender());
    let is_admin = !ctx.db.profile().iter().any(|profile| profile.is_admin);
    let short_id = id.chars().take(8).collect::<String>();
    ctx.db.profile().insert(Profile {
        id: id.clone(),
        owner: ctx.sender(),
        user_id: id.clone(),
        created_at: ctx.timestamp,
        description: None,
        current_room: Some(CREATION_ROOM_ID.to_string()),
        handle: Some(format!("Traveler-{short_id}")),
        name: None,
        membership_tier: Some("local".to_string()),
        is_admin,
    });
    ensure_actor_progression(ctx, &id);
    ensure_actor_life_state(ctx, &id);
}

fn json_string(value: Option<&Value>, fallback: &str) -> String {
    match value {
        Some(Value::String(value)) => value.clone(),
        Some(value) if !value.is_null() => value.to_string(),
        _ => fallback.to_string(),
    }
}

fn string(value: &Value, key: &str, fallback: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or(fallback).to_string()
}

fn optional_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(ToString::to_string)
}

fn i32_value(value: &Value, key: &str, fallback: i32) -> i32 {
    value.get(key).and_then(Value::as_i64).map(|value| value as i32).unwrap_or(fallback)
}

fn u32_value(value: &Value, key: &str, fallback: u32) -> u32 {
    value
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(fallback)
}

fn bool_value(value: &Value, key: &str, fallback: bool) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(fallback)
}

fn normalized_key(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| if character.is_ascii_alphanumeric() { character } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn validate_lifecycle_policy_values(
    initial_spawn_policy: &str,
    respawn_policy: &str,
    death_mode: &str,
    inventory_loss_mode: &str,
) -> Result<(), String> {
    if !matches!(initial_spawn_policy, "fixed" | "highest_priority" | "random") {
        return Err("Initial spawn policy must be fixed, highest_priority, or random.".to_string());
    }
    if !matches!(respawn_policy, "fixed" | "nearest" | "region_nearest" | "highest_priority" | "random") {
        return Err("Respawn policy must be fixed, nearest, region_nearest, highest_priority, or random.".to_string());
    }
    if !matches!(death_mode, "respawn" | "hardcore") {
        return Err("Death mode must be respawn or hardcore.".to_string());
    }
    if !matches!(inventory_loss_mode, "keep" | "drop_inventory" | "drop_all" | "destroy_inventory" | "destroy_all" | "drop_percentage" | "destroy_percentage") {
        return Err("Inventory loss mode is invalid.".to_string());
    }
    Ok(())
}

fn actor_stat_id(actor_id: &str, stat_definition_id: &str) -> String {
    format!("{actor_id}::{stat_definition_id}")
}

fn actor_exists(ctx: &ReducerContext, actor_id: &str) -> bool {
    let actor_id = actor_id.to_string();
    ctx.db.character().id().find(&actor_id).is_some()
        || ctx.db.npc().id().find(&actor_id).is_some()
        || ctx.db.profile().id().find(&actor_id).is_some()
}

fn parse_rows(payload_json: &str) -> Result<Vec<Value>, String> {
    let value: Value = serde_json::from_str(payload_json).map_err(|error| error.to_string())?;
    match value {
        Value::Array(rows) => Ok(rows),
        row @ Value::Object(_) => Ok(vec![row]),
        _ => Err("Mutation payload must be an object or array.".to_string()),
    }
}

fn parse_ids(ids_json: &str) -> Result<Vec<String>, String> {
    serde_json::from_str(ids_json).map_err(|error| error.to_string())
}

fn add_message(
    ctx: &ReducerContext,
    room_id: Option<String>,
    character_id: Option<String>,
    character_name: Option<String>,
    target_character_id: Option<String>,
    kind: &str,
    body: String,
    region: Option<String>,
    region_name: Option<String>,
) {
    ctx.db.room_message().insert(RoomMessage {
        id: 0,
        room_id,
        character_id,
        kind: kind.to_string(),
        body,
        created_at: ctx.timestamp,
        character_name,
        target_character_id,
        region,
        region_name,
    });
}

fn seed_rpg_definitions(ctx: &ReducerContext) {
    let first_progression_install = ctx.db.progression_config().id().find(&"world".to_string()).is_none();
    let stats = [
        ("health", "Health", "How much harm an actor can withstand.", "health", 0, 9999, 20, 5, 1),
        ("mana", "Mana", "Arcane power spent on spells and magical abilities.", "mana", 0, 9999, 40, 5, 2),
        ("energy", "Energy", "Fast-recovering power spent on physical techniques.", "energy", 0, 9999, 100, 0, 5),
        ("focus", "Focus", "Concentration spent on precise or sustained techniques.", "focus", 0, 9999, 100, 0, 1),
        ("strength", "Strength", "Physical power used by weapons and heavy actions.", "power", 0, 999, 3, 1, 0),
        ("defense", "Defense", "Innate resistance before equipped armor is applied.", "defense", 0, 999, 0, 1, 0),
    ];
    for (id, name, description, role, minimum, maximum, default_value, per_level_gain, regeneration_per_second) in stats {
        let id = id.to_string();
        if let Some(existing) = ctx.db.stat_definition().id().find(&id) {
            if first_progression_install {
                ctx.db.stat_definition().id().update(StatDefinition {
                    per_level_gain,
                    regeneration_per_second,
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        } else {
            ctx.db.stat_definition().insert(StatDefinition {
                id,
                name: name.to_string(),
                description: description.to_string(),
                role: Some(role.to_string()),
                minimum,
                maximum,
                default_value,
                visible: true,
                created_at: ctx.timestamp,
                updated_at: ctx.timestamp,
                per_level_gain,
                regeneration_per_second,
                player_allocatable: true,
                point_cost: 1,
                points_per_rank: 1,
            });
        }
    }

    let definitions = [
        ObjectDefinition {
            id: "wood".to_string(), name: "Firewood".to_string(), description: "A dry split log suitable for fuel.".to_string(),
            primitive_kind: "item".to_string(), icon: "🪵".to_string(), image_url: None, tags: r#"["fuel","wood"]"#.to_string(),
            portable: true, stackable: true, max_stack: 20, capacity: 0, equipment_slot: None,
            weapon_damage: 0, armor_value: 0, scales_with_stat: None, fuel_value: 300, burn_rate: 0,
            accepted_fuel_tags: "[]".to_string(), stat_modifiers: "{}".to_string(), on_use: "{}".to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
            attack_cooldown_ms: 2000, inventory_slots_bonus: 0,
        },
        ObjectDefinition {
            id: "wooden-box".to_string(), name: "Wooden Box".to_string(), description: "A simple container for loose possessions.".to_string(),
            primitive_kind: "container".to_string(), icon: "📦".to_string(), image_url: None, tags: r#"["container","wood"]"#.to_string(),
            portable: true, stackable: false, max_stack: 1, capacity: 12, equipment_slot: None,
            weapon_damage: 0, armor_value: 0, scales_with_stat: None, fuel_value: 0, burn_rate: 0,
            accepted_fuel_tags: "[]".to_string(), stat_modifiers: "{}".to_string(), on_use: "{}".to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
            attack_cooldown_ms: 2000, inventory_slots_bonus: 0,
        },
        ObjectDefinition {
            id: "campfire".to_string(), name: "Campfire".to_string(), description: "A stone-ringed fire that burns while it has fuel.".to_string(),
            primitive_kind: "fixture".to_string(), icon: "🔥".to_string(), image_url: None, tags: r#"["fire","light"]"#.to_string(),
            portable: false, stackable: false, max_stack: 1, capacity: 0, equipment_slot: None,
            weapon_damage: 0, armor_value: 0, scales_with_stat: None, fuel_value: 0, burn_rate: 1,
            accepted_fuel_tags: r#"["fuel"]"#.to_string(), stat_modifiers: "{}".to_string(), on_use: "{}".to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
            attack_cooldown_ms: 2000, inventory_slots_bonus: 0,
        },
        ObjectDefinition {
            id: "iron-sword".to_string(), name: "Iron Sword".to_string(), description: "A dependable one-handed blade.".to_string(),
            primitive_kind: "weapon".to_string(), icon: "⚔️".to_string(), image_url: None, tags: r#"["weapon","blade"]"#.to_string(),
            portable: true, stackable: false, max_stack: 1, capacity: 0, equipment_slot: Some("main-hand".to_string()),
            weapon_damage: 5, armor_value: 0, scales_with_stat: Some("strength".to_string()), fuel_value: 0, burn_rate: 0,
            accepted_fuel_tags: "[]".to_string(), stat_modifiers: "{}".to_string(), on_use: "{}".to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
            attack_cooldown_ms: 1800, inventory_slots_bonus: 0,
        },
        ObjectDefinition {
            id: "leather-armor".to_string(), name: "Leather Armor".to_string(), description: "Flexible protection made from boiled leather.".to_string(),
            primitive_kind: "armor".to_string(), icon: "🛡️".to_string(), image_url: None, tags: r#"["armor","leather"]"#.to_string(),
            portable: true, stackable: false, max_stack: 1, capacity: 0, equipment_slot: Some("body".to_string()),
            weapon_damage: 0, armor_value: 2, scales_with_stat: None, fuel_value: 0, burn_rate: 0,
            accepted_fuel_tags: "[]".to_string(), stat_modifiers: "{}".to_string(), on_use: "{}".to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
            attack_cooldown_ms: 2000, inventory_slots_bonus: 0,
        },
        ObjectDefinition {
            id: "healing-potion".to_string(), name: "Healing Potion".to_string(), description: "A crimson restorative draught.".to_string(),
            primitive_kind: "consumable".to_string(), icon: "🧪".to_string(), image_url: None, tags: r#"["consumable","potion"]"#.to_string(),
            portable: true, stackable: true, max_stack: 10, capacity: 0, equipment_slot: None,
            weapon_damage: 0, armor_value: 0, scales_with_stat: None, fuel_value: 0, burn_rate: 0,
            accepted_fuel_tags: "[]".to_string(), stat_modifiers: "{}".to_string(),
            on_use: r#"{"stat_id":"health","delta":8,"consume":true}"#.to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
            attack_cooldown_ms: 2000, inventory_slots_bonus: 0,
        },
    ];
    for definition in definitions {
        if ctx.db.object_definition().id().find(&definition.id).is_none() {
            ctx.db.object_definition().insert(definition);
        }
    }

    if first_progression_install {
        ctx.db.progression_config().insert(ProgressionConfig {
            id: "world".to_string(),
            max_level: 60,
            base_xp: 100,
            growth_percent: 15,
            base_inventory_slots: 20,
            inventory_slots_per_level: 1,
            stat_points_per_level: 0,
            created_at: ctx.timestamp,
            updated_at: ctx.timestamp,
        });
    }

    let slots = [
        ("main-hand", "Main hand", 1, 10), ("off-hand", "Off hand", 1, 20),
        ("head", "Head", 1, 30), ("neck", "Neck", 1, 40),
        ("shoulders", "Shoulders", 1, 50), ("back", "Back", 1, 60),
        ("chest", "Chest", 1, 70), ("body", "Body (legacy)", 1, 75),
        ("wrists", "Wrists", 1, 80), ("hands", "Hands", 1, 90),
        ("waist", "Waist", 1, 100), ("legs", "Legs", 1, 110),
        ("feet", "Feet", 1, 120), ("finger", "Finger", 2, 130),
        ("trinket", "Trinket", 2, 140),
    ];
    for (id, name, capacity, sort_order) in slots {
        let id = id.to_string();
        if ctx.db.equipment_slot_definition().id().find(&id).is_none() {
            ctx.db.equipment_slot_definition().insert(EquipmentSlotDefinition {
                id, name: name.to_string(), capacity, sort_order,
                created_at: ctx.timestamp, updated_at: ctx.timestamp,
            });
        }
    }

    let abilities = [
        AbilityDefinition {
            id: "strike".to_string(), name: "Strike".to_string(), description: "A committed physical blow.".to_string(),
            icon: "⚔️".to_string(), school: "physical".to_string(), effect_type: "damage".to_string(), target_type: "enemy".to_string(),
            resource_stat_id: Some("energy".to_string()), resource_cost: 25, cooldown_ms: 3000, cast_time_ms: 0,
            power_min: 4, power_max: 7, scales_with_stat: Some("strength".to_string()), scaling_percent: 100,
            effect_stat_id: Some("health".to_string()), mitigation_type: "armor".to_string(), required_level: 1, auto_learn: true, enabled: true,
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
        },
        AbilityDefinition {
            id: "firebolt".to_string(), name: "Firebolt".to_string(), description: "Hurl a bolt of fire at an enemy.".to_string(),
            icon: "🔥".to_string(), school: "fire".to_string(), effect_type: "damage".to_string(), target_type: "enemy".to_string(),
            resource_stat_id: Some("mana".to_string()), resource_cost: 12, cooldown_ms: 2500, cast_time_ms: 1000,
            power_min: 7, power_max: 11, scales_with_stat: None, scaling_percent: 0,
            effect_stat_id: Some("health".to_string()), mitigation_type: "none".to_string(), required_level: 2, auto_learn: true, enabled: true,
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
        },
        AbilityDefinition {
            id: "mend".to_string(), name: "Mend".to_string(), description: "Restore your own vitality.".to_string(),
            icon: "✨".to_string(), school: "restoration".to_string(), effect_type: "heal".to_string(), target_type: "self".to_string(),
            resource_stat_id: Some("mana".to_string()), resource_cost: 10, cooldown_ms: 6000, cast_time_ms: 1500,
            power_min: 6, power_max: 10, scales_with_stat: None, scaling_percent: 0,
            effect_stat_id: Some("health".to_string()), mitigation_type: "none".to_string(), required_level: 3, auto_learn: true, enabled: true,
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
        },
    ];
    for ability in abilities {
        if ctx.db.ability_definition().id().find(&ability.id).is_none() {
            ctx.db.ability_definition().insert(ability);
        }
    }

    let watch_id = "settlement-watch".to_string();
    if ctx.db.faction_definition().id().find(&watch_id).is_none() {
        ctx.db.faction_definition().insert(FactionDefinition {
            id: watch_id,
            name: "Settlement Watch".to_string(),
            description: "Guards and civic officials who keep the peace in settled regions.".to_string(),
            starting_reputation: 0,
            minimum_reputation: -3000,
            maximum_reputation: 3000,
            hostile_threshold: -1000,
            friendly_threshold: 1000,
            attack_penalty: -100,
            kill_penalty: -500,
            created_at: ctx.timestamp,
            updated_at: ctx.timestamp,
        });
    }
}

fn seed_lifecycle_definitions(ctx: &ReducerContext) {
    let config_id = "world".to_string();
    if ctx.db.world_lifecycle_config().id().find(&config_id).is_some() { return; }
    let starter_point_id = "starter-town-square".to_string();
    if ctx.db.spawn_point().id().find(&starter_point_id).is_none()
        && ctx.db.room().id().find(&STARTING_ROOM_ID.to_string()).is_some() {
        ctx.db.spawn_point().insert(SpawnPoint {
            id: starter_point_id.clone(),
            name: "Town Square".to_string(),
            description: "Default arrival and recovery point for new worlds.".to_string(),
            room_id: STARTING_ROOM_ID.to_string(),
            allows_initial_spawn: true,
            allows_respawn: true,
            active: true,
            priority: 100,
            created_at: ctx.timestamp,
            updated_at: ctx.timestamp,
        });
    }
    ctx.db.world_lifecycle_config().insert(WorldLifecycleConfig {
        id: config_id,
        initial_spawn_policy: "fixed".to_string(),
        fixed_initial_spawn_point_id: Some(starter_point_id.clone()),
        respawn_policy: "nearest".to_string(),
        fixed_respawn_point_id: Some(starter_point_id),
        death_mode: "respawn".to_string(),
        respawn_delay_seconds: 0,
        inventory_loss_mode: "keep".to_string(),
        inventory_loss_percent: 0,
        include_equipped_in_loss: false,
        gold_loss_percent: 0,
        experience_loss_percent: 0,
        respawn_health_percent: 100,
        respawn_resource_percent: 100,
        spawn_protection_seconds: 0,
        reset_quests_on_death: false,
        clear_wanted_on_respawn: false,
        created_at: ctx.timestamp,
        updated_at: ctx.timestamp,
    });
}

fn seed_world(ctx: &ReducerContext) {
    seed_rpg_definitions(ctx);
    let arkyv_region = "arkyv".to_string();
    let creation_region = "character-creation".to_string();
    let starting_region = "starting-zone".to_string();
    let creation_room_id = CREATION_ROOM_ID.to_string();
    let starting_room_id = STARTING_ROOM_ID.to_string();
    if ctx.db.region().name().find(&arkyv_region).is_none() {
        ctx.db.region().insert(Region {
            name: "arkyv".to_string(),
            display_name: Some("Arkyv".to_string()),
            description: Some("A liminal space where new personas are instantiated and prepared for their journey.".to_string()),
            created_at: ctx.timestamp,
            updated_at: ctx.timestamp,
            color_scheme: r##"{"accent":"rgba(137, 207, 240, 0.14)","fontColor":"#e0f2fe","borderColor":"#89CFF0"}"##.to_string(),
            pvp_enabled: false,
            respawn_room_id: Some(CREATION_ROOM_ID.to_string()),
        });
    }
    if ctx.db.region().name().find(&creation_region).is_none() {
        ctx.db.region().insert(Region {
            name: "character-creation".to_string(),
            display_name: Some("Character Creation".to_string()),
            description: Some("The chamber where saved-world identities manage their characters.".to_string()),
            created_at: ctx.timestamp,
            updated_at: ctx.timestamp,
            color_scheme: r##"{"accent":"rgba(137, 207, 240, 0.14)","fontColor":"#e0f2fe","borderColor":"#89CFF0"}"##.to_string(),
            pvp_enabled: false,
            respawn_room_id: Some(CREATION_ROOM_ID.to_string()),
        });
    }
    if ctx.db.region().name().find(&starting_region).is_none() {
        ctx.db.region().insert(Region {
            name: "starting-zone".to_string(),
            display_name: Some("Whispering Woods".to_string()),
            description: Some("A welcoming area where new adventurers begin their journey.".to_string()),
            created_at: ctx.timestamp,
            updated_at: ctx.timestamp,
            color_scheme: r##"{"accent":"rgba(34, 197, 94, 0.14)","fontColor":"#dcfce7","borderColor":"#22c55e"}"##.to_string(),
            pvp_enabled: false,
            respawn_room_id: Some(STARTING_ROOM_ID.to_string()),
        });
    }
    if ctx.db.room().id().find(&creation_room_id).is_none() {
        ctx.db.room().insert(Room {
            id: CREATION_ROOM_ID.to_string(),
            name: "Character Creation Chamber".to_string(),
            description: "Soft cyan light bathes the minimalist chamber. Holographic interfaces flicker along the walls, ready to instantiate new personas.".to_string(),
            region: "Character Creation".to_string(),
            region_name: Some("character-creation".to_string()),
            height: 0,
            image_url: Some("/starter-images/character-creation-chamber.png".to_string()),
        });
    }
    if ctx.db.room().id().find(&starting_room_id).is_none() {
        ctx.db.room().insert(Room {
            id: STARTING_ROOM_ID.to_string(),
            name: "Town Square".to_string(),
            description: "A bustling town square paved with smooth cobblestones. Market stalls line the edges and several paths branch into the world.".to_string(),
            region: "Starting Zone".to_string(),
            region_name: Some("starting-zone".to_string()),
            height: 0,
            image_url: Some("/starter-images/town-square.png".to_string()),
        });
    }
    const ARCHIE_ID: &str = "b8c640a0-7fdc-43d3-948d-69d8e2da8a48";
    let archie_id = ARCHIE_ID.to_string();
    if ctx.db.npc().id().find(&archie_id).is_none() {
        ctx.db.npc().insert(Npc {
            id: ARCHIE_ID.to_string(),
            name: "Archie the Archivist".to_string(),
            description: Some("A sleek humanoid welcome robot with a polished chrome chassis and glowing azure circuits.".to_string()),
            current_room: Some(CREATION_ROOM_ID.to_string()),
            dialogue_tree: Some(r#"{"personality":"You are Archie the Archivist, a welcoming guide. Speak with warm, measured optimism and keep responses under 50 words."}"#.to_string()),
            faction: None,
            behavior_type: "static".to_string(),
            created_at: ctx.timestamp,
            alias: Some("archie".to_string()),
            greeting_behavior: "public".to_string(),
            portrait_url: Some("/starter-images/archie-portrait.png".to_string()),
            disposition: Some("friendly".to_string()),
            attack_on_sight: false,
            patrol_route: Some("[]".to_string()),
            patrol_interval_seconds: 20,
            patrol_index: 0,
            last_patrol_at: None,
            attack_interval_seconds: 6,
            last_attack_at: None,
            respawn_seconds: 60,
            spawn_room: Some(CREATION_ROOM_ID.to_string()),
            defeated_at: None,
            xp_reward: 0,
            is_guard: false,
            guard_greeting: None,
            protect_players: true,
            protect_faction_members: true,
            guard_wanted_seconds: 120,
        });
    }
    seed_lifecycle_definitions(ctx);
}

#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    seed_world(ctx);
}

#[reducer(client_connected)]
pub fn client_connected(ctx: &ReducerContext) {
    // Existing databases do not rerun `init` after a compatible schema publish.
    // Seed the new progression layer once, without resurrecting starter content
    // that an administrator deliberately removes later.
    if ctx.db.progression_config().iter().next().is_none() {
        seed_rpg_definitions(ctx);
    }
    seed_lifecycle_definitions(ctx);
    ensure_profile(ctx);
}

#[reducer]
pub fn install_rpg_starter_kit(ctx: &ReducerContext) -> Result<(), String> {
    ensure_profile(ctx);
    require_admin(ctx)?;
    seed_rpg_definitions(ctx);
    Ok(())
}

#[reducer]
pub fn insert_rows(ctx: &ReducerContext, table_name: String, payload_json: String) -> Result<(), String> {
    ensure_profile(ctx);
    let rows = parse_rows(&payload_json)?;

    match table_name.as_str() {
        "profiles" => {
            if profile_for(ctx, ctx.sender()).is_none() {
                ensure_profile(ctx);
            }
        }
        "characters" => {
            for row in rows {
                let id = string(&row, "id", "");
                let name = string(&row, "name", "").trim().to_string();
                if id.is_empty() || name.len() < 3 {
                    return Err("Character id and a name of at least 3 characters are required.".to_string());
                }
                if ctx.db.character().iter().any(|existing| existing.name.eq_ignore_ascii_case(&name)) {
                    return Err("23505: character name already exists".to_string());
                }
                let user_id = identity_id(ctx.sender());
                let initial_room = choose_initial_spawn(ctx, &id)
                    .map(|point| point.room_id)
                    .or_else(|| optional_string(&row, "current_room"))
                    .filter(|room_id| ctx.db.room().id().find(room_id).is_some())
                    .or_else(|| Some(STARTING_ROOM_ID.to_string()).filter(|room_id| ctx.db.room().id().find(room_id).is_some()));
                ctx.db.character().insert(Character {
                    id: id.clone(),
                    owner: ctx.sender(),
                    user_id,
                    name,
                    current_room: initial_room,
                    created_at: ctx.timestamp,
                    description: optional_string(&row, "description"),
                });
                ensure_actor_progression(ctx, &id);
                ensure_actor_life_state(ctx, &id);
            }
        }
        "regions" => {
            require_admin(ctx)?;
            for row in rows {
                let name = string(&row, "name", "");
                if name.is_empty() || ctx.db.region().name().find(&name).is_some() {
                    return Err("Region name is missing or already exists.".to_string());
                }
                ctx.db.region().insert(Region {
                    name,
                    display_name: optional_string(&row, "display_name"),
                    description: optional_string(&row, "description"),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                    color_scheme: json_string(row.get("color_scheme"), r##"{"accent":"rgba(56, 189, 248, 0.14)","fontColor":"#e0f2fe","borderColor":"#38bdf8"}"##),
                    pvp_enabled: bool_value(&row, "pvp_enabled", false),
                    respawn_room_id: optional_string(&row, "respawn_room_id"),
                });
            }
        }
        "stat_definitions" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", "")));
                if id.is_empty() || ctx.db.stat_definition().id().find(&id).is_some() {
                    return Err("Stat id is missing or already exists.".to_string());
                }
                let minimum = i32_value(&row, "minimum", 0);
                let maximum = i32_value(&row, "maximum", 100).max(minimum);
                let default_value = i32_value(&row, "default_value", minimum).clamp(minimum, maximum);
                ctx.db.stat_definition().insert(StatDefinition {
                    id,
                    name: string(&row, "name", "Untitled Stat"),
                    description: string(&row, "description", ""),
                    role: optional_string(&row, "role").filter(|role| !role.trim().is_empty()),
                    minimum,
                    maximum,
                    default_value,
                    visible: bool_value(&row, "visible", true),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                    per_level_gain: i32_value(&row, "per_level_gain", 0),
                    regeneration_per_second: i32_value(&row, "regeneration_per_second", 0).max(0),
                    player_allocatable: bool_value(&row, "player_allocatable", true),
                    point_cost: u32_value(&row, "point_cost", 1).max(1),
                    points_per_rank: i32_value(&row, "points_per_rank", 1).max(1),
                });
            }
        }
        "object_definitions" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", "")));
                if id.is_empty() || ctx.db.object_definition().id().find(&id).is_some() {
                    return Err("Object definition id is missing or already exists.".to_string());
                }
                ctx.db.object_definition().insert(ObjectDefinition {
                    id,
                    name: string(&row, "name", "Untitled Object"),
                    description: string(&row, "description", ""),
                    primitive_kind: string(&row, "primitive_kind", "item"),
                    icon: string(&row, "icon", "◇"),
                    image_url: optional_string(&row, "image_url"),
                    tags: json_string(row.get("tags"), "[]"),
                    portable: bool_value(&row, "portable", true),
                    stackable: bool_value(&row, "stackable", false),
                    max_stack: u32_value(&row, "max_stack", 1).max(1),
                    capacity: u32_value(&row, "capacity", 0),
                    equipment_slot: optional_string(&row, "equipment_slot").filter(|slot| !slot.trim().is_empty()),
                    weapon_damage: i32_value(&row, "weapon_damage", 0).max(0),
                    armor_value: i32_value(&row, "armor_value", 0).max(0),
                    scales_with_stat: optional_string(&row, "scales_with_stat").filter(|stat| !stat.trim().is_empty()),
                    fuel_value: i32_value(&row, "fuel_value", 0).max(0),
                    burn_rate: i32_value(&row, "burn_rate", 0).max(0),
                    accepted_fuel_tags: json_string(row.get("accepted_fuel_tags"), "[]"),
                    stat_modifiers: json_string(row.get("stat_modifiers"), "{}"),
                    on_use: json_string(row.get("on_use"), "{}"),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                    attack_cooldown_ms: u32_value(&row, "attack_cooldown_ms", 2000),
                    inventory_slots_bonus: u32_value(&row, "inventory_slots_bonus", 0),
                });
            }
        }
        "progression_configs" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", "world");
                if id.is_empty() || ctx.db.progression_config().id().find(&id).is_some() {
                    return Err("Progression config id is missing or already exists.".to_string());
                }
                ctx.db.progression_config().insert(ProgressionConfig {
                    id,
                    max_level: u32_value(&row, "max_level", 60).max(1),
                    base_xp: u32_value(&row, "base_xp", 100).max(1),
                    growth_percent: u32_value(&row, "growth_percent", 15),
                    base_inventory_slots: u32_value(&row, "base_inventory_slots", 20),
                    inventory_slots_per_level: u32_value(&row, "inventory_slots_per_level", 1),
                    stat_points_per_level: u32_value(&row, "stat_points_per_level", 0),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                });
            }
        }
        "equipment_slot_definitions" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", "")));
                if id.is_empty() || ctx.db.equipment_slot_definition().id().find(&id).is_some() {
                    return Err("Equipment slot id is missing or already exists.".to_string());
                }
                ctx.db.equipment_slot_definition().insert(EquipmentSlotDefinition {
                    id,
                    name: string(&row, "name", "Untitled slot"),
                    capacity: u32_value(&row, "capacity", 1).max(1),
                    sort_order: u32_value(&row, "sort_order", 100),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                });
            }
        }
        "ability_definitions" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", "")));
                if id.is_empty() || ctx.db.ability_definition().id().find(&id).is_some() {
                    return Err("Ability id is missing or already exists.".to_string());
                }
                let effect_type = string(&row, "effect_type", "damage").to_lowercase();
                let target_type = string(&row, "target_type", "enemy").to_lowercase();
                let mitigation_type = string(&row, "mitigation_type", "none").to_lowercase();
                if !matches!(effect_type.as_str(), "damage" | "heal" | "restore") {
                    return Err("Ability effect must be damage, heal, or restore.".to_string());
                }
                if !matches!(target_type.as_str(), "enemy" | "self" | "ally") {
                    return Err("Ability target must be enemy, self, or ally.".to_string());
                }
                if !matches!(mitigation_type.as_str(), "none" | "armor") {
                    return Err("Ability mitigation must be none or armor.".to_string());
                }
                let power_min = i32_value(&row, "power_min", 1).max(0);
                let power_max = i32_value(&row, "power_max", power_min).max(power_min);
                for stat_id in [optional_string(&row, "resource_stat_id"), optional_string(&row, "scales_with_stat"), optional_string(&row, "effect_stat_id")].into_iter().flatten().filter(|value| !value.trim().is_empty()) {
                    if ctx.db.stat_definition().id().find(&stat_id).is_none() {
                        return Err(format!("Ability references missing stat: {stat_id}"));
                    }
                }
                ctx.db.ability_definition().insert(AbilityDefinition {
                    id,
                    name: string(&row, "name", "Untitled ability"),
                    description: string(&row, "description", ""),
                    icon: string(&row, "icon", "✦"),
                    school: string(&row, "school", "untyped"),
                    effect_type,
                    target_type,
                    resource_stat_id: optional_string(&row, "resource_stat_id").filter(|value| !value.trim().is_empty()),
                    resource_cost: i32_value(&row, "resource_cost", 0).max(0),
                    cooldown_ms: u32_value(&row, "cooldown_ms", 0),
                    cast_time_ms: u32_value(&row, "cast_time_ms", 0),
                    power_min,
                    power_max,
                    scales_with_stat: optional_string(&row, "scales_with_stat").filter(|value| !value.trim().is_empty()),
                    scaling_percent: i32_value(&row, "scaling_percent", 0).max(0),
                    effect_stat_id: optional_string(&row, "effect_stat_id").filter(|value| !value.trim().is_empty()),
                    mitigation_type,
                    required_level: u32_value(&row, "required_level", 1).max(1),
                    auto_learn: bool_value(&row, "auto_learn", true),
                    enabled: bool_value(&row, "enabled", true),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                });
            }
        }
        "actor_abilities" => {
            require_admin(ctx)?;
            for row in rows {
                let actor_id = string(&row, "actor_id", "");
                let ability_id = string(&row, "ability_id", "");
                if !actor_exists(ctx, &actor_id) || ctx.db.ability_definition().id().find(&ability_id).is_none() {
                    return Err("Ability grants require an existing actor and ability.".to_string());
                }
                let id = format!("{actor_id}::{ability_id}");
                if ctx.db.actor_ability().id().find(&id).is_some() {
                    return Err("That actor already has this ability grant.".to_string());
                }
                ctx.db.actor_ability().insert(ActorAbility { id, actor_id, ability_id, granted_at: ctx.timestamp });
            }
        }
        "actor_progressions" => {
            require_admin(ctx)?;
            for row in rows {
                let actor_id = string(&row, "actor_id", "");
                if !actor_exists(ctx, &actor_id) || ctx.db.actor_progression().id().find(&actor_id).is_some() {
                    return Err("Progression requires an existing actor without a progression row.".to_string());
                }
                let config = world_progression_config(ctx);
                ctx.db.actor_progression().insert(ActorProgression {
                    id: actor_id.clone(), actor_id,
                    level: u32_value(&row, "level", 1).clamp(1, config.max_level.max(1)),
                    experience: u32_value(&row, "experience", 0),
                    unspent_stat_points: u32_value(&row, "unspent_stat_points", 0),
                    updated_at: ctx.timestamp,
                });
            }
        }
        "faction_definitions" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", "")));
                if id.is_empty() || ctx.db.faction_definition().id().find(&id).is_some() {
                    return Err("Faction id is missing or already exists.".to_string());
                }
                let minimum_reputation = i32_value(&row, "minimum_reputation", -3000);
                let maximum_reputation = i32_value(&row, "maximum_reputation", 3000).max(minimum_reputation);
                let hostile_threshold = i32_value(&row, "hostile_threshold", -1000).clamp(minimum_reputation, maximum_reputation);
                ctx.db.faction_definition().insert(FactionDefinition {
                    id,
                    name: string(&row, "name", "Untitled faction"),
                    description: string(&row, "description", ""),
                    starting_reputation: i32_value(&row, "starting_reputation", 0).clamp(minimum_reputation, maximum_reputation),
                    minimum_reputation,
                    maximum_reputation,
                    hostile_threshold,
                    friendly_threshold: i32_value(&row, "friendly_threshold", 1000).clamp(hostile_threshold, maximum_reputation),
                    attack_penalty: i32_value(&row, "attack_penalty", -100).min(0),
                    kill_penalty: i32_value(&row, "kill_penalty", -500).min(0),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                });
            }
        }
        "actor_faction_reputations" => {
            require_admin(ctx)?;
            for row in rows {
                let actor_id = string(&row, "actor_id", "");
                let faction_id = string(&row, "faction_id", "");
                let faction = ctx.db.faction_definition().id().find(&faction_id).ok_or_else(|| "Faction does not exist.".to_string())?;
                if !actor_exists(ctx, &actor_id) { return Err("Actor does not exist.".to_string()); }
                let id = format!("{actor_id}::{faction_id}");
                if ctx.db.actor_faction_reputation().id().find(&id).is_some() { return Err("That actor already has a reputation row for this faction.".to_string()); }
                ctx.db.actor_faction_reputation().insert(ActorFactionReputation {
                    id, actor_id, faction_id,
                    reputation: i32_value(&row, "reputation", faction.starting_reputation).clamp(faction.minimum_reputation, faction.maximum_reputation),
                    updated_at: ctx.timestamp,
                });
            }
        }
        "quest_definitions" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "title", "")));
                let quest_giver_npc_id = string(&row, "quest_giver_npc_id", "");
                let turn_in_npc_id = string(&row, "turn_in_npc_id", &quest_giver_npc_id);
                if id.is_empty() || ctx.db.quest_definition().id().find(&id).is_some() { return Err("Quest id is missing or already exists.".to_string()); }
                if ctx.db.npc().id().find(&quest_giver_npc_id).is_none() || ctx.db.npc().id().find(&turn_in_npc_id).is_none() {
                    return Err("Quest giver and turn-in NPC must exist.".to_string());
                }
                for faction_id in [optional_string(&row, "required_faction_id"), optional_string(&row, "reputation_faction_id")].into_iter().flatten().filter(|value| !value.trim().is_empty()) {
                    if ctx.db.faction_definition().id().find(&faction_id).is_none() { return Err(format!("Quest references missing faction: {faction_id}")); }
                }
                ctx.db.quest_definition().insert(QuestDefinition {
                    id,
                    title: string(&row, "title", "Untitled quest"),
                    description: string(&row, "description", ""),
                    quest_giver_npc_id,
                    turn_in_npc_id,
                    required_level: u32_value(&row, "required_level", 1).max(1),
                    required_faction_id: optional_string(&row, "required_faction_id").filter(|value| !value.trim().is_empty()),
                    required_reputation: i32_value(&row, "required_reputation", 0),
                    repeatable: bool_value(&row, "repeatable", false),
                    active: bool_value(&row, "active", true),
                    xp_reward: u32_value(&row, "xp_reward", 0),
                    gold_reward: i32_value(&row, "gold_reward", 0).max(0),
                    reputation_faction_id: optional_string(&row, "reputation_faction_id").filter(|value| !value.trim().is_empty()),
                    reputation_reward: i32_value(&row, "reputation_reward", 0),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                });
            }
        }
        "quest_objectives" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", "");
                let quest_id = string(&row, "quest_id", "");
                let objective_type = string(&row, "objective_type", "explore_room").to_lowercase();
                let target_id = string(&row, "target_id", "");
                if id.is_empty() || ctx.db.quest_objective().id().find(&id).is_some() { return Err("Quest objective id is missing or already exists.".to_string()); }
                if ctx.db.quest_definition().id().find(&quest_id).is_none() { return Err("Quest does not exist.".to_string()); }
                let target_exists = match objective_type.as_str() {
                    "explore_room" => ctx.db.room().id().find(&target_id).is_some(),
                    "acquire_item" => ctx.db.object_definition().id().find(&target_id).is_some(),
                    "kill_npc" | "talk_npc" => ctx.db.npc().id().find(&target_id).is_some(),
                    "kill_faction" => ctx.db.faction_definition().id().find(&target_id).is_some(),
                    _ => return Err("Objective type must be explore_room, acquire_item, kill_npc, kill_faction, or talk_npc.".to_string()),
                };
                if !target_exists { return Err("Quest objective target does not exist.".to_string()); }
                ctx.db.quest_objective().insert(QuestObjective {
                    id, quest_id, objective_type, target_id,
                    description: string(&row, "description", ""),
                    required_count: u32_value(&row, "required_count", 1).max(1),
                    sort_order: u32_value(&row, "sort_order", 100),
                    consume_on_turn_in: bool_value(&row, "consume_on_turn_in", false),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                });
            }
        }
        "quest_item_rewards" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", "");
                let quest_id = string(&row, "quest_id", "");
                let definition_id = string(&row, "definition_id", "");
                if id.is_empty() || ctx.db.quest_item_reward().id().find(&id).is_some() { return Err("Quest item reward id is missing or already exists.".to_string()); }
                if ctx.db.quest_definition().id().find(&quest_id).is_none() || ctx.db.object_definition().id().find(&definition_id).is_none() {
                    return Err("Quest reward requires an existing quest and object definition.".to_string());
                }
                ctx.db.quest_item_reward().insert(QuestItemReward {
                    id, quest_id, definition_id,
                    quantity: u32_value(&row, "quantity", 1).max(1),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                });
            }
        }
        "actor_wallets" => {
            require_admin(ctx)?;
            for row in rows {
                let actor_id = string(&row, "actor_id", "");
                if !actor_exists(ctx, &actor_id) || ctx.db.actor_wallet().id().find(&actor_id).is_some() { return Err("Wallet requires an existing actor without a wallet.".to_string()); }
                ctx.db.actor_wallet().insert(ActorWallet { id: actor_id.clone(), actor_id, gold: i32_value(&row, "gold", 0).max(0), updated_at: ctx.timestamp });
            }
        }
        "spawn_points" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", "")));
                let room_id = string(&row, "room_id", "");
                if id.is_empty() || ctx.db.spawn_point().id().find(&id).is_some() { return Err("Spawn point id is missing or already exists.".to_string()); }
                if ctx.db.room().id().find(&room_id).is_none() { return Err("Spawn point room does not exist.".to_string()); }
                ctx.db.spawn_point().insert(SpawnPoint {
                    id,
                    name: string(&row, "name", "Untitled spawn point"),
                    description: string(&row, "description", ""),
                    room_id,
                    allows_initial_spawn: bool_value(&row, "allows_initial_spawn", false),
                    allows_respawn: bool_value(&row, "allows_respawn", true),
                    active: bool_value(&row, "active", true),
                    priority: i32_value(&row, "priority", 0),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                });
            }
        }
        "world_lifecycle_configs" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", "world");
                if ctx.db.world_lifecycle_config().id().find(&id).is_some() { return Err("A lifecycle configuration with that id already exists.".to_string()); }
                let initial_spawn_policy = string(&row, "initial_spawn_policy", "fixed");
                let respawn_policy = string(&row, "respawn_policy", "nearest");
                let death_mode = string(&row, "death_mode", "respawn");
                let inventory_loss_mode = string(&row, "inventory_loss_mode", "keep");
                validate_lifecycle_policy_values(&initial_spawn_policy, &respawn_policy, &death_mode, &inventory_loss_mode)?;
                let fixed_initial_spawn_point_id = optional_string(&row, "fixed_initial_spawn_point_id").filter(|value| !value.trim().is_empty());
                let fixed_respawn_point_id = optional_string(&row, "fixed_respawn_point_id").filter(|value| !value.trim().is_empty());
                for spawn_point_id in [fixed_initial_spawn_point_id.as_ref(), fixed_respawn_point_id.as_ref()].into_iter().flatten() {
                    if ctx.db.spawn_point().id().find(spawn_point_id).is_none() { return Err(format!("Lifecycle configuration references missing spawn point: {spawn_point_id}")); }
                }
                ctx.db.world_lifecycle_config().insert(WorldLifecycleConfig {
                    id,
                    initial_spawn_policy,
                    fixed_initial_spawn_point_id,
                    respawn_policy,
                    fixed_respawn_point_id,
                    death_mode,
                    respawn_delay_seconds: u32_value(&row, "respawn_delay_seconds", 0),
                    inventory_loss_mode,
                    inventory_loss_percent: u32_value(&row, "inventory_loss_percent", 0).min(100),
                    include_equipped_in_loss: bool_value(&row, "include_equipped_in_loss", false),
                    gold_loss_percent: u32_value(&row, "gold_loss_percent", 0).min(100),
                    experience_loss_percent: u32_value(&row, "experience_loss_percent", 0).min(100),
                    respawn_health_percent: u32_value(&row, "respawn_health_percent", 100).clamp(1, 100),
                    respawn_resource_percent: u32_value(&row, "respawn_resource_percent", 100).min(100),
                    spawn_protection_seconds: u32_value(&row, "spawn_protection_seconds", 0),
                    reset_quests_on_death: bool_value(&row, "reset_quests_on_death", false),
                    clear_wanted_on_respawn: bool_value(&row, "clear_wanted_on_respawn", false),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                });
            }
        }
        "world_objects" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", "");
                let definition_id = string(&row, "definition_id", "");
                let location_kind = string(&row, "location_kind", "room");
                let location_id = string(&row, "location_id", "");
                if id.is_empty() || ctx.db.world_object().id().find(&id).is_some() {
                    return Err("World object id is missing or already exists.".to_string());
                }
                if ctx.db.object_definition().id().find(&definition_id).is_none() {
                    return Err("World object definition does not exist.".to_string());
                }
                if !matches!(location_kind.as_str(), "room" | "inventory" | "equipped" | "container") {
                    return Err("Object location must be room, inventory, equipped, or container.".to_string());
                }
                if location_id.is_empty() {
                    return Err("World objects require a location.".to_string());
                }
                ctx.db.world_object().insert(WorldObject {
                    id,
                    definition_id,
                    location_kind,
                    location_id,
                    quantity: u32_value(&row, "quantity", 1).max(1),
                    equipped_slot: optional_string(&row, "equipped_slot").filter(|slot| !slot.trim().is_empty()),
                    durability: i32_value(&row, "durability", 100).max(0),
                    fuel_remaining: i32_value(&row, "fuel_remaining", 0).max(0),
                    is_active: bool_value(&row, "is_active", false),
                    state_json: json_string(row.get("state_json"), "{}"),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                });
            }
        }
        "actor_stats" => {
            require_admin(ctx)?;
            for row in rows {
                let actor_id = string(&row, "actor_id", "");
                let stat_definition_id = string(&row, "stat_definition_id", "");
                let id = actor_stat_id(&actor_id, &stat_definition_id);
                let definition = ctx.db.stat_definition().id().find(&stat_definition_id)
                    .ok_or_else(|| "Stat definition does not exist.".to_string())?;
                if !actor_exists(ctx, &actor_id) {
                    return Err("Actor does not exist.".to_string());
                }
                if ctx.db.actor_stat().id().find(&id).is_some() {
                    return Err("That actor already has this stat override.".to_string());
                }
                let base_value = i32_value(&row, "base_value", definition.default_value).clamp(definition.minimum, definition.maximum);
                let current_value = i32_value(&row, "current_value", base_value).clamp(definition.minimum, definition.maximum);
                ctx.db.actor_stat().insert(ActorStat {
                    id, actor_id, stat_definition_id, base_value, current_value,
                    invested_points: u32_value(&row, "invested_points", 0),
                    updated_at: ctx.timestamp,
                });
            }
        }
        "loot_table_entries" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", "");
                let npc_id = string(&row, "npc_id", "");
                let definition_id = string(&row, "definition_id", "");
                if id.is_empty() || ctx.db.loot_table_entry().id().find(&id).is_some() {
                    return Err("Loot entry id is missing or already exists.".to_string());
                }
                if ctx.db.npc().id().find(&npc_id).is_none() {
                    return Err("Loot entry NPC does not exist.".to_string());
                }
                if ctx.db.object_definition().id().find(&definition_id).is_none() {
                    return Err("Loot entry object definition does not exist.".to_string());
                }
                let minimum_quantity = u32_value(&row, "minimum_quantity", 1).max(1);
                let maximum_quantity = u32_value(&row, "maximum_quantity", minimum_quantity).max(minimum_quantity);
                ctx.db.loot_table_entry().insert(LootTableEntry {
                    id,
                    npc_id,
                    definition_id,
                    minimum_quantity,
                    maximum_quantity,
                    chance_percent: u32_value(&row, "chance_percent", 100).min(100),
                    created_at: ctx.timestamp,
                    updated_at: ctx.timestamp,
                });
            }
        }
        "rooms" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", "");
                if id.is_empty() || ctx.db.room().id().find(&id).is_some() {
                    return Err("Room id is missing or already exists.".to_string());
                }
                ctx.db.room().insert(Room {
                    id,
                    name: string(&row, "name", "Untitled Room"),
                    description: string(&row, "description", ""),
                    region: string(&row, "region", "Unknown"),
                    region_name: optional_string(&row, "region_name"),
                    height: i32_value(&row, "height", 0),
                    image_url: optional_string(&row, "image_url"),
                });
            }
        }
        "npcs" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", "");
                if id.is_empty() || ctx.db.npc().id().find(&id).is_some() {
                    return Err("NPC id is missing or already exists.".to_string());
                }
                let faction = optional_string(&row, "faction").filter(|value| !value.trim().is_empty());
                if faction.as_ref().map(|faction_id| ctx.db.faction_definition().id().find(faction_id).is_none()).unwrap_or(false) {
                    return Err("NPC faction does not exist.".to_string());
                }
                ctx.db.npc().insert(Npc {
                    id,
                    name: string(&row, "name", "Unnamed NPC"),
                    description: optional_string(&row, "description"),
                    current_room: optional_string(&row, "current_room"),
                    dialogue_tree: row.get("dialogue_tree").filter(|value| !value.is_null()).map(|value| json_string(Some(value), "{}")),
                    faction,
                    behavior_type: string(&row, "behavior_type", "static"),
                    created_at: ctx.timestamp,
                    alias: optional_string(&row, "alias"),
                    greeting_behavior: string(&row, "greeting_behavior", "none"),
                    portrait_url: optional_string(&row, "portrait_url"),
                    disposition: Some(string(&row, "disposition", "neutral")),
                    attack_on_sight: bool_value(&row, "attack_on_sight", false),
                    patrol_route: Some(json_string(row.get("patrol_route"), "[]")),
                    patrol_interval_seconds: u32_value(&row, "patrol_interval_seconds", 20).max(1),
                    patrol_index: 0,
                    last_patrol_at: None,
                    attack_interval_seconds: u32_value(&row, "attack_interval_seconds", 6).max(1),
                    last_attack_at: None,
                    respawn_seconds: u32_value(&row, "respawn_seconds", 60),
                    spawn_room: optional_string(&row, "spawn_room").or_else(|| optional_string(&row, "current_room")),
                    defeated_at: None,
                    xp_reward: u32_value(&row, "xp_reward", 25),
                    is_guard: bool_value(&row, "is_guard", false),
                    guard_greeting: optional_string(&row, "guard_greeting"),
                    protect_players: bool_value(&row, "protect_players", true),
                    protect_faction_members: bool_value(&row, "protect_faction_members", true),
                    guard_wanted_seconds: u32_value(&row, "guard_wanted_seconds", 120),
                });
            }
        }
        "exits" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", "");
                if id.is_empty() || ctx.db.exit().id().find(&id).is_some() {
                    return Err("Exit id is missing or already exists.".to_string());
                }
                ctx.db.exit().insert(Exit {
                    id,
                    from_room: optional_string(&row, "from_room"),
                    to_room: optional_string(&row, "to_room"),
                    verb: string(&row, "verb", ""),
                });
            }
        }
        "region_chats" => return Err("Chat messages must use the submit_command reducer.".to_string()),
        "commands" => return Err("Commands must use the submit_command reducer.".to_string()),
        _ => return Err(format!("Unsupported insert table: {table_name}")),
    }
    Ok(())
}

#[reducer]
pub fn update_rows(
    ctx: &ReducerContext,
    table_name: String,
    ids_json: String,
    payload_json: String,
) -> Result<(), String> {
    ensure_profile(ctx);
    let ids = parse_ids(&ids_json)?;
    let payload: Value = serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;

    match table_name.as_str() {
        "profiles" => {
            for id in ids {
                let Some(existing) = ctx.db.profile().id().find(&id) else { continue };
                if existing.owner != ctx.sender() {
                    return Err("Profiles can only be updated by their owner.".to_string());
                }
                ctx.db.profile().id().update(Profile {
                    handle: payload.get("handle").map(|_| optional_string(&payload, "handle")).unwrap_or(existing.handle),
                    description: payload.get("description").map(|_| optional_string(&payload, "description")).unwrap_or(existing.description),
                    current_room: payload.get("current_room").map(|_| optional_string(&payload, "current_room")).unwrap_or(existing.current_room),
                    name: payload.get("name").map(|_| optional_string(&payload, "name")).unwrap_or(existing.name),
                    membership_tier: payload.get("membership_tier").map(|_| optional_string(&payload, "membership_tier")).unwrap_or(existing.membership_tier),
                    ..existing
                });
            }
        }
        "characters" => {
            for id in ids {
                let Some(existing) = ctx.db.character().id().find(&id) else { continue };
                if existing.owner != ctx.sender() {
                    return Err("Characters can only be updated by their owner.".to_string());
                }
                ctx.db.character().id().update(Character {
                    name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(),
                    current_room: payload.get("current_room").map(|_| optional_string(&payload, "current_room")).unwrap_or(existing.current_room),
                    description: payload.get("description").map(|_| optional_string(&payload, "description")).unwrap_or(existing.description),
                    ..existing
                });
            }
        }
        "regions" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.region().name().find(&id) else { continue };
                let new_name = payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string();
                let updated = Region {
                    name: new_name.clone(),
                    display_name: payload.get("display_name").map(|_| optional_string(&payload, "display_name")).unwrap_or(existing.display_name),
                    description: payload.get("description").map(|_| optional_string(&payload, "description")).unwrap_or(existing.description),
                    created_at: existing.created_at,
                    updated_at: ctx.timestamp,
                    color_scheme: payload.get("color_scheme").map(|value| json_string(Some(value), &existing.color_scheme)).unwrap_or(existing.color_scheme),
                    pvp_enabled: payload.get("pvp_enabled").and_then(Value::as_bool).unwrap_or(existing.pvp_enabled),
                    respawn_room_id: payload.get("respawn_room_id").map(|_| optional_string(&payload, "respawn_room_id")).unwrap_or(existing.respawn_room_id),
                };
                if new_name == id {
                    ctx.db.region().name().update(updated);
                } else {
                    if ctx.db.region().name().find(&new_name).is_some() {
                        return Err("The new region name already exists.".to_string());
                    }
                    ctx.db.region().name().delete(&id);
                    ctx.db.region().insert(updated);
                    let rooms = ctx.db.room().iter().filter(|room| room.region_name.as_deref() == Some(id.as_str())).collect::<Vec<_>>();
                    for room in rooms {
                        ctx.db.room().id().update(Room { region_name: Some(new_name.clone()), ..room });
                    }
                }
            }
        }
        "stat_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.stat_definition().id().find(&id) else { continue };
                let minimum = payload.get("minimum").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.minimum);
                let maximum = payload.get("maximum").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.maximum).max(minimum);
                let default_value = payload.get("default_value").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.default_value).clamp(minimum, maximum);
                ctx.db.stat_definition().id().update(StatDefinition {
                    name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(),
                    description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(),
                    role: payload.get("role").map(|_| optional_string(&payload, "role").filter(|role| !role.trim().is_empty())).unwrap_or(existing.role),
                    minimum,
                    maximum,
                    default_value,
                    visible: payload.get("visible").and_then(Value::as_bool).unwrap_or(existing.visible),
                    per_level_gain: payload.get("per_level_gain").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.per_level_gain),
                    regeneration_per_second: payload.get("regeneration_per_second").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.regeneration_per_second).max(0),
                    player_allocatable: payload.get("player_allocatable").and_then(Value::as_bool).unwrap_or(existing.player_allocatable),
                    point_cost: payload.get("point_cost").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.point_cost).max(1),
                    points_per_rank: payload.get("points_per_rank").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.points_per_rank).max(1),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "object_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.object_definition().id().find(&id) else { continue };
                ctx.db.object_definition().id().update(ObjectDefinition {
                    name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(),
                    description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(),
                    primitive_kind: payload.get("primitive_kind").and_then(Value::as_str).unwrap_or(&existing.primitive_kind).to_string(),
                    icon: payload.get("icon").and_then(Value::as_str).unwrap_or(&existing.icon).to_string(),
                    image_url: payload.get("image_url").map(|_| optional_string(&payload, "image_url")).unwrap_or(existing.image_url),
                    tags: payload.get("tags").map(|value| json_string(Some(value), &existing.tags)).unwrap_or(existing.tags),
                    portable: payload.get("portable").and_then(Value::as_bool).unwrap_or(existing.portable),
                    stackable: payload.get("stackable").and_then(Value::as_bool).unwrap_or(existing.stackable),
                    max_stack: payload.get("max_stack").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.max_stack).max(1),
                    capacity: payload.get("capacity").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.capacity),
                    equipment_slot: payload.get("equipment_slot").map(|_| optional_string(&payload, "equipment_slot").filter(|slot| !slot.trim().is_empty())).unwrap_or(existing.equipment_slot),
                    weapon_damage: payload.get("weapon_damage").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.weapon_damage).max(0),
                    armor_value: payload.get("armor_value").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.armor_value).max(0),
                    scales_with_stat: payload.get("scales_with_stat").map(|_| optional_string(&payload, "scales_with_stat").filter(|stat| !stat.trim().is_empty())).unwrap_or(existing.scales_with_stat),
                    fuel_value: payload.get("fuel_value").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.fuel_value).max(0),
                    burn_rate: payload.get("burn_rate").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.burn_rate).max(0),
                    accepted_fuel_tags: payload.get("accepted_fuel_tags").map(|value| json_string(Some(value), &existing.accepted_fuel_tags)).unwrap_or(existing.accepted_fuel_tags),
                    stat_modifiers: payload.get("stat_modifiers").map(|value| json_string(Some(value), &existing.stat_modifiers)).unwrap_or(existing.stat_modifiers),
                    on_use: payload.get("on_use").map(|value| json_string(Some(value), &existing.on_use)).unwrap_or(existing.on_use),
                    attack_cooldown_ms: payload.get("attack_cooldown_ms").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.attack_cooldown_ms),
                    inventory_slots_bonus: payload.get("inventory_slots_bonus").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.inventory_slots_bonus),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "world_objects" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.world_object().id().find(&id) else { continue };
                let definition_id = payload.get("definition_id").and_then(Value::as_str).unwrap_or(&existing.definition_id).to_string();
                if ctx.db.object_definition().id().find(&definition_id).is_none() {
                    return Err("World object definition does not exist.".to_string());
                }
                let location_kind = payload.get("location_kind").and_then(Value::as_str).unwrap_or(&existing.location_kind).to_string();
                if !matches!(location_kind.as_str(), "room" | "inventory" | "equipped" | "container") {
                    return Err("Object location must be room, inventory, equipped, or container.".to_string());
                }
                ctx.db.world_object().id().update(WorldObject {
                    definition_id,
                    location_kind,
                    location_id: payload.get("location_id").and_then(Value::as_str).unwrap_or(&existing.location_id).to_string(),
                    quantity: payload.get("quantity").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.quantity).max(1),
                    equipped_slot: payload.get("equipped_slot").map(|_| optional_string(&payload, "equipped_slot").filter(|slot| !slot.trim().is_empty())).unwrap_or(existing.equipped_slot),
                    durability: payload.get("durability").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.durability).max(0),
                    fuel_remaining: payload.get("fuel_remaining").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.fuel_remaining).max(0),
                    is_active: payload.get("is_active").and_then(Value::as_bool).unwrap_or(existing.is_active),
                    state_json: payload.get("state_json").map(|value| json_string(Some(value), &existing.state_json)).unwrap_or(existing.state_json),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "actor_stats" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.actor_stat().id().find(&id) else { continue };
                let definition = ctx.db.stat_definition().id().find(&existing.stat_definition_id)
                    .ok_or_else(|| "Stat definition does not exist.".to_string())?;
                let base_value = payload.get("base_value").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.base_value).clamp(definition.minimum, definition.maximum);
                let current_value = payload.get("current_value").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.current_value).clamp(definition.minimum, definition.maximum);
                let invested_points = payload.get("invested_points").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.invested_points);
                ctx.db.actor_stat().id().update(ActorStat { base_value, current_value, invested_points, updated_at: ctx.timestamp, ..existing });
            }
        }
        "progression_configs" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.progression_config().id().find(&id) else { continue };
                let max_level = payload.get("max_level").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.max_level).max(1);
                ctx.db.progression_config().id().update(ProgressionConfig {
                    max_level,
                    base_xp: payload.get("base_xp").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.base_xp).max(1),
                    growth_percent: payload.get("growth_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.growth_percent),
                    base_inventory_slots: payload.get("base_inventory_slots").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.base_inventory_slots),
                    inventory_slots_per_level: payload.get("inventory_slots_per_level").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.inventory_slots_per_level),
                    stat_points_per_level: payload.get("stat_points_per_level").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.stat_points_per_level),
                    updated_at: ctx.timestamp,
                    ..existing
                });
                let progressions = ctx.db.actor_progression().iter().filter(|row| row.level > max_level).collect::<Vec<_>>();
                for progression in progressions {
                    apply_level_change(ctx, &progression.actor_id, progression.level, max_level);
                    ctx.db.actor_progression().id().update(ActorProgression { level: max_level, experience: 0, updated_at: ctx.timestamp, ..progression });
                }
            }
        }
        "equipment_slot_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.equipment_slot_definition().id().find(&id) else { continue };
                ctx.db.equipment_slot_definition().id().update(EquipmentSlotDefinition {
                    name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(),
                    capacity: payload.get("capacity").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.capacity).max(1),
                    sort_order: payload.get("sort_order").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.sort_order),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "ability_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.ability_definition().id().find(&id) else { continue };
                let effect_type = payload.get("effect_type").and_then(Value::as_str).unwrap_or(&existing.effect_type).to_lowercase();
                let target_type = payload.get("target_type").and_then(Value::as_str).unwrap_or(&existing.target_type).to_lowercase();
                let mitigation_type = payload.get("mitigation_type").and_then(Value::as_str).unwrap_or(&existing.mitigation_type).to_lowercase();
                if !matches!(effect_type.as_str(), "damage" | "heal" | "restore")
                    || !matches!(target_type.as_str(), "enemy" | "self" | "ally")
                    || !matches!(mitigation_type.as_str(), "none" | "armor") {
                    return Err("Ability effect, target, or mitigation type is invalid.".to_string());
                }
                let power_min = payload.get("power_min").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.power_min).max(0);
                let power_max = payload.get("power_max").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.power_max).max(power_min);
                let resource_stat_id = payload.get("resource_stat_id").map(|_| optional_string(&payload, "resource_stat_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.resource_stat_id.clone());
                let scales_with_stat = payload.get("scales_with_stat").map(|_| optional_string(&payload, "scales_with_stat").filter(|value| !value.trim().is_empty())).unwrap_or(existing.scales_with_stat.clone());
                let effect_stat_id = payload.get("effect_stat_id").map(|_| optional_string(&payload, "effect_stat_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.effect_stat_id.clone());
                for stat_id in [resource_stat_id.as_ref(), scales_with_stat.as_ref(), effect_stat_id.as_ref()].into_iter().flatten() {
                    if ctx.db.stat_definition().id().find(stat_id).is_none() {
                        return Err(format!("Ability references missing stat: {stat_id}"));
                    }
                }
                ctx.db.ability_definition().id().update(AbilityDefinition {
                    name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(),
                    description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(),
                    icon: payload.get("icon").and_then(Value::as_str).unwrap_or(&existing.icon).to_string(),
                    school: payload.get("school").and_then(Value::as_str).unwrap_or(&existing.school).to_string(),
                    effect_type,
                    target_type,
                    resource_stat_id,
                    resource_cost: payload.get("resource_cost").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.resource_cost).max(0),
                    cooldown_ms: payload.get("cooldown_ms").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.cooldown_ms),
                    cast_time_ms: payload.get("cast_time_ms").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.cast_time_ms),
                    power_min,
                    power_max,
                    scales_with_stat,
                    scaling_percent: payload.get("scaling_percent").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.scaling_percent).max(0),
                    effect_stat_id,
                    mitigation_type,
                    required_level: payload.get("required_level").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.required_level).max(1),
                    auto_learn: payload.get("auto_learn").and_then(Value::as_bool).unwrap_or(existing.auto_learn),
                    enabled: payload.get("enabled").and_then(Value::as_bool).unwrap_or(existing.enabled),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "actor_progressions" => {
            require_admin(ctx)?;
            let config = world_progression_config(ctx);
            for id in ids {
                let Some(existing) = ctx.db.actor_progression().id().find(&id) else { continue };
                let level = payload.get("level").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.level).clamp(1, config.max_level.max(1));
                apply_level_change(ctx, &existing.actor_id, existing.level, level);
                ctx.db.actor_progression().id().update(ActorProgression {
                    level,
                    experience: payload.get("experience").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.experience),
                    unspent_stat_points: payload.get("unspent_stat_points").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.unspent_stat_points),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "loot_table_entries" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.loot_table_entry().id().find(&id) else { continue };
                let npc_id = payload.get("npc_id").and_then(Value::as_str).unwrap_or(&existing.npc_id).to_string();
                let definition_id = payload.get("definition_id").and_then(Value::as_str).unwrap_or(&existing.definition_id).to_string();
                if ctx.db.npc().id().find(&npc_id).is_none() {
                    return Err("Loot entry NPC does not exist.".to_string());
                }
                if ctx.db.object_definition().id().find(&definition_id).is_none() {
                    return Err("Loot entry object definition does not exist.".to_string());
                }
                let minimum_quantity = payload.get("minimum_quantity").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.minimum_quantity).max(1);
                let maximum_quantity = payload.get("maximum_quantity").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.maximum_quantity).max(minimum_quantity);
                ctx.db.loot_table_entry().id().update(LootTableEntry {
                    npc_id,
                    definition_id,
                    minimum_quantity,
                    maximum_quantity,
                    chance_percent: payload.get("chance_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.chance_percent).min(100),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "rooms" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.room().id().find(&id) else { continue };
                ctx.db.room().id().update(Room {
                    name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(),
                    description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(),
                    region: payload.get("region").and_then(Value::as_str).unwrap_or(&existing.region).to_string(),
                    region_name: payload.get("region_name").map(|_| optional_string(&payload, "region_name")).unwrap_or(existing.region_name),
                    height: payload.get("height").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.height),
                    image_url: payload.get("image_url").map(|_| optional_string(&payload, "image_url")).unwrap_or(existing.image_url),
                    ..existing
                });
            }
        }
        "npcs" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.npc().id().find(&id) else { continue };
                let faction = payload.get("faction").map(|_| optional_string(&payload, "faction").filter(|value| !value.trim().is_empty())).unwrap_or(existing.faction.clone());
                if payload.get("faction").is_some() && faction != existing.faction && faction.as_ref().map(|faction_id| ctx.db.faction_definition().id().find(faction_id).is_none()).unwrap_or(false) {
                    return Err("NPC faction does not exist.".to_string());
                }
                ctx.db.npc().id().update(Npc {
                    name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(),
                    description: payload.get("description").map(|_| optional_string(&payload, "description")).unwrap_or(existing.description),
                    current_room: payload.get("current_room").map(|_| optional_string(&payload, "current_room")).unwrap_or(existing.current_room),
                    dialogue_tree: payload.get("dialogue_tree").map(|value| if value.is_null() { None } else { Some(json_string(Some(value), "{}")) }).unwrap_or(existing.dialogue_tree),
                    faction,
                    behavior_type: payload.get("behavior_type").and_then(Value::as_str).unwrap_or(&existing.behavior_type).to_string(),
                    alias: payload.get("alias").map(|_| optional_string(&payload, "alias")).unwrap_or(existing.alias),
                    greeting_behavior: payload.get("greeting_behavior").and_then(Value::as_str).unwrap_or(&existing.greeting_behavior).to_string(),
                    portrait_url: payload.get("portrait_url").map(|_| optional_string(&payload, "portrait_url")).unwrap_or(existing.portrait_url),
                    disposition: payload.get("disposition").map(|_| optional_string(&payload, "disposition")).unwrap_or(existing.disposition),
                    attack_on_sight: payload.get("attack_on_sight").and_then(Value::as_bool).unwrap_or(existing.attack_on_sight),
                    patrol_route: payload.get("patrol_route").map(|value| Some(json_string(Some(value), "[]"))).unwrap_or(existing.patrol_route),
                    patrol_interval_seconds: payload.get("patrol_interval_seconds").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.patrol_interval_seconds).max(1),
                    attack_interval_seconds: payload.get("attack_interval_seconds").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.attack_interval_seconds).max(1),
                    respawn_seconds: payload.get("respawn_seconds").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.respawn_seconds),
                    spawn_room: payload.get("spawn_room").map(|_| optional_string(&payload, "spawn_room")).unwrap_or(existing.spawn_room),
                    xp_reward: payload.get("xp_reward").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.xp_reward),
                    is_guard: payload.get("is_guard").and_then(Value::as_bool).unwrap_or(existing.is_guard),
                    guard_greeting: payload.get("guard_greeting").map(|_| optional_string(&payload, "guard_greeting")).unwrap_or(existing.guard_greeting),
                    protect_players: payload.get("protect_players").and_then(Value::as_bool).unwrap_or(existing.protect_players),
                    protect_faction_members: payload.get("protect_faction_members").and_then(Value::as_bool).unwrap_or(existing.protect_faction_members),
                    guard_wanted_seconds: payload.get("guard_wanted_seconds").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.guard_wanted_seconds),
                    ..existing
                });
            }
        }
        "faction_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.faction_definition().id().find(&id) else { continue };
                let minimum_reputation = payload.get("minimum_reputation").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.minimum_reputation);
                let maximum_reputation = payload.get("maximum_reputation").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.maximum_reputation).max(minimum_reputation);
                let hostile_threshold = payload.get("hostile_threshold").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.hostile_threshold).clamp(minimum_reputation, maximum_reputation);
                let friendly_threshold = payload.get("friendly_threshold").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.friendly_threshold).clamp(hostile_threshold, maximum_reputation);
                let updated = FactionDefinition {
                    name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(),
                    description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(),
                    starting_reputation: payload.get("starting_reputation").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.starting_reputation).clamp(minimum_reputation, maximum_reputation),
                    minimum_reputation,
                    maximum_reputation,
                    hostile_threshold,
                    friendly_threshold,
                    attack_penalty: payload.get("attack_penalty").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.attack_penalty).min(0),
                    kill_penalty: payload.get("kill_penalty").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.kill_penalty).min(0),
                    updated_at: ctx.timestamp,
                    ..existing
                };
                ctx.db.faction_definition().id().update(updated.clone());
                let standings = ctx.db.actor_faction_reputation().iter().filter(|row| row.faction_id == id).collect::<Vec<_>>();
                for standing in standings {
                    ctx.db.actor_faction_reputation().id().update(ActorFactionReputation {
                        reputation: standing.reputation.clamp(updated.minimum_reputation, updated.maximum_reputation),
                        updated_at: ctx.timestamp,
                        ..standing
                    });
                }
            }
        }
        "actor_faction_reputations" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.actor_faction_reputation().id().find(&id) else { continue };
                let definition = ctx.db.faction_definition().id().find(&existing.faction_id).ok_or_else(|| "Faction does not exist.".to_string())?;
                ctx.db.actor_faction_reputation().id().update(ActorFactionReputation {
                    reputation: payload.get("reputation").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.reputation).clamp(definition.minimum_reputation, definition.maximum_reputation),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "quest_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.quest_definition().id().find(&id) else { continue };
                let quest_giver_npc_id = payload.get("quest_giver_npc_id").and_then(Value::as_str).unwrap_or(&existing.quest_giver_npc_id).to_string();
                let turn_in_npc_id = payload.get("turn_in_npc_id").and_then(Value::as_str).unwrap_or(&existing.turn_in_npc_id).to_string();
                if ctx.db.npc().id().find(&quest_giver_npc_id).is_none() || ctx.db.npc().id().find(&turn_in_npc_id).is_none() {
                    return Err("Quest giver and turn-in NPC must exist.".to_string());
                }
                let required_faction_id = payload.get("required_faction_id").map(|_| optional_string(&payload, "required_faction_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.required_faction_id.clone());
                let reputation_faction_id = payload.get("reputation_faction_id").map(|_| optional_string(&payload, "reputation_faction_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.reputation_faction_id.clone());
                for faction_id in [required_faction_id.as_ref(), reputation_faction_id.as_ref()].into_iter().flatten() {
                    if ctx.db.faction_definition().id().find(faction_id).is_none() { return Err(format!("Quest references missing faction: {faction_id}")); }
                }
                ctx.db.quest_definition().id().update(QuestDefinition {
                    title: payload.get("title").and_then(Value::as_str).unwrap_or(&existing.title).to_string(),
                    description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(),
                    quest_giver_npc_id,
                    turn_in_npc_id,
                    required_level: payload.get("required_level").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.required_level).max(1),
                    required_faction_id,
                    required_reputation: payload.get("required_reputation").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.required_reputation),
                    repeatable: payload.get("repeatable").and_then(Value::as_bool).unwrap_or(existing.repeatable),
                    active: payload.get("active").and_then(Value::as_bool).unwrap_or(existing.active),
                    xp_reward: payload.get("xp_reward").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.xp_reward),
                    gold_reward: payload.get("gold_reward").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.gold_reward).max(0),
                    reputation_faction_id,
                    reputation_reward: payload.get("reputation_reward").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.reputation_reward),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "quest_objectives" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.quest_objective().id().find(&id) else { continue };
                let objective_type = payload.get("objective_type").and_then(Value::as_str).unwrap_or(&existing.objective_type).to_lowercase();
                let target_id = payload.get("target_id").and_then(Value::as_str).unwrap_or(&existing.target_id).to_string();
                let target_exists = match objective_type.as_str() {
                    "explore_room" => ctx.db.room().id().find(&target_id).is_some(),
                    "acquire_item" => ctx.db.object_definition().id().find(&target_id).is_some(),
                    "kill_npc" | "talk_npc" => ctx.db.npc().id().find(&target_id).is_some(),
                    "kill_faction" => ctx.db.faction_definition().id().find(&target_id).is_some(),
                    _ => return Err("Objective type must be explore_room, acquire_item, kill_npc, kill_faction, or talk_npc.".to_string()),
                };
                if !target_exists { return Err("Quest objective target does not exist.".to_string()); }
                ctx.db.quest_objective().id().update(QuestObjective {
                    objective_type,
                    target_id,
                    description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(),
                    required_count: payload.get("required_count").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.required_count).max(1),
                    sort_order: payload.get("sort_order").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.sort_order),
                    consume_on_turn_in: payload.get("consume_on_turn_in").and_then(Value::as_bool).unwrap_or(existing.consume_on_turn_in),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "quest_item_rewards" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.quest_item_reward().id().find(&id) else { continue };
                let definition_id = payload.get("definition_id").and_then(Value::as_str).unwrap_or(&existing.definition_id).to_string();
                if ctx.db.object_definition().id().find(&definition_id).is_none() { return Err("Quest reward item does not exist.".to_string()); }
                ctx.db.quest_item_reward().id().update(QuestItemReward {
                    definition_id,
                    quantity: payload.get("quantity").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.quantity).max(1),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "actor_wallets" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.actor_wallet().id().find(&id) else { continue };
                ctx.db.actor_wallet().id().update(ActorWallet {
                    gold: payload.get("gold").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.gold).max(0),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "spawn_points" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.spawn_point().id().find(&id) else { continue };
                let room_id = payload.get("room_id").and_then(Value::as_str).unwrap_or(&existing.room_id).to_string();
                if ctx.db.room().id().find(&room_id).is_none() { return Err("Spawn point room does not exist.".to_string()); }
                ctx.db.spawn_point().id().update(SpawnPoint {
                    name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(),
                    description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(),
                    room_id,
                    allows_initial_spawn: payload.get("allows_initial_spawn").and_then(Value::as_bool).unwrap_or(existing.allows_initial_spawn),
                    allows_respawn: payload.get("allows_respawn").and_then(Value::as_bool).unwrap_or(existing.allows_respawn),
                    active: payload.get("active").and_then(Value::as_bool).unwrap_or(existing.active),
                    priority: payload.get("priority").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.priority),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        "world_lifecycle_configs" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.world_lifecycle_config().id().find(&id) else { continue };
                let initial_spawn_policy = payload.get("initial_spawn_policy").and_then(Value::as_str).unwrap_or(&existing.initial_spawn_policy).to_string();
                let respawn_policy = payload.get("respawn_policy").and_then(Value::as_str).unwrap_or(&existing.respawn_policy).to_string();
                let death_mode = payload.get("death_mode").and_then(Value::as_str).unwrap_or(&existing.death_mode).to_string();
                let inventory_loss_mode = payload.get("inventory_loss_mode").and_then(Value::as_str).unwrap_or(&existing.inventory_loss_mode).to_string();
                validate_lifecycle_policy_values(&initial_spawn_policy, &respawn_policy, &death_mode, &inventory_loss_mode)?;
                let fixed_initial_spawn_point_id = payload.get("fixed_initial_spawn_point_id").map(|_| optional_string(&payload, "fixed_initial_spawn_point_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.fixed_initial_spawn_point_id.clone());
                let fixed_respawn_point_id = payload.get("fixed_respawn_point_id").map(|_| optional_string(&payload, "fixed_respawn_point_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.fixed_respawn_point_id.clone());
                for spawn_point_id in [fixed_initial_spawn_point_id.as_ref(), fixed_respawn_point_id.as_ref()].into_iter().flatten() {
                    if ctx.db.spawn_point().id().find(spawn_point_id).is_none() { return Err(format!("Lifecycle configuration references missing spawn point: {spawn_point_id}")); }
                }
                ctx.db.world_lifecycle_config().id().update(WorldLifecycleConfig {
                    initial_spawn_policy,
                    fixed_initial_spawn_point_id,
                    respawn_policy,
                    fixed_respawn_point_id,
                    death_mode,
                    respawn_delay_seconds: payload.get("respawn_delay_seconds").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.respawn_delay_seconds),
                    inventory_loss_mode,
                    inventory_loss_percent: payload.get("inventory_loss_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.inventory_loss_percent).min(100),
                    include_equipped_in_loss: payload.get("include_equipped_in_loss").and_then(Value::as_bool).unwrap_or(existing.include_equipped_in_loss),
                    gold_loss_percent: payload.get("gold_loss_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.gold_loss_percent).min(100),
                    experience_loss_percent: payload.get("experience_loss_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.experience_loss_percent).min(100),
                    respawn_health_percent: payload.get("respawn_health_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.respawn_health_percent).clamp(1, 100),
                    respawn_resource_percent: payload.get("respawn_resource_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.respawn_resource_percent).min(100),
                    spawn_protection_seconds: payload.get("spawn_protection_seconds").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.spawn_protection_seconds),
                    reset_quests_on_death: payload.get("reset_quests_on_death").and_then(Value::as_bool).unwrap_or(existing.reset_quests_on_death),
                    clear_wanted_on_respawn: payload.get("clear_wanted_on_respawn").and_then(Value::as_bool).unwrap_or(existing.clear_wanted_on_respawn),
                    updated_at: ctx.timestamp,
                    ..existing
                });
            }
        }
        _ => return Err(format!("Unsupported update table: {table_name}")),
    }
    Ok(())
}

fn delete_world_object_tree(ctx: &ReducerContext, id: &String) {
    let child_ids = ctx.db.world_object().iter()
        .filter(|object| object.location_kind == "container" && object.location_id == *id)
        .map(|object| object.id)
        .collect::<Vec<_>>();
    for child_id in child_ids {
        delete_world_object_tree(ctx, &child_id);
    }
    ctx.db.world_object().id().delete(id);
}

fn delete_actor_rpg_state(ctx: &ReducerContext, actor_id: &String) {
    let object_ids = ctx.db.world_object().iter()
        .filter(|object| matches!(object.location_kind.as_str(), "inventory" | "equipped") && object.location_id == *actor_id)
        .map(|object| object.id)
        .collect::<Vec<_>>();
    for object_id in object_ids {
        delete_world_object_tree(ctx, &object_id);
    }
    let stat_ids = ctx.db.actor_stat().iter()
        .filter(|stat| stat.actor_id == *actor_id)
        .map(|stat| stat.id)
        .collect::<Vec<_>>();
    for stat_id in stat_ids {
        ctx.db.actor_stat().id().delete(&stat_id);
    }
    let ability_ids = ctx.db.actor_ability().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for ability_id in ability_ids { ctx.db.actor_ability().id().delete(&ability_id); }
    let cooldown_ids = ctx.db.actor_cooldown().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for cooldown_id in cooldown_ids { ctx.db.actor_cooldown().id().delete(&cooldown_id); }
    let cast_ids = ctx.db.scheduled_cast().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.scheduled_id).collect::<Vec<_>>();
    for cast_id in cast_ids { ctx.db.scheduled_cast().scheduled_id().delete(cast_id); }
    let reputation_ids = ctx.db.actor_faction_reputation().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for reputation_id in reputation_ids { ctx.db.actor_faction_reputation().id().delete(&reputation_id); }
    let crime_ids = ctx.db.actor_crime().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for crime_id in crime_ids { ctx.db.actor_crime().id().delete(&crime_id); }
    let quest_ids = ctx.db.actor_quest().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for quest_id in quest_ids { ctx.db.actor_quest().id().delete(&quest_id); }
    let progress_ids = ctx.db.actor_quest_progress().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for progress_id in progress_ids { ctx.db.actor_quest_progress().id().delete(&progress_id); }
    ctx.db.actor_wallet().id().delete(actor_id);
    ctx.db.actor_life_state().id().delete(actor_id);
    ctx.db.actor_progression().id().delete(actor_id);
}

#[reducer]
pub fn delete_rows(ctx: &ReducerContext, table_name: String, ids_json: String) -> Result<(), String> {
    ensure_profile(ctx);
    let ids = parse_ids(&ids_json)?;
    match table_name.as_str() {
        "characters" => {
            for id in ids {
                if let Some(row) = ctx.db.character().id().find(&id) {
                    if row.owner != ctx.sender() {
                        return Err("Characters can only be deleted by their owner.".to_string());
                    }
                    delete_actor_rpg_state(ctx, &id);
                    ctx.db.character().id().delete(&id);
                }
            }
        }
        "profiles" => delete_current_account(ctx)?,
        "regions" => {
            require_admin(ctx)?;
            for id in ids {
                if ctx.db.room().iter().any(|room| room.region_name.as_deref() == Some(id.as_str())) {
                    return Err("Move or delete every room in this region before deleting the region.".to_string());
                }
                ctx.db.region().name().delete(&id);
            }
        }
        "stat_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let actor_stat_ids = ctx.db.actor_stat().iter().filter(|stat| stat.stat_definition_id == id).map(|stat| stat.id).collect::<Vec<_>>();
                for actor_stat_id in actor_stat_ids { ctx.db.actor_stat().id().delete(&actor_stat_id); }
                let definitions = ctx.db.object_definition().iter().filter(|definition| definition.scales_with_stat.as_deref() == Some(id.as_str())).collect::<Vec<_>>();
                for definition in definitions {
                    ctx.db.object_definition().id().update(ObjectDefinition { scales_with_stat: None, updated_at: ctx.timestamp, ..definition });
                }
                let abilities = ctx.db.ability_definition().iter().filter(|ability| {
                    ability.resource_stat_id.as_deref() == Some(id.as_str())
                        || ability.scales_with_stat.as_deref() == Some(id.as_str())
                        || ability.effect_stat_id.as_deref() == Some(id.as_str())
                }).collect::<Vec<_>>();
                for ability in abilities {
                    ctx.db.ability_definition().id().update(AbilityDefinition {
                        resource_stat_id: ability.resource_stat_id.clone().filter(|value| value != &id),
                        scales_with_stat: ability.scales_with_stat.clone().filter(|value| value != &id),
                        effect_stat_id: ability.effect_stat_id.clone().filter(|value| value != &id),
                        updated_at: ctx.timestamp,
                        ..ability
                    });
                }
                ctx.db.stat_definition().id().delete(&id);
            }
        }
        "object_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                if ctx.db.quest_objective().iter().any(|objective| objective.objective_type == "acquire_item" && objective.target_id == id) {
                    return Err("This item is used by a quest objective. Reassign or delete that objective first.".to_string());
                }
                let reward_ids = ctx.db.quest_item_reward().iter().filter(|reward| reward.definition_id == id).map(|reward| reward.id).collect::<Vec<_>>();
                for reward_id in reward_ids { ctx.db.quest_item_reward().id().delete(&reward_id); }
                let loot_ids = ctx.db.loot_table_entry().iter().filter(|entry| entry.definition_id == id).map(|entry| entry.id).collect::<Vec<_>>();
                for loot_id in loot_ids { ctx.db.loot_table_entry().id().delete(&loot_id); }
                let object_ids = ctx.db.world_object().iter().filter(|object| object.definition_id == id).map(|object| object.id).collect::<Vec<_>>();
                for object_id in object_ids { delete_world_object_tree(ctx, &object_id); }
                ctx.db.object_definition().id().delete(&id);
            }
        }
        "world_objects" => {
            require_admin(ctx)?;
            for id in ids { delete_world_object_tree(ctx, &id); }
        }
        "actor_stats" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.actor_stat().id().delete(&id); }
        }
        "loot_table_entries" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.loot_table_entry().id().delete(&id); }
        }
        "progression_configs" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.progression_config().id().delete(&id); }
        }
        "equipment_slot_definitions" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.equipment_slot_definition().id().delete(&id); }
        }
        "ability_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let grants = ctx.db.actor_ability().iter().filter(|grant| grant.ability_id == id).map(|grant| grant.id).collect::<Vec<_>>();
                for grant in grants { ctx.db.actor_ability().id().delete(&grant); }
                let action_id = format!("ability:{id}");
                let cooldowns = ctx.db.actor_cooldown().iter().filter(|cooldown| cooldown.action_id == action_id).map(|cooldown| cooldown.id).collect::<Vec<_>>();
                for cooldown in cooldowns { ctx.db.actor_cooldown().id().delete(&cooldown); }
                ctx.db.ability_definition().id().delete(&id);
            }
        }
        "actor_abilities" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.actor_ability().id().delete(&id); }
        }
        "actor_progressions" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.actor_progression().id().delete(&id); }
        }
        "rooms" => {
            require_admin(ctx)?;
            for id in ids {
                if ctx.db.spawn_point().iter().any(|point| point.room_id == id) {
                    return Err("This room is used by a spawn point. Move or delete that spawn point first.".to_string());
                }
                if ctx.db.quest_objective().iter().any(|objective| objective.objective_type == "explore_room" && objective.target_id == id) {
                    return Err("This room is used by a quest objective. Reassign or delete that objective first.".to_string());
                }
                let exits = ctx.db.exit().iter().filter(|exit| exit.from_room.as_deref() == Some(id.as_str()) || exit.to_room.as_deref() == Some(id.as_str())).map(|exit| exit.id).collect::<Vec<_>>();
                for exit_id in exits { ctx.db.exit().id().delete(&exit_id); }
                let object_ids = ctx.db.world_object().iter().filter(|object| object.location_kind == "room" && object.location_id == id).map(|object| object.id).collect::<Vec<_>>();
                for object_id in object_ids { delete_world_object_tree(ctx, &object_id); }
                let npcs = ctx.db.npc().iter().filter(|npc| npc.current_room.as_deref() == Some(id.as_str()) || npc.spawn_room.as_deref() == Some(id.as_str())).collect::<Vec<_>>();
                for npc in npcs {
                    let route = npc.patrol_route.as_deref().and_then(|route| serde_json::from_str::<Vec<String>>(route).ok()).unwrap_or_default().into_iter().filter(|room_id| room_id != &id).collect::<Vec<_>>();
                    ctx.db.npc().id().update(Npc {
                        current_room: if npc.current_room.as_deref() == Some(id.as_str()) { None } else { npc.current_room.clone() },
                        spawn_room: if npc.spawn_room.as_deref() == Some(id.as_str()) { None } else { npc.spawn_room.clone() },
                        patrol_route: Some(serde_json::to_string(&route).unwrap_or_else(|_| "[]".to_string())),
                        patrol_index: 0,
                        ..npc
                    });
                }
                let characters = ctx.db.character().iter().filter(|character| character.current_room.as_deref() == Some(id.as_str())).collect::<Vec<_>>();
                for character in characters {
                    ctx.db.character().id().update(Character { current_room: Some(STARTING_ROOM_ID.to_string()).filter(|room_id| room_id != &id), ..character });
                }
                let profiles = ctx.db.profile().iter().filter(|profile| profile.current_room.as_deref() == Some(id.as_str())).collect::<Vec<_>>();
                for profile in profiles {
                    ctx.db.profile().id().update(Profile { current_room: Some(STARTING_ROOM_ID.to_string()).filter(|room_id| room_id != &id), ..profile });
                }
                let regions = ctx.db.region().iter().filter(|region| region.respawn_room_id.as_deref() == Some(id.as_str())).collect::<Vec<_>>();
                for region in regions { ctx.db.region().name().update(Region { respawn_room_id: None, updated_at: ctx.timestamp, ..region }); }
                ctx.db.room().id().delete(&id);
            }
        }
        "npcs" => {
            require_admin(ctx)?;
            for id in ids {
                if ctx.db.quest_definition().iter().any(|quest| quest.quest_giver_npc_id == id || quest.turn_in_npc_id == id)
                    || ctx.db.quest_objective().iter().any(|objective| matches!(objective.objective_type.as_str(), "kill_npc" | "talk_npc") && objective.target_id == id) {
                    return Err("This NPC is used by a quest. Reassign or delete that quest content first.".to_string());
                }
                let loot_ids = ctx.db.loot_table_entry().iter().filter(|entry| entry.npc_id == id).map(|entry| entry.id).collect::<Vec<_>>();
                for loot_id in loot_ids { ctx.db.loot_table_entry().id().delete(&loot_id); }
                delete_actor_rpg_state(ctx, &id);
                ctx.db.npc().id().delete(&id);
            }
        }
        "faction_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                if ctx.db.npc().iter().any(|npc| npc.faction.as_deref() == Some(id.as_str()))
                    || ctx.db.quest_definition().iter().any(|quest| quest.required_faction_id.as_deref() == Some(id.as_str()) || quest.reputation_faction_id.as_deref() == Some(id.as_str()))
                    || ctx.db.quest_objective().iter().any(|objective| objective.objective_type == "kill_faction" && objective.target_id == id) {
                    return Err("This faction is used by an NPC or quest. Reassign those references first.".to_string());
                }
                let standings = ctx.db.actor_faction_reputation().iter().filter(|row| row.faction_id == id).map(|row| row.id).collect::<Vec<_>>();
                for standing in standings { ctx.db.actor_faction_reputation().id().delete(&standing); }
                let crimes = ctx.db.actor_crime().iter().filter(|row| row.faction_id.as_deref() == Some(id.as_str())).map(|row| row.id).collect::<Vec<_>>();
                for crime in crimes { ctx.db.actor_crime().id().delete(&crime); }
                ctx.db.faction_definition().id().delete(&id);
            }
        }
        "actor_faction_reputations" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.actor_faction_reputation().id().delete(&id); }
        }
        "quest_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let objective_ids = ctx.db.quest_objective().iter().filter(|row| row.quest_id == id).map(|row| row.id).collect::<Vec<_>>();
                for objective_id in objective_ids {
                    let progress_ids = ctx.db.actor_quest_progress().iter().filter(|row| row.objective_id == objective_id).map(|row| row.id).collect::<Vec<_>>();
                    for progress_id in progress_ids { ctx.db.actor_quest_progress().id().delete(&progress_id); }
                    ctx.db.quest_objective().id().delete(&objective_id);
                }
                let reward_ids = ctx.db.quest_item_reward().iter().filter(|row| row.quest_id == id).map(|row| row.id).collect::<Vec<_>>();
                for reward_id in reward_ids { ctx.db.quest_item_reward().id().delete(&reward_id); }
                let actor_quest_ids = ctx.db.actor_quest().iter().filter(|row| row.quest_id == id).map(|row| row.id).collect::<Vec<_>>();
                for actor_quest_id in actor_quest_ids { ctx.db.actor_quest().id().delete(&actor_quest_id); }
                ctx.db.quest_definition().id().delete(&id);
            }
        }
        "quest_objectives" => {
            require_admin(ctx)?;
            for id in ids {
                let progress_ids = ctx.db.actor_quest_progress().iter().filter(|row| row.objective_id == id).map(|row| row.id).collect::<Vec<_>>();
                for progress_id in progress_ids { ctx.db.actor_quest_progress().id().delete(&progress_id); }
                ctx.db.quest_objective().id().delete(&id);
            }
        }
        "quest_item_rewards" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.quest_item_reward().id().delete(&id); }
        }
        "actor_wallets" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.actor_wallet().id().delete(&id); }
        }
        "actor_cooldowns" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.actor_cooldown().id().delete(&id); }
        }
        "actor_crimes" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.actor_crime().id().delete(&id); }
        }
        "actor_quests" => {
            require_admin(ctx)?;
            for id in ids {
                if let Some(actor_quest) = ctx.db.actor_quest().id().find(&id) {
                    let progress_ids = ctx.db.actor_quest_progress().iter()
                        .filter(|row| row.actor_id == actor_quest.actor_id && row.quest_id == actor_quest.quest_id)
                        .map(|row| row.id).collect::<Vec<_>>();
                    for progress_id in progress_ids { ctx.db.actor_quest_progress().id().delete(&progress_id); }
                }
                ctx.db.actor_quest().id().delete(&id);
            }
        }
        "actor_quest_progress" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.actor_quest_progress().id().delete(&id); }
        }
        "spawn_points" => {
            require_admin(ctx)?;
            for id in ids {
                let configs = ctx.db.world_lifecycle_config().iter().filter(|config| config.fixed_initial_spawn_point_id.as_deref() == Some(id.as_str()) || config.fixed_respawn_point_id.as_deref() == Some(id.as_str())).collect::<Vec<_>>();
                for config in configs {
                    ctx.db.world_lifecycle_config().id().update(WorldLifecycleConfig {
                        fixed_initial_spawn_point_id: config.fixed_initial_spawn_point_id.clone().filter(|value| value != &id),
                        fixed_respawn_point_id: config.fixed_respawn_point_id.clone().filter(|value| value != &id),
                        updated_at: ctx.timestamp,
                        ..config
                    });
                }
                let life_states = ctx.db.actor_life_state().iter().filter(|state| state.pending_spawn_point_id.as_deref() == Some(id.as_str())).collect::<Vec<_>>();
                for state in life_states { ctx.db.actor_life_state().id().update(ActorLifeState { pending_spawn_point_id: None, updated_at: ctx.timestamp, ..state }); }
                ctx.db.spawn_point().id().delete(&id);
            }
        }
        "world_lifecycle_configs" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.world_lifecycle_config().id().delete(&id); }
        }
        "actor_death_records" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.actor_death_record().id().delete(&id); }
        }
        "exits" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.exit().id().delete(&id); }
        }
        "room_messages" => {
            require_admin(ctx)?;
            for id in ids {
                if let Ok(id) = id.parse::<u64>() { ctx.db.room_message().id().delete(id); }
            }
        }
        _ => return Err(format!("Unsupported delete table: {table_name}")),
    }
    Ok(())
}

/// Focused moderation operations that need more invariants than generic row
/// editing can provide. The payload is a JSON object whose fields depend on
/// the action; all branches are administrator-only and server validated.
#[reducer]
pub fn admin_actor_action(ctx: &ReducerContext, actor_id: String, action: String, payload_json: String) -> Result<(), String> {
    ensure_profile(ctx);
    require_admin(ctx)?;
    if !actor_exists(ctx, &actor_id) { return Err("Actor does not exist.".to_string()); }
    let payload: Value = serde_json::from_str(&payload_json).map_err(|error| format!("Invalid moderation payload: {error}"))?;
    match action.as_str() {
        "set_gold" => {
            let gold = payload.get("gold").and_then(Value::as_i64).and_then(|value| i32::try_from(value).ok()).unwrap_or(0).max(0);
            if let Some(wallet) = ctx.db.actor_wallet().id().find(&actor_id) {
                ctx.db.actor_wallet().id().update(ActorWallet { gold, updated_at: ctx.timestamp, ..wallet });
            } else {
                ctx.db.actor_wallet().insert(ActorWallet { id: actor_id.clone(), actor_id: actor_id.clone(), gold, updated_at: ctx.timestamp });
            }
        }
        "clear_crimes" => {
            let ids = ctx.db.actor_crime().iter().filter(|row| row.actor_id == actor_id).map(|row| row.id).collect::<Vec<_>>();
            for id in ids { ctx.db.actor_crime().id().delete(&id); }
        }
        "clear_cooldowns" => {
            let ids = ctx.db.actor_cooldown().iter().filter(|row| row.actor_id == actor_id).map(|row| row.id).collect::<Vec<_>>();
            for id in ids { ctx.db.actor_cooldown().id().delete(&id); }
        }
        "move" => {
            let room_id = payload.get("room_id").and_then(Value::as_str).ok_or_else(|| "Choose a destination room.".to_string())?;
            move_actor_to_room(ctx, &actor_id, room_id)?;
        }
        "rescue" => {
            let origin_room = actor_current_room(ctx, &actor_id).unwrap_or_else(|| STARTING_ROOM_ID.to_string());
            let destination = if let Some(room_id) = payload.get("room_id").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) {
                if ctx.db.room().id().find(&room_id.to_string()).is_none() { return Err("Destination room does not exist.".to_string()); }
                room_id.to_string()
            } else {
                choose_respawn_point(ctx, &actor_id, &origin_room).map(|point| point.room_id).unwrap_or_else(|| legacy_respawn_room(ctx, &origin_room))
            };
            move_actor_to_room(ctx, &actor_id, &destination)?;
            let config = world_lifecycle_config(ctx);
            restore_actor_after_respawn(ctx, &actor_id, &config);
            let state = ensure_actor_life_state(ctx, &actor_id);
            ctx.db.actor_life_state().id().update(ActorLifeState {
                state: "alive".to_string(), death_room_id: None, pending_spawn_point_id: None,
                respawn_available_at_micros: 0, protected_until_micros: 0, updated_at: ctx.timestamp, ..state
            });
        }
        "set_quest_status" => {
            let quest_id = payload.get("quest_id").and_then(Value::as_str).ok_or_else(|| "Choose a quest.".to_string())?.to_string();
            if ctx.db.quest_definition().id().find(&quest_id).is_none() { return Err("Quest does not exist.".to_string()); }
            let status = payload.get("status").and_then(Value::as_str).unwrap_or("active");
            if !matches!(status, "active" | "ready" | "completed") { return Err("Quest status must be active, ready, or completed.".to_string()); }
            let id = actor_quest_id(&actor_id, &quest_id);
            let existing = ctx.db.actor_quest().id().find(&id);
            let completion_count = existing.as_ref().map(|row| row.completion_count).unwrap_or(0);
            let accepted_at = existing.as_ref().map(|row| row.accepted_at).unwrap_or(ctx.timestamp);
            let row = ActorQuest {
                id: id.clone(), actor_id: actor_id.clone(), quest_id: quest_id.clone(), status: status.to_string(),
                completion_count: if status == "completed" { completion_count.saturating_add(1) } else { completion_count },
                accepted_at, updated_at: ctx.timestamp, completed_at: if status == "completed" { Some(ctx.timestamp) } else { None },
            };
            if existing.is_some() { ctx.db.actor_quest().id().update(row); } else { ctx.db.actor_quest().insert(row); }
            if status == "ready" || status == "completed" {
                let objectives = ctx.db.quest_objective().iter().filter(|row| row.quest_id == quest_id).collect::<Vec<_>>();
                for objective in objectives {
                    let progress_id = quest_progress_id(&actor_id, &objective.id);
                    let progress = ActorQuestProgress {
                        id: progress_id.clone(), actor_id: actor_id.clone(), quest_id: quest_id.clone(), objective_id: objective.id,
                        progress: objective.required_count, updated_at: ctx.timestamp,
                    };
                    if ctx.db.actor_quest_progress().id().find(&progress_id).is_some() { ctx.db.actor_quest_progress().id().update(progress); }
                    else { ctx.db.actor_quest_progress().insert(progress); }
                }
            }
        }
        "set_quest_progress" => {
            let objective_id = payload.get("objective_id").and_then(Value::as_str).ok_or_else(|| "Choose a quest objective.".to_string())?.to_string();
            let objective = ctx.db.quest_objective().id().find(&objective_id).ok_or_else(|| "Quest objective does not exist.".to_string())?;
            let progress_value = payload.get("progress").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(0).min(objective.required_count);
            let id = quest_progress_id(&actor_id, &objective_id);
            let row = ActorQuestProgress { id: id.clone(), actor_id: actor_id.clone(), quest_id: objective.quest_id, objective_id, progress: progress_value, updated_at: ctx.timestamp };
            if ctx.db.actor_quest_progress().id().find(&id).is_some() { ctx.db.actor_quest_progress().id().update(row); }
            else { ctx.db.actor_quest_progress().insert(row); }
        }
        _ => return Err(format!("Unsupported moderation action: {action}")),
    }
    Ok(())
}

#[reducer]
pub fn delete_current_account(ctx: &ReducerContext) -> Result<(), String> {
    let owned_characters = ctx.db.character().iter().filter(|row| row.owner == ctx.sender()).map(|row| row.id).collect::<Vec<_>>();
    let profile = profile_for(ctx, ctx.sender());
    let mut owned_actor_ids = owned_characters.clone();
    if let Some(profile) = profile.as_ref() { owned_actor_ids.push(profile.id.clone()); }
    let owned_messages = ctx.db.room_message().iter().filter(|row| {
        row.character_id.as_ref().map(|id| owned_actor_ids.contains(id)).unwrap_or(false)
            || row.target_character_id.as_ref().map(|id| owned_actor_ids.contains(id)).unwrap_or(false)
    }).map(|row| row.id).collect::<Vec<_>>();
    for id in owned_messages { ctx.db.room_message().id().delete(id); }
    let owned_chats = ctx.db.region_chat().iter().filter(|row| {
        row.character_id.as_ref().map(|id| owned_actor_ids.contains(id)).unwrap_or(false)
    }).map(|row| row.id).collect::<Vec<_>>();
    for id in owned_chats { ctx.db.region_chat().id().delete(&id); }
    for id in owned_characters {
        delete_actor_rpg_state(ctx, &id);
        ctx.db.character().id().delete(&id);
    }
    let owned_commands = ctx.db.command().iter().filter(|row| row.owner == ctx.sender()).map(|row| row.id).collect::<Vec<_>>();
    for id in owned_commands { ctx.db.command().id().delete(&id); }
    let deleted_admin = profile.as_ref().map(|profile| profile.is_admin).unwrap_or(false);
    if let Some(profile) = profile {
        delete_actor_rpg_state(ctx, &profile.id);
        ctx.db.profile().id().delete(&profile.id);
    }
    if deleted_admin {
        if let Some(successor) = ctx.db.profile().iter().min_by_key(|profile| profile.created_at) {
            ctx.db.profile().id().update(Profile { is_admin: true, ..successor });
        }
    }
    Ok(())
}

fn object_definition_for(ctx: &ReducerContext, object: &WorldObject) -> Option<ObjectDefinition> {
    ctx.db.object_definition().id().find(&object.definition_id)
}

fn object_matches(definition: &ObjectDefinition, query: &str) -> bool {
    let query = query.trim().to_lowercase();
    definition.id.eq_ignore_ascii_case(&query)
        || definition.name.eq_ignore_ascii_case(&query)
        || definition.name.to_lowercase().starts_with(&query)
}

fn find_object_at(
    ctx: &ReducerContext,
    location_kind: &str,
    location_id: &str,
    query: &str,
) -> Option<(WorldObject, ObjectDefinition)> {
    ctx.db.world_object().iter()
        .filter(|object| object.location_kind == location_kind && object.location_id == location_id)
        .find_map(|object| object_definition_for(ctx, &object)
            .filter(|definition| object_matches(definition, query))
            .map(|definition| (object, definition)))
}

fn find_carried_object(ctx: &ReducerContext, actor_id: &str, query: &str) -> Option<(WorldObject, ObjectDefinition)> {
    find_object_at(ctx, "inventory", actor_id, query)
        .or_else(|| find_object_at(ctx, "equipped", actor_id, query))
}

fn reconcile_fuel(ctx: &ReducerContext, object: WorldObject, definition: &ObjectDefinition) -> WorldObject {
    if !object.is_active || object.fuel_remaining <= 0 || definition.burn_rate <= 0 {
        return object;
    }
    let elapsed_micros = ctx.timestamp.to_micros_since_unix_epoch()
        .saturating_sub(object.updated_at.to_micros_since_unix_epoch());
    let elapsed_seconds = elapsed_micros / 1_000_000;
    let consumed = elapsed_seconds.saturating_mul(i64::from(definition.burn_rate));
    if consumed <= 0 {
        return object;
    }
    let fuel_remaining = i64::from(object.fuel_remaining).saturating_sub(consumed).max(0) as i32;
    let updated = WorldObject {
        fuel_remaining,
        is_active: fuel_remaining > 0,
        updated_at: ctx.timestamp,
        ..object
    };
    ctx.db.world_object().id().update(updated.clone());
    updated
}

fn stat_definition_by_role(ctx: &ReducerContext, role: &str) -> Option<StatDefinition> {
    ctx.db.stat_definition().iter().find(|definition| definition.role.as_deref() == Some(role))
}

fn world_progression_config(ctx: &ReducerContext) -> ProgressionConfig {
    ctx.db.progression_config().id().find(&"world".to_string())
        .or_else(|| ctx.db.progression_config().iter().next())
        .unwrap_or(ProgressionConfig {
            id: "world".to_string(), max_level: 60, base_xp: 100, growth_percent: 15,
            base_inventory_slots: 20, inventory_slots_per_level: 1, stat_points_per_level: 0,
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
        })
}

fn ensure_actor_progression(ctx: &ReducerContext, actor_id: &str) -> ActorProgression {
    let actor_key = actor_id.to_string();
    let progression = ctx.db.actor_progression().id().find(&actor_key).unwrap_or_else(|| {
        let row = ActorProgression {
            id: actor_key.clone(), actor_id: actor_key.clone(), level: 1, experience: 0,
            unspent_stat_points: 0, updated_at: ctx.timestamp,
        };
        ctx.db.actor_progression().insert(row.clone());
        row
    });
    let definitions = ctx.db.stat_definition().iter().collect::<Vec<_>>();
    for definition in definitions {
        let id = actor_stat_id(actor_id, &definition.id);
        if ctx.db.actor_stat().id().find(&id).is_none() {
            ctx.db.actor_stat().insert(ActorStat {
                id, actor_id: actor_key.clone(), stat_definition_id: definition.id,
                base_value: definition.default_value, current_value: definition.default_value,
                invested_points: 0,
                updated_at: ctx.timestamp,
            });
        }
    }
    progression
}

fn world_lifecycle_config(ctx: &ReducerContext) -> WorldLifecycleConfig {
    ctx.db.world_lifecycle_config().id().find(&"world".to_string())
        .or_else(|| ctx.db.world_lifecycle_config().iter().next())
        .unwrap_or(WorldLifecycleConfig {
            id: "world".to_string(),
            initial_spawn_policy: "fixed".to_string(),
            fixed_initial_spawn_point_id: None,
            respawn_policy: "nearest".to_string(),
            fixed_respawn_point_id: None,
            death_mode: "respawn".to_string(),
            respawn_delay_seconds: 0,
            inventory_loss_mode: "keep".to_string(),
            inventory_loss_percent: 0,
            include_equipped_in_loss: false,
            gold_loss_percent: 0,
            experience_loss_percent: 0,
            respawn_health_percent: 100,
            respawn_resource_percent: 100,
            spawn_protection_seconds: 0,
            reset_quests_on_death: false,
            clear_wanted_on_respawn: false,
            created_at: ctx.timestamp,
            updated_at: ctx.timestamp,
        })
}

fn ensure_actor_life_state(ctx: &ReducerContext, actor_id: &str) -> ActorLifeState {
    let id = actor_id.to_string();
    if let Some(state) = ctx.db.actor_life_state().id().find(&id) { return state; }
    let state = ActorLifeState {
        id: id.clone(), actor_id: id, state: "alive".to_string(), death_room_id: None,
        pending_spawn_point_id: None, death_count: 0, died_at: None,
        respawn_available_at_micros: 0, protected_until_micros: 0, updated_at: ctx.timestamp,
    };
    ctx.db.actor_life_state().insert(state.clone());
    state
}

fn active_spawn_points(ctx: &ReducerContext, initial: bool) -> Vec<SpawnPoint> {
    ctx.db.spawn_point().iter()
        .filter(|point| point.active && if initial { point.allows_initial_spawn } else { point.allows_respawn })
        .filter(|point| ctx.db.room().id().find(&point.room_id).is_some())
        .collect::<Vec<_>>()
}

fn highest_priority_spawn(mut points: Vec<SpawnPoint>) -> Option<SpawnPoint> {
    points.sort_by(|left, right| right.priority.cmp(&left.priority).then(left.name.cmp(&right.name)).then(left.id.cmp(&right.id)));
    points.into_iter().next()
}

fn choose_initial_spawn(ctx: &ReducerContext, actor_id: &str) -> Option<SpawnPoint> {
    let config = world_lifecycle_config(ctx);
    let points = active_spawn_points(ctx, true);
    if points.is_empty() { return None; }
    match config.initial_spawn_policy.as_str() {
        "fixed" => config.fixed_initial_spawn_point_id.as_ref().and_then(|id| points.iter().find(|point| &point.id == id).cloned()).or_else(|| highest_priority_spawn(points)),
        "random" => {
            let index = deterministic_roll(&format!("initial:{actor_id}:{}", ctx.timestamp.to_micros_since_unix_epoch())) as usize % points.len();
            points.get(index).cloned()
        }
        _ => highest_priority_spawn(points),
    }
}

fn room_distances(ctx: &ReducerContext, origin_room: &str) -> BTreeMap<String, u32> {
    let mut distances = BTreeMap::new();
    let mut queue = VecDeque::new();
    distances.insert(origin_room.to_string(), 0u32);
    queue.push_back(origin_room.to_string());
    while let Some(room_id) = queue.pop_front() {
        let distance = *distances.get(&room_id).unwrap_or(&0);
        let neighbors = ctx.db.exit().iter().filter_map(|exit| {
            if exit.from_room.as_deref() == Some(room_id.as_str()) { exit.to_room }
            else if exit.to_room.as_deref() == Some(room_id.as_str()) { exit.from_room }
            else { None }
        }).collect::<Vec<_>>();
        for neighbor in neighbors {
            if distances.contains_key(&neighbor) { continue; }
            distances.insert(neighbor.clone(), distance.saturating_add(1));
            queue.push_back(neighbor);
        }
    }
    distances
}

fn nearest_spawn(ctx: &ReducerContext, origin_room: &str, mut points: Vec<SpawnPoint>) -> Option<SpawnPoint> {
    let distances = room_distances(ctx, origin_room);
    points.sort_by(|left, right| {
        let left_distance = distances.get(&left.room_id).copied().unwrap_or(u32::MAX);
        let right_distance = distances.get(&right.room_id).copied().unwrap_or(u32::MAX);
        left_distance.cmp(&right_distance).then(right.priority.cmp(&left.priority)).then(left.name.cmp(&right.name)).then(left.id.cmp(&right.id))
    });
    points.into_iter().next()
}

fn choose_respawn_point(ctx: &ReducerContext, actor_id: &str, origin_room: &str) -> Option<SpawnPoint> {
    let config = world_lifecycle_config(ctx);
    let mut points = active_spawn_points(ctx, false);
    if points.is_empty() { return None; }
    match config.respawn_policy.as_str() {
        "fixed" => config.fixed_respawn_point_id.as_ref().and_then(|id| points.iter().find(|point| &point.id == id).cloned()).or_else(|| highest_priority_spawn(points)),
        "random" => {
            let index = deterministic_roll(&format!("respawn:{actor_id}:{origin_room}:{}", ctx.timestamp.to_micros_since_unix_epoch())) as usize % points.len();
            points.get(index).cloned()
        }
        "highest_priority" => highest_priority_spawn(points),
        "region_nearest" => {
            let origin_region = ctx.db.room().id().find(&origin_room.to_string()).and_then(|room| room.region_name);
            let regional = origin_region.as_ref().map(|region_id| points.iter().filter(|point| ctx.db.room().id().find(&point.room_id).and_then(|room| room.region_name).as_deref() == Some(region_id.as_str())).cloned().collect::<Vec<_>>()).unwrap_or_default();
            if regional.is_empty() { nearest_spawn(ctx, origin_room, points) } else { nearest_spawn(ctx, origin_room, regional) }
        }
        _ => nearest_spawn(ctx, origin_room, std::mem::take(&mut points)),
    }
}

fn actor_is_dead(ctx: &ReducerContext, actor_id: &str) -> bool {
    ctx.db.actor_life_state().id().find(&actor_id.to_string()).map(|state| state.state == "dead").unwrap_or(false)
}

fn actor_has_spawn_protection(ctx: &ReducerContext, actor_id: &str) -> bool {
    ctx.db.actor_life_state().id().find(&actor_id.to_string())
        .map(|state| state.protected_until_micros > ctx.timestamp.to_micros_since_unix_epoch())
        .unwrap_or(false)
}

fn xp_for_next_level(config: &ProgressionConfig, level: u32) -> u32 {
    let mut required = config.base_xp.max(1);
    for _ in 1..level.max(1) {
        let grown = u64::from(required)
            .saturating_mul(u64::from(100u32.saturating_add(config.growth_percent)))
            / 100;
        required = u32::try_from(grown).unwrap_or(u32::MAX).max(required.saturating_add(1));
    }
    required
}

fn actor_stat_row(ctx: &ReducerContext, actor_id: &str, definition: &StatDefinition) -> ActorStat {
    let id = actor_stat_id(actor_id, &definition.id);
    let Some(mut row) = ctx.db.actor_stat().id().find(&id) else { return ActorStat {
        id,
        actor_id: actor_id.to_string(),
        stat_definition_id: definition.id.clone(),
        base_value: definition.default_value,
        current_value: definition.default_value,
        invested_points: 0,
        updated_at: ctx.timestamp,
    }};
    if definition.regeneration_per_second > 0 && row.current_value < row.base_value {
        let elapsed_micros = ctx.timestamp.to_micros_since_unix_epoch()
            .saturating_sub(row.updated_at.to_micros_since_unix_epoch());
        let elapsed_seconds = elapsed_micros / 1_000_000;
        if elapsed_seconds > 0 {
            let recovered = i64::from(definition.regeneration_per_second).saturating_mul(elapsed_seconds);
            row.current_value = i64::from(row.current_value).saturating_add(recovered)
                .min(i64::from(row.base_value)).min(i64::from(definition.maximum)) as i32;
            row.updated_at = ctx.timestamp;
            ctx.db.actor_stat().id().update(row.clone());
        }
    }
    row
}

fn equipment_stat_bonus(ctx: &ReducerContext, actor_id: &str, stat_id: &str) -> i32 {
    ctx.db.world_object().iter()
        .filter(|object| object.location_kind == "equipped" && object.location_id == actor_id && object.durability > 0)
        .filter_map(|object| object_definition_for(ctx, &object))
        .filter_map(|definition| serde_json::from_str::<Value>(&definition.stat_modifiers).ok())
        .filter_map(|modifiers| modifiers.get(stat_id).and_then(Value::as_i64))
        .map(|value| value as i32)
        .sum()
}

fn actor_stat_value(ctx: &ReducerContext, actor_id: &str, definition: &StatDefinition) -> i32 {
    let row = actor_stat_row(ctx, actor_id, definition);
    row.current_value.saturating_add(equipment_stat_bonus(ctx, actor_id, &definition.id))
}

fn set_actor_stat_current(ctx: &ReducerContext, actor_id: &str, definition: &StatDefinition, value: i32) {
    let mut row = actor_stat_row(ctx, actor_id, definition);
    let exists = ctx.db.actor_stat().id().find(&row.id).is_some();
    row.current_value = value.clamp(definition.minimum, row.base_value.clamp(definition.minimum, definition.maximum));
    row.updated_at = ctx.timestamp;
    if exists {
        ctx.db.actor_stat().id().update(row);
    } else {
        ctx.db.actor_stat().insert(row);
    }
}

/// Apply only the portion of an actor's base stats that comes from levels.
/// Purchased ranks and administrator-authored offsets remain intact when an
/// administrator raises or lowers a level directly.
fn apply_level_change(ctx: &ReducerContext, actor_id: &str, old_level: u32, new_level: u32) {
    if old_level == new_level { return; }
    let level_delta = i64::from(new_level).saturating_sub(i64::from(old_level));
    let definitions = ctx.db.stat_definition().iter().filter(|definition| definition.per_level_gain != 0).collect::<Vec<_>>();
    for definition in definitions {
        let mut row = actor_stat_row(ctx, actor_id, &definition);
        let exists = ctx.db.actor_stat().id().find(&row.id).is_some();
        let previous_base = row.base_value;
        let change = i64::from(definition.per_level_gain).saturating_mul(level_delta);
        row.base_value = i64::from(row.base_value).saturating_add(change)
            .clamp(i64::from(definition.minimum), i64::from(definition.maximum)) as i32;
        let applied = row.base_value.saturating_sub(previous_base);
        row.current_value = row.current_value.saturating_add(applied).clamp(definition.minimum, row.base_value);
        row.updated_at = ctx.timestamp;
        if exists { ctx.db.actor_stat().id().update(row); } else { ctx.db.actor_stat().insert(row); }
    }
}

fn train_actor_stat(ctx: &ReducerContext, actor_id: &str, query: &str, requested_ranks: u32) -> Result<String, String> {
    let query = query.trim();
    if query.is_empty() { return Err("Choose a stat to train, for example `train strength`.".to_string()); }
    if requested_ranks == 0 { return Err("The number of ranks must be at least 1.".to_string()); }
    let query_lower = query.to_lowercase();
    let mut matches = ctx.db.stat_definition().iter().filter(|definition| {
        definition.id.eq_ignore_ascii_case(query)
            || definition.name.eq_ignore_ascii_case(query)
            || definition.name.to_lowercase().starts_with(&query_lower)
    }).collect::<Vec<_>>();
    matches.sort_by(|left, right| left.name.cmp(&right.name));
    let Some(definition) = matches.first().cloned() else { return Err(format!("There is no stat named \"{query}\".")); };
    if matches.len() > 1 && !definition.id.eq_ignore_ascii_case(query) && !definition.name.eq_ignore_ascii_case(query) {
        return Err(format!("That matches several stats: {}.", matches.iter().map(|row| row.name.clone()).collect::<Vec<_>>().join(", ")));
    }
    if !definition.player_allocatable { return Err(format!("{} cannot be increased with player stat points.", definition.name)); }
    let point_cost = definition.point_cost.max(1);
    let points_per_rank = definition.points_per_rank.max(1);
    let mut progression = ensure_actor_progression(ctx, actor_id);
    let mut row = actor_stat_row(ctx, actor_id, &definition);
    if row.base_value >= definition.maximum { return Err(format!("{} is already at its maximum of {}.", definition.name, definition.maximum)); }
    let affordable_ranks = progression.unspent_stat_points / point_cost;
    if affordable_ranks == 0 {
        return Err(format!("Training {} costs {} stat point{}; you have {}.", definition.name, point_cost, if point_cost == 1 { "" } else { "s" }, progression.unspent_stat_points));
    }
    let room = u32::try_from(definition.maximum.saturating_sub(row.base_value)).unwrap_or(0);
    let gain = u32::try_from(points_per_rank).unwrap_or(1).max(1);
    let ranks_until_cap = room.saturating_add(gain.saturating_sub(1)) / gain;
    let ranks = requested_ranks.min(affordable_ranks).min(ranks_until_cap).max(1);
    let spent = ranks.saturating_mul(point_cost);
    let previous_base = row.base_value;
    let increase = i64::from(points_per_rank).saturating_mul(i64::from(ranks));
    row.base_value = i64::from(row.base_value).saturating_add(increase).min(i64::from(definition.maximum)) as i32;
    let applied = row.base_value.saturating_sub(previous_base);
    row.current_value = row.current_value.saturating_add(applied).clamp(definition.minimum, row.base_value);
    row.invested_points = row.invested_points.saturating_add(spent);
    row.updated_at = ctx.timestamp;
    ctx.db.actor_stat().id().update(row.clone());
    progression.unspent_stat_points = progression.unspent_stat_points.saturating_sub(spent);
    progression.updated_at = ctx.timestamp;
    ctx.db.actor_progression().id().update(progression.clone());
    Ok(format!("You train {} by {} to {}. {} unspent stat point{} remain.", definition.name, applied, row.base_value, progression.unspent_stat_points, if progression.unspent_stat_points == 1 { "" } else { "s" }))
}

fn award_experience(ctx: &ReducerContext, actor_id: &str, amount: u32) -> String {
    let config = world_progression_config(ctx);
    let mut progression = ensure_actor_progression(ctx, actor_id);
    if amount == 0 {
        return "This enemy grants no experience.".to_string();
    }
    if progression.level >= config.max_level.max(1) {
        return format!("You are already at the level cap ({}).", config.max_level.max(1));
    }
    let starting_level = progression.level;
    progression.experience = progression.experience.saturating_add(amount);
    while progression.level < config.max_level.max(1) {
        let required = xp_for_next_level(&config, progression.level);
        if progression.experience < required { break; }
        progression.experience = progression.experience.saturating_sub(required);
        progression.level = progression.level.saturating_add(1);
        progression.unspent_stat_points = progression.unspent_stat_points.saturating_add(config.stat_points_per_level);
    }
    apply_level_change(ctx, actor_id, starting_level, progression.level);
    progression.updated_at = ctx.timestamp;
    ctx.db.actor_progression().id().update(progression.clone());
    if progression.level == starting_level {
        let required = xp_for_next_level(&config, progression.level);
        return format!("You gain {amount} XP ({}/{} toward level {}).", progression.experience, required, progression.level.saturating_add(1));
    }
    let unlocked = ctx.db.ability_definition().iter()
        .filter(|ability| ability.enabled && ability.auto_learn && ability.required_level > starting_level && ability.required_level <= progression.level)
        .map(|ability| ability.name)
        .collect::<Vec<_>>();
    let mut message = format!("You gain {amount} XP and reach level {}!", progression.level);
    if !unlocked.is_empty() { message.push_str(&format!(" New abilities: {}.", unlocked.join(", "))); }
    if config.stat_points_per_level > 0 {
        message.push_str(&format!(" Unspent stat points: {}.", progression.unspent_stat_points));
    }
    message
}

fn inventory_slots(ctx: &ReducerContext, actor_id: &str) -> u32 {
    let config = world_progression_config(ctx);
    let level = ensure_actor_progression(ctx, actor_id).level.max(1);
    let equipment_bonus = ctx.db.world_object().iter()
        .filter(|object| object.location_kind == "equipped" && object.location_id == actor_id && object.durability > 0)
        .filter_map(|object| object_definition_for(ctx, &object))
        .map(|definition| definition.inventory_slots_bonus)
        .fold(0u32, u32::saturating_add);
    config.base_inventory_slots
        .saturating_add(config.inventory_slots_per_level.saturating_mul(level.saturating_sub(1)))
        .saturating_add(equipment_bonus)
}

fn inventory_used(ctx: &ReducerContext, actor_id: &str) -> u32 {
    ctx.db.world_object().iter()
        .filter(|object| object.location_kind == "inventory" && object.location_id == actor_id)
        .count() as u32
}

fn inventory_has_space(ctx: &ReducerContext, actor_id: &str, additional_stacks: u32) -> bool {
    inventory_used(ctx, actor_id).saturating_add(additional_stacks) <= inventory_slots(ctx, actor_id)
}

fn equipment_slot_capacity(ctx: &ReducerContext, slot: &str) -> u32 {
    ctx.db.equipment_slot_definition().id().find(&slot.to_string()).map(|definition| definition.capacity.max(1)).unwrap_or(1)
}

fn cooldown_id(actor_id: &str, action_id: &str) -> String {
    format!("{actor_id}::{action_id}")
}

fn cooldown_remaining_ms(ctx: &ReducerContext, actor_id: &str, action_id: &str) -> u32 {
    let id = cooldown_id(actor_id, action_id);
    let Some(cooldown) = ctx.db.actor_cooldown().id().find(&id) else { return 0 };
    let remaining = cooldown.ready_at_micros.saturating_sub(ctx.timestamp.to_micros_since_unix_epoch());
    if remaining <= 0 { 0 } else { u32::try_from((remaining.saturating_add(999)) / 1000).unwrap_or(u32::MAX) }
}

fn set_cooldown(ctx: &ReducerContext, actor_id: &str, action_id: &str, duration_ms: u32) {
    let id = cooldown_id(actor_id, action_id);
    let row = ActorCooldown {
        id: id.clone(), actor_id: actor_id.to_string(), action_id: action_id.to_string(),
        ready_at_micros: ctx.timestamp.to_micros_since_unix_epoch().saturating_add(i64::from(duration_ms) * 1000),
        updated_at: ctx.timestamp,
    };
    if ctx.db.actor_cooldown().id().find(&id).is_some() {
        ctx.db.actor_cooldown().id().update(row);
    } else {
        ctx.db.actor_cooldown().insert(row);
    }
}

fn consume_object_quantity(ctx: &ReducerContext, object: WorldObject, quantity: u32) {
    if object.quantity > quantity {
        ctx.db.world_object().id().update(WorldObject {
            quantity: object.quantity - quantity,
            updated_at: ctx.timestamp,
            ..object
        });
    } else {
        delete_world_object_tree(ctx, &object.id);
    }
}

fn object_is_inside(ctx: &ReducerContext, object_id: &str, possible_ancestor_id: &str) -> bool {
    let mut current_id = object_id.to_string();
    let mut visited = Vec::new();
    loop {
        if current_id == possible_ancestor_id { return true; }
        if visited.contains(&current_id) { return false; }
        visited.push(current_id.clone());
        let Some(object) = ctx.db.world_object().id().find(&current_id) else { return false };
        if object.location_kind != "container" { return false; }
        current_id = object.location_id;
    }
}

fn rpg_message(ctx: &ReducerContext, room_id: &str, actor_id: &str, kind: &str, body: String) {
    add_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), None, None, kind, body, None, None);
}

fn list_inventory(ctx: &ReducerContext, room_id: &str, actor_id: &str) {
    let mut inventory = Vec::new();
    let mut equipment = Vec::new();
    for object in ctx.db.world_object().iter().filter(|object| object.location_id == actor_id) {
        let Some(definition) = object_definition_for(ctx, &object) else { continue };
        let durability = if definition.equipment_slot.is_some() || definition.weapon_damage > 0 || definition.armor_value > 0 {
            if object.durability == 0 { " · BROKEN".to_string() } else { format!(" · {} durability", object.durability) }
        } else { String::new() };
        let label = if object.quantity > 1 { format!("{} {} ×{}{}", definition.icon, definition.name, object.quantity, durability) } else { format!("{} {}{}", definition.icon, definition.name, durability) };
        if object.location_kind == "equipped" {
            equipment.push(format!("• {} [{}]", label, object.equipped_slot.clone().unwrap_or_else(|| "equipped".to_string())));
        } else if object.location_kind == "inventory" {
            inventory.push(format!("• {label}"));
        }
    }
    let mut sections = Vec::new();
    let used = inventory_used(ctx, actor_id);
    let slots = inventory_slots(ctx, actor_id);
    sections.push(if inventory.is_empty() { format!("[INVENTORY · {used}/{slots} SLOTS]\n• Empty") } else { format!("[INVENTORY · {used}/{slots} SLOTS]\n{}", inventory.join("\n")) });
    if !equipment.is_empty() { sections.push(format!("[EQUIPMENT]\n{}", equipment.join("\n"))); }
    rpg_message(ctx, room_id, actor_id, "system", sections.join("\n\n"));
}

fn list_stats(ctx: &ReducerContext, room_id: &str, actor_id: &str) {
    let mut definitions = ctx.db.stat_definition().iter().filter(|definition| definition.visible).collect::<Vec<_>>();
    definitions.sort_by(|left, right| left.name.cmp(&right.name));
    if definitions.is_empty() {
        rpg_message(ctx, room_id, actor_id, "system", "This world has no visible hero stats yet.".to_string());
        return;
    }
    let lines = definitions.into_iter().map(|definition| {
        let row = actor_stat_row(ctx, actor_id, &definition);
        let bonus = equipment_stat_bonus(ctx, actor_id, &definition.id);
        let training = if definition.player_allocatable {
            format!(" · train: {} point{} for +{} · invested {}", definition.point_cost.max(1), if definition.point_cost == 1 { "" } else { "s" }, definition.points_per_rank.max(1), row.invested_points)
        } else { String::new() };
        if bonus == 0 {
            format!("• {}: {}/{}{}", definition.name, row.current_value, row.base_value, training)
        } else {
            format!("• {}: {} ({:+} equipment) / {}{}", definition.name, row.current_value.saturating_add(bonus), bonus, row.base_value.saturating_add(bonus), training)
        }
    }).collect::<Vec<_>>();
    let config = world_progression_config(ctx);
    let progression = ensure_actor_progression(ctx, actor_id);
    let xp = if progression.level >= config.max_level.max(1) {
        "LEVEL CAP".to_string()
    } else {
        format!("{} / {} XP", progression.experience, xp_for_next_level(&config, progression.level))
    };
    let training_hint = if progression.unspent_stat_points > 0 {
        format!("\n\n[UNSPENT STAT POINTS: {}]\nUse `train <stat> [ranks]` to allocate them.", progression.unspent_stat_points)
    } else { String::new() };
    rpg_message(ctx, room_id, actor_id, "system", format!("[LEVEL {} · {}]\n\n[HERO STATS]\n{}{}", progression.level, xp, lines.join("\n"), training_hint));
}

fn describe_object(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) {
    let found = find_object_at(ctx, "room", room_id, query)
        .or_else(|| find_carried_object(ctx, actor_id, query));
    let Some((object, definition)) = found else {
        rpg_message(ctx, room_id, actor_id, "error", format!("There is no \"{query}\" here."));
        return;
    };
    let object = reconcile_fuel(ctx, object, &definition);
    let mut lines = vec![format!("[{} {}]", definition.icon, definition.name.to_uppercase()), definition.description.clone()];
    if definition.burn_rate > 0 {
        lines.push(if object.is_active {
            format!("It is burning with {} fuel-seconds remaining.", object.fuel_remaining / definition.burn_rate.max(1))
        } else if object.fuel_remaining > 0 {
            format!("It is unlit and holds {} fuel-seconds.", object.fuel_remaining / definition.burn_rate.max(1))
        } else { "It is cold and has no fuel.".to_string() });
    }
    if definition.equipment_slot.is_some() || definition.weapon_damage > 0 || definition.armor_value > 0 {
        lines.push(if object.durability == 0 { "It is broken and provides no equipment benefits.".to_string() } else { format!("Durability: {}.", object.durability) });
    }
    if definition.capacity > 0 {
        let contents = ctx.db.world_object().iter()
            .filter(|child| child.location_kind == "container" && child.location_id == object.id)
            .filter_map(|child| object_definition_for(ctx, &child).map(|child_definition| format!("• {} {} ×{}", child_definition.icon, child_definition.name, child.quantity)))
            .collect::<Vec<_>>();
        lines.push(if contents.is_empty() { "[CONTENTS]\n• Empty".to_string() } else { format!("[CONTENTS]\n{}", contents.join("\n")) });
    }
    rpg_message(ctx, room_id, actor_id, "system", lines.join("\n\n"));
}

fn target_actor_in_room(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) -> Option<(String, String, bool)> {
    let query = query.trim();
    ctx.db.npc().iter()
        .find(|npc| npc.current_room.as_deref() == Some(room_id)
            && (npc.name.eq_ignore_ascii_case(query) || npc.alias.as_deref().map(|alias| alias.eq_ignore_ascii_case(query)).unwrap_or(false)))
        .map(|npc| (npc.id, npc.name, true))
        .or_else(|| ctx.db.character().iter()
            .find(|character| character.id != actor_id && character.current_room.as_deref() == Some(room_id) && character.name.eq_ignore_ascii_case(query))
            .map(|character| (character.id, character.name, false)))
}

fn npc_disposition(npc: &Npc) -> &str {
    npc.disposition.as_deref().filter(|value| !value.trim().is_empty()).unwrap_or_else(|| {
        if npc.alias.as_deref().map(|alias| alias.eq_ignore_ascii_case("archie")).unwrap_or(false) { "friendly" } else { "neutral" }
    })
}

fn region_for_room(ctx: &ReducerContext, room_id: &str) -> Option<Region> {
    let room = ctx.db.room().id().find(&room_id.to_string())?;
    room.region_name
        .and_then(|name| ctx.db.region().name().find(&name))
        .or_else(|| ctx.db.region().iter().find(|region| {
            region.display_name.as_deref().map(|name| name.eq_ignore_ascii_case(&room.region)).unwrap_or(false)
                || region.name.eq_ignore_ascii_case(&room.region)
        }))
}

fn actor_current_room(ctx: &ReducerContext, actor_id: &str) -> Option<String> {
    let actor_id = actor_id.to_string();
    ctx.db.character().id().find(&actor_id).and_then(|actor| actor.current_room)
        .or_else(|| ctx.db.profile().id().find(&actor_id).and_then(|actor| actor.current_room))
        .or_else(|| ctx.db.npc().id().find(&actor_id).and_then(|actor| actor.current_room))
}

fn move_actor_to_room(ctx: &ReducerContext, actor_id: &str, room_id: &str) -> Result<(), String> {
    let actor_key = actor_id.to_string();
    let room_key = room_id.to_string();
    if ctx.db.room().id().find(&room_key).is_none() { return Err("Destination room does not exist.".to_string()); }
    if let Some(origin) = actor_current_room(ctx, actor_id).filter(|origin| origin != room_id) {
        interrupt_actor_casts(ctx, actor_id, &origin, "by moving");
    }
    if let Some(actor) = ctx.db.character().id().find(&actor_key) {
        ctx.db.character().id().update(Character { current_room: Some(room_key), ..actor });
    } else if let Some(actor) = ctx.db.profile().id().find(&actor_key) {
        ctx.db.profile().id().update(Profile { current_room: Some(room_key), ..actor });
    } else if let Some(actor) = ctx.db.npc().id().find(&actor_key) {
        ctx.db.npc().id().update(Npc { current_room: Some(room_key), defeated_at: None, ..actor });
    } else {
        return Err("Actor does not exist.".to_string());
    }
    Ok(())
}

fn reputation_id(actor_id: &str, faction_id: &str) -> String {
    format!("{actor_id}::{faction_id}")
}

fn actor_reputation(ctx: &ReducerContext, actor_id: &str, faction_id: &str) -> i32 {
    let id = reputation_id(actor_id, faction_id);
    if let Some(row) = ctx.db.actor_faction_reputation().id().find(&id) { return row.reputation; }
    let Some(faction) = ctx.db.faction_definition().id().find(&faction_id.to_string()) else { return 0 };
    ctx.db.actor_faction_reputation().insert(ActorFactionReputation {
        id,
        actor_id: actor_id.to_string(),
        faction_id: faction_id.to_string(),
        reputation: faction.starting_reputation,
        updated_at: ctx.timestamp,
    });
    faction.starting_reputation
}

fn change_reputation(ctx: &ReducerContext, actor_id: &str, faction_id: &str, delta: i32) -> Option<i32> {
    let faction = ctx.db.faction_definition().id().find(&faction_id.to_string())?;
    let id = reputation_id(actor_id, faction_id);
    let current = actor_reputation(ctx, actor_id, faction_id);
    let reputation = current.saturating_add(delta).clamp(faction.minimum_reputation, faction.maximum_reputation);
    let row = ActorFactionReputation {
        id: id.clone(), actor_id: actor_id.to_string(), faction_id: faction_id.to_string(), reputation, updated_at: ctx.timestamp,
    };
    if ctx.db.actor_faction_reputation().id().find(&id).is_some() { ctx.db.actor_faction_reputation().id().update(row); } else { ctx.db.actor_faction_reputation().insert(row); }
    Some(reputation)
}

fn faction_standing(faction: &FactionDefinition, reputation: i32) -> &'static str {
    if reputation <= faction.hostile_threshold { "Hostile" }
    else if reputation >= faction.friendly_threshold { "Friendly" }
    else { "Neutral" }
}

fn list_reputation(ctx: &ReducerContext, room_id: &str, actor_id: &str) {
    let mut factions = ctx.db.faction_definition().iter().collect::<Vec<_>>();
    factions.sort_by(|left, right| left.name.cmp(&right.name));
    if factions.is_empty() {
        rpg_message(ctx, room_id, actor_id, "system", "This world has no factions yet.".to_string());
        return;
    }
    let lines = factions.into_iter().map(|faction| {
        let value = actor_reputation(ctx, actor_id, &faction.id);
        format!("- {}: {} ({:+})", faction.name, faction_standing(&faction, value), value)
    }).collect::<Vec<_>>();
    rpg_message(ctx, room_id, actor_id, "system", format!("[FACTION REPUTATION]\n{}", lines.join("\n")));
}

fn ensure_wallet(ctx: &ReducerContext, actor_id: &str) -> ActorWallet {
    let id = actor_id.to_string();
    if let Some(wallet) = ctx.db.actor_wallet().id().find(&id) { return wallet; }
    let wallet = ActorWallet { id: id.clone(), actor_id: id, gold: 0, updated_at: ctx.timestamp };
    ctx.db.actor_wallet().insert(wallet.clone());
    wallet
}

fn object_belongs_to_actor(ctx: &ReducerContext, object: &WorldObject, actor_id: &str) -> bool {
    let mut current = object.clone();
    let mut visited = Vec::new();
    loop {
        if matches!(current.location_kind.as_str(), "inventory" | "equipped") { return current.location_id == actor_id; }
        if current.location_kind != "container" || visited.contains(&current.id) { return false; }
        visited.push(current.id.clone());
        let Some(parent) = ctx.db.world_object().id().find(&current.location_id) else { return false };
        current = parent;
    }
}

fn actor_item_quantity(ctx: &ReducerContext, actor_id: &str, definition_id: &str) -> u32 {
    ctx.db.world_object().iter()
        .filter(|object| object.definition_id == definition_id && object_belongs_to_actor(ctx, object, actor_id))
        .map(|object| object.quantity)
        .fold(0u32, u32::saturating_add)
}

fn consume_actor_items(ctx: &ReducerContext, actor_id: &str, definition_id: &str, mut quantity: u32) -> bool {
    if actor_item_quantity(ctx, actor_id, definition_id) < quantity { return false; }
    let objects = ctx.db.world_object().iter()
        .filter(|object| object.definition_id == definition_id && object_belongs_to_actor(ctx, object, actor_id))
        .collect::<Vec<_>>();
    for object in objects {
        if quantity == 0 { break; }
        let consumed = object.quantity.min(quantity);
        quantity -= consumed;
        consume_object_quantity(ctx, object, consumed);
    }
    quantity == 0
}

fn actor_quest_id(actor_id: &str, quest_id: &str) -> String { format!("{actor_id}::{quest_id}") }
fn quest_progress_id(actor_id: &str, objective_id: &str) -> String { format!("{actor_id}::{objective_id}") }

fn quest_objective_label(ctx: &ReducerContext, objective: &QuestObjective) -> String {
    if !objective.description.trim().is_empty() { return objective.description.clone(); }
    let target = match objective.objective_type.as_str() {
        "explore_room" => ctx.db.room().id().find(&objective.target_id).map(|row| row.name),
        "acquire_item" => ctx.db.object_definition().id().find(&objective.target_id).map(|row| row.name),
        "kill_npc" | "talk_npc" => ctx.db.npc().id().find(&objective.target_id).map(|row| row.name),
        "kill_faction" => ctx.db.faction_definition().id().find(&objective.target_id).map(|row| row.name),
        _ => None,
    }.unwrap_or_else(|| objective.target_id.clone());
    match objective.objective_type.as_str() {
        "explore_room" => format!("Explore {target}"),
        "acquire_item" => format!("Acquire {target}"),
        "kill_npc" => format!("Defeat {target}"),
        "kill_faction" => format!("Defeat members of {target}"),
        "talk_npc" => format!("Speak with {target}"),
        _ => target,
    }
}

fn objective_progress(ctx: &ReducerContext, actor_id: &str, objective: &QuestObjective) -> u32 {
    if objective.objective_type == "acquire_item" {
        return actor_item_quantity(ctx, actor_id, &objective.target_id).min(objective.required_count);
    }
    ctx.db.actor_quest_progress().id().find(&quest_progress_id(actor_id, &objective.id)).map(|row| row.progress).unwrap_or(0).min(objective.required_count)
}

fn set_objective_progress(ctx: &ReducerContext, actor_id: &str, objective: &QuestObjective, progress: u32) {
    let id = quest_progress_id(actor_id, &objective.id);
    let row = ActorQuestProgress {
        id: id.clone(), actor_id: actor_id.to_string(), quest_id: objective.quest_id.clone(), objective_id: objective.id.clone(),
        progress: progress.min(objective.required_count), updated_at: ctx.timestamp,
    };
    if ctx.db.actor_quest_progress().id().find(&id).is_some() { ctx.db.actor_quest_progress().id().update(row); } else { ctx.db.actor_quest_progress().insert(row); }
}

fn refresh_actor_quest(ctx: &ReducerContext, actor_id: &str, quest_id: &str) -> Option<ActorQuest> {
    let id = actor_quest_id(actor_id, quest_id);
    let mut actor_quest = ctx.db.actor_quest().id().find(&id)?;
    if actor_quest.status == "completed" { return Some(actor_quest); }
    let objectives = ctx.db.quest_objective().iter().filter(|objective| objective.quest_id == quest_id).collect::<Vec<_>>();
    let mut complete = true;
    for objective in objectives {
        let progress = objective_progress(ctx, actor_id, &objective);
        set_objective_progress(ctx, actor_id, &objective, progress);
        if progress < objective.required_count { complete = false; }
    }
    actor_quest.status = if complete { "ready".to_string() } else { "active".to_string() };
    actor_quest.updated_at = ctx.timestamp;
    ctx.db.actor_quest().id().update(actor_quest.clone());
    Some(actor_quest)
}

fn refresh_actor_acquire_quests(ctx: &ReducerContext, actor_id: &str) {
    let quest_ids = ctx.db.actor_quest().iter().filter(|row| row.actor_id == actor_id && row.status != "completed").map(|row| row.quest_id).collect::<Vec<_>>();
    for quest_id in quest_ids { refresh_actor_quest(ctx, actor_id, &quest_id); }
}

fn advance_quest_event(ctx: &ReducerContext, actor_id: &str, event_type: &str, target_id: &str, amount: u32) {
    let active_quests = ctx.db.actor_quest().iter().filter(|row| row.actor_id == actor_id && row.status != "completed").collect::<Vec<_>>();
    for actor_quest in active_quests {
        let objectives = ctx.db.quest_objective().iter().filter(|objective| {
            objective.quest_id == actor_quest.quest_id && objective.objective_type == event_type && objective.target_id == target_id
        }).collect::<Vec<_>>();
        for objective in objectives {
            let progress = objective_progress(ctx, actor_id, &objective).saturating_add(amount).min(objective.required_count);
            set_objective_progress(ctx, actor_id, &objective, progress);
        }
        refresh_actor_quest(ctx, actor_id, &actor_quest.quest_id);
    }
}

fn quest_matches(quest: &QuestDefinition, query: &str) -> bool {
    quest.id.eq_ignore_ascii_case(query) || quest.title.eq_ignore_ascii_case(query) || quest.title.to_lowercase().starts_with(&query.to_lowercase())
}

fn npc_matches(npc: &Npc, query: &str) -> bool {
    npc.id.eq_ignore_ascii_case(query) || npc.name.eq_ignore_ascii_case(query)
        || npc.alias.as_deref().map(|alias| alias.eq_ignore_ascii_case(query)).unwrap_or(false)
}

fn quest_requirement_error(ctx: &ReducerContext, actor_id: &str, quest: &QuestDefinition) -> Option<String> {
    let level = ensure_actor_progression(ctx, actor_id).level;
    if level < quest.required_level { return Some(format!("Requires level {}.", quest.required_level)); }
    if let Some(faction_id) = quest.required_faction_id.as_ref() {
        let reputation = actor_reputation(ctx, actor_id, faction_id);
        if reputation < quest.required_reputation { return Some(format!("Requires {:+} reputation with {}.", quest.required_reputation, ctx.db.faction_definition().id().find(faction_id).map(|row| row.name).unwrap_or_else(|| faction_id.clone()))); }
    }
    None
}

fn accept_quest(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) {
    let nearby_givers = ctx.db.npc().iter().filter(|npc| npc.current_room.as_deref() == Some(room_id)).map(|npc| npc.id).collect::<Vec<_>>();
    let Some(quest) = ctx.db.quest_definition().iter().find(|quest| quest.active && nearby_givers.contains(&quest.quest_giver_npc_id) && quest_matches(quest, query)) else {
        rpg_message(ctx, room_id, actor_id, "error", format!("No nearby quest giver offers \"{}\".", query.trim()));
        return;
    };
    if let Some(reason) = quest_requirement_error(ctx, actor_id, &quest) {
        rpg_message(ctx, room_id, actor_id, "error", format!("You cannot accept {}: {reason}", quest.title));
        return;
    }
    let id = actor_quest_id(actor_id, &quest.id);
    let existing = ctx.db.actor_quest().id().find(&id);
    if existing.as_ref().map(|row| row.status != "completed").unwrap_or(false) {
        rpg_message(ctx, room_id, actor_id, "error", format!("{} is already in your quest log.", quest.title));
        return;
    }
    if existing.is_some() && !quest.repeatable {
        rpg_message(ctx, room_id, actor_id, "error", format!("You have already completed {}.", quest.title));
        return;
    }
    let completion_count = existing.as_ref().map(|row| row.completion_count).unwrap_or(0);
    if existing.is_some() { ctx.db.actor_quest().id().delete(&id); }
    let stale = ctx.db.actor_quest_progress().iter().filter(|row| row.actor_id == actor_id && row.quest_id == quest.id).map(|row| row.id).collect::<Vec<_>>();
    for progress_id in stale { ctx.db.actor_quest_progress().id().delete(&progress_id); }
    ctx.db.actor_quest().insert(ActorQuest {
        id, actor_id: actor_id.to_string(), quest_id: quest.id.clone(), status: "active".to_string(), completion_count,
        accepted_at: ctx.timestamp, updated_at: ctx.timestamp, completed_at: None,
    });
    let objectives = ctx.db.quest_objective().iter().filter(|objective| objective.quest_id == quest.id).collect::<Vec<_>>();
    for objective in objectives { set_objective_progress(ctx, actor_id, &objective, 0); }
    advance_quest_event(ctx, actor_id, "explore_room", room_id, 1);
    refresh_actor_quest(ctx, actor_id, &quest.id);
    rpg_message(ctx, room_id, actor_id, "system", format!("[QUEST ACCEPTED] {}\n{}", quest.title, quest.description));
}

fn grant_quest_item(ctx: &ReducerContext, actor_id: &str, reward: &QuestItemReward, completion_count: u32) -> Option<String> {
    let definition = ctx.db.object_definition().id().find(&reward.definition_id)?;
    if definition.stackable {
        if let Some(existing) = ctx.db.world_object().iter().find(|object| object.location_kind == "inventory" && object.location_id == actor_id && object.definition_id == reward.definition_id) {
            ctx.db.world_object().id().update(WorldObject { quantity: existing.quantity.saturating_add(reward.quantity), updated_at: ctx.timestamp, ..existing });
            return Some(format!("{} x{}", definition.name, reward.quantity));
        }
    }
    let timestamp = ctx.timestamp.to_micros_since_unix_epoch();
    ctx.db.world_object().insert(WorldObject {
        id: format!("quest-reward-{}-{}-{completion_count}-{timestamp}", actor_id, reward.id),
        definition_id: reward.definition_id.clone(), location_kind: "inventory".to_string(), location_id: actor_id.to_string(),
        quantity: reward.quantity, equipped_slot: None, durability: 100, fuel_remaining: 0, is_active: false,
        state_json: format!(r#"{{"quest_reward":"{}"}}"#, reward.quest_id), created_at: ctx.timestamp, updated_at: ctx.timestamp,
    });
    Some(format!("{} x{}", definition.name, reward.quantity))
}

fn turn_in_quest(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) {
    let Some(quest) = ctx.db.quest_definition().iter().find(|quest| quest_matches(quest, query)) else {
        rpg_message(ctx, room_id, actor_id, "error", format!("There is no quest named \"{}\".", query.trim()));
        return;
    };
    let Some(turn_in_npc) = ctx.db.npc().id().find(&quest.turn_in_npc_id).filter(|npc| npc.current_room.as_deref() == Some(room_id)) else {
        rpg_message(ctx, room_id, actor_id, "error", "The quest's turn-in NPC is not here.".to_string());
        return;
    };
    let id = actor_quest_id(actor_id, &quest.id);
    if ctx.db.actor_quest().id().find(&id).is_none() {
        rpg_message(ctx, room_id, actor_id, "error", format!("You have not accepted {}.", quest.title));
        return;
    }
    refresh_actor_quest(ctx, actor_id, &quest.id);
    let Some(mut actor_quest) = ctx.db.actor_quest().id().find(&id) else { return };
    if actor_quest.status != "ready" {
        rpg_message(ctx, room_id, actor_id, "error", format!("{} is not complete yet. Use `quests` to review its objectives.", quest.title));
        return;
    }
    let rewards = ctx.db.quest_item_reward().iter().filter(|reward| reward.quest_id == quest.id).collect::<Vec<_>>();
    let needed_stacks = rewards.iter().filter(|reward| {
        ctx.db.object_definition().id().find(&reward.definition_id).map(|definition| !definition.stackable || !ctx.db.world_object().iter().any(|object| object.location_kind == "inventory" && object.location_id == actor_id && object.definition_id == reward.definition_id)).unwrap_or(false)
    }).count() as u32;
    if !inventory_has_space(ctx, actor_id, needed_stacks) {
        rpg_message(ctx, room_id, actor_id, "error", format!("You need {needed_stacks} free inventory stack(s) to receive the quest rewards."));
        return;
    }
    let objectives = ctx.db.quest_objective().iter().filter(|objective| objective.quest_id == quest.id && objective.objective_type == "acquire_item" && objective.consume_on_turn_in).collect::<Vec<_>>();
    let mut required_items = BTreeMap::<String, u32>::new();
    for objective in objectives {
        required_items.entry(objective.target_id).and_modify(|quantity| *quantity = (*quantity).max(objective.required_count)).or_insert(objective.required_count);
    }
    if required_items.iter().any(|(definition_id, quantity)| actor_item_quantity(ctx, actor_id, definition_id) < *quantity) {
        rpg_message(ctx, room_id, actor_id, "error", "A required quest item is no longer in your inventory.".to_string());
        refresh_actor_quest(ctx, actor_id, &quest.id);
        return;
    }
    for (definition_id, quantity) in required_items {
        consume_actor_items(ctx, actor_id, &definition_id, quantity);
    }
    let mut wallet = ensure_wallet(ctx, actor_id);
    wallet.gold = wallet.gold.saturating_add(quest.gold_reward).max(0);
    wallet.updated_at = ctx.timestamp;
    ctx.db.actor_wallet().id().update(wallet.clone());
    let xp_message = if quest.xp_reward > 0 { Some(award_experience(ctx, actor_id, quest.xp_reward)) } else { None };
    let reputation_message = quest.reputation_faction_id.as_ref().and_then(|faction_id| {
        change_reputation(ctx, actor_id, faction_id, quest.reputation_reward).map(|value| {
            let name = ctx.db.faction_definition().id().find(faction_id).map(|row| row.name).unwrap_or_else(|| faction_id.clone());
            format!("{name} reputation {:+} (now {:+})", quest.reputation_reward, value)
        })
    });
    actor_quest.status = "completed".to_string();
    actor_quest.completion_count = actor_quest.completion_count.saturating_add(1);
    actor_quest.completed_at = Some(ctx.timestamp);
    actor_quest.updated_at = ctx.timestamp;
    ctx.db.actor_quest().id().update(actor_quest.clone());
    let item_names = rewards.iter().filter_map(|reward| grant_quest_item(ctx, actor_id, reward, actor_quest.completion_count)).collect::<Vec<_>>();
    let mut reward_lines = vec![format!("{} gold (wallet: {})", quest.gold_reward, wallet.gold)];
    if let Some(message) = xp_message { reward_lines.push(message); }
    if let Some(message) = reputation_message { reward_lines.push(message); }
    if !item_names.is_empty() { reward_lines.push(format!("Items: {}", item_names.join(", "))); }
    rpg_message(ctx, room_id, actor_id, "system", format!("[QUEST COMPLETE] {}\n{} accepts your report.\n{}", quest.title, turn_in_npc.name, reward_lines.join("\n")));
}

fn list_quests(ctx: &ReducerContext, room_id: &str, actor_id: &str) {
    refresh_actor_acquire_quests(ctx, actor_id);
    let wallet = ensure_wallet(ctx, actor_id);
    let active = ctx.db.actor_quest().iter().filter(|row| row.actor_id == actor_id && row.status != "completed").collect::<Vec<_>>();
    let mut sections = Vec::new();
    for actor_quest in active {
        let Some(quest) = ctx.db.quest_definition().id().find(&actor_quest.quest_id) else { continue };
        let mut objectives = ctx.db.quest_objective().iter().filter(|objective| objective.quest_id == quest.id).collect::<Vec<_>>();
        objectives.sort_by_key(|objective| objective.sort_order);
        let lines = objectives.into_iter().map(|objective| format!("{} {}/{}", quest_objective_label(ctx, &objective), objective_progress(ctx, actor_id, &objective), objective.required_count)).collect::<Vec<_>>();
        sections.push(format!("[{} - {}]\n{}\nTurn in to: {}", quest.title, actor_quest.status.to_uppercase(), if lines.is_empty() { "No objectives".to_string() } else { lines.join("\n") }, ctx.db.npc().id().find(&quest.turn_in_npc_id).map(|npc| npc.name).unwrap_or_else(|| quest.turn_in_npc_id.clone())));
    }
    let nearby_npcs = ctx.db.npc().iter().filter(|npc| npc.current_room.as_deref() == Some(room_id)).map(|npc| npc.id).collect::<Vec<_>>();
    let offers = ctx.db.quest_definition().iter().filter(|quest| {
        if !quest.active || !nearby_npcs.contains(&quest.quest_giver_npc_id) || quest_requirement_error(ctx, actor_id, quest).is_some() { return false; }
        let state = ctx.db.actor_quest().id().find(&actor_quest_id(actor_id, &quest.id));
        state.is_none() || (state.map(|row| row.status == "completed").unwrap_or(false) && quest.repeatable)
    }).map(|quest| format!("- {} from {}", quest.title, ctx.db.npc().id().find(&quest.quest_giver_npc_id).map(|npc| npc.name).unwrap_or_else(|| quest.quest_giver_npc_id.clone()))).collect::<Vec<_>>();
    if !offers.is_empty() { sections.push(format!("[AVAILABLE HERE]\n{}\nUse `accept <quest>`.", offers.join("\n"))); }
    if sections.is_empty() { sections.push("No active quests or nearby offers.".to_string()); }
    rpg_message(ctx, room_id, actor_id, "system", format!("[QUEST LOG - {} GOLD]\n\n{}", wallet.gold, sections.join("\n\n")));
}

fn list_npc_quests(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) {
    let Some(npc) = ctx.db.npc().iter().find(|npc| npc.current_room.as_deref() == Some(room_id) && npc_matches(npc, query)) else {
        rpg_message(ctx, room_id, actor_id, "error", format!("There is no NPC named \"{}\" here.", query.trim()));
        return;
    };
    let mut lines = Vec::new();
    for quest in ctx.db.quest_definition().iter().filter(|quest| quest.active && quest.quest_giver_npc_id == npc.id) {
        let state = ctx.db.actor_quest().id().find(&actor_quest_id(actor_id, &quest.id));
        let status = if let Some(row) = state {
            if row.status == "completed" && !quest.repeatable { "completed".to_string() } else { row.status }
        } else { quest_requirement_error(ctx, actor_id, &quest).unwrap_or_else(|| "available".to_string()) };
        lines.push(format!("- {} [{}]\n  {}", quest.title, status, quest.description));
    }
    for quest in ctx.db.quest_definition().iter().filter(|quest| quest.turn_in_npc_id == npc.id) {
        if let Some(row) = ctx.db.actor_quest().id().find(&actor_quest_id(actor_id, &quest.id)).filter(|row| row.status != "completed") {
            lines.push(format!("- {} [{} - turn in here]", quest.title, row.status));
        }
    }
    rpg_message(ctx, room_id, actor_id, "system", if lines.is_empty() { format!("{} has no quest business with you.", npc.name) } else { format!("[QUESTS - {}]\n{}", npc.name, lines.join("\n")) });
}

fn guard_is_hostile_to_actor(ctx: &ReducerContext, guard: &Npc, actor_id: &str, room_id: &str) -> bool {
    let wanted = region_for_room(ctx, room_id).map(|region| {
        ctx.db.actor_crime().id().find(&format!("{actor_id}::{}", region.name)).map(|crime| crime.wanted_until_micros > ctx.timestamp.to_micros_since_unix_epoch()).unwrap_or(false)
    }).unwrap_or(false);
    if wanted { return true; }
    guard.faction.as_ref().and_then(|faction_id| ctx.db.faction_definition().id().find(faction_id).map(|faction| actor_reputation(ctx, actor_id, faction_id) <= faction.hostile_threshold)).unwrap_or(false)
}

fn record_safe_zone_crime(ctx: &ReducerContext, room_id: &str, actor_id: &str, actor_name: &str, victim_faction: Option<&str>, victim_is_player: bool, severity: u32) {
    let Some(region) = region_for_room(ctx, room_id) else { return };
    if region.pvp_enabled { return; }
    let guards_in_region = ctx.db.npc().iter().filter(|guard| guard.is_guard && guard.defeated_at.is_none() && guard.current_room.as_ref().and_then(|guard_room| region_for_room(ctx, guard_room)).map(|guard_region| guard_region.name == region.name).unwrap_or(false)).collect::<Vec<_>>();
    let wanted_seconds = guards_in_region.iter().map(|guard| guard.guard_wanted_seconds).max().unwrap_or(120);
    let id = format!("{actor_id}::{}", region.name);
    let existing = ctx.db.actor_crime().id().find(&id);
    let row = ActorCrime {
        id: id.clone(), actor_id: actor_id.to_string(), region_id: region.name.clone(), faction_id: victim_faction.map(str::to_string),
        severity: existing.as_ref().map(|crime| crime.severity).unwrap_or(0).saturating_add(severity),
        wanted_until_micros: existing.as_ref().map(|crime| crime.wanted_until_micros).unwrap_or(0).max(ctx.timestamp.to_micros_since_unix_epoch().saturating_add(i64::from(wanted_seconds) * 1_000_000)),
        updated_at: ctx.timestamp,
    };
    if existing.is_some() { ctx.db.actor_crime().id().update(row); } else { ctx.db.actor_crime().insert(row); }
    rpg_message(ctx, room_id, actor_id, "error", format!("That is a crime in this safe region. You are wanted for {wanted_seconds} seconds."));
    let Some(health) = stat_definition_by_role(ctx, "health") else { return };
    for guard in guards_in_region.into_iter().filter(|guard| {
        guard.current_room.as_deref() == Some(room_id) && ((victim_is_player && guard.protect_players) || (!victim_is_player && guard.protect_faction_members))
    }) {
        add_message(ctx, Some(room_id.to_string()), Some(guard.id.clone()), Some(guard.name.clone()), None, "npc_speech", format!("{}: \"Stop! You have broken the peace, {actor_name}!\"", guard.name), None, None);
        npc_attack_player(ctx, guard, room_id, actor_id, actor_name, &health);
        if actor_current_room(ctx, actor_id).as_deref() != Some(room_id) { break; }
    }
}

fn penalize_npc_attack(ctx: &ReducerContext, room_id: &str, actor_id: &str, actor_name: &str, npc: &Npc, killing: bool) {
    if npc_disposition(npc) == "hostile" { return; }
    if let Some(faction_id) = npc.faction.as_ref() {
        if let Some(faction) = ctx.db.faction_definition().id().find(faction_id) {
            let delta = if killing { faction.kill_penalty } else { faction.attack_penalty };
            if delta != 0 {
                if let Some(value) = change_reputation(ctx, actor_id, faction_id, delta) {
                    rpg_message(ctx, room_id, actor_id, "error", format!("{} reputation {:+} (now {:+}).", faction.name, delta, value));
                }
            }
        }
    }
    record_safe_zone_crime(ctx, room_id, actor_id, actor_name, npc.faction.as_deref(), false, if killing { 2 } else { 1 });
}

fn handle_room_entry(ctx: &ReducerContext, room_id: &str, actor_id: &str, actor_name: &str, character_id: Option<String>, is_profile: bool) {
    advance_quest_event(ctx, actor_id, "explore_room", room_id, 1);
    let npcs = ctx.db.npc().iter().filter(|npc| npc.current_room.as_deref() == Some(room_id) && npc.defeated_at.is_none()).collect::<Vec<_>>();
    for npc in npcs {
        if npc.is_guard {
            let greeting = npc.guard_greeting.clone().filter(|value| !value.trim().is_empty()).unwrap_or_else(|| format!("Halt and state your business, {actor_name}. Keep the peace while you are here."));
            add_message(ctx, Some(room_id.to_string()), Some(npc.id.clone()), Some(npc.name.clone()), None, "npc_speech", format!("{}: \"{}\"", npc.name, greeting), None, None);
        } else if npc.greeting_behavior != "none" {
            let private = !is_profile && npc.greeting_behavior == "private";
            add_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), None, if private { character_id.clone() } else { None }, if private { "npc_whisper" } else { "npc_speech" }, if private { format!("{} whispers to you: \"Welcome, {}.\"", npc.name, actor_name) } else { format!("{}: \"Welcome, {}.\"", npc.name, actor_name) }, None, None);
        }
    }
}

fn actor_health_max(ctx: &ReducerContext, actor_id: &str, definition: &StatDefinition) -> i32 {
    actor_stat_row(ctx, actor_id, definition).base_value.clamp(definition.minimum, definition.maximum)
}

fn combat_damage(ctx: &ReducerContext, attacker_id: &str, target_id: &str) -> (i32, String) {
    let equipped_weapon = ctx.db.world_object().iter()
        .filter(|object| object.location_kind == "equipped" && object.location_id == attacker_id && object.durability > 0)
        .filter_map(|object| object_definition_for(ctx, &object))
        .find(|definition| definition.weapon_damage > 0);
    let mut attack = equipped_weapon.as_ref().map(|weapon| weapon.weapon_damage).unwrap_or(1);
    if let Some(stat_id) = equipped_weapon.as_ref().and_then(|weapon| weapon.scales_with_stat.clone()) {
        if let Some(definition) = ctx.db.stat_definition().id().find(&stat_id) {
            attack = attack.saturating_add(actor_stat_value(ctx, attacker_id, &definition));
        }
    } else if let Some(power) = stat_definition_by_role(ctx, "power") {
        attack = attack.saturating_add(actor_stat_value(ctx, attacker_id, &power));
    }
    let innate_defense = stat_definition_by_role(ctx, "defense")
        .map(|definition| actor_stat_value(ctx, target_id, &definition))
        .unwrap_or(0);
    let armor = ctx.db.world_object().iter()
        .filter(|object| object.location_kind == "equipped" && object.location_id == target_id && object.durability > 0)
        .filter_map(|object| object_definition_for(ctx, &object))
        .map(|definition| definition.armor_value)
        .sum::<i32>();
    (
        attack.saturating_sub(innate_defense.saturating_add(armor)).max(1),
        equipped_weapon.map(|weapon| weapon.name).unwrap_or_else(|| "bare hands".to_string()),
    )
}

fn basic_attack_cooldown_ms(ctx: &ReducerContext, actor_id: &str) -> u32 {
    ctx.db.world_object().iter()
        .filter(|object| object.location_kind == "equipped" && object.location_id == actor_id && object.durability > 0)
        .filter_map(|object| object_definition_for(ctx, &object))
        .find(|definition| definition.weapon_damage > 0)
        .map(|weapon| weapon.attack_cooldown_ms)
        .unwrap_or(2000)
}

fn wear_equipped_weapon(ctx: &ReducerContext, actor_id: &str, room_id: &str) {
    let equipped = ctx.db.world_object().iter()
        .filter(|object| object.location_kind == "equipped" && object.location_id == actor_id && object.durability > 0)
        .find_map(|object| object_definition_for(ctx, &object).filter(|definition| definition.weapon_damage > 0).map(|definition| (object, definition)));
    let Some((object, definition)) = equipped else { return };
    let durability = object.durability.saturating_sub(1).max(0);
    ctx.db.world_object().id().update(WorldObject { durability, updated_at: ctx.timestamp, ..object });
    if durability == 0 {
        rpg_message(ctx, room_id, actor_id, "error", format!("Your {} breaks and no longer provides weapon damage or bonuses.", definition.name));
    }
}

fn wear_equipped_armor(ctx: &ReducerContext, actor_id: &str, room_id: &str) {
    let armor = ctx.db.world_object().iter()
        .filter(|object| object.location_kind == "equipped" && object.location_id == actor_id && object.durability > 0)
        .filter_map(|object| object_definition_for(ctx, &object).filter(|definition| definition.armor_value > 0).map(|definition| (object, definition)))
        .collect::<Vec<_>>();
    for (object, definition) in armor {
        let durability = object.durability.saturating_sub(1).max(0);
        ctx.db.world_object().id().update(WorldObject { durability, updated_at: ctx.timestamp, ..object });
        if durability == 0 {
            rpg_message(ctx, room_id, actor_id, "error", format!("Your {} breaks and no longer provides armor or bonuses.", definition.name));
        }
    }
}

fn deterministic_roll(seed: &str) -> u32 {
    seed.as_bytes().iter().fold(2_166_136_261u32, |hash, byte| {
        hash.wrapping_mul(16_777_619) ^ u32::from(*byte)
    })
}

fn ability_is_available(ctx: &ReducerContext, actor_id: &str, ability: &AbilityDefinition, level: u32) -> bool {
    if !ability.enabled { return false; }
    (ability.auto_learn && level >= ability.required_level)
        || ctx.db.actor_ability().id().find(&format!("{actor_id}::{}", ability.id)).is_some()
}

fn find_ability(ctx: &ReducerContext, query: &str) -> Option<AbilityDefinition> {
    let query = query.trim();
    ctx.db.ability_definition().iter().find(|ability| {
        ability.id.eq_ignore_ascii_case(query)
            || ability.name.eq_ignore_ascii_case(query)
            || ability.name.to_lowercase().starts_with(&query.to_lowercase())
    })
}

fn list_abilities(ctx: &ReducerContext, room_id: &str, actor_id: &str) {
    let progression = ensure_actor_progression(ctx, actor_id);
    let mut abilities = ctx.db.ability_definition().iter().filter(|ability| ability.enabled).collect::<Vec<_>>();
    abilities.sort_by(|left, right| left.required_level.cmp(&right.required_level).then(left.name.cmp(&right.name)));
    if abilities.is_empty() {
        rpg_message(ctx, room_id, actor_id, "system", "This world has no enabled abilities yet.".to_string());
        return;
    }
    let lines = abilities.into_iter().map(|ability| {
        let available = ability_is_available(ctx, actor_id, &ability, progression.level);
        let cost = ability.resource_stat_id.as_ref()
            .and_then(|id| ctx.db.stat_definition().id().find(id))
            .map(|stat| format!("{} {}", ability.resource_cost, stat.name))
            .unwrap_or_else(|| "free".to_string());
        let state = if available {
            let remaining = cooldown_remaining_ms(ctx, actor_id, &format!("ability:{}", ability.id));
            if remaining == 0 { "ready".to_string() } else { format!("{:.1}s cooldown", remaining as f32 / 1000.0) }
        } else if ability.auto_learn {
            format!("unlocks at level {}", ability.required_level)
        } else {
            "requires an admin grant".to_string()
        };
        format!("• {} {} — {} · {} · {}", ability.icon, ability.name, cost, ability.target_type, state)
    }).collect::<Vec<_>>();
    rpg_message(ctx, room_id, actor_id, "system", format!("[ABILITIES · LEVEL {}]\n{}\n\nUse `cast <ability> at <target>`; self abilities need no target.", progression.level, lines.join("\n")));
}

fn ability_power(ctx: &ReducerContext, actor_id: &str, ability: &AbilityDefinition) -> i32 {
    let range = ability.power_max.saturating_sub(ability.power_min).saturating_add(1).max(1) as u32;
    let rolled = ability.power_min.saturating_add((deterministic_roll(&format!("{actor_id}:{}:{}", ability.id, ctx.timestamp.to_micros_since_unix_epoch())) % range) as i32);
    let scaling = ability.scales_with_stat.as_ref()
        .and_then(|stat_id| ctx.db.stat_definition().id().find(stat_id))
        .map(|definition| actor_stat_value(ctx, actor_id, &definition).saturating_mul(ability.scaling_percent) / 100)
        .unwrap_or(0);
    rolled.saturating_add(scaling).max(0)
}

fn cast_ability(
    ctx: &ReducerContext,
    room_id: &str,
    actor_id: &str,
    actor_name: &str,
    ability_query: &str,
    target_query: Option<&str>,
    resolving_scheduled_cast: bool,
) {
    if resolving_scheduled_cast && actor_current_room(ctx, actor_id).as_deref() != Some(room_id) {
        let current_room = actor_current_room(ctx, actor_id).unwrap_or_else(|| room_id.to_string());
        rpg_message(ctx, &current_room, actor_id, "error", "Your cast is interrupted because you moved.".to_string());
        return;
    }
    if resolving_scheduled_cast && actor_is_dead(ctx, actor_id) {
        return;
    }
    let progression = ensure_actor_progression(ctx, actor_id);
    let Some(ability) = find_ability(ctx, ability_query) else {
        rpg_message(ctx, room_id, actor_id, "error", format!("There is no ability named \"{}\".", ability_query.trim()));
        return;
    };
    if !ability_is_available(ctx, actor_id, &ability, progression.level) {
        let reason = if ability.auto_learn { format!("It unlocks at level {}.", ability.required_level) } else { "It must be granted by an administrator.".to_string() };
        rpg_message(ctx, room_id, actor_id, "error", format!("You have not learned {}. {reason}", ability.name));
        return;
    }
    let action_id = format!("ability:{}", ability.id);
    let remaining = cooldown_remaining_ms(ctx, actor_id, &action_id);
    if remaining > 0 {
        rpg_message(ctx, room_id, actor_id, "error", format!("{} will be ready in {:.1} seconds.", ability.name, remaining as f32 / 1000.0));
        return;
    }
    if !resolving_scheduled_cast && ctx.db.scheduled_cast().iter().any(|cast| cast.actor_id == actor_id) {
        rpg_message(ctx, room_id, actor_id, "error", "You are already casting an ability.".to_string());
        return;
    }

    let target_query = target_query.map(str::trim).filter(|value| !value.is_empty());
    let target = match ability.target_type.as_str() {
        "self" => Some((actor_id.to_string(), actor_name.to_string(), false)),
        "ally" if target_query.is_none() || target_query.map(|value| value.eq_ignore_ascii_case("self") || value.eq_ignore_ascii_case("me") || value.eq_ignore_ascii_case(actor_name)).unwrap_or(false) => {
            Some((actor_id.to_string(), actor_name.to_string(), false))
        }
        "ally" => target_actor_in_room(ctx, room_id, actor_id, target_query.unwrap_or_default())
            .filter(|(target_id, _, target_is_npc)| *target_id == actor_id || !*target_is_npc || ctx.db.npc().id().find(target_id).map(|npc| npc_disposition(&npc) != "hostile").unwrap_or(false)),
        "enemy" => target_query.and_then(|query| target_actor_in_room(ctx, room_id, actor_id, query)),
        _ => None,
    };
    let Some((target_id, target_name, target_is_npc)) = target else {
        let usage = if ability.target_type == "self" { format!("cast {}", ability.name) } else { format!("cast {} at <target>", ability.name) };
        rpg_message(ctx, room_id, actor_id, "error", format!("No valid {} target was found. Use `{usage}`.", ability.target_type));
        return;
    };
    let target_npc = if target_is_npc { ctx.db.npc().id().find(&target_id) } else { None };
    if ability.target_type == "enemy" {
        if !target_is_npc && actor_is_dead(ctx, &target_id) {
            rpg_message(ctx, room_id, actor_id, "error", format!("{target_name} is awaiting respawn and cannot be attacked."));
            return;
        }
        if !target_is_npc && actor_has_spawn_protection(ctx, &target_id) {
            rpg_message(ctx, room_id, actor_id, "error", format!("{target_name} is protected after respawning."));
            return;
        }
        if !resolving_scheduled_cast {
            if let Some(npc) = target_npc.as_ref() {
                penalize_npc_attack(ctx, room_id, actor_id, actor_name, npc, false);
                if actor_current_room(ctx, actor_id).as_deref() != Some(room_id) { return; }
            } else if !target_is_npc && !region_for_room(ctx, room_id).map(|region| region.pvp_enabled).unwrap_or(false) {
                record_safe_zone_crime(ctx, room_id, actor_id, actor_name, None, true, 1);
            }
        }
        if target_npc.as_ref().map(|npc| npc_disposition(npc) == "friendly").unwrap_or(false) {
            rpg_message(ctx, room_id, actor_id, "error", format!("{target_name} is friendly and cannot be targeted by hostile abilities."));
            return;
        }
        if !target_is_npc && !region_for_room(ctx, room_id).map(|region| region.pvp_enabled).unwrap_or(false) {
            rpg_message(ctx, room_id, actor_id, "error", "Player combat is disabled in this region.".to_string());
            return;
        }
    }

    let resource = ability.resource_stat_id.as_ref().and_then(|id| ctx.db.stat_definition().id().find(id));
    if ability.resource_stat_id.is_some() && resource.is_none() {
        rpg_message(ctx, room_id, actor_id, "error", "This ability's resource stat no longer exists.".to_string());
        return;
    }
    if let Some(resource) = resource.as_ref() {
        let row = actor_stat_row(ctx, actor_id, resource);
        if row.current_value < ability.resource_cost {
            rpg_message(ctx, room_id, actor_id, "error", format!("{} needs {} {}, but you have {}.", ability.name, ability.resource_cost, resource.name, row.current_value));
            return;
        }
    }
    let effect_stat = ability.effect_stat_id.as_ref()
        .and_then(|id| ctx.db.stat_definition().id().find(id))
        .or_else(|| if matches!(ability.effect_type.as_str(), "damage" | "heal") { stat_definition_by_role(ctx, "health") } else { None });
    let Some(effect_stat) = effect_stat else {
        rpg_message(ctx, room_id, actor_id, "error", "This ability's effect stat is not configured.".to_string());
        return;
    };
    let target_row = actor_stat_row(ctx, &target_id, &effect_stat);
    if ability.effect_type == "damage" && target_row.current_value <= effect_stat.minimum {
        rpg_message(ctx, room_id, actor_id, "error", format!("{target_name} is already defeated."));
        return;
    }

    if ability.cast_time_ms > 0 && !resolving_scheduled_cast {
        let cast_at = ctx.timestamp + TimeDuration::from_micros(i64::from(ability.cast_time_ms).saturating_mul(1_000));
        ctx.db.scheduled_cast().insert(ScheduledCast {
            scheduled_id: 0,
            scheduled_at: cast_at.into(),
            actor_id: actor_id.to_string(),
            actor_name: actor_name.to_string(),
            room_id: room_id.to_string(),
            ability_id: ability.id.clone(),
            target_query: if ability.target_type == "self" { None } else { Some(target_name.clone()) },
        });
        add_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), Some(actor_name.to_string()), None, "combat",
            format!("{actor_name} begins casting {} {} ({:.1}s).", ability.icon, ability.name, ability.cast_time_ms as f32 / 1000.0), None, None);
        return;
    }

    if let Some(resource) = resource.as_ref() {
        let row = actor_stat_row(ctx, actor_id, resource);
        set_actor_stat_current(ctx, actor_id, resource, row.current_value.saturating_sub(ability.resource_cost));
    }
    if ability.target_type == "enemy" { clear_actor_spawn_protection(ctx, actor_id); }
    set_cooldown(ctx, actor_id, &action_id, ability.cooldown_ms);
    let mut power = ability_power(ctx, actor_id, &ability);
    if ability.effect_type == "damage" && ability.mitigation_type == "armor" {
        let innate_defense = stat_definition_by_role(ctx, "defense").map(|definition| actor_stat_value(ctx, &target_id, &definition)).unwrap_or(0);
        let armor = ctx.db.world_object().iter()
            .filter(|object| object.location_kind == "equipped" && object.location_id == target_id && object.durability > 0)
            .filter_map(|object| object_definition_for(ctx, &object))
            .map(|definition| definition.armor_value).sum::<i32>();
        power = power.saturating_sub(innate_defense.saturating_add(armor)).max(1);
    }

    match ability.effect_type.as_str() {
        "damage" => {
            let next = target_row.current_value.saturating_sub(power).max(effect_stat.minimum);
            interrupt_actor_casts(ctx, &target_id, room_id, "by taking damage");
            if ability.mitigation_type == "armor" { wear_equipped_armor(ctx, &target_id, room_id); }
            set_actor_stat_current(ctx, &target_id, &effect_stat, next);
            let result = if next <= effect_stat.minimum { format!(" {target_name} is defeated.") } else { format!(" {target_name} has {next} {} remaining.", effect_stat.name) };
            add_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), Some(actor_name.to_string()), None, "combat",
                format!("{actor_name} uses {} {} on {target_name} for {power} damage.{result}", ability.icon, ability.name), None, None);
            if next <= effect_stat.minimum {
                if let Some(npc) = target_npc {
                    penalize_npc_attack(ctx, room_id, actor_id, actor_name, &npc, true);
                    advance_quest_event(ctx, actor_id, "kill_npc", &npc.id, 1);
                    if let Some(faction_id) = npc.faction.as_ref() { advance_quest_event(ctx, actor_id, "kill_faction", faction_id, 1); }
                    let xp_reward = npc.xp_reward;
                    let drops = defeat_npc(ctx, npc, room_id);
                    rpg_message(ctx, room_id, actor_id, "system", award_experience(ctx, actor_id, xp_reward));
                    if !drops.is_empty() { rpg_message(ctx, room_id, actor_id, "system", format!("{target_name} drops {}.", drops.join(", "))); }
                } else {
                    defeat_player(ctx, &target_id, room_id, &target_name, Some(actor_name));
                }
            } else if let Some(npc) = target_npc {
                if npc_disposition(&npc) != "friendly" {
                    if let Some(health) = stat_definition_by_role(ctx, "health") {
                        npc_attack_player(ctx, npc, room_id, actor_id, actor_name, &health);
                    }
                }
            }
        }
        "heal" | "restore" => {
            let next = target_row.current_value.saturating_add(power).min(target_row.base_value);
            let applied = next.saturating_sub(target_row.current_value);
            set_actor_stat_current(ctx, &target_id, &effect_stat, next);
            add_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), Some(actor_name.to_string()), None, "combat",
                format!("{actor_name} uses {} {} on {target_name}, restoring {applied} {}.", ability.icon, ability.name, effect_stat.name), None, None);
        }
        _ => {}
    }
}

#[reducer]
pub fn resolve_scheduled_cast(ctx: &ReducerContext, cast: ScheduledCast) -> Result<(), String> {
    if ctx.sender() != ctx.identity() {
        return Err("Scheduled casts may only be resolved by the module scheduler.".to_string());
    }
    cast_ability(
        ctx,
        &cast.room_id,
        &cast.actor_id,
        &cast.actor_name,
        &cast.ability_id,
        cast.target_query.as_deref(),
        true,
    );
    Ok(())
}

fn drop_enemy_loot(ctx: &ReducerContext, npc: &Npc, room_id: &str) -> Vec<String> {
    let entries = ctx.db.loot_table_entry().iter()
        .filter(|entry| entry.npc_id == npc.id)
        .collect::<Vec<_>>();
    let timestamp = ctx.timestamp.to_micros_since_unix_epoch();
    let mut drops = Vec::new();
    for entry in entries {
        let roll_seed = format!("{}:{}:{timestamp}:chance", npc.id, entry.id);
        if deterministic_roll(&roll_seed) % 100 >= entry.chance_percent {
            continue;
        }
        let Some(definition) = ctx.db.object_definition().id().find(&entry.definition_id) else { continue };
        let range = entry.maximum_quantity.saturating_sub(entry.minimum_quantity).saturating_add(1);
        let quantity = entry.minimum_quantity.saturating_add(deterministic_roll(&format!("{}:{timestamp}:quantity", entry.id)) % range.max(1));
        let id = format!("drop-{}-{}-{timestamp}", npc.id, entry.id);
        ctx.db.world_object().insert(WorldObject {
            id,
            definition_id: entry.definition_id,
            location_kind: "room".to_string(),
            location_id: room_id.to_string(),
            quantity,
            equipped_slot: None,
            durability: 100,
            fuel_remaining: 0,
            is_active: false,
            state_json: format!(r#"{{"dropped_by":"{}"}}"#, npc.id),
            created_at: ctx.timestamp,
            updated_at: ctx.timestamp,
        });
        drops.push(if quantity > 1 { format!("{} x{quantity}", definition.name) } else { definition.name });
    }
    drops
}

fn defeat_npc(ctx: &ReducerContext, npc: Npc, room_id: &str) -> Vec<String> {
    let drops = drop_enemy_loot(ctx, &npc, room_id);
    let spawn_room = npc.spawn_room.clone().or_else(|| npc.current_room.clone());
    ctx.db.npc().id().update(Npc {
        current_room: None,
        spawn_room,
        defeated_at: Some(ctx.timestamp),
        last_attack_at: Some(ctx.timestamp),
        ..npc
    });
    drops
}

fn object_is_protected_on_death(definition: &ObjectDefinition) -> bool {
    serde_json::from_str::<Vec<String>>(&definition.tags).unwrap_or_default().iter().any(|tag| {
        tag.eq_ignore_ascii_case("soulbound") || tag.eq_ignore_ascii_case("keep-on-death")
    })
}

fn apply_death_item_loss(
    ctx: &ReducerContext,
    actor_id: &str,
    origin_room: &str,
    config: &WorldLifecycleConfig,
) -> (u32, u32) {
    let mode = config.inventory_loss_mode.as_str();
    if mode == "keep" { return (0, 0); }
    let include_equipped = matches!(mode, "drop_all" | "destroy_all") || config.include_equipped_in_loss;
    let candidates = ctx.db.world_object().iter()
        .filter(|object| object.location_id == actor_id
            && (object.location_kind == "inventory" || (include_equipped && object.location_kind == "equipped")))
        .filter(|object| object_definition_for(ctx, object).map(|definition| !object_is_protected_on_death(&definition)).unwrap_or(true))
        .collect::<Vec<_>>();
    let percentage_mode = matches!(mode, "drop_percentage" | "destroy_percentage");
    let destroy = matches!(mode, "destroy_inventory" | "destroy_all" | "destroy_percentage");
    let mut dropped = 0u32;
    let mut destroyed = 0u32;
    for object in candidates {
        if percentage_mode {
            let roll = deterministic_roll(&format!("death:{}:{}:{}", actor_id, object.id, ctx.timestamp.to_micros_since_unix_epoch())) % 100;
            if roll >= config.inventory_loss_percent { continue; }
        }
        if destroy {
            delete_world_object_tree(ctx, &object.id);
            destroyed = destroyed.saturating_add(1);
        } else {
            ctx.db.world_object().id().update(WorldObject {
                location_kind: "room".to_string(),
                location_id: origin_room.to_string(),
                equipped_slot: None,
                is_active: false,
                state_json: format!(r#"{{"dropped_on_death_by":"{}"}}"#, actor_id),
                updated_at: ctx.timestamp,
                ..object
            });
            dropped = dropped.saturating_add(1);
        }
    }
    (dropped, destroyed)
}

fn apply_death_progression_loss(ctx: &ReducerContext, actor_id: &str, config: &WorldLifecycleConfig) -> (i32, u32) {
    let actor_key = actor_id.to_string();
    let gold_lost = ctx.db.actor_wallet().id().find(&actor_key).map(|wallet| {
        let loss = i64::from(wallet.gold.max(0)).saturating_mul(i64::from(config.gold_loss_percent)) / 100;
        let loss = i32::try_from(loss).unwrap_or(i32::MAX);
        ctx.db.actor_wallet().id().update(ActorWallet { gold: wallet.gold.saturating_sub(loss), updated_at: ctx.timestamp, ..wallet });
        loss
    }).unwrap_or(0);
    let experience_lost = ctx.db.actor_progression().id().find(&actor_key).map(|progression| {
        let loss = u64::from(progression.experience).saturating_mul(u64::from(config.experience_loss_percent)) / 100;
        let loss = u32::try_from(loss).unwrap_or(u32::MAX);
        ctx.db.actor_progression().id().update(ActorProgression {
            experience: progression.experience.saturating_sub(loss), updated_at: ctx.timestamp, ..progression
        });
        loss
    }).unwrap_or(0);
    (gold_lost, experience_lost)
}

fn reset_active_quests_on_death(ctx: &ReducerContext, actor_id: &str) {
    let quest_ids = ctx.db.actor_quest().iter()
        .filter(|quest| quest.actor_id == actor_id && quest.status != "completed")
        .map(|quest| quest.id)
        .collect::<Vec<_>>();
    for quest_id in quest_ids { ctx.db.actor_quest().id().delete(&quest_id); }
    let progress_ids = ctx.db.actor_quest_progress().iter()
        .filter(|progress| progress.actor_id == actor_id && ctx.db.actor_quest().id().find(&actor_quest_id(actor_id, &progress.quest_id)).is_none())
        .map(|progress| progress.id)
        .collect::<Vec<_>>();
    for progress_id in progress_ids { ctx.db.actor_quest_progress().id().delete(&progress_id); }
}

fn legacy_respawn_room(ctx: &ReducerContext, origin_room: &str) -> String {
    region_for_room(ctx, origin_room)
        .and_then(|region| region.respawn_room_id)
        .filter(|room_id| ctx.db.room().id().find(room_id).is_some())
        .or_else(|| ctx.db.room().id().find(&STARTING_ROOM_ID.to_string()).map(|room| room.id))
        .unwrap_or_else(|| origin_room.to_string())
}

fn restore_actor_after_respawn(ctx: &ReducerContext, actor_id: &str, config: &WorldLifecycleConfig) -> Option<i32> {
    let definitions = ctx.db.stat_definition().iter().collect::<Vec<_>>();
    let mut restored_health = None;
    for definition in definitions {
        let Some(role) = definition.role.as_deref() else { continue };
        let percentage = if role == "health" { config.respawn_health_percent }
            else if matches!(role, "mana" | "energy" | "focus" | "resource") { config.respawn_resource_percent }
            else { continue };
        let row = actor_stat_row(ctx, actor_id, &definition);
        let usable = row.base_value.saturating_sub(definition.minimum).max(0);
        let restored = definition.minimum.saturating_add(usable.saturating_mul(percentage as i32) / 100)
            .clamp(definition.minimum, row.base_value.clamp(definition.minimum, definition.maximum));
        let restored = if role == "health" && restored <= definition.minimum && row.base_value > definition.minimum {
            definition.minimum.saturating_add(1)
        } else { restored };
        set_actor_stat_current(ctx, actor_id, &definition, restored);
        if role == "health" { restored_health = Some(restored); }
    }
    restored_health
}

fn clear_actor_spawn_protection(ctx: &ReducerContext, actor_id: &str) {
    let actor_key = actor_id.to_string();
    if let Some(state) = ctx.db.actor_life_state().id().find(&actor_key).filter(|state| state.protected_until_micros > 0) {
        ctx.db.actor_life_state().id().update(ActorLifeState { protected_until_micros: 0, updated_at: ctx.timestamp, ..state });
    }
}

fn interrupt_actor_casts(ctx: &ReducerContext, actor_id: &str, room_id: &str, reason: &str) {
    let casts = ctx.db.scheduled_cast().iter().filter(|row| row.actor_id == actor_id).collect::<Vec<_>>();
    if casts.is_empty() { return; }
    for cast in casts { ctx.db.scheduled_cast().scheduled_id().delete(cast.scheduled_id); }
    rpg_message(ctx, room_id, actor_id, "error", format!("Your cast is interrupted {reason}."));
}

fn complete_actor_respawn(ctx: &ReducerContext, actor_id: &str, actor_name: &str) -> Result<(), String> {
    let actor_key = actor_id.to_string();
    let Some(state) = ctx.db.actor_life_state().id().find(&actor_key) else { return Err("No death state exists for this actor.".to_string()) };
    if state.state != "dead" { return Err("You are already alive.".to_string()); }
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    if now < state.respawn_available_at_micros {
        let seconds = (state.respawn_available_at_micros.saturating_sub(now).saturating_add(999_999)) / 1_000_000;
        return Err(format!("You can respawn in {seconds} second{}.", if seconds == 1 { "" } else { "s" }));
    }
    let origin_room = state.death_room_id.clone().or_else(|| actor_current_room(ctx, actor_id)).unwrap_or_else(|| STARTING_ROOM_ID.to_string());
    let point = state.pending_spawn_point_id.as_ref().and_then(|id| ctx.db.spawn_point().id().find(id))
        .filter(|point| point.active && point.allows_respawn)
        .or_else(|| choose_respawn_point(ctx, actor_id, &origin_room));
    let destination = point.as_ref().map(|point| point.room_id.clone()).unwrap_or_else(|| legacy_respawn_room(ctx, &origin_room));
    if let Some(character) = ctx.db.character().id().find(&actor_key) {
        ctx.db.character().id().update(Character { current_room: Some(destination.clone()), ..character });
    } else if let Some(profile) = ctx.db.profile().id().find(&actor_key) {
        ctx.db.profile().id().update(Profile { current_room: Some(destination.clone()), ..profile });
    } else {
        return Err("This character no longer exists.".to_string());
    }
    let config = world_lifecycle_config(ctx);
    if config.clear_wanted_on_respawn {
        let crime_ids = ctx.db.actor_crime().iter().filter(|crime| crime.actor_id == actor_id).map(|crime| crime.id).collect::<Vec<_>>();
        for crime_id in crime_ids { ctx.db.actor_crime().id().delete(&crime_id); }
    }
    let restored_health = restore_actor_after_respawn(ctx, actor_id, &config);
    let protected_until_micros = now.saturating_add(i64::from(config.spawn_protection_seconds) * 1_000_000);
    ctx.db.actor_life_state().id().update(ActorLifeState {
        state: "alive".to_string(), death_room_id: None, pending_spawn_point_id: None,
        respawn_available_at_micros: 0, protected_until_micros, updated_at: ctx.timestamp, ..state
    });
    let recovery = restored_health.map(|value| format!(" with {value} health")).unwrap_or_default();
    let protection = if config.spawn_protection_seconds > 0 { format!(" You are protected from attacks for {} seconds, or until you attack.", config.spawn_protection_seconds) } else { String::new() };
    add_message(ctx, Some(destination), Some(actor_id.to_string()), None, Some(actor_id.to_string()), "system",
        format!("{actor_name} returns to the world{recovery}.{protection}"), None, None);
    Ok(())
}

fn defeat_player(ctx: &ReducerContext, actor_id: &str, origin_room: &str, actor_name: &str, defeated_by: Option<&str>) {
    if actor_is_dead(ctx, actor_id) { return; }
    let config = world_lifecycle_config(ctx);
    let spawn_point = choose_respawn_point(ctx, actor_id, origin_room);
    let (dropped, mut destroyed) = apply_death_item_loss(ctx, actor_id, origin_room, &config);
    let (gold_lost, experience_lost) = apply_death_progression_loss(ctx, actor_id, &config);
    if config.reset_quests_on_death { reset_active_quests_on_death(ctx, actor_id); }
    let actor_key = actor_id.to_string();
    let previous = ensure_actor_life_state(ctx, actor_id);
    let record_id = format!("{actor_id}:{}", ctx.timestamp.to_micros_since_unix_epoch());
    ctx.db.actor_death_record().insert(ActorDeathRecord {
        id: record_id, actor_id: actor_key.clone(), actor_name: actor_name.to_string(), death_room_id: origin_room.to_string(),
        spawn_point_id: spawn_point.as_ref().map(|point| point.id.clone()), death_mode: config.death_mode.clone(),
        defeated_by: defeated_by.map(str::to_string), item_stacks_dropped: dropped, item_stacks_destroyed: destroyed,
        gold_lost, experience_lost, died_at: ctx.timestamp,
    });
    add_message(ctx, Some(origin_room.to_string()), Some(actor_key.clone()), None, None, "combat", format!("{actor_name} is defeated."), None, None);

    if config.death_mode == "hardcore" && ctx.db.character().id().find(&actor_key).is_some() {
        let remaining = ctx.db.world_object().iter()
            .filter(|object| object.location_id == actor_id && matches!(object.location_kind.as_str(), "inventory" | "equipped"))
            .count() as u32;
        destroyed = destroyed.saturating_add(remaining);
        if let Some(record) = ctx.db.actor_death_record().id().find(&format!("{actor_id}:{}", ctx.timestamp.to_micros_since_unix_epoch())) {
            ctx.db.actor_death_record().id().update(ActorDeathRecord { item_stacks_destroyed: destroyed, ..record });
        }
        add_message(ctx, Some(origin_room.to_string()), Some(actor_key.clone()), None, Some(actor_key.clone()), "system",
            "Hardcore death is permanent. This character has been lost; create a new character to return.".to_string(), None, None);
        delete_actor_rpg_state(ctx, &actor_key);
        ctx.db.character().id().delete(&actor_key);
        return;
    }

    let respawn_available_at_micros = ctx.timestamp.to_micros_since_unix_epoch()
        .saturating_add(i64::from(config.respawn_delay_seconds) * 1_000_000);
    ctx.db.actor_life_state().id().update(ActorLifeState {
        state: "dead".to_string(), death_room_id: Some(origin_room.to_string()),
        pending_spawn_point_id: spawn_point.map(|point| point.id), death_count: previous.death_count.saturating_add(1),
        died_at: Some(ctx.timestamp), respawn_available_at_micros, protected_until_micros: 0, updated_at: ctx.timestamp, ..previous
    });
    if config.respawn_delay_seconds == 0 {
        let _ = complete_actor_respawn(ctx, actor_id, actor_name);
    } else {
        add_message(ctx, Some(origin_room.to_string()), Some(actor_key.clone()), None, Some(actor_key), "system",
            format!("You may respawn in {} seconds. Use `respawn` when the time has elapsed.", config.respawn_delay_seconds), None, None);
    }
}

fn npc_attack_player(ctx: &ReducerContext, npc: Npc, room_id: &str, actor_id: &str, actor_name: &str, health: &StatDefinition) {
    if actor_is_dead(ctx, actor_id) || actor_has_spawn_protection(ctx, actor_id) { return; }
    let current_health = actor_stat_row(ctx, actor_id, health).current_value;
    if current_health <= health.minimum { return; }
    let (damage, weapon_name) = combat_damage(ctx, &npc.id, actor_id);
    let next_health = current_health.saturating_sub(damage).max(health.minimum);
    interrupt_actor_casts(ctx, actor_id, room_id, "by taking damage");
    wear_equipped_weapon(ctx, &npc.id, room_id);
    wear_equipped_armor(ctx, actor_id, room_id);
    set_actor_stat_current(ctx, actor_id, health, next_health);
    ctx.db.npc().id().update(Npc { last_attack_at: Some(ctx.timestamp), ..npc.clone() });
    let result = if next_health <= health.minimum {
        format!(" {actor_name} is defeated.")
    } else {
        format!(" {actor_name} has {next_health} {} remaining.", health.name)
    };
    add_message(ctx, Some(room_id.to_string()), Some(npc.id.clone()), Some(npc.name.clone()), None, "combat",
        format!("{} attacks {actor_name} with {weapon_name} for {damage} damage.{result}", npc.name), None, None);
    if next_health <= health.minimum {
        defeat_player(ctx, actor_id, room_id, actor_name, Some(&npc.name));
    }
}

fn action_is_due(ctx: &ReducerContext, last_at: Option<Timestamp>, interval_seconds: u32) -> bool {
    last_at.map(|timestamp| {
        ctx.timestamp.to_micros_since_unix_epoch().saturating_sub(timestamp.to_micros_since_unix_epoch())
            >= i64::from(interval_seconds.max(1)) * 1_000_000
    }).unwrap_or(true)
}

fn advance_world(ctx: &ReducerContext, actor_id: &str, actor_name: &str) {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let defeated = ctx.db.npc().iter().filter(|npc| npc.defeated_at.is_some()).collect::<Vec<_>>();
    for npc in defeated {
        if npc.respawn_seconds == 0 { continue; }
        let elapsed = npc.defeated_at.map(|at| now.saturating_sub(at.to_micros_since_unix_epoch())).unwrap_or(0);
        if elapsed < i64::from(npc.respawn_seconds) * 1_000_000 { continue; }
        let Some(spawn_room) = npc.spawn_room.clone().filter(|room_id| ctx.db.room().id().find(room_id).is_some()) else { continue };
        if let Some(health) = stat_definition_by_role(ctx, "health") {
            let restored = actor_health_max(ctx, &npc.id, &health);
            set_actor_stat_current(ctx, &npc.id, &health, restored);
        }
        ctx.db.npc().id().update(Npc {
            current_room: Some(spawn_room.clone()),
            defeated_at: None,
            last_patrol_at: Some(ctx.timestamp),
            last_attack_at: Some(ctx.timestamp),
            ..npc.clone()
        });
        add_message(ctx, Some(spawn_room), Some(npc.id), Some(npc.name.clone()), None, "system", format!("{} returns.", npc.name), None, None);
    }

    let patrollers = ctx.db.npc().iter()
        .filter(|npc| npc.defeated_at.is_none() && matches!(npc.behavior_type.as_str(), "patrol" | "patrol_hostile"))
        .collect::<Vec<_>>();
    for npc in patrollers {
        if !action_is_due(ctx, npc.last_patrol_at, npc.patrol_interval_seconds) { continue; }
        let route = npc.patrol_route.as_deref().and_then(|route| serde_json::from_str::<Vec<String>>(route).ok()).unwrap_or_default();
        let Some(current_room) = npc.current_room.clone() else { continue };
        if route.len() < 2 { continue; }
        let current_index = route.iter().position(|room| room == &current_room).unwrap_or(npc.patrol_index as usize % route.len());
        let next_index = (current_index + 1) % route.len();
        let next_room = route[next_index].clone();
        let connected = ctx.db.exit().iter().any(|exit| exit.from_room.as_deref() == Some(current_room.as_str()) && exit.to_room.as_deref() == Some(next_room.as_str()));
        if !connected {
            ctx.db.npc().id().update(Npc { last_patrol_at: Some(ctx.timestamp), ..npc });
            continue;
        }
        ctx.db.npc().id().update(Npc {
            current_room: Some(next_room.clone()),
            patrol_index: next_index as u32,
            last_patrol_at: Some(ctx.timestamp),
            ..npc.clone()
        });
        add_message(ctx, Some(current_room), Some(npc.id.clone()), Some(npc.name.clone()), None, "system", format!("{} leaves on patrol.", npc.name), None, None);
        add_message(ctx, Some(next_room), Some(npc.id), Some(npc.name.clone()), None, "system", format!("{} arrives on patrol.", npc.name), None, None);
    }

    let Some(room_id) = actor_current_room(ctx, actor_id) else { return };
    let Some(health) = stat_definition_by_role(ctx, "health") else { return };
    let hostiles = ctx.db.npc().iter()
        .filter(|npc| !npc.is_guard && npc.current_room.as_deref() == Some(room_id.as_str()) && npc.defeated_at.is_none() && npc_disposition(npc) == "hostile" && npc.attack_on_sight)
        .collect::<Vec<_>>();
    for npc in hostiles {
        if actor_current_room(ctx, actor_id).as_deref() != Some(room_id.as_str()) { break; }
        if action_is_due(ctx, npc.last_attack_at, npc.attack_interval_seconds) {
            npc_attack_player(ctx, npc, &room_id, actor_id, actor_name, &health);
        }
    }
    let guards = ctx.db.npc().iter().filter(|npc| npc.is_guard && npc.current_room.as_deref() == Some(room_id.as_str()) && npc.defeated_at.is_none()).collect::<Vec<_>>();
    for guard in guards {
        if actor_current_room(ctx, actor_id).as_deref() != Some(room_id.as_str()) { break; }
        if guard_is_hostile_to_actor(ctx, &guard, actor_id, &room_id) && action_is_due(ctx, guard.last_attack_at, guard.attack_interval_seconds) {
            npc_attack_player(ctx, guard, &room_id, actor_id, actor_name, &health);
        }
    }
}

fn fuel_is_accepted(fuel: &ObjectDefinition, burner: &ObjectDefinition) -> bool {
    if fuel.fuel_value <= 0 { return false; }
    let accepted = serde_json::from_str::<Vec<String>>(&burner.accepted_fuel_tags).unwrap_or_default();
    if accepted.is_empty() { return true; }
    let tags = serde_json::from_str::<Vec<String>>(&fuel.tags).unwrap_or_default();
    accepted.iter().any(|accepted_tag| tags.iter().any(|tag| tag.eq_ignore_ascii_case(accepted_tag)))
}

fn handle_rpg_command(
    ctx: &ReducerContext,
    raw: &str,
    room_id: &str,
    actor_id: &str,
    actor_name: &str,
) -> Result<bool, String> {
    let lower = raw.trim().to_lowercase();
    ensure_actor_progression(ctx, actor_id);
    let life_state = ensure_actor_life_state(ctx, actor_id);
    if life_state.state == "dead" {
        if lower == "respawn" {
            if let Err(error) = complete_actor_respawn(ctx, actor_id, actor_name) {
                rpg_message(ctx, room_id, actor_id, "error", error);
            }
        } else {
            let remaining_micros = life_state.respawn_available_at_micros.saturating_sub(ctx.timestamp.to_micros_since_unix_epoch());
            let remaining_seconds = remaining_micros.saturating_add(999_999) / 1_000_000;
            let message = if remaining_seconds > 0 {
                format!("You are defeated. You can respawn in {remaining_seconds} second{}. Use `respawn` when ready.", if remaining_seconds == 1 { "" } else { "s" })
            } else {
                "You are defeated. Use `respawn` to return to the world.".to_string()
            };
            rpg_message(ctx, room_id, actor_id, "error", message);
        }
        return Ok(true);
    }

    if matches!(lower.as_str(), "inventory" | "inv" | "i" | "equipment") {
        list_inventory(ctx, room_id, actor_id);
        return Ok(true);
    }
    if matches!(lower.as_str(), "stats" | "status" | "sheet") {
        list_stats(ctx, room_id, actor_id);
        return Ok(true);
    }
    if let Some(rest) = lower.strip_prefix("train ").or_else(|| lower.strip_prefix("spend ")) {
        let (stat_query, ranks) = rest.rsplit_once(' ')
            .and_then(|(query, value)| value.parse::<u32>().ok().map(|ranks| (query, ranks)))
            .unwrap_or((rest, 1));
        match train_actor_stat(ctx, actor_id, stat_query, ranks) {
            Ok(message) => rpg_message(ctx, room_id, actor_id, "system", message),
            Err(error) => rpg_message(ctx, room_id, actor_id, "error", error),
        }
        return Ok(true);
    }
    if matches!(lower.as_str(), "abilities" | "spells" | "skills" | "powers") {
        list_abilities(ctx, room_id, actor_id);
        return Ok(true);
    }
    if matches!(lower.as_str(), "reputation" | "rep" | "factions") {
        list_reputation(ctx, room_id, actor_id);
        return Ok(true);
    }
    if matches!(lower.as_str(), "quests" | "quest log" | "journal") {
        list_quests(ctx, room_id, actor_id);
        return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("quest ") {
        list_npc_quests(ctx, room_id, actor_id, query.trim());
        return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("accept ") {
        accept_quest(ctx, room_id, actor_id, query.trim());
        return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("turn in ").or_else(|| lower.strip_prefix("complete ")) {
        turn_in_quest(ctx, room_id, actor_id, query.trim());
        return Ok(true);
    }
    if let Some(rest) = lower.strip_prefix("cast ").or_else(|| lower.strip_prefix("ability ")) {
        let (ability, target) = rest.split_once(" at ").map(|(ability, target)| (ability, Some(target))).unwrap_or((rest, None));
        cast_ability(ctx, room_id, actor_id, actor_name, ability.trim(), target, false);
        return Ok(true);
    }
    if matches!(lower.as_str(), "exits" | "directions") {
        let exits = ctx.db.exit().iter()
            .filter(|exit| exit.from_room.as_deref() == Some(room_id))
            .map(|exit| {
                let destination = exit.to_room.as_ref().and_then(|id| ctx.db.room().id().find(id)).map(|room| room.name).unwrap_or_else(|| "unknown destination".to_string());
                format!("• {} → {}", exit.verb, destination)
            })
            .collect::<Vec<_>>();
        rpg_message(ctx, room_id, actor_id, "system", if exits.is_empty() { "[EXITS]\n• None".to_string() } else { format!("[EXITS]\n{}", exits.join("\n")) });
        return Ok(true);
    }
    if matches!(lower.as_str(), "wait" | "pass") {
        rpg_message(ctx, room_id, actor_id, "system", "You wait and watch the world move around you.".to_string());
        return Ok(true);
    }
    if matches!(lower.as_str(), "combat" | "danger" | "consider") {
        let pvp_enabled = region_for_room(ctx, room_id).map(|region| region.pvp_enabled).unwrap_or(false);
        let enemies = ctx.db.npc().iter()
            .filter(|npc| npc.current_room.as_deref() == Some(room_id) && npc.defeated_at.is_none() && npc_disposition(npc) == "hostile")
            .map(|npc| format!("• {}", npc.name))
            .collect::<Vec<_>>();
        let mut body = format!("[COMBAT RULES]\n• Player versus player: {}", if pvp_enabled { "enabled in this region" } else { "disabled in this region" });
        body.push_str(if enemies.is_empty() { "\n\n[ENEMIES]\n• None visible" } else { "\n\n[ENEMIES]\n" });
        if !enemies.is_empty() { body.push_str(&enemies.join("\n")); }
        rpg_message(ctx, room_id, actor_id, "system", body);
        return Ok(true);
    }
    if lower == "rest" {
        let threatened = ctx.db.npc().iter().any(|npc| npc.current_room.as_deref() == Some(room_id) && npc.defeated_at.is_none() && npc_disposition(&npc) == "hostile");
        if threatened {
            rpg_message(ctx, room_id, actor_id, "error", "You cannot rest while a hostile enemy is present.".to_string());
        } else if stat_definition_by_role(ctx, "health").is_some() {
            let recoverable = ctx.db.stat_definition().iter()
                .filter(|definition| definition.regeneration_per_second > 0 || matches!(definition.role.as_deref(), Some("health" | "mana" | "energy" | "focus")))
                .collect::<Vec<_>>();
            let mut restored = Vec::new();
            for definition in recoverable {
                let maximum = actor_stat_row(ctx, actor_id, &definition).base_value;
                set_actor_stat_current(ctx, actor_id, &definition, maximum);
                restored.push(format!("{} {maximum}", definition.name));
            }
            rpg_message(ctx, room_id, actor_id, "system", format!("You rest and recover {}.", restored.join(", ")));
        } else {
            rpg_message(ctx, room_id, actor_id, "error", "Rest requires a stat with the Health role.".to_string());
        }
        return Ok(true);
    }
    if lower == "loot" {
        let loot = ctx.db.world_object().iter()
            .filter(|object| object.location_kind == "room" && object.location_id == room_id)
            .filter_map(|object| object_definition_for(ctx, &object).filter(|definition| definition.portable).map(|definition| format!("• {} {} x{}", definition.icon, definition.name, object.quantity)))
            .collect::<Vec<_>>();
        rpg_message(ctx, room_id, actor_id, "system", if loot.is_empty() { "There is no portable loot here.".to_string() } else { format!("[LOOT]\n{}\n\nUse `take <item>` to collect it.", loot.join("\n")) });
        return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("loot ") {
        describe_object(ctx, room_id, actor_id, query.trim());
        return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("examine ").or_else(|| lower.strip_prefix("open ")) {
        describe_object(ctx, room_id, actor_id, query.trim());
        return Ok(true);
    }

    if let Some(rest) = lower.strip_prefix("take ").or_else(|| lower.strip_prefix("get ")) {
        if let Some((item_query, container_query)) = rest.split_once(" from ") {
            let container = find_object_at(ctx, "room", room_id, container_query.trim())
                .or_else(|| find_carried_object(ctx, actor_id, container_query.trim()));
            let Some((container, container_definition)) = container else {
                rpg_message(ctx, room_id, actor_id, "error", format!("There is no \"{}\" here.", container_query.trim()));
                return Ok(true);
            };
            if container_definition.capacity == 0 {
                rpg_message(ctx, room_id, actor_id, "error", format!("{} is not a container.", container_definition.name));
                return Ok(true);
            }
            if item_query.trim() == "all" {
                let contents = ctx.db.world_object().iter()
                    .filter(|object| object.location_kind == "container" && object.location_id == container.id)
                    .collect::<Vec<_>>();
                let mut taken = Vec::new();
                let mut skipped = 0u32;
                for object in contents {
                    let Some(definition) = object_definition_for(ctx, &object) else { continue };
                    if !definition.portable { continue; }
                    if !inventory_has_space(ctx, actor_id, 1) { skipped = skipped.saturating_add(1); continue; }
                    ctx.db.world_object().id().update(WorldObject {
                        location_kind: "inventory".to_string(), location_id: actor_id.to_string(), equipped_slot: None,
                        updated_at: ctx.timestamp, ..object
                    });
                    taken.push(definition.name);
                }
                let message = if taken.is_empty() && skipped > 0 {
                    format!("Your inventory is full ({}/{} slots).", inventory_used(ctx, actor_id), inventory_slots(ctx, actor_id))
                } else if taken.is_empty() {
                    format!("{} contains nothing you can carry.", container_definition.name)
                } else if skipped > 0 {
                    format!("You take {} from {}. {skipped} stack(s) remain because your inventory is full.", taken.join(", "), container_definition.name)
                } else {
                    format!("You take {} from {}.", taken.join(", "), container_definition.name)
                };
                rpg_message(ctx, room_id, actor_id, "system", message);
                refresh_actor_acquire_quests(ctx, actor_id);
                return Ok(true);
            }
            let Some((object, definition)) = find_object_at(ctx, "container", &container.id, item_query.trim()) else {
                rpg_message(ctx, room_id, actor_id, "error", format!("{} does not contain that.", container_definition.name));
                return Ok(true);
            };
            if !definition.portable {
                rpg_message(ctx, room_id, actor_id, "error", format!("{} cannot be carried.", definition.name));
                return Ok(true);
            }
            if !inventory_has_space(ctx, actor_id, 1) {
                rpg_message(ctx, room_id, actor_id, "error", format!("Your inventory is full ({}/{} slots).", inventory_used(ctx, actor_id), inventory_slots(ctx, actor_id)));
                return Ok(true);
            }
            ctx.db.world_object().id().update(WorldObject {
                location_kind: "inventory".to_string(), location_id: actor_id.to_string(), equipped_slot: None,
                updated_at: ctx.timestamp, ..object
            });
            rpg_message(ctx, room_id, actor_id, "system", format!("You take {} from {}.", definition.name, container_definition.name));
            refresh_actor_acquire_quests(ctx, actor_id);
            return Ok(true);
        }

        let query = rest.trim();
        let Some((object, definition)) = find_object_at(ctx, "room", room_id, query) else {
            rpg_message(ctx, room_id, actor_id, "error", format!("There is no \"{query}\" here to take."));
            return Ok(true);
        };
        if !definition.portable {
            rpg_message(ctx, room_id, actor_id, "error", format!("{} is fixed in place.", definition.name));
            return Ok(true);
        }
        if !inventory_has_space(ctx, actor_id, 1) {
            rpg_message(ctx, room_id, actor_id, "error", format!("Your inventory is full ({}/{} slots).", inventory_used(ctx, actor_id), inventory_slots(ctx, actor_id)));
            return Ok(true);
        }
        ctx.db.world_object().id().update(WorldObject {
            location_kind: "inventory".to_string(), location_id: actor_id.to_string(), equipped_slot: None,
            is_active: false, updated_at: ctx.timestamp, ..object
        });
        rpg_message(ctx, room_id, actor_id, "system", format!("You take {}.", definition.name));
        refresh_actor_acquire_quests(ctx, actor_id);
        return Ok(true);
    }

    if let Some(query) = lower.strip_prefix("drop ") {
        let Some((object, definition)) = find_carried_object(ctx, actor_id, query.trim()) else {
            rpg_message(ctx, room_id, actor_id, "error", format!("You are not carrying \"{}\".", query.trim()));
            return Ok(true);
        };
        if object.location_kind == "equipped" && definition.inventory_slots_bonus > 0 {
            let post_slots = inventory_slots(ctx, actor_id).saturating_sub(definition.inventory_slots_bonus);
            if inventory_used(ctx, actor_id) > post_slots {
                rpg_message(ctx, room_id, actor_id, "error", format!("Dropping {} would reduce your capacity below the {} stacks already carried.", definition.name, inventory_used(ctx, actor_id)));
                return Ok(true);
            }
        }
        ctx.db.world_object().id().update(WorldObject {
            location_kind: "room".to_string(), location_id: room_id.to_string(), equipped_slot: None,
            is_active: false, updated_at: ctx.timestamp, ..object
        });
        rpg_message(ctx, room_id, actor_id, "system", format!("You drop {}.", definition.name));
        refresh_actor_acquire_quests(ctx, actor_id);
        return Ok(true);
    }

    if let Some(rest) = lower.strip_prefix("put ") {
        let Some((item_query, container_query)) = rest.split_once(" in ") else {
            rpg_message(ctx, room_id, actor_id, "error", "Use `put <item> in <container>`.".to_string());
            return Ok(true);
        };
        let Some((item, item_definition)) = find_object_at(ctx, "inventory", actor_id, item_query.trim()) else {
            rpg_message(ctx, room_id, actor_id, "error", format!("You are not carrying \"{}\".", item_query.trim()));
            return Ok(true);
        };
        let container = find_object_at(ctx, "room", room_id, container_query.trim())
            .or_else(|| find_carried_object(ctx, actor_id, container_query.trim()));
        let Some((container, container_definition)) = container else {
            rpg_message(ctx, room_id, actor_id, "error", format!("There is no \"{}\" here.", container_query.trim()));
            return Ok(true);
        };
        if container.id == item.id {
            rpg_message(ctx, room_id, actor_id, "error", "An object cannot contain itself.".to_string());
            return Ok(true);
        }
        if object_is_inside(ctx, &container.id, &item.id) {
            rpg_message(ctx, room_id, actor_id, "error", "That would create an impossible container loop.".to_string());
            return Ok(true);
        }
        if container_definition.burn_rate > 0 {
            if !fuel_is_accepted(&item_definition, &container_definition) {
                rpg_message(ctx, room_id, actor_id, "error", format!("{} cannot fuel {}.", item_definition.name, container_definition.name));
                return Ok(true);
            }
            let added = item_definition.fuel_value.saturating_mul(item.quantity as i32);
            let reconciled = reconcile_fuel(ctx, container, &container_definition);
            ctx.db.world_object().id().update(WorldObject {
                fuel_remaining: reconciled.fuel_remaining.saturating_add(added), updated_at: ctx.timestamp, ..reconciled
            });
            let quantity = item.quantity;
            consume_object_quantity(ctx, item, quantity);
            rpg_message(ctx, room_id, actor_id, "system", format!("You add {} to {} (+{} fuel-seconds).", item_definition.name, container_definition.name, added / container_definition.burn_rate.max(1)));
            refresh_actor_acquire_quests(ctx, actor_id);
            return Ok(true);
        }
        if container_definition.capacity == 0 {
            rpg_message(ctx, room_id, actor_id, "error", format!("{} cannot hold items.", container_definition.name));
            return Ok(true);
        }
        let occupied = ctx.db.world_object().iter().filter(|child| child.location_kind == "container" && child.location_id == container.id).count() as u32;
        if occupied >= container_definition.capacity {
            rpg_message(ctx, room_id, actor_id, "error", format!("{} is full.", container_definition.name));
            return Ok(true);
        }
        ctx.db.world_object().id().update(WorldObject {
            location_kind: "container".to_string(), location_id: container.id, equipped_slot: None,
            updated_at: ctx.timestamp, ..item
        });
        rpg_message(ctx, room_id, actor_id, "system", format!("You put {} in {}.", item_definition.name, container_definition.name));
        refresh_actor_acquire_quests(ctx, actor_id);
        return Ok(true);
    }

    if let Some(query) = lower.strip_prefix("equip ") {
        let Some((object, definition)) = find_object_at(ctx, "inventory", actor_id, query.trim()) else {
            rpg_message(ctx, room_id, actor_id, "error", format!("You are not carrying \"{}\".", query.trim()));
            return Ok(true);
        };
        let Some(slot) = definition.equipment_slot.clone() else {
            rpg_message(ctx, room_id, actor_id, "error", format!("{} is not equippable.", definition.name));
            return Ok(true);
        };
        let capacity = equipment_slot_capacity(ctx, &slot);
        let equipped_in_slot = ctx.db.world_object().iter()
            .filter(|item| item.location_kind == "equipped" && item.location_id == actor_id && item.equipped_slot.as_deref() == Some(slot.as_str()))
            .collect::<Vec<_>>();
        let displaced = if equipped_in_slot.len() as u32 >= capacity { equipped_in_slot.first().cloned() } else { None };
        let displaced_bonus = displaced.as_ref().and_then(|item| object_definition_for(ctx, item)).map(|value| value.inventory_slots_bonus).unwrap_or(0);
        let post_used = if displaced.is_some() { inventory_used(ctx, actor_id) } else { inventory_used(ctx, actor_id).saturating_sub(1) };
        let post_slots = inventory_slots(ctx, actor_id).saturating_sub(displaced_bonus).saturating_add(definition.inventory_slots_bonus);
        if post_used > post_slots {
            rpg_message(ctx, room_id, actor_id, "error", format!("Equipping {} would leave {post_used} stacks in only {post_slots} inventory slots.", definition.name));
            return Ok(true);
        }
        if equipped_in_slot.len() as u32 >= capacity {
            let occupied = displaced.expect("occupied slot has an item");
            ctx.db.world_object().id().update(WorldObject {
                location_kind: "inventory".to_string(), equipped_slot: None, updated_at: ctx.timestamp, ..occupied
            });
        }
        ctx.db.world_object().id().update(WorldObject {
            location_kind: "equipped".to_string(), equipped_slot: Some(slot.clone()), updated_at: ctx.timestamp, ..object
        });
        rpg_message(ctx, room_id, actor_id, "system", format!("You equip {} in your {} slot ({}/{capacity}).", definition.name, slot,
            ctx.db.world_object().iter().filter(|item| item.location_kind == "equipped" && item.location_id == actor_id && item.equipped_slot.as_deref() == Some(slot.as_str())).count()));
        return Ok(true);
    }

    if let Some(query) = lower.strip_prefix("unequip ") {
        let found = find_object_at(ctx, "equipped", actor_id, query.trim()).or_else(|| {
            ctx.db.world_object().iter()
                .find(|item| item.location_kind == "equipped" && item.location_id == actor_id && item.equipped_slot.as_deref().map(|slot| slot.eq_ignore_ascii_case(query.trim())).unwrap_or(false))
                .and_then(|item| object_definition_for(ctx, &item).map(|definition| (item, definition)))
        });
        let Some((object, definition)) = found else {
            rpg_message(ctx, room_id, actor_id, "error", format!("Nothing matching \"{}\" is equipped.", query.trim()));
            return Ok(true);
        };
        let post_slots = inventory_slots(ctx, actor_id).saturating_sub(definition.inventory_slots_bonus);
        if inventory_used(ctx, actor_id).saturating_add(1) > post_slots {
            rpg_message(ctx, room_id, actor_id, "error", format!("Your inventory is full ({}/{} slots). Drop or store something first.", inventory_used(ctx, actor_id), inventory_slots(ctx, actor_id)));
            return Ok(true);
        }
        ctx.db.world_object().id().update(WorldObject {
            location_kind: "inventory".to_string(), equipped_slot: None, updated_at: ctx.timestamp, ..object
        });
        rpg_message(ctx, room_id, actor_id, "system", format!("You unequip {}.", definition.name));
        return Ok(true);
    }

    if let Some(query) = lower.strip_prefix("light ") {
        let found = find_object_at(ctx, "room", room_id, query.trim()).or_else(|| find_carried_object(ctx, actor_id, query.trim()));
        let Some((object, definition)) = found else {
            rpg_message(ctx, room_id, actor_id, "error", format!("There is no \"{}\" here.", query.trim()));
            return Ok(true);
        };
        if definition.burn_rate <= 0 {
            rpg_message(ctx, room_id, actor_id, "error", format!("{} is not a fuel-burning object.", definition.name));
            return Ok(true);
        }
        let object = reconcile_fuel(ctx, object, &definition);
        if object.fuel_remaining <= 0 {
            rpg_message(ctx, room_id, actor_id, "error", format!("{} needs fuel first.", definition.name));
            return Ok(true);
        }
        ctx.db.world_object().id().update(WorldObject { is_active: true, updated_at: ctx.timestamp, ..object });
        rpg_message(ctx, room_id, actor_id, "system", format!("You light {}. It begins to burn.", definition.name));
        return Ok(true);
    }

    if let Some(query) = lower.strip_prefix("extinguish ") {
        let found = find_object_at(ctx, "room", room_id, query.trim()).or_else(|| find_carried_object(ctx, actor_id, query.trim()));
        let Some((object, definition)) = found else {
            rpg_message(ctx, room_id, actor_id, "error", format!("There is no \"{}\" here.", query.trim()));
            return Ok(true);
        };
        let object = reconcile_fuel(ctx, object, &definition);
        ctx.db.world_object().id().update(WorldObject { is_active: false, updated_at: ctx.timestamp, ..object });
        rpg_message(ctx, room_id, actor_id, "system", format!("You extinguish {}.", definition.name));
        return Ok(true);
    }

    if let Some(query) = lower.strip_prefix("use ") {
        let Some((object, definition)) = find_object_at(ctx, "inventory", actor_id, query.trim()) else {
            rpg_message(ctx, room_id, actor_id, "error", format!("You are not carrying \"{}\".", query.trim()));
            return Ok(true);
        };
        let behavior = serde_json::from_str::<Value>(&definition.on_use).unwrap_or(Value::Null);
        let Some(stat_id) = behavior.get("stat_id").and_then(Value::as_str) else {
            rpg_message(ctx, room_id, actor_id, "error", format!("{} has no use behavior configured.", definition.name));
            return Ok(true);
        };
        let Some(stat_definition) = ctx.db.stat_definition().id().find(&stat_id.to_string()) else {
            rpg_message(ctx, room_id, actor_id, "error", "The configured target stat no longer exists.".to_string());
            return Ok(true);
        };
        let delta = behavior.get("delta").and_then(Value::as_i64).unwrap_or(0) as i32;
        let current = actor_stat_row(ctx, actor_id, &stat_definition).current_value;
        set_actor_stat_current(ctx, actor_id, &stat_definition, current.saturating_add(delta));
        if behavior.get("consume").and_then(Value::as_bool).unwrap_or(true) { consume_object_quantity(ctx, object, 1); }
        rpg_message(ctx, room_id, actor_id, "system", format!("You use {}. {} changes by {:+}.", definition.name, stat_definition.name, delta));
        refresh_actor_acquire_quests(ctx, actor_id);
        return Ok(true);
    }

    if let Some(query) = lower.strip_prefix("attack ") {
        let Some(health_definition) = stat_definition_by_role(ctx, "health") else {
            rpg_message(ctx, room_id, actor_id, "error", "Combat is not configured: create a stat with the Health role.".to_string());
            return Ok(true);
        };
        let Some((target_id, target_name, target_is_npc)) = target_actor_in_room(ctx, room_id, actor_id, query.trim()) else {
            rpg_message(ctx, room_id, actor_id, "error", format!("There is no attackable target named \"{}\" here.", query.trim()));
            return Ok(true);
        };
        let target_npc = if target_is_npc { ctx.db.npc().id().find(&target_id) } else { None };
        if !target_is_npc && actor_is_dead(ctx, &target_id) {
            rpg_message(ctx, room_id, actor_id, "error", format!("{target_name} is awaiting respawn and cannot be attacked."));
            return Ok(true);
        }
        if !target_is_npc && actor_has_spawn_protection(ctx, &target_id) {
            rpg_message(ctx, room_id, actor_id, "error", format!("{target_name} is protected after respawning."));
            return Ok(true);
        }
        if let Some(npc) = target_npc.as_ref() {
            penalize_npc_attack(ctx, room_id, actor_id, actor_name, npc, false);
            if actor_current_room(ctx, actor_id).as_deref() != Some(room_id) { return Ok(true); }
        } else if !target_is_npc && !region_for_room(ctx, room_id).map(|region| region.pvp_enabled).unwrap_or(false) {
            record_safe_zone_crime(ctx, room_id, actor_id, actor_name, None, true, 1);
        }
        if target_npc.as_ref().map(|npc| npc_disposition(npc) == "friendly").unwrap_or(false) {
            rpg_message(ctx, room_id, actor_id, "error", format!("{target_name} is friendly and cannot be attacked."));
            return Ok(true);
        }
        if !target_is_npc && !region_for_room(ctx, room_id).map(|region| region.pvp_enabled).unwrap_or(false) {
            rpg_message(ctx, room_id, actor_id, "error", "Player combat is disabled in this region. Find a region marked for PvP.".to_string());
            return Ok(true);
        }
        let attacker_health = actor_stat_row(ctx, actor_id, &health_definition).current_value;
        if attacker_health <= health_definition.minimum {
            rpg_message(ctx, room_id, actor_id, "error", "You are defeated and cannot attack.".to_string());
            return Ok(true);
        }
        let remaining = cooldown_remaining_ms(ctx, actor_id, "basic-attack");
        if remaining > 0 {
            rpg_message(ctx, room_id, actor_id, "error", format!("Your next attack will be ready in {:.1} seconds.", remaining as f32 / 1000.0));
            return Ok(true);
        }
        let (damage, weapon_name) = combat_damage(ctx, actor_id, &target_id);
        let current_health = actor_stat_row(ctx, &target_id, &health_definition).current_value;
        if current_health <= health_definition.minimum {
            rpg_message(ctx, room_id, actor_id, "error", format!("{target_name} is already defeated."));
            return Ok(true);
        }
        clear_actor_spawn_protection(ctx, actor_id);
        set_cooldown(ctx, actor_id, "basic-attack", basic_attack_cooldown_ms(ctx, actor_id));
        let next_health = current_health.saturating_sub(damage).max(health_definition.minimum);
        interrupt_actor_casts(ctx, &target_id, room_id, "by taking damage");
        wear_equipped_weapon(ctx, actor_id, room_id);
        wear_equipped_armor(ctx, &target_id, room_id);
        set_actor_stat_current(ctx, &target_id, &health_definition, next_health);
        let result = if next_health <= health_definition.minimum { format!(" {target_name} is defeated.") } else { format!(" {target_name} has {next_health} {} remaining.", health_definition.name) };
        add_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), Some(actor_name.to_string()), None, "combat",
            format!("{actor_name} attacks {target_name} with {weapon_name} for {damage} damage.{result}"), None, None);
        if next_health <= health_definition.minimum {
            if let Some(npc) = target_npc {
                penalize_npc_attack(ctx, room_id, actor_id, actor_name, &npc, true);
                advance_quest_event(ctx, actor_id, "kill_npc", &npc.id, 1);
                if let Some(faction_id) = npc.faction.as_ref() { advance_quest_event(ctx, actor_id, "kill_faction", faction_id, 1); }
                let xp_reward = npc.xp_reward;
                let drops = defeat_npc(ctx, npc, room_id);
                rpg_message(ctx, room_id, actor_id, "system", award_experience(ctx, actor_id, xp_reward));
                let loot_message = if drops.is_empty() {
                    format!("{target_name} carried no loot.")
                } else {
                    format!("{target_name} drops {}. Use `loot` or `take <item>`.", drops.join(", "))
                };
                rpg_message(ctx, room_id, actor_id, "system", loot_message);
            } else {
                defeat_player(ctx, &target_id, room_id, &target_name, Some(actor_name));
            }
        } else if let Some(npc) = target_npc {
            if npc_disposition(&npc) != "friendly" {
                npc_attack_player(ctx, npc, room_id, actor_id, actor_name, &health_definition);
            }
        }
        return Ok(true);
    }

    Ok(false)
}

fn actor(ctx: &ReducerContext, character_id: &Option<String>) -> Result<(String, String, bool), String> {
    if let Some(character_id) = character_id {
        let character = ctx.db.character().id().find(character_id).ok_or_else(|| "Character not found.".to_string())?;
        if character.owner != ctx.sender() { return Err("That character belongs to another saved world.".to_string()); }
        Ok((character.name, character.id, false))
    } else {
        let profile = require_profile(ctx)?;
        Ok((profile.handle.unwrap_or_else(|| "Traveler".to_string()), profile.id, true))
    }
}

fn finish_command(ctx: &ReducerContext, command_id: &String) {
    if let Some(command) = ctx.db.command().id().find(command_id) {
        ctx.db.command().id().update(Command { processed_at: Some(ctx.timestamp), ..command });
    }
}

#[reducer]
pub fn submit_command(
    ctx: &ReducerContext,
    command_id: String,
    raw: String,
    character_id: Option<String>,
    room_id: Option<String>,
    conversation_history: Option<String>,
) -> Result<(), String> {
    ensure_profile(ctx);
    let (actor_name, actor_id, is_profile) = actor(ctx, &character_id)?;
    let world_actor_id = actor_id.clone();
    let world_actor_name = actor_name.clone();
    let requested_room_id = room_id.ok_or_else(|| "A room is required.".to_string())?;
    let room_id = actor_current_room(ctx, &actor_id).ok_or_else(|| "Your actor is not currently in a room.".to_string())?;
    if requested_room_id != room_id {
        return Err("The command room does not match your actor's current location.".to_string());
    }
    let raw = raw.trim().to_string();
    ctx.db.command().insert(Command {
        id: command_id.clone(), owner: ctx.sender(), character_id: character_id.clone(), room_id: Some(room_id.clone()),
        raw: raw.clone(), created_at: ctx.timestamp, processed_at: None, conversation_history,
        user_id: if is_profile { Some(identity_id(ctx.sender())) } else { None },
    });

    if handle_rpg_command(ctx, &raw, &room_id, &actor_id, &actor_name)? {
        advance_world(ctx, &world_actor_id, &world_actor_name);
        finish_command(ctx, &command_id);
        return Ok(());
    }

    if raw == "help" {
        add_message(ctx, Some(room_id), Some(actor_id.clone()), None, None, "system", "[AVAILABLE COMMANDS]\n\n• say <message> - Speak to everyone in the room\n• whisper <name> <message> - Send a private message\n• look / who - Examine the room and nearby actors\n• talk <npc> <message> - Speak to an AI-powered NPC\n• inspect <name> - Inspect a character\n• inventory / equipment / stats - View capacity, level, XP, resources, and gear\n• abilities - View learned and upcoming abilities\n• cast <ability> at <target> - Use magic, techniques, or utility powers\n• quests / quest <npc> - Review your journal or a nearby NPC's quests\n• accept <quest> / turn in <quest> - Start or complete quest work\n• reputation - View faction standings\n• take / drop / examine <item> - Interact with objects\n• open / loot <container> - View chest or container contents\n• take all from <container> - Collect portable contents\n• put <item> in <container> - Store an item or add fuel\n• equip / unequip / use <item> - Use gear and consumables\n• light / extinguish <object> - Control fuel-burning objects\n• combat / attack <target> - Check rules or make a weapon-speed-limited attack\n• rest / wait - Recover safely or let the world advance\n• flee <direction> - Escape through an exit\n• respawn - Return after the configured death delay\n• set handle <name> - Set your saved-world handle\n• <direction> - Move through an exit".to_string(), None, None);
    } else if let Some(handle) = raw.strip_prefix("set handle ") {
        let handle = handle.trim();
        if !is_profile || handle.is_empty() || handle.len() > 30 {
            add_message(ctx, Some(room_id), Some(actor_id.clone()), None, None, "error", "Use `set handle <name>` in profile mode (maximum 30 characters).".to_string(), None, None);
        } else if let Some(profile) = ctx.db.profile().id().find(&actor_id) {
            ctx.db.profile().id().update(Profile { handle: Some(handle.to_string()), ..profile });
            add_message(ctx, Some(room_id), Some(actor_id.clone()), None, None, "system", format!("Your handle has been set to: {handle}"), None, None);
        }
    } else if let Some(body) = raw.strip_prefix("say ") {
        let body = body.trim();
        if !body.is_empty() {
            let room = ctx.db.room().id().find(&room_id);
            let region_name = room.as_ref().and_then(|room| room.region_name.clone());
            let region = room.as_ref().map(|room| room.region.clone());
            add_message(ctx, Some(room_id.clone()), Some(actor_id.clone()), Some(actor_name.clone()), None, "say", body.to_string(), region.clone(), region_name.clone());
            if let Some(region_name) = region_name {
                ctx.db.region_chat().insert(RegionChat {
                    id: format!("chat-{command_id}"), region: region.unwrap_or_else(|| region_name.clone()), room_id: Some(room_id),
                    character_id: Some(actor_id.clone()), character_name: actor_name, body: body.to_string(), kind: "say".to_string(), created_at: ctx.timestamp,
                    region_name: Some(region_name),
                });
            }
        }
    } else if raw == "look" {
        if let Some(room) = ctx.db.room().id().find(&room_id) {
            let region_record = room.region_name.as_ref().and_then(|name| ctx.db.region().name().find(name));
            let region_label = region_record.as_ref().and_then(|region| region.display_name.clone()).or(room.region_name.clone());
            let heading = region_label.map(|region| format!("{} ({})", room.name.to_uppercase(), region.to_uppercase())).unwrap_or_else(|| room.name.to_uppercase());
            let mut body = room.image_url.as_ref().map(|url| format!("[IMAGE:{url}]\n")).unwrap_or_default();
            body.push_str(&format!("[LOCATION:{heading}]\n{}", room.description));
            body.push_str(if region_record.map(|region| region.pvp_enabled).unwrap_or(false) { "\n\n[ZONE RULE] Player combat is enabled here." } else { "\n\n[ZONE RULE] This is a safe region; player combat is disabled." });
            let characters = ctx.db.character().iter().filter(|row| row.current_room.as_deref() == Some(room_id.as_str()) && row.id != actor_id).map(|row| format!("• {}", row.name)).collect::<Vec<_>>();
            if !characters.is_empty() { body.push_str(&format!("\n\n[CHARACTERS]\n{}", characters.join("\n"))); }
            let npcs = ctx.db.npc().iter().filter(|row| row.current_room.as_deref() == Some(room_id.as_str())).map(|row| {
                let behavior = if row.is_guard { "GUARD" } else if npc_disposition(&row) == "hostile" { "ENEMY" } else if row.behavior_type.starts_with("patrol") { "PATROLLING" } else { "NPC" };
                format!("• {} [{} · {}] - {}", row.name, row.alias.unwrap_or_default(), behavior, row.description.unwrap_or_default())
            }).collect::<Vec<_>>();
            if !npcs.is_empty() { body.push_str(&format!("\n\n[NPCs]\n{}", npcs.join("\n"))); }
            let objects = ctx.db.world_object().iter()
                .filter(|object| object.location_kind == "room" && object.location_id == room_id)
                .filter_map(|object| object_definition_for(ctx, &object).map(|definition| (reconcile_fuel(ctx, object, &definition), definition)))
                .map(|(object, definition)| {
                    let quantity = if object.quantity > 1 { format!(" ×{}", object.quantity) } else { String::new() };
                    let state = if definition.burn_rate > 0 && object.is_active { " (burning)" } else { "" };
                    format!("• {} {}{}{}", definition.icon, definition.name, quantity, state)
                }).collect::<Vec<_>>();
            if !objects.is_empty() { body.push_str(&format!("\n\n[OBJECTS]\n{}", objects.join("\n"))); }
            let exits = ctx.db.exit().iter().filter(|row| row.from_room.as_deref() == Some(room_id.as_str())).map(|row| {
                let destination = row.to_room.as_ref().and_then(|id| ctx.db.room().id().find(id)).map(|room| room.name).unwrap_or_else(|| "unknown destination".to_string());
                format!("• {} → {}", row.verb, destination)
            }).collect::<Vec<_>>();
            if !exits.is_empty() { body.push_str(&format!("\n\n[EXITS]\n{}", exits.join("\n"))); }
            add_message(ctx, Some(room_id), Some(actor_id.clone()), None, None, "system", body, None, None);
        }
    } else if raw == "who" {
        let mut lines = Vec::new();
        let characters = ctx.db.character().iter().filter(|row| row.current_room.as_deref() == Some(room_id.as_str()) && row.id != actor_id).map(|row| format!("• {}", row.name)).collect::<Vec<_>>();
        if !characters.is_empty() { lines.push(format!("[CHARACTERS]\n{}", characters.join("\n"))); }
        let npcs = ctx.db.npc().iter().filter(|row| row.current_room.as_deref() == Some(room_id.as_str())).map(|row| {
            let label = if row.is_guard { "guard" } else if npc_disposition(&row) == "hostile" { "enemy" } else { "talk" };
            format!("• {} ({label} {})", row.name, row.alias.unwrap_or_default())
        }).collect::<Vec<_>>();
        if !npcs.is_empty() { lines.push(format!("[NPCs]\n{}", npcs.join("\n"))); }
        add_message(ctx, Some(room_id), Some(actor_id.clone()), None, None, "system", if lines.is_empty() { "You are alone here.".to_string() } else { lines.join("\n\n") }, None, None);
    } else if let Some(target) = raw.strip_prefix("inspect ") {
        let target = target.trim();
        let result = ctx.db.character().iter().find(|row| row.current_room.as_deref() == Some(room_id.as_str()) && row.name.eq_ignore_ascii_case(target));
        let body = result.map(|row| format!("[{}]\n{}", row.name.to_uppercase(), row.description.unwrap_or_else(|| "A persona inhabiting the Arkyv.".to_string())))
            .or_else(|| ctx.db.npc().iter().find(|npc| npc.current_room.as_deref() == Some(room_id.as_str()) && (npc.name.eq_ignore_ascii_case(target) || npc.alias.as_deref().map(|alias| alias.eq_ignore_ascii_case(target)).unwrap_or(false))).map(|npc| {
                let disposition = npc_disposition(&npc).to_uppercase();
                let movement = if npc.behavior_type.starts_with("patrol") { "patrolling" } else { "stationary" };
                format!("[{} · {} · {}]\n{}", npc.name.to_uppercase(), disposition, movement, npc.description.unwrap_or_else(|| "You cannot discern much about them.".to_string()))
            }))
            .unwrap_or_else(|| "No one by that name is here.".to_string());
        add_message(ctx, Some(room_id), Some(actor_id.clone()), None, None, "system", body, None, None);
    } else if let Some(rest) = raw.strip_prefix("whisper ") {
        let mut parts = rest.trim().splitn(2, ' ');
        let target = parts.next().unwrap_or_default();
        let body = parts.next().unwrap_or_default();
        if let Some(target_character) = ctx.db.character().iter().find(|row| row.current_room.as_deref() == Some(room_id.as_str()) && row.name.eq_ignore_ascii_case(target) && row.id != actor_id) {
            add_message(ctx, Some(room_id.clone()), Some(actor_id.clone()), Some(actor_name.clone()), Some(target_character.id.clone()), "whisper", format!("{actor_name} whispers to you: \"{body}\""), None, None);
            add_message(ctx, Some(room_id), Some(actor_id.clone()), Some(actor_name), Some(actor_id), "system", format!("You whisper to {}: \"{body}\"", target_character.name), None, None);
        } else {
            add_message(ctx, Some(room_id), Some(actor_id.clone()), None, None, "system", format!("There is no one named \"{target}\" here to whisper to."), None, None);
        }
    } else if let Some(rest) = raw.strip_prefix("talk ") {
        let alias = rest.split_whitespace().next().unwrap_or_default();
        if let Some(npc) = ctx.db.npc().iter().find(|npc| npc.current_room.as_deref() == Some(room_id.as_str()) && npc_matches(npc, alias)) {
            advance_quest_event(ctx, &actor_id, "talk_npc", &npc.id, 1);
            add_message(ctx, Some(room_id), Some(actor_id), None, None, "npc_typing", format!("{} is thinking...", npc.name), None, None);
            return Ok(());
        }
        add_message(ctx, Some(room_id), Some(actor_id.clone()), None, None, "system", format!("There is no one named \"{alias}\" here to talk to. Use 'who' to see who's present."), None, None);
    } else if raw == "__GREET" {
        handle_room_entry(ctx, &room_id, &actor_id, &actor_name, character_id.clone(), is_profile);
    } else if let Some(exit) = ctx.db.exit().iter().find(|exit| {
        let movement = raw.strip_prefix("flee ").unwrap_or(raw.as_str());
        exit.from_room.as_deref() == Some(room_id.as_str()) && exit.verb.eq_ignore_ascii_case(movement)
    }) {
        if let Some(destination) = exit.to_room {
            interrupt_actor_casts(ctx, &actor_id, &room_id, "by moving");
            if is_profile {
                if let Some(profile) = ctx.db.profile().id().find(&actor_id) { ctx.db.profile().id().update(Profile { current_room: Some(destination.clone()), ..profile }); }
            } else if let Some(character) = ctx.db.character().id().find(&actor_id) {
                ctx.db.character().id().update(Character { current_room: Some(destination.clone()), ..character });
            }
            handle_room_entry(ctx, &destination, &actor_id, &actor_name, character_id.clone(), is_profile);
            add_message(ctx, Some(destination), Some(actor_id.clone()), Some(actor_name.clone()), None, "system", format!("{actor_name} arrives."), None, None);
        }
    } else {
        add_message(ctx, Some(room_id), Some(actor_id), None, None, "system", format!("You cannot go \"{raw}\" from here. Type \"exits\" to see available directions."), None, None);
    }
    advance_world(ctx, &world_actor_id, &world_actor_name);
    finish_command(ctx, &command_id);
    Ok(())
}

#[reducer]
pub fn complete_npc_command(ctx: &ReducerContext, command_id: String, response: String) -> Result<(), String> {
    let command = ctx.db.command().id().find(&command_id).ok_or_else(|| "Pending command not found.".to_string())?;
    if command.owner != ctx.sender() { return Err("That command belongs to another saved world.".to_string()); }
    let room_id = command.room_id.clone().ok_or_else(|| "Command has no room.".to_string())?;
    let alias = command.raw.strip_prefix("talk ").and_then(|rest| rest.split_whitespace().next()).unwrap_or_default();
    let npc = ctx.db.npc().iter().find(|npc| npc.current_room.as_deref() == Some(room_id.as_str()) && npc.alias.as_deref().map(|value| value.eq_ignore_ascii_case(alias)).unwrap_or(false)).ok_or_else(|| "NPC is no longer present.".to_string())?;
    let typing_ids = ctx.db.room_message().iter().filter(|message| message.room_id.as_deref() == Some(room_id.as_str()) && message.kind == "npc_typing" && message.body.starts_with(&npc.name)).map(|message| message.id).collect::<Vec<_>>();
    for id in typing_ids { ctx.db.room_message().id().delete(id); }
    let actor_id = command.character_id.clone().or(command.user_id.clone());
    add_message(ctx, Some(room_id), actor_id, None, None, "npc_speech", format!("{}: {}", npc.name, response.trim()), None, None);
    finish_command(ctx, &command_id);
    Ok(())
}
