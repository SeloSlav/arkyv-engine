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
    pub updated_at: Timestamp,
    /// Total progression points deliberately invested by the player.
    #[default(0)]
    pub invested_points: u32,
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

/// Ordered, composable effects let one ability damage, heal, apply a status,
/// interrupt, move, revive, or summon without embedding behavior in JSON.
#[spacetimedb::table(accessor = ability_effect_definition, public)]
#[derive(Clone)]
pub struct AbilityEffectDefinition {
    #[primary_key]
    pub id: String,
    pub ability_id: String,
    pub effect_kind: String,
    pub target_scope: String,
    pub stat_id: Option<String>,
    pub power_min: i32,
    pub power_max: i32,
    pub scales_with_stat: Option<String>,
    pub scaling_percent: i32,
    pub mitigation_type: String,
    pub chance_percent: u32,
    pub duration_ms: u32,
    pub tick_interval_ms: u32,
    pub modifier_value: i32,
    pub max_stacks: u32,
    pub status_name: String,
    pub destination_room_id: Option<String>,
    pub summon_npc_id: Option<String>,
    pub sort_order: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_status_effect, public)]
#[derive(Clone)]
pub struct ActorStatusEffect {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub source_actor_id: String,
    pub ability_id: String,
    pub effect_id: String,
    pub name: String,
    pub kind: String,
    pub stat_id: Option<String>,
    pub modifier_value: i32,
    pub stacks: u32,
    pub expires_at_micros: i64,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = scheduled_effect_tick, scheduled(resolve_scheduled_effect_tick))]
#[derive(Clone)]
pub struct ScheduledEffectTick {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
    pub source_actor_id: String,
    pub source_actor_name: String,
    pub target_actor_id: String,
    pub ability_id: String,
    pub effect_id: String,
    pub remaining_ticks: u32,
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

/// World-wide combat probabilities and scaling. Stat definitions whose roles
/// are accuracy, crit, dodge, parry, block, or resistance:<school> add to the
/// corresponding authored baseline at runtime.
#[spacetimedb::table(accessor = world_combat_config, public)]
#[derive(Clone)]
pub struct WorldCombatConfig {
    #[primary_key]
    pub id: String,
    pub base_hit_chance_percent: u32,
    pub base_crit_chance_percent: u32,
    pub crit_damage_percent: u32,
    pub base_dodge_chance_percent: u32,
    pub base_parry_chance_percent: u32,
    pub base_block_chance_percent: u32,
    pub block_damage_reduction_percent: u32,
    pub armor_effectiveness_percent: u32,
    pub pvp_damage_percent: u32,
    pub global_cooldown_ms: u32,
    pub assist_xp_percent: u32,
    pub threat_enabled: bool,
    pub threat_decay_seconds: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = npc_threat, public)]
#[derive(Clone)]
pub struct NpcThreat {
    #[primary_key]
    pub id: String,
    pub npc_id: String,
    pub actor_id: String,
    pub threat: u32,
    pub damage_contributed: u32,
    pub updated_at_micros: i64,
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

/// Optional authored rules extend a quest with prerequisites, timers, failure,
/// completion caps, and a follow-up without bloating the core quest row.
#[spacetimedb::table(accessor = quest_rule, public)]
#[derive(Clone)]
pub struct QuestRule {
    #[primary_key]
    pub quest_id: String,
    pub prerequisite_quest_id: Option<String>,
    pub prerequisite_completions: u32,
    pub time_limit_seconds: u32,
    pub failure_on_death: bool,
    pub next_quest_id: Option<String>,
    pub maximum_completions: u32,
    pub updated_at: Timestamp,
}

/// Player-facing branch presented by the `choose` command during a quest.
#[spacetimedb::table(accessor = quest_choice, public)]
#[derive(Clone)]
pub struct QuestChoice {
    #[primary_key]
    pub id: String,
    pub quest_id: String,
    pub label: String,
    pub description: String,
    pub next_quest_id: Option<String>,
    pub gold_reward: i32,
    pub reputation_faction_id: Option<String>,
    pub reputation_reward: i32,
    pub sort_order: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_quest_choice, public)]
#[derive(Clone)]
pub struct ActorQuestChoice {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub quest_id: String,
    pub choice_id: String,
    pub chosen_at: Timestamp,
}

/// Reusable race, class, and background definitions for character creation.
#[spacetimedb::table(accessor = character_option_definition, public)]
#[derive(Clone)]
pub struct CharacterOptionDefinition {
    #[primary_key]
    pub id: String,
    pub option_kind: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub starting_room_id: Option<String>,
    pub starting_gold: i32,
    pub active: bool,
    pub sort_order: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A structured stat, item, or ability granted by a character option.
#[spacetimedb::table(accessor = character_option_grant, public)]
#[derive(Clone)]
pub struct CharacterOptionGrant {
    #[primary_key]
    pub id: String,
    pub option_id: String,
    pub grant_kind: String,
    pub reference_id: String,
    pub amount: i32,
    pub equipped_slot: Option<String>,
    pub sort_order: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_character_option, public)]
#[derive(Clone)]
pub struct ActorCharacterOption {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub option_id: String,
    pub option_kind: String,
    pub selected_at: Timestamp,
}

/// Admin roles use explicit permission keys. Existing administrators without
/// an assignment remain owners with full access for backwards compatibility.
#[spacetimedb::table(accessor = admin_role_definition, public)]
#[derive(Clone)]
pub struct AdminRoleDefinition {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub description: String,
    pub permissions: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = admin_role_assignment, public)]
#[derive(Clone)]
pub struct AdminRoleAssignment {
    #[primary_key]
    pub profile_id: String,
    pub role_id: String,
    pub assigned_at: Timestamp,
}

/// Multiple currencies, vendor inventories, recipes, and banked items form the
/// authored economy layer. The legacy gold wallet remains the default coin.
#[spacetimedb::table(accessor = currency_definition, public)]
#[derive(Clone)]
pub struct CurrencyDefinition {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub icon: String,
    pub maximum_balance: i64,
    pub tradeable: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_currency, public)]
#[derive(Clone)]
pub struct ActorCurrency {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub currency_id: String,
    pub balance: i64,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = vendor_definition, public)]
#[derive(Clone)]
pub struct VendorDefinition {
    #[primary_key]
    pub id: String,
    pub npc_id: String,
    pub name: String,
    pub currency_id: String,
    pub buys_from_players: bool,
    pub sell_price_percent: u32,
    pub required_faction_id: Option<String>,
    pub required_reputation: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = vendor_stock, public)]
#[derive(Clone)]
pub struct VendorStock {
    #[primary_key]
    pub id: String,
    pub vendor_id: String,
    pub definition_id: String,
    pub price: i64,
    pub stock: i32,
    pub maximum_per_purchase: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = crafting_recipe, public)]
#[derive(Clone)]
pub struct CraftingRecipe {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub description: String,
    pub output_definition_id: String,
    pub output_quantity: u32,
    pub station_tag: Option<String>,
    pub required_level: u32,
    pub currency_id: Option<String>,
    pub currency_cost: i64,
    pub active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = crafting_ingredient, public)]
#[derive(Clone)]
pub struct CraftingIngredient {
    #[primary_key]
    pub id: String,
    pub recipe_id: String,
    pub definition_id: String,
    pub quantity: u32,
    pub consumed: bool,
    pub created_at: Timestamp,
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
    #[default(None::<String>)]
    pub required_option_id: Option<String>,
    #[default(None::<String>)]
    pub required_faction_id: Option<String>,
    #[default(0)]
    pub required_reputation: i32,
    #[default(None::<String>)]
    pub death_region_id: Option<String>,
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
    #[default(0)]
    pub maximum_lives: u32,
    #[default(false)]
    pub create_lootable_corpse: bool,
    #[default(true)]
    pub allow_ability_revive: bool,
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
    #[default(0)]
    pub lives_remaining: u32,
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
    let profile = require_profile(ctx)?;
    if profile.is_admin || ctx.db.admin_role_assignment().profile_id().find(&profile.id).is_some() {
        Ok(())
    } else {
        Err("Administrator access is required.".to_string())
    }
}

fn require_permission(ctx: &ReducerContext, permission: &str) -> Result<(), String> {
    let profile = require_profile(ctx)?;
    let Some(assignment) = ctx.db.admin_role_assignment().profile_id().find(&profile.id) else {
        return if profile.is_admin { Ok(()) } else { Err("Administrator access is required.".to_string()) };
    };
    let role = ctx.db.admin_role_definition().id().find(&assignment.role_id).ok_or_else(|| "The assigned admin role no longer exists.".to_string())?;
    let permissions = serde_json::from_str::<Vec<String>>(&role.permissions).unwrap_or_default();
    if permissions.iter().any(|value| value == "*" || value == permission) { Ok(()) } else { Err(format!("Your admin role does not grant `{permission}`.")) }
}

fn table_permission(table_name: &str) -> &'static str {
    match table_name {
        "profiles" | "characters" | "actor_stats" | "actor_progressions" | "actor_faction_reputations" | "actor_wallets" | "actor_cooldowns" | "actor_crimes" | "actor_quests" | "actor_quest_progress" | "actor_death_records" => "players.moderate",
        "admin_role_definitions" | "admin_role_assignments" => "roles.manage",
        "currency_definitions" | "vendor_definitions" | "vendor_stocks" | "crafting_recipes" | "crafting_ingredients" => "economy.manage",
        "quest_definitions" | "quest_objectives" | "quest_item_rewards" | "quest_rules" | "quest_choices" => "quests.manage",
        "world_lifecycle_configs" | "spawn_points" => "lifecycle.manage",
        "stat_definitions" | "progression_configs" | "equipment_slot_definitions" | "ability_definitions" | "ability_effect_definitions" | "world_combat_configs" | "character_option_definitions" | "character_option_grants" => "systems.manage",
        _ => "world.manage",
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

fn i64_value(value: &Value, key: &str, fallback: i64) -> i64 {
    value.get(key).and_then(Value::as_i64).unwrap_or(fallback)
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

    if ctx.db.world_combat_config().id().find(&"world".to_string()).is_none() {
        ctx.db.world_combat_config().insert(WorldCombatConfig {
            id: "world".to_string(), base_hit_chance_percent: 90, base_crit_chance_percent: 5,
            crit_damage_percent: 150, base_dodge_chance_percent: 3, base_parry_chance_percent: 3,
            base_block_chance_percent: 3, block_damage_reduction_percent: 40,
            armor_effectiveness_percent: 100, pvp_damage_percent: 100, global_cooldown_ms: 1000,
            assist_xp_percent: 50, threat_enabled: true, threat_decay_seconds: 30,
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
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
            required_option_id: None, required_faction_id: None, required_reputation: 0, death_region_id: None,
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
        maximum_lives: 0, create_lootable_corpse: false, allow_ability_revive: true,
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
    if !matches!(table_name.as_str(), "profiles" | "characters") { require_permission(ctx, table_permission(&table_name))?; }

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
        "world_combat_configs" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", "world");
                if ctx.db.world_combat_config().id().find(&id).is_some() { return Err("A combat configuration with that id already exists.".to_string()); }
                ctx.db.world_combat_config().insert(WorldCombatConfig {
                    id,
                    base_hit_chance_percent: u32_value(&row, "base_hit_chance_percent", 90).min(100),
                    base_crit_chance_percent: u32_value(&row, "base_crit_chance_percent", 5).min(100),
                    crit_damage_percent: u32_value(&row, "crit_damage_percent", 150).max(100),
                    base_dodge_chance_percent: u32_value(&row, "base_dodge_chance_percent", 3).min(100),
                    base_parry_chance_percent: u32_value(&row, "base_parry_chance_percent", 3).min(100),
                    base_block_chance_percent: u32_value(&row, "base_block_chance_percent", 3).min(100),
                    block_damage_reduction_percent: u32_value(&row, "block_damage_reduction_percent", 40).min(100),
                    armor_effectiveness_percent: u32_value(&row, "armor_effectiveness_percent", 100),
                    pvp_damage_percent: u32_value(&row, "pvp_damage_percent", 100),
                    global_cooldown_ms: u32_value(&row, "global_cooldown_ms", 1000),
                    assist_xp_percent: u32_value(&row, "assist_xp_percent", 50).min(100),
                    threat_enabled: bool_value(&row, "threat_enabled", true),
                    threat_decay_seconds: u32_value(&row, "threat_decay_seconds", 30),
                    created_at: ctx.timestamp, updated_at: ctx.timestamp,
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
        "ability_effect_definitions" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", "");
                let ability_id = string(&row, "ability_id", "");
                let effect_kind = string(&row, "effect_kind", "damage").to_lowercase();
                let target_scope = string(&row, "target_scope", "primary").to_lowercase();
                if id.is_empty() || ctx.db.ability_effect_definition().id().find(&id).is_some() { return Err("Ability effect id is missing or already exists.".to_string()); }
                if ctx.db.ability_definition().id().find(&ability_id).is_none() { return Err("Ability effect requires an existing ability.".to_string()); }
                if !matches!(effect_kind.as_str(), "damage" | "heal" | "restore" | "damage_over_time" | "heal_over_time" | "buff" | "debuff" | "stun" | "interrupt" | "cleanse" | "teleport" | "revive" | "summon") { return Err("Unsupported ability effect kind.".to_string()); }
                if !matches!(target_scope.as_str(), "primary" | "self" | "all_enemies" | "all_allies" | "room") { return Err("Unsupported ability effect target scope.".to_string()); }
                let stat_id = optional_string(&row, "stat_id").filter(|value| !value.trim().is_empty());
                let scales_with_stat = optional_string(&row, "scales_with_stat").filter(|value| !value.trim().is_empty());
                for stat in [stat_id.as_ref(), scales_with_stat.as_ref()].into_iter().flatten() {
                    if ctx.db.stat_definition().id().find(stat).is_none() { return Err(format!("Ability effect references missing stat: {stat}")); }
                }
                let destination_room_id = optional_string(&row, "destination_room_id").filter(|value| !value.trim().is_empty());
                if destination_room_id.as_ref().map(|id| ctx.db.room().id().find(id).is_none()).unwrap_or(false) { return Err("Teleport destination room does not exist.".to_string()); }
                let summon_npc_id = optional_string(&row, "summon_npc_id").filter(|value| !value.trim().is_empty());
                if summon_npc_id.as_ref().map(|id| ctx.db.npc().id().find(id).is_none()).unwrap_or(false) { return Err("Summoned NPC does not exist.".to_string()); }
                let power_min = i32_value(&row, "power_min", 0);
                ctx.db.ability_effect_definition().insert(AbilityEffectDefinition {
                    id, ability_id, effect_kind, target_scope, stat_id, power_min,
                    power_max: i32_value(&row, "power_max", power_min).max(power_min), scales_with_stat,
                    scaling_percent: i32_value(&row, "scaling_percent", 0).max(0),
                    mitigation_type: string(&row, "mitigation_type", "none"), chance_percent: u32_value(&row, "chance_percent", 100).min(100),
                    duration_ms: u32_value(&row, "duration_ms", 0), tick_interval_ms: u32_value(&row, "tick_interval_ms", 1000).max(1),
                    modifier_value: i32_value(&row, "modifier_value", 0), max_stacks: u32_value(&row, "max_stacks", 1).max(1),
                    status_name: string(&row, "status_name", "Status"), destination_room_id, summon_npc_id,
                    sort_order: u32_value(&row, "sort_order", 100), created_at: ctx.timestamp, updated_at: ctx.timestamp,
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
                    "acquire_item" | "deliver_item" | "interact_object" => ctx.db.object_definition().id().find(&target_id).is_some(),
                    "kill_npc" | "talk_npc" | "escort_npc" => ctx.db.npc().id().find(&target_id).is_some(),
                    "kill_faction" => ctx.db.faction_definition().id().find(&target_id).is_some(),
                    "pay_gold" | "choice" | "survive" => true,
                    _ => return Err("Unsupported quest objective type.".to_string()),
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
        "quest_rules" => {
            require_admin(ctx)?;
            for row in rows {
                let quest_id = string(&row, "quest_id", "");
                if ctx.db.quest_definition().id().find(&quest_id).is_none() || ctx.db.quest_rule().quest_id().find(&quest_id).is_some() { return Err("Quest rule requires an existing quest without a rule.".to_string()); }
                let prerequisite_quest_id = optional_string(&row, "prerequisite_quest_id").filter(|value| !value.trim().is_empty());
                let next_quest_id = optional_string(&row, "next_quest_id").filter(|value| !value.trim().is_empty());
                for reference in [prerequisite_quest_id.as_ref(), next_quest_id.as_ref()].into_iter().flatten() {
                    if ctx.db.quest_definition().id().find(reference).is_none() { return Err(format!("Quest rule references missing quest: {reference}")); }
                }
                ctx.db.quest_rule().insert(QuestRule { quest_id, prerequisite_quest_id, prerequisite_completions: u32_value(&row, "prerequisite_completions", 1), time_limit_seconds: u32_value(&row, "time_limit_seconds", 0), failure_on_death: bool_value(&row, "failure_on_death", false), next_quest_id, maximum_completions: u32_value(&row, "maximum_completions", 0), updated_at: ctx.timestamp });
            }
        }
        "quest_choices" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", ""); let quest_id = string(&row, "quest_id", "");
                if id.is_empty() || ctx.db.quest_choice().id().find(&id).is_some() || ctx.db.quest_definition().id().find(&quest_id).is_none() { return Err("Quest choice requires a unique id and existing quest.".to_string()); }
                let next_quest_id = optional_string(&row, "next_quest_id").filter(|value| !value.trim().is_empty());
                let reputation_faction_id = optional_string(&row, "reputation_faction_id").filter(|value| !value.trim().is_empty());
                if next_quest_id.as_ref().map(|value| ctx.db.quest_definition().id().find(value).is_none()).unwrap_or(false) { return Err("Choice follow-up quest does not exist.".to_string()); }
                if reputation_faction_id.as_ref().map(|value| ctx.db.faction_definition().id().find(value).is_none()).unwrap_or(false) { return Err("Choice reputation faction does not exist.".to_string()); }
                ctx.db.quest_choice().insert(QuestChoice { id, quest_id, label: string(&row, "label", "Choice"), description: string(&row, "description", ""), next_quest_id, gold_reward: i32_value(&row, "gold_reward", 0), reputation_faction_id, reputation_reward: i32_value(&row, "reputation_reward", 0), sort_order: u32_value(&row, "sort_order", 100), created_at: ctx.timestamp, updated_at: ctx.timestamp });
            }
        }
        "character_option_definitions" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", ""))); let option_kind = string(&row, "option_kind", "class").to_lowercase();
                if id.is_empty() || ctx.db.character_option_definition().id().find(&id).is_some() { return Err("Character option id is missing or already exists.".to_string()); }
                if !matches!(option_kind.as_str(), "race" | "class" | "background") { return Err("Character option kind must be race, class, or background.".to_string()); }
                let starting_room_id = optional_string(&row, "starting_room_id").filter(|value| !value.trim().is_empty());
                if starting_room_id.as_ref().map(|value| ctx.db.room().id().find(value).is_none()).unwrap_or(false) { return Err("Character option starting room does not exist.".to_string()); }
                ctx.db.character_option_definition().insert(CharacterOptionDefinition { id, option_kind, name: string(&row, "name", "Untitled option"), description: string(&row, "description", ""), icon: string(&row, "icon", "◇"), starting_room_id, starting_gold: i32_value(&row, "starting_gold", 0).max(0), active: bool_value(&row, "active", true), sort_order: u32_value(&row, "sort_order", 100), created_at: ctx.timestamp, updated_at: ctx.timestamp });
            }
        }
        "character_option_grants" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", ""); let option_id = string(&row, "option_id", ""); let grant_kind = string(&row, "grant_kind", "stat").to_lowercase(); let reference_id = string(&row, "reference_id", "");
                if id.is_empty() || ctx.db.character_option_grant().id().find(&id).is_some() || ctx.db.character_option_definition().id().find(&option_id).is_none() { return Err("Character option grant requires a unique id and existing option.".to_string()); }
                let exists = match grant_kind.as_str() { "stat" => ctx.db.stat_definition().id().find(&reference_id).is_some(), "item" => ctx.db.object_definition().id().find(&reference_id).is_some(), "ability" => ctx.db.ability_definition().id().find(&reference_id).is_some(), _ => false };
                if !exists { return Err("Character option grant kind/reference is invalid.".to_string()); }
                ctx.db.character_option_grant().insert(CharacterOptionGrant { id, option_id, grant_kind, reference_id, amount: i32_value(&row, "amount", 1), equipped_slot: optional_string(&row, "equipped_slot").filter(|value| !value.trim().is_empty()), sort_order: u32_value(&row, "sort_order", 100), created_at: ctx.timestamp, updated_at: ctx.timestamp });
            }
        }
        "admin_role_definitions" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", "")));
                if id.is_empty() || ctx.db.admin_role_definition().id().find(&id).is_some() { return Err("Admin role id is missing or already exists.".to_string()); }
                ctx.db.admin_role_definition().insert(AdminRoleDefinition { id, name: string(&row, "name", "Untitled role"), description: string(&row, "description", ""), permissions: json_string(row.get("permissions"), "[]"), created_at: ctx.timestamp, updated_at: ctx.timestamp });
            }
        }
        "admin_role_assignments" => {
            require_admin(ctx)?;
            for row in rows {
                let profile_id = string(&row, "profile_id", ""); let role_id = string(&row, "role_id", "");
                let Some(profile) = ctx.db.profile().id().find(&profile_id) else { return Err("Role assignment requires an existing profile.".to_string()) };
                if profile.is_admin { return Err("An unrestricted world owner cannot be converted into a delegated role. Assign roles only to non-admin profiles.".to_string()); }
                if ctx.db.admin_role_definition().id().find(&role_id).is_none() || ctx.db.admin_role_assignment().profile_id().find(&profile_id).is_some() { return Err("Role assignment requires an existing role and no current assignment.".to_string()); }
                ctx.db.admin_role_assignment().insert(AdminRoleAssignment { profile_id: profile_id.clone(), role_id, assigned_at: ctx.timestamp });
                ctx.db.profile().id().update(Profile { is_admin: true, ..profile });
            }
        }
        "currency_definitions" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", "")));
                if id.is_empty() || ctx.db.currency_definition().id().find(&id).is_some() { return Err("Currency id is missing or already exists.".to_string()); }
                ctx.db.currency_definition().insert(CurrencyDefinition { id, name: string(&row, "name", "Currency"), icon: string(&row, "icon", "¤"), maximum_balance: i64_value(&row, "maximum_balance", i64::MAX).max(0), tradeable: bool_value(&row, "tradeable", true), created_at: ctx.timestamp, updated_at: ctx.timestamp });
            }
        }
        "vendor_definitions" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", ""))); let npc_id = string(&row, "npc_id", ""); let currency_id = string(&row, "currency_id", "gold");
                if id.is_empty() || ctx.db.vendor_definition().id().find(&id).is_some() || ctx.db.npc().id().find(&npc_id).is_none() || (currency_id != "gold" && ctx.db.currency_definition().id().find(&currency_id).is_none()) { return Err("Vendor requires a unique id, NPC, and valid currency.".to_string()); }
                let required_faction_id = optional_string(&row, "required_faction_id").filter(|value| !value.trim().is_empty());
                if required_faction_id.as_ref().map(|value| ctx.db.faction_definition().id().find(value).is_none()).unwrap_or(false) { return Err("Vendor faction does not exist.".to_string()); }
                ctx.db.vendor_definition().insert(VendorDefinition { id, npc_id, name: string(&row, "name", "Vendor"), currency_id, buys_from_players: bool_value(&row, "buys_from_players", true), sell_price_percent: u32_value(&row, "sell_price_percent", 50), required_faction_id, required_reputation: i32_value(&row, "required_reputation", 0), created_at: ctx.timestamp, updated_at: ctx.timestamp });
            }
        }
        "vendor_stocks" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", ""); let vendor_id = string(&row, "vendor_id", ""); let definition_id = string(&row, "definition_id", "");
                if id.is_empty() || ctx.db.vendor_stock().id().find(&id).is_some() || ctx.db.vendor_definition().id().find(&vendor_id).is_none() || ctx.db.object_definition().id().find(&definition_id).is_none() { return Err("Vendor stock requires a unique id, vendor, and object.".to_string()); }
                ctx.db.vendor_stock().insert(VendorStock { id, vendor_id, definition_id, price: i64_value(&row, "price", 0).max(0), stock: i32_value(&row, "stock", -1).max(-1), maximum_per_purchase: u32_value(&row, "maximum_per_purchase", 99).max(1), created_at: ctx.timestamp, updated_at: ctx.timestamp });
            }
        }
        "crafting_recipes" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", ""))); let output_definition_id = string(&row, "output_definition_id", "");
                if id.is_empty() || ctx.db.crafting_recipe().id().find(&id).is_some() || ctx.db.object_definition().id().find(&output_definition_id).is_none() { return Err("Recipe requires a unique id and output object.".to_string()); }
                let currency_id = optional_string(&row, "currency_id").filter(|value| !value.trim().is_empty());
                if currency_id.as_ref().map(|value| value != "gold" && ctx.db.currency_definition().id().find(value).is_none()).unwrap_or(false) { return Err("Recipe currency does not exist.".to_string()); }
                ctx.db.crafting_recipe().insert(CraftingRecipe { id, name: string(&row, "name", "Recipe"), description: string(&row, "description", ""), output_definition_id, output_quantity: u32_value(&row, "output_quantity", 1).max(1), station_tag: optional_string(&row, "station_tag").filter(|value| !value.trim().is_empty()), required_level: u32_value(&row, "required_level", 1).max(1), currency_id, currency_cost: i64_value(&row, "currency_cost", 0).max(0), active: bool_value(&row, "active", true), created_at: ctx.timestamp, updated_at: ctx.timestamp });
            }
        }
        "crafting_ingredients" => {
            require_admin(ctx)?;
            for row in rows {
                let id = string(&row, "id", ""); let recipe_id = string(&row, "recipe_id", ""); let definition_id = string(&row, "definition_id", "");
                if id.is_empty() || ctx.db.crafting_ingredient().id().find(&id).is_some() || ctx.db.crafting_recipe().id().find(&recipe_id).is_none() || ctx.db.object_definition().id().find(&definition_id).is_none() { return Err("Ingredient requires a unique id, recipe, and object.".to_string()); }
                ctx.db.crafting_ingredient().insert(CraftingIngredient { id, recipe_id, definition_id, quantity: u32_value(&row, "quantity", 1).max(1), consumed: bool_value(&row, "consumed", true), created_at: ctx.timestamp, updated_at: ctx.timestamp });
            }
        }
        "spawn_points" => {
            require_admin(ctx)?;
            for row in rows {
                let id = normalized_key(&string(&row, "id", &string(&row, "name", "")));
                let room_id = string(&row, "room_id", "");
                if id.is_empty() || ctx.db.spawn_point().id().find(&id).is_some() { return Err("Spawn point id is missing or already exists.".to_string()); }
                if ctx.db.room().id().find(&room_id).is_none() { return Err("Spawn point room does not exist.".to_string()); }
                let required_option_id = optional_string(&row, "required_option_id").filter(|value| !value.trim().is_empty());
                let required_faction_id = optional_string(&row, "required_faction_id").filter(|value| !value.trim().is_empty());
                let death_region_id = optional_string(&row, "death_region_id").filter(|value| !value.trim().is_empty());
                if required_option_id.as_ref().map(|value| ctx.db.character_option_definition().id().find(value).is_none()).unwrap_or(false) { return Err("Spawn option requirement does not exist.".to_string()); }
                if required_faction_id.as_ref().map(|value| ctx.db.faction_definition().id().find(value).is_none()).unwrap_or(false) { return Err("Spawn faction requirement does not exist.".to_string()); }
                if death_region_id.as_ref().map(|value| ctx.db.region().name().find(value).is_none()).unwrap_or(false) { return Err("Spawn death-region override does not exist.".to_string()); }
                ctx.db.spawn_point().insert(SpawnPoint {
                    id,
                    name: string(&row, "name", "Untitled spawn point"),
                    description: string(&row, "description", ""),
                    room_id,
                    allows_initial_spawn: bool_value(&row, "allows_initial_spawn", false),
                    allows_respawn: bool_value(&row, "allows_respawn", true),
                    active: bool_value(&row, "active", true),
                    priority: i32_value(&row, "priority", 0),
                    required_option_id, required_faction_id, required_reputation: i32_value(&row, "required_reputation", 0), death_region_id,
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
                    maximum_lives: u32_value(&row, "maximum_lives", 0),
                    create_lootable_corpse: bool_value(&row, "create_lootable_corpse", false),
                    allow_ability_revive: bool_value(&row, "allow_ability_revive", true),
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
    if table_name != "profiles" { require_permission(ctx, table_permission(&table_name))?; }
    let payload: Value = serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;

    match table_name.as_str() {
        "profiles" => {
            for id in ids {
                if ctx.db.character_option_grant().iter().any(|grant| grant.grant_kind == "stat" && grant.reference_id == id) { return Err("This stat is granted by a character option.".to_string()); }
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
                if ctx.db.vendor_stock().iter().any(|stock| stock.definition_id == id) || ctx.db.crafting_recipe().iter().any(|recipe| recipe.output_definition_id == id) || ctx.db.crafting_ingredient().iter().any(|ingredient| ingredient.definition_id == id) || ctx.db.character_option_grant().iter().any(|grant| grant.grant_kind == "item" && grant.reference_id == id) { return Err("This item is used by an option, vendor, or recipe.".to_string()); }
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
        "world_combat_configs" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.world_combat_config().id().find(&id) else { continue };
                ctx.db.world_combat_config().id().update(WorldCombatConfig {
                    base_hit_chance_percent: payload.get("base_hit_chance_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.base_hit_chance_percent).min(100),
                    base_crit_chance_percent: payload.get("base_crit_chance_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.base_crit_chance_percent).min(100),
                    crit_damage_percent: payload.get("crit_damage_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.crit_damage_percent).max(100),
                    base_dodge_chance_percent: payload.get("base_dodge_chance_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.base_dodge_chance_percent).min(100),
                    base_parry_chance_percent: payload.get("base_parry_chance_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.base_parry_chance_percent).min(100),
                    base_block_chance_percent: payload.get("base_block_chance_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.base_block_chance_percent).min(100),
                    block_damage_reduction_percent: payload.get("block_damage_reduction_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.block_damage_reduction_percent).min(100),
                    armor_effectiveness_percent: payload.get("armor_effectiveness_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.armor_effectiveness_percent),
                    pvp_damage_percent: payload.get("pvp_damage_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.pvp_damage_percent),
                    global_cooldown_ms: payload.get("global_cooldown_ms").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.global_cooldown_ms),
                    assist_xp_percent: payload.get("assist_xp_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.assist_xp_percent).min(100),
                    threat_enabled: payload.get("threat_enabled").and_then(Value::as_bool).unwrap_or(existing.threat_enabled),
                    threat_decay_seconds: payload.get("threat_decay_seconds").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.threat_decay_seconds),
                    updated_at: ctx.timestamp,
                    ..existing
                });
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
                if ctx.db.character_option_grant().iter().any(|grant| grant.grant_kind == "ability" && grant.reference_id == id) { return Err("This ability is granted by a character option.".to_string()); }
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
        "ability_effect_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.ability_effect_definition().id().find(&id) else { continue };
                let effect_kind = payload.get("effect_kind").and_then(Value::as_str).unwrap_or(&existing.effect_kind).to_lowercase();
                let target_scope = payload.get("target_scope").and_then(Value::as_str).unwrap_or(&existing.target_scope).to_lowercase();
                if !matches!(effect_kind.as_str(), "damage" | "heal" | "restore" | "damage_over_time" | "heal_over_time" | "buff" | "debuff" | "stun" | "interrupt" | "cleanse" | "teleport" | "revive" | "summon") || !matches!(target_scope.as_str(), "primary" | "self" | "all_enemies" | "all_allies" | "room") { return Err("Ability effect kind or scope is invalid.".to_string()); }
                let stat_id = payload.get("stat_id").map(|_| optional_string(&payload, "stat_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.stat_id.clone());
                let scales_with_stat = payload.get("scales_with_stat").map(|_| optional_string(&payload, "scales_with_stat").filter(|value| !value.trim().is_empty())).unwrap_or(existing.scales_with_stat.clone());
                for stat in [stat_id.as_ref(), scales_with_stat.as_ref()].into_iter().flatten() { if ctx.db.stat_definition().id().find(stat).is_none() { return Err(format!("Ability effect references missing stat: {stat}")); } }
                let destination_room_id = payload.get("destination_room_id").map(|_| optional_string(&payload, "destination_room_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.destination_room_id.clone());
                let summon_npc_id = payload.get("summon_npc_id").map(|_| optional_string(&payload, "summon_npc_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.summon_npc_id.clone());
                if destination_room_id.as_ref().map(|room| ctx.db.room().id().find(room).is_none()).unwrap_or(false) || summon_npc_id.as_ref().map(|npc| ctx.db.npc().id().find(npc).is_none()).unwrap_or(false) { return Err("Ability effect destination or summon target does not exist.".to_string()); }
                let power_min = payload.get("power_min").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.power_min);
                ctx.db.ability_effect_definition().id().update(AbilityEffectDefinition {
                    effect_kind, target_scope, stat_id, power_min,
                    power_max: payload.get("power_max").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.power_max).max(power_min),
                    scales_with_stat, scaling_percent: payload.get("scaling_percent").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.scaling_percent).max(0),
                    mitigation_type: payload.get("mitigation_type").and_then(Value::as_str).unwrap_or(&existing.mitigation_type).to_string(),
                    chance_percent: payload.get("chance_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.chance_percent).min(100),
                    duration_ms: payload.get("duration_ms").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.duration_ms),
                    tick_interval_ms: payload.get("tick_interval_ms").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.tick_interval_ms).max(1),
                    modifier_value: payload.get("modifier_value").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.modifier_value),
                    max_stacks: payload.get("max_stacks").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.max_stacks).max(1),
                    status_name: payload.get("status_name").and_then(Value::as_str).unwrap_or(&existing.status_name).to_string(),
                    destination_room_id, summon_npc_id,
                    sort_order: payload.get("sort_order").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.sort_order),
                    updated_at: ctx.timestamp, ..existing
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
                if ctx.db.character_option_definition().iter().any(|option| option.starting_room_id.as_deref() == Some(id.as_str())) { return Err("This room is a character option starting room.".to_string()); }
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
                if ctx.db.vendor_definition().iter().any(|vendor| vendor.npc_id == id) { return Err("This NPC operates a vendor. Delete the vendor first.".to_string()); }
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
                if ctx.db.quest_rule().iter().any(|rule| rule.quest_id != id && (rule.prerequisite_quest_id.as_deref() == Some(id.as_str()) || rule.next_quest_id.as_deref() == Some(id.as_str())))
                    || ctx.db.quest_choice().iter().any(|choice| choice.next_quest_id.as_deref() == Some(id.as_str())) {
                    return Err("This quest is referenced as a prerequisite or branch destination. Reassign that reference first.".to_string());
                }
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
                    "acquire_item" | "deliver_item" | "interact_object" => ctx.db.object_definition().id().find(&target_id).is_some(),
                    "kill_npc" | "talk_npc" | "escort_npc" => ctx.db.npc().id().find(&target_id).is_some(),
                    "kill_faction" => ctx.db.faction_definition().id().find(&target_id).is_some(),
                    "pay_gold" | "choice" | "survive" => true,
                    _ => return Err("Unsupported quest objective type.".to_string()),
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
        "quest_rules" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.quest_rule().quest_id().find(&id) else { continue };
                let prerequisite_quest_id = payload.get("prerequisite_quest_id").map(|_| optional_string(&payload, "prerequisite_quest_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.prerequisite_quest_id.clone());
                let next_quest_id = payload.get("next_quest_id").map(|_| optional_string(&payload, "next_quest_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.next_quest_id.clone());
                for reference in [prerequisite_quest_id.as_ref(), next_quest_id.as_ref()].into_iter().flatten() { if ctx.db.quest_definition().id().find(reference).is_none() { return Err(format!("Quest rule references missing quest: {reference}")); } }
                ctx.db.quest_rule().quest_id().update(QuestRule { prerequisite_quest_id, prerequisite_completions: payload.get("prerequisite_completions").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.prerequisite_completions), time_limit_seconds: payload.get("time_limit_seconds").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.time_limit_seconds), failure_on_death: payload.get("failure_on_death").and_then(Value::as_bool).unwrap_or(existing.failure_on_death), next_quest_id, maximum_completions: payload.get("maximum_completions").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.maximum_completions), updated_at: ctx.timestamp, ..existing });
            }
        }
        "quest_choices" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.quest_choice().id().find(&id) else { continue };
                let next_quest_id = payload.get("next_quest_id").map(|_| optional_string(&payload, "next_quest_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.next_quest_id.clone());
                let reputation_faction_id = payload.get("reputation_faction_id").map(|_| optional_string(&payload, "reputation_faction_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.reputation_faction_id.clone());
                ctx.db.quest_choice().id().update(QuestChoice { label: payload.get("label").and_then(Value::as_str).unwrap_or(&existing.label).to_string(), description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(), next_quest_id, gold_reward: payload.get("gold_reward").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.gold_reward), reputation_faction_id, reputation_reward: payload.get("reputation_reward").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.reputation_reward), sort_order: payload.get("sort_order").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.sort_order), updated_at: ctx.timestamp, ..existing });
            }
        }
        "character_option_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.character_option_definition().id().find(&id) else { continue };
                let option_kind = payload.get("option_kind").and_then(Value::as_str).unwrap_or(&existing.option_kind).to_lowercase();
                if !matches!(option_kind.as_str(), "race" | "class" | "background") { return Err("Character option kind must be race, class, or background.".to_string()); }
                let starting_room_id = payload.get("starting_room_id").map(|_| optional_string(&payload, "starting_room_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.starting_room_id.clone());
                ctx.db.character_option_definition().id().update(CharacterOptionDefinition { option_kind, name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(), description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(), icon: payload.get("icon").and_then(Value::as_str).unwrap_or(&existing.icon).to_string(), starting_room_id, starting_gold: payload.get("starting_gold").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.starting_gold).max(0), active: payload.get("active").and_then(Value::as_bool).unwrap_or(existing.active), sort_order: payload.get("sort_order").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.sort_order), updated_at: ctx.timestamp, ..existing });
            }
        }
        "character_option_grants" => {
            require_admin(ctx)?;
            for id in ids {
                let Some(existing) = ctx.db.character_option_grant().id().find(&id) else { continue };
                let grant_kind = payload.get("grant_kind").and_then(Value::as_str).unwrap_or(&existing.grant_kind).to_lowercase(); let reference_id = payload.get("reference_id").and_then(Value::as_str).unwrap_or(&existing.reference_id).to_string();
                let exists = match grant_kind.as_str() { "stat" => ctx.db.stat_definition().id().find(&reference_id).is_some(), "item" => ctx.db.object_definition().id().find(&reference_id).is_some(), "ability" => ctx.db.ability_definition().id().find(&reference_id).is_some(), _ => false };
                if !exists { return Err("Character option grant kind/reference is invalid.".to_string()); }
                ctx.db.character_option_grant().id().update(CharacterOptionGrant { grant_kind, reference_id, amount: payload.get("amount").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.amount), equipped_slot: payload.get("equipped_slot").map(|_| optional_string(&payload, "equipped_slot").filter(|value| !value.trim().is_empty())).unwrap_or(existing.equipped_slot.clone()), sort_order: payload.get("sort_order").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.sort_order), updated_at: ctx.timestamp, ..existing });
            }
        }
        "admin_role_definitions" => {
            require_admin(ctx)?;
            for id in ids { if let Some(existing) = ctx.db.admin_role_definition().id().find(&id) { ctx.db.admin_role_definition().id().update(AdminRoleDefinition { name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(), description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(), permissions: payload.get("permissions").map(|value| json_string(Some(value), "[]")).unwrap_or(existing.permissions.clone()), updated_at: ctx.timestamp, ..existing }); } }
        }
        "admin_role_assignments" => {
            require_admin(ctx)?;
            for id in ids { if let Some(existing) = ctx.db.admin_role_assignment().profile_id().find(&id) { let role_id = payload.get("role_id").and_then(Value::as_str).unwrap_or(&existing.role_id).to_string(); if ctx.db.admin_role_definition().id().find(&role_id).is_none() { return Err("Admin role does not exist.".to_string()); } ctx.db.admin_role_assignment().profile_id().update(AdminRoleAssignment { role_id, assigned_at: ctx.timestamp, ..existing }); } }
        }
        "currency_definitions" => {
            require_admin(ctx)?;
            for id in ids { if let Some(existing) = ctx.db.currency_definition().id().find(&id) { ctx.db.currency_definition().id().update(CurrencyDefinition { name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(), icon: payload.get("icon").and_then(Value::as_str).unwrap_or(&existing.icon).to_string(), maximum_balance: payload.get("maximum_balance").and_then(Value::as_i64).unwrap_or(existing.maximum_balance).max(0), tradeable: payload.get("tradeable").and_then(Value::as_bool).unwrap_or(existing.tradeable), updated_at: ctx.timestamp, ..existing }); } }
        }
        "vendor_definitions" => {
            require_admin(ctx)?;
            for id in ids { if let Some(existing) = ctx.db.vendor_definition().id().find(&id) { ctx.db.vendor_definition().id().update(VendorDefinition { name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(), buys_from_players: payload.get("buys_from_players").and_then(Value::as_bool).unwrap_or(existing.buys_from_players), sell_price_percent: payload.get("sell_price_percent").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.sell_price_percent), required_faction_id: payload.get("required_faction_id").map(|_| optional_string(&payload, "required_faction_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.required_faction_id.clone()), required_reputation: payload.get("required_reputation").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.required_reputation), updated_at: ctx.timestamp, ..existing }); } }
        }
        "vendor_stocks" => {
            require_admin(ctx)?;
            for id in ids { if let Some(existing) = ctx.db.vendor_stock().id().find(&id) { ctx.db.vendor_stock().id().update(VendorStock { price: payload.get("price").and_then(Value::as_i64).unwrap_or(existing.price).max(0), stock: payload.get("stock").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.stock).max(-1), maximum_per_purchase: payload.get("maximum_per_purchase").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.maximum_per_purchase).max(1), updated_at: ctx.timestamp, ..existing }); } }
        }
        "crafting_recipes" => {
            require_admin(ctx)?;
            for id in ids { if let Some(existing) = ctx.db.crafting_recipe().id().find(&id) { ctx.db.crafting_recipe().id().update(CraftingRecipe { name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(), description: payload.get("description").and_then(Value::as_str).unwrap_or(&existing.description).to_string(), output_quantity: payload.get("output_quantity").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.output_quantity).max(1), station_tag: payload.get("station_tag").map(|_| optional_string(&payload, "station_tag").filter(|value| !value.trim().is_empty())).unwrap_or(existing.station_tag.clone()), required_level: payload.get("required_level").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.required_level).max(1), currency_id: payload.get("currency_id").map(|_| optional_string(&payload, "currency_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.currency_id.clone()), currency_cost: payload.get("currency_cost").and_then(Value::as_i64).unwrap_or(existing.currency_cost).max(0), active: payload.get("active").and_then(Value::as_bool).unwrap_or(existing.active), updated_at: ctx.timestamp, ..existing }); } }
        }
        "crafting_ingredients" => {
            require_admin(ctx)?;
            for id in ids { if let Some(existing) = ctx.db.crafting_ingredient().id().find(&id) { ctx.db.crafting_ingredient().id().update(CraftingIngredient { quantity: payload.get("quantity").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.quantity).max(1), consumed: payload.get("consumed").and_then(Value::as_bool).unwrap_or(existing.consumed), updated_at: ctx.timestamp, ..existing }); } }
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
                    required_option_id: payload.get("required_option_id").map(|_| optional_string(&payload, "required_option_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.required_option_id.clone()),
                    required_faction_id: payload.get("required_faction_id").map(|_| optional_string(&payload, "required_faction_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.required_faction_id.clone()),
                    required_reputation: payload.get("required_reputation").and_then(Value::as_i64).map(|value| value as i32).unwrap_or(existing.required_reputation),
                    death_region_id: payload.get("death_region_id").map(|_| optional_string(&payload, "death_region_id").filter(|value| !value.trim().is_empty())).unwrap_or(existing.death_region_id.clone()),
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
                    maximum_lives: payload.get("maximum_lives").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(existing.maximum_lives),
                    create_lootable_corpse: payload.get("create_lootable_corpse").and_then(Value::as_bool).unwrap_or(existing.create_lootable_corpse),
                    allow_ability_revive: payload.get("allow_ability_revive").and_then(Value::as_bool).unwrap_or(existing.allow_ability_revive),
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

fn delete_ability_effect(ctx: &ReducerContext, id: &String) {
    let status_ids = ctx.db.actor_status_effect().iter().filter(|row| row.effect_id == *id).map(|row| row.id).collect::<Vec<_>>();
    for status_id in status_ids { ctx.db.actor_status_effect().id().delete(&status_id); }
    let tick_ids = ctx.db.scheduled_effect_tick().iter().filter(|row| row.effect_id == *id).map(|row| row.scheduled_id).collect::<Vec<_>>();
    for tick_id in tick_ids { ctx.db.scheduled_effect_tick().scheduled_id().delete(tick_id); }
    ctx.db.ability_effect_definition().id().delete(id);
}

fn delete_actor_rpg_state(ctx: &ReducerContext, actor_id: &String) {
    let object_ids = ctx.db.world_object().iter()
        .filter(|object| matches!(object.location_kind.as_str(), "inventory" | "equipped" | "bank") && object.location_id == *actor_id)
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
    let threat_ids = ctx.db.npc_threat().iter().filter(|row| row.actor_id == *actor_id || row.npc_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for threat_id in threat_ids { ctx.db.npc_threat().id().delete(&threat_id); }
    let status_ids = ctx.db.actor_status_effect().iter().filter(|row| row.actor_id == *actor_id || row.source_actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for status_id in status_ids { ctx.db.actor_status_effect().id().delete(&status_id); }
    let tick_ids = ctx.db.scheduled_effect_tick().iter().filter(|row| row.target_actor_id == *actor_id || row.source_actor_id == *actor_id).map(|row| row.scheduled_id).collect::<Vec<_>>();
    for tick_id in tick_ids { ctx.db.scheduled_effect_tick().scheduled_id().delete(tick_id); }
    let reputation_ids = ctx.db.actor_faction_reputation().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for reputation_id in reputation_ids { ctx.db.actor_faction_reputation().id().delete(&reputation_id); }
    let crime_ids = ctx.db.actor_crime().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for crime_id in crime_ids { ctx.db.actor_crime().id().delete(&crime_id); }
    let quest_ids = ctx.db.actor_quest().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for quest_id in quest_ids { ctx.db.actor_quest().id().delete(&quest_id); }
    let progress_ids = ctx.db.actor_quest_progress().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for progress_id in progress_ids { ctx.db.actor_quest_progress().id().delete(&progress_id); }
    let choice_ids = ctx.db.actor_quest_choice().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for choice_id in choice_ids { ctx.db.actor_quest_choice().id().delete(&choice_id); }
    let option_ids = ctx.db.actor_character_option().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for option_id in option_ids { ctx.db.actor_character_option().id().delete(&option_id); }
    let currency_ids = ctx.db.actor_currency().iter().filter(|row| row.actor_id == *actor_id).map(|row| row.id).collect::<Vec<_>>();
    for currency_id in currency_ids { ctx.db.actor_currency().id().delete(&currency_id); }
    ctx.db.actor_wallet().id().delete(actor_id);
    ctx.db.actor_life_state().id().delete(actor_id);
    ctx.db.actor_progression().id().delete(actor_id);
}

#[reducer]
pub fn delete_rows(ctx: &ReducerContext, table_name: String, ids_json: String) -> Result<(), String> {
    ensure_profile(ctx);
    let ids = parse_ids(&ids_json)?;
    if !matches!(table_name.as_str(), "profiles" | "characters") { require_permission(ctx, table_permission(&table_name))?; }
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
        "world_combat_configs" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.world_combat_config().id().delete(&id); }
        }
        "equipment_slot_definitions" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.equipment_slot_definition().id().delete(&id); }
        }
        "ability_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let effect_ids = ctx.db.ability_effect_definition().iter().filter(|effect| effect.ability_id == id).map(|effect| effect.id).collect::<Vec<_>>();
                for effect_id in effect_ids { delete_ability_effect(ctx, &effect_id); }
                let grants = ctx.db.actor_ability().iter().filter(|grant| grant.ability_id == id).map(|grant| grant.id).collect::<Vec<_>>();
                for grant in grants { ctx.db.actor_ability().id().delete(&grant); }
                let action_id = format!("ability:{id}");
                let cooldowns = ctx.db.actor_cooldown().iter().filter(|cooldown| cooldown.action_id == action_id).map(|cooldown| cooldown.id).collect::<Vec<_>>();
                for cooldown in cooldowns { ctx.db.actor_cooldown().id().delete(&cooldown); }
                ctx.db.ability_definition().id().delete(&id);
            }
        }
        "ability_effect_definitions" => {
            require_admin(ctx)?;
            for id in ids { delete_ability_effect(ctx, &id); }
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
                ctx.db.quest_rule().quest_id().delete(&id);
                let choice_ids = ctx.db.quest_choice().iter().filter(|row| row.quest_id == id).map(|row| row.id).collect::<Vec<_>>();
                for choice_id in choice_ids {
                    let selected = ctx.db.actor_quest_choice().iter().filter(|row| row.choice_id == choice_id).map(|row| row.id).collect::<Vec<_>>();
                    for selection in selected { ctx.db.actor_quest_choice().id().delete(&selection); }
                    ctx.db.quest_choice().id().delete(&choice_id);
                }
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
        "quest_rules" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.quest_rule().quest_id().delete(&id); }
        }
        "quest_choices" => {
            require_admin(ctx)?;
            for id in ids {
                let selected = ctx.db.actor_quest_choice().iter().filter(|row| row.choice_id == id).map(|row| row.id).collect::<Vec<_>>();
                for selection in selected { ctx.db.actor_quest_choice().id().delete(&selection); }
                ctx.db.quest_choice().id().delete(&id);
            }
        }
        "character_option_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let grants = ctx.db.character_option_grant().iter().filter(|row| row.option_id == id).map(|row| row.id).collect::<Vec<_>>();
                for grant in grants { ctx.db.character_option_grant().id().delete(&grant); }
                let selections = ctx.db.actor_character_option().iter().filter(|row| row.option_id == id).map(|row| row.id).collect::<Vec<_>>();
                for selection in selections { ctx.db.actor_character_option().id().delete(&selection); }
                ctx.db.character_option_definition().id().delete(&id);
            }
        }
        "character_option_grants" => { require_admin(ctx)?; for id in ids { ctx.db.character_option_grant().id().delete(&id); } }
        "admin_role_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                let assignments = ctx.db.admin_role_assignment().iter().filter(|row| row.role_id == id).map(|row| row.profile_id).collect::<Vec<_>>();
                for assignment in assignments {
                    ctx.db.admin_role_assignment().profile_id().delete(&assignment);
                    if let Some(profile) = ctx.db.profile().id().find(&assignment) { ctx.db.profile().id().update(Profile { is_admin: false, ..profile }); }
                }
                ctx.db.admin_role_definition().id().delete(&id);
            }
        }
        "admin_role_assignments" => { require_admin(ctx)?; for id in ids { ctx.db.admin_role_assignment().profile_id().delete(&id); if let Some(profile) = ctx.db.profile().id().find(&id) { ctx.db.profile().id().update(Profile { is_admin: false, ..profile }); } } }
        "currency_definitions" => {
            require_admin(ctx)?;
            for id in ids {
                if ctx.db.vendor_definition().iter().any(|row| row.currency_id == id) || ctx.db.crafting_recipe().iter().any(|row| row.currency_id.as_deref() == Some(id.as_str())) { return Err("Currency is used by a vendor or recipe.".to_string()); }
                let balances = ctx.db.actor_currency().iter().filter(|row| row.currency_id == id).map(|row| row.id).collect::<Vec<_>>();
                for balance in balances { ctx.db.actor_currency().id().delete(&balance); }
                ctx.db.currency_definition().id().delete(&id);
            }
        }
        "vendor_definitions" => {
            require_admin(ctx)?;
            for id in ids { let stocks = ctx.db.vendor_stock().iter().filter(|row| row.vendor_id == id).map(|row| row.id).collect::<Vec<_>>(); for stock in stocks { ctx.db.vendor_stock().id().delete(&stock); } ctx.db.vendor_definition().id().delete(&id); }
        }
        "vendor_stocks" => { require_admin(ctx)?; for id in ids { ctx.db.vendor_stock().id().delete(&id); } }
        "crafting_recipes" => {
            require_admin(ctx)?;
            for id in ids { let ingredients = ctx.db.crafting_ingredient().iter().filter(|row| row.recipe_id == id).map(|row| row.id).collect::<Vec<_>>(); for ingredient in ingredients { ctx.db.crafting_ingredient().id().delete(&ingredient); } ctx.db.crafting_recipe().id().delete(&id); }
        }
        "crafting_ingredients" => { require_admin(ctx)?; for id in ids { ctx.db.crafting_ingredient().id().delete(&id); } }
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
    require_permission(ctx, "players.moderate")?;
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
            let cast_ids = ctx.db.scheduled_cast().iter().filter(|row| row.actor_id == actor_id).map(|row| row.scheduled_id).collect::<Vec<_>>();
            for id in cast_ids { ctx.db.scheduled_cast().scheduled_id().delete(id); }
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

fn apply_character_option(ctx: &ReducerContext, actor_id: &str, option: &CharacterOptionDefinition) -> Result<(), String> {
    let selection_id = format!("{actor_id}::{}", option.option_kind);
    if ctx.db.actor_character_option().id().find(&selection_id).is_some() { return Err(format!("A {} has already been selected.", option.option_kind)); }
    let mut grants = ctx.db.character_option_grant().iter().filter(|grant| grant.option_id == option.id).collect::<Vec<_>>();
    grants.sort_by_key(|grant| grant.sort_order);
    for grant in grants {
        match grant.grant_kind.as_str() {
            "stat" => {
                let Some(definition) = ctx.db.stat_definition().id().find(&grant.reference_id) else { continue };
                let mut stat = actor_stat_row(ctx, actor_id, &definition);
                let exists = ctx.db.actor_stat().id().find(&stat.id).is_some();
                stat.base_value = stat.base_value.saturating_add(grant.amount).clamp(definition.minimum, definition.maximum);
                stat.current_value = stat.current_value.saturating_add(grant.amount).clamp(definition.minimum, stat.base_value);
                stat.updated_at = ctx.timestamp;
                if exists { ctx.db.actor_stat().id().update(stat); } else { ctx.db.actor_stat().insert(stat); }
            }
            "ability" => {
                let id = format!("{actor_id}::{}", grant.reference_id);
                if ctx.db.actor_ability().id().find(&id).is_none() { ctx.db.actor_ability().insert(ActorAbility { id, actor_id: actor_id.to_string(), ability_id: grant.reference_id, granted_at: ctx.timestamp }); }
            }
            "item" => {
                if ctx.db.object_definition().id().find(&grant.reference_id).is_none() { continue; }
                let timestamp = ctx.timestamp.to_micros_since_unix_epoch();
                ctx.db.world_object().insert(WorldObject { id: format!("origin-{}-{}-{timestamp}", actor_id, grant.id), definition_id: grant.reference_id, location_kind: if grant.equipped_slot.is_some() { "equipped".to_string() } else { "inventory".to_string() }, location_id: actor_id.to_string(), quantity: u32::try_from(grant.amount.max(1)).unwrap_or(1), equipped_slot: grant.equipped_slot, durability: 100, fuel_remaining: 0, is_active: false, state_json: format!(r#"{{"character_option":"{}"}}"#, option.id), created_at: ctx.timestamp, updated_at: ctx.timestamp });
            }
            _ => {}
        }
    }
    if option.starting_gold > 0 {
        let mut wallet = ensure_wallet(ctx, actor_id);
        wallet.gold = wallet.gold.saturating_add(option.starting_gold);
        wallet.updated_at = ctx.timestamp;
        ctx.db.actor_wallet().id().update(wallet);
    }
    ctx.db.actor_character_option().insert(ActorCharacterOption { id: selection_id, actor_id: actor_id.to_string(), option_id: option.id.clone(), option_kind: option.option_kind.clone(), selected_at: ctx.timestamp });
    if let Some(room_id) = option.starting_room_id.as_ref().cloned().or_else(|| choose_initial_spawn(ctx, actor_id).map(|point| point.room_id)) { move_actor_to_room(ctx, actor_id, &room_id)?; }
    Ok(())
}

#[reducer]
pub fn select_character_option(ctx: &ReducerContext, actor_id: String, option_id: String) -> Result<(), String> {
    ensure_profile(ctx);
    let owned = ctx.db.character().id().find(&actor_id).map(|character| character.owner == ctx.sender()).unwrap_or(false);
    if !owned && !profile_for(ctx, ctx.sender()).map(|profile| profile.is_admin).unwrap_or(false) { return Err("You may only configure your own character.".to_string()); }
    let option = ctx.db.character_option_definition().id().find(&option_id).filter(|option| option.active).ok_or_else(|| "Character option does not exist or is disabled.".to_string())?;
    let progression = ensure_actor_progression(ctx, &actor_id);
    if progression.level > 1 || progression.experience > 0 { return Err("Character options are locked after progression begins.".to_string()); }
    apply_character_option(ctx, &actor_id, &option)
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

fn world_combat_config(ctx: &ReducerContext) -> WorldCombatConfig {
    ctx.db.world_combat_config().id().find(&"world".to_string())
        .or_else(|| ctx.db.world_combat_config().iter().next())
        .unwrap_or(WorldCombatConfig {
            id: "world".to_string(), base_hit_chance_percent: 90, base_crit_chance_percent: 5,
            crit_damage_percent: 150, base_dodge_chance_percent: 3, base_parry_chance_percent: 3,
            base_block_chance_percent: 3, block_damage_reduction_percent: 40,
            armor_effectiveness_percent: 100, pvp_damage_percent: 100, global_cooldown_ms: 1000,
            assist_xp_percent: 50, threat_enabled: true, threat_decay_seconds: 30,
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
            maximum_lives: 0, create_lootable_corpse: false, allow_ability_revive: true,
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
        respawn_available_at_micros: 0, protected_until_micros: 0, lives_remaining: world_lifecycle_config(ctx).maximum_lives, updated_at: ctx.timestamp,
    };
    ctx.db.actor_life_state().insert(state.clone());
    state
}

fn active_spawn_points(ctx: &ReducerContext, actor_id: &str, initial: bool, death_region_id: Option<&str>) -> Vec<SpawnPoint> {
    ctx.db.spawn_point().iter()
        .filter(|point| point.active && if initial { point.allows_initial_spawn } else { point.allows_respawn })
        .filter(|point| ctx.db.room().id().find(&point.room_id).is_some())
        .filter(|point| point.required_option_id.as_ref().map(|option_id| ctx.db.actor_character_option().iter().any(|selection| selection.actor_id == actor_id && selection.option_id == *option_id)).unwrap_or(true))
        .filter(|point| point.required_faction_id.as_ref().map(|faction_id| actor_reputation(ctx, actor_id, faction_id) >= point.required_reputation).unwrap_or(true))
        .filter(|point| point.death_region_id.as_deref().map(|required| Some(required) == death_region_id).unwrap_or(true))
        .collect::<Vec<_>>()
}

fn highest_priority_spawn(mut points: Vec<SpawnPoint>) -> Option<SpawnPoint> {
    points.sort_by(|left, right| right.priority.cmp(&left.priority).then(left.name.cmp(&right.name)).then(left.id.cmp(&right.id)));
    points.into_iter().next()
}

fn choose_initial_spawn(ctx: &ReducerContext, actor_id: &str) -> Option<SpawnPoint> {
    let config = world_lifecycle_config(ctx);
    let points = active_spawn_points(ctx, actor_id, true, None);
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
    let origin_region = ctx.db.room().id().find(&origin_room.to_string()).and_then(|room| room.region_name);
    let mut points = active_spawn_points(ctx, actor_id, false, origin_region.as_deref());
    if points.is_empty() { return None; }
    match config.respawn_policy.as_str() {
        "fixed" => config.fixed_respawn_point_id.as_ref().and_then(|id| points.iter().find(|point| &point.id == id).cloned()).or_else(|| highest_priority_spawn(points)),
        "random" => {
            let index = deterministic_roll(&format!("respawn:{actor_id}:{origin_room}:{}", ctx.timestamp.to_micros_since_unix_epoch())) as usize % points.len();
            points.get(index).cloned()
        }
        "highest_priority" => highest_priority_spawn(points),
        "region_nearest" => {
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
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let status_bonus = ctx.db.actor_status_effect().iter()
        .filter(|status| status.actor_id == actor_id && status.stat_id.as_deref() == Some(definition.id.as_str()) && status.expires_at_micros > now)
        .map(|status| status.modifier_value.saturating_mul(i32::try_from(status.stacks).unwrap_or(i32::MAX)))
        .sum::<i32>();
    row.current_value.saturating_add(equipment_stat_bonus(ctx, actor_id, &definition.id)).saturating_add(status_bonus)
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

fn list_status_effects(ctx: &ReducerContext, room_id: &str, actor_id: &str) {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let mut statuses = ctx.db.actor_status_effect().iter().filter(|status| status.actor_id == actor_id && status.expires_at_micros > now).collect::<Vec<_>>();
    statuses.sort_by(|left, right| left.expires_at_micros.cmp(&right.expires_at_micros));
    let lines = statuses.into_iter().map(|status| {
        let seconds = status.expires_at_micros.saturating_sub(now).saturating_add(999_999) / 1_000_000;
        let modifier = status.stat_id.as_ref().map(|stat| format!(" · {stat} {:+}", status.modifier_value.saturating_mul(status.stacks as i32))).unwrap_or_default();
        format!("• {} ×{} · {}s{}", status.name, status.stacks, seconds, modifier)
    }).collect::<Vec<_>>();
    rpg_message(ctx, room_id, actor_id, "system", if lines.is_empty() { "[STATUS EFFECTS]\n• None".to_string() } else { format!("[STATUS EFFECTS]\n{}", lines.join("\n")) });
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
        .or_else(|| ctx.db.profile().iter()
            .find(|profile| profile.id != actor_id
                && profile.current_room.as_deref() == Some(room_id)
                && profile.name.as_deref().or(profile.handle.as_deref()).map(|name| name.eq_ignore_ascii_case(query)).unwrap_or(false))
            .map(|profile| (profile.id, profile.name.or(profile.handle).unwrap_or_else(|| "Traveler".to_string()), false)))
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

fn actor_display_name(ctx: &ReducerContext, actor_id: &str) -> Option<String> {
    let key = actor_id.to_string();
    ctx.db.character().id().find(&key).map(|actor| actor.name)
        .or_else(|| ctx.db.profile().id().find(&key).map(|actor| actor.name.or(actor.handle).unwrap_or_else(|| "Traveler".to_string())))
        .or_else(|| ctx.db.npc().id().find(&key).map(|actor| actor.name))
}

fn highest_threat_target(ctx: &ReducerContext, npc_id: &str, room_id: &str) -> Option<(String, String)> {
    let config = world_combat_config(ctx);
    if !config.threat_enabled { return None; }
    let cutoff = ctx.timestamp.to_micros_since_unix_epoch().saturating_sub(i64::from(config.threat_decay_seconds) * 1_000_000);
    ctx.db.npc_threat().iter()
        .filter(|row| row.npc_id == npc_id && row.updated_at_micros >= cutoff)
        .filter(|row| actor_current_room(ctx, &row.actor_id).as_deref() == Some(room_id) && !actor_is_dead(ctx, &row.actor_id))
        .max_by_key(|row| row.threat)
        .and_then(|row| actor_display_name(ctx, &row.actor_id).map(|name| (row.actor_id, name)))
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

fn currency_balance(ctx: &ReducerContext, actor_id: &str, currency_id: &str) -> i64 {
    if currency_id == "gold" { return i64::from(ensure_wallet(ctx, actor_id).gold); }
    ctx.db.actor_currency().id().find(&format!("{actor_id}::{currency_id}")).map(|row| row.balance).unwrap_or(0)
}

fn change_currency(ctx: &ReducerContext, actor_id: &str, currency_id: &str, delta: i64) -> Result<i64, String> {
    if currency_id == "gold" {
        let mut wallet = ensure_wallet(ctx, actor_id);
        let next = i64::from(wallet.gold).saturating_add(delta);
        if next < 0 { return Err("Not enough gold.".to_string()); }
        wallet.gold = i32::try_from(next).unwrap_or(i32::MAX); wallet.updated_at = ctx.timestamp; ctx.db.actor_wallet().id().update(wallet.clone()); return Ok(i64::from(wallet.gold));
    }
    let definition = ctx.db.currency_definition().id().find(&currency_id.to_string()).ok_or_else(|| "Currency does not exist.".to_string())?;
    let id = format!("{actor_id}::{currency_id}"); let existing = ctx.db.actor_currency().id().find(&id); let current = existing.as_ref().map(|row| row.balance).unwrap_or(0); let next = current.saturating_add(delta);
    if next < 0 { return Err(format!("Not enough {}.", definition.name)); }
    let row = ActorCurrency { id: id.clone(), actor_id: actor_id.to_string(), currency_id: currency_id.to_string(), balance: next.min(definition.maximum_balance), updated_at: ctx.timestamp };
    if existing.is_some() { ctx.db.actor_currency().id().update(row.clone()); } else { ctx.db.actor_currency().insert(row.clone()); }
    Ok(row.balance)
}

fn grant_inventory_item(ctx: &ReducerContext, actor_id: &str, definition_id: &str, quantity: u32, source: &str) -> Result<String, String> {
    let definition = ctx.db.object_definition().id().find(&definition_id.to_string()).ok_or_else(|| "Object definition does not exist.".to_string())?;
    if definition.stackable {
        if let Some(existing) = ctx.db.world_object().iter().find(|object| object.location_kind == "inventory" && object.location_id == actor_id && object.definition_id == definition_id) {
            ctx.db.world_object().id().update(WorldObject { quantity: existing.quantity.saturating_add(quantity), updated_at: ctx.timestamp, ..existing });
            return Ok(format!("{} x{quantity}", definition.name));
        }
    }
    if !inventory_has_space(ctx, actor_id, 1) { return Err("Your inventory is full.".to_string()); }
    let timestamp = ctx.timestamp.to_micros_since_unix_epoch();
    ctx.db.world_object().insert(WorldObject { id: format!("{source}-{actor_id}-{definition_id}-{timestamp}"), definition_id: definition_id.to_string(), location_kind: "inventory".to_string(), location_id: actor_id.to_string(), quantity: quantity.max(1), equipped_slot: None, durability: 100, fuel_remaining: 0, is_active: false, state_json: format!(r#"{{"source":"{source}"}}"#), created_at: ctx.timestamp, updated_at: ctx.timestamp });
    Ok(format!("{} x{quantity}", definition.name))
}

fn vendor_matches(ctx: &ReducerContext, room_id: &str, query: &str) -> Option<VendorDefinition> {
    let query = query.trim();
    ctx.db.vendor_definition().iter().find(|vendor| ctx.db.npc().id().find(&vendor.npc_id).map(|npc| npc.current_room.as_deref() == Some(room_id) && (query.is_empty() || vendor.name.eq_ignore_ascii_case(query) || npc.name.eq_ignore_ascii_case(query) || npc.alias.as_deref().map(|alias| alias.eq_ignore_ascii_case(query)).unwrap_or(false))).unwrap_or(false))
}

fn list_shop(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) {
    let Some(vendor) = vendor_matches(ctx, room_id, query) else { rpg_message(ctx, room_id, actor_id, "error", "There is no matching vendor here.".to_string()); return };
    if vendor.required_faction_id.as_ref().map(|faction| actor_reputation(ctx, actor_id, faction) < vendor.required_reputation).unwrap_or(false) { rpg_message(ctx, room_id, actor_id, "error", "This vendor refuses to trade at your current reputation.".to_string()); return; }
    let mut stocks = ctx.db.vendor_stock().iter().filter(|stock| stock.vendor_id == vendor.id).collect::<Vec<_>>(); stocks.sort_by(|left, right| left.price.cmp(&right.price));
    let currency_name = if vendor.currency_id == "gold" { "gold".to_string() } else { ctx.db.currency_definition().id().find(&vendor.currency_id).map(|row| row.name).unwrap_or(vendor.currency_id.clone()) };
    let lines = stocks.into_iter().filter_map(|stock| ctx.db.object_definition().id().find(&stock.definition_id).map(|item| format!("• {} {} — {} {}{}", item.icon, item.name, stock.price, currency_name, if stock.stock < 0 { "".to_string() } else { format!(" · {} left", stock.stock) }))).collect::<Vec<_>>();
    rpg_message(ctx, room_id, actor_id, "system", format!("[{}]\nBalance: {} {}\n{}\n\nUse `buy <item>` or `sell <item>`.", vendor.name, currency_balance(ctx, actor_id, &vendor.currency_id), currency_name, if lines.is_empty() { "• Sold out".to_string() } else { lines.join("\n") }));
}

fn buy_from_vendor(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) {
    let (item_part, vendor_query) = query.split_once(" from ").unwrap_or((query, ""));
    let (item_query, quantity) = item_part.rsplit_once(' ').and_then(|(name, value)| value.parse::<u32>().ok().map(|quantity| (name, quantity.max(1)))).unwrap_or((item_part, 1));
    let Some(vendor) = vendor_matches(ctx, room_id, vendor_query) else { rpg_message(ctx, room_id, actor_id, "error", "There is no matching vendor here.".to_string()); return };
    let Some(mut stock) = ctx.db.vendor_stock().iter().find(|stock| stock.vendor_id == vendor.id && ctx.db.object_definition().id().find(&stock.definition_id).map(|item| item.id.eq_ignore_ascii_case(item_query.trim()) || item.name.eq_ignore_ascii_case(item_query.trim()) || item.name.to_lowercase().starts_with(&item_query.trim().to_lowercase())).unwrap_or(false)) else { rpg_message(ctx, room_id, actor_id, "error", "That vendor does not sell this item.".to_string()); return };
    let quantity = quantity.min(stock.maximum_per_purchase.max(1));
    if stock.stock >= 0 && stock.stock < i32::try_from(quantity).unwrap_or(i32::MAX) { rpg_message(ctx, room_id, actor_id, "error", "The vendor does not have that many in stock.".to_string()); return; }
    let cost = stock.price.saturating_mul(i64::from(quantity));
    if currency_balance(ctx, actor_id, &vendor.currency_id) < cost { rpg_message(ctx, room_id, actor_id, "error", "You cannot afford that purchase.".to_string()); return; }
    if let Err(error) = grant_inventory_item(ctx, actor_id, &stock.definition_id, quantity, "purchase") { rpg_message(ctx, room_id, actor_id, "error", error); return; }
    let _ = change_currency(ctx, actor_id, &vendor.currency_id, -cost);
    if stock.stock >= 0 { stock.stock = stock.stock.saturating_sub(i32::try_from(quantity).unwrap_or(i32::MAX)); stock.updated_at = ctx.timestamp; ctx.db.vendor_stock().id().update(stock.clone()); }
    let name = ctx.db.object_definition().id().find(&stock.definition_id).map(|item| item.name).unwrap_or(stock.definition_id);
    refresh_actor_acquire_quests(ctx, actor_id); rpg_message(ctx, room_id, actor_id, "system", format!("You buy {name} x{quantity} for {cost} {}.", vendor.currency_id));
}

fn sell_to_vendor(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) {
    let (item_query, vendor_query) = query.split_once(" to ").unwrap_or((query, ""));
    let Some(vendor) = vendor_matches(ctx, room_id, vendor_query).filter(|vendor| vendor.buys_from_players) else { rpg_message(ctx, room_id, actor_id, "error", "There is no vendor here buying items.".to_string()); return };
    let Some((object, definition)) = find_carried_object(ctx, actor_id, item_query.trim()).filter(|(object, _)| object.location_kind == "inventory") else { rpg_message(ctx, room_id, actor_id, "error", "You are not carrying that item loose in your inventory.".to_string()); return };
    let base = ctx.db.vendor_stock().iter().find(|stock| stock.vendor_id == vendor.id && stock.definition_id == definition.id).map(|stock| stock.price).unwrap_or(0);
    if base <= 0 { rpg_message(ctx, room_id, actor_id, "error", "The vendor is not interested in that item.".to_string()); return; }
    let value = base.saturating_mul(i64::from(vendor.sell_price_percent)).saturating_div(100).max(1);
    consume_object_quantity(ctx, object, 1); let _ = change_currency(ctx, actor_id, &vendor.currency_id, value); refresh_actor_acquire_quests(ctx, actor_id);
    rpg_message(ctx, room_id, actor_id, "system", format!("You sell {} for {value} {}.", definition.name, vendor.currency_id));
}

fn repair_at_vendor(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) {
    let Some(vendor) = vendor_matches(ctx, room_id, "") else { rpg_message(ctx, room_id, actor_id, "error", "A vendor must be present to repair equipment.".to_string()); return };
    let Some((object, definition)) = find_carried_object(ctx, actor_id, query).filter(|(object, definition)| object.durability < 100 && (definition.weapon_damage > 0 || definition.armor_value > 0 || definition.equipment_slot.is_some())) else { rpg_message(ctx, room_id, actor_id, "error", "That item is not damaged equipment you carry or wear.".to_string()); return };
    let base_price = ctx.db.vendor_stock().iter().find(|stock| stock.vendor_id == vendor.id && stock.definition_id == definition.id).map(|stock| stock.price).unwrap_or(10).max(1);
    let missing = i64::from(100i32.saturating_sub(object.durability).max(1));
    let cost = base_price.saturating_mul(missing).saturating_add(99).saturating_div(100).max(1);
    if change_currency(ctx, actor_id, &vendor.currency_id, -cost).is_err() { rpg_message(ctx, room_id, actor_id, "error", format!("Repairing {} costs {cost} {}, which you cannot afford.", definition.name, vendor.currency_id)); return; }
    ctx.db.world_object().id().update(WorldObject { durability: 100, updated_at: ctx.timestamp, ..object });
    rpg_message(ctx, room_id, actor_id, "system", format!("{} repairs {} for {cost} {}.", vendor.name, definition.name, vendor.currency_id));
}

fn recipe_station_available(ctx: &ReducerContext, room_id: &str, recipe: &CraftingRecipe) -> bool {
    let Some(required) = recipe.station_tag.as_ref() else { return true };
    ctx.db.world_object().iter().filter(|object| object.location_kind == "room" && object.location_id == room_id).filter_map(|object| object_definition_for(ctx, &object)).any(|definition| serde_json::from_str::<Vec<String>>(&definition.tags).unwrap_or_default().iter().any(|tag| tag.eq_ignore_ascii_case(required)))
}

fn list_recipes(ctx: &ReducerContext, room_id: &str, actor_id: &str) {
    let level = ensure_actor_progression(ctx, actor_id).level;
    let mut recipes = ctx.db.crafting_recipe().iter().filter(|recipe| recipe.active).collect::<Vec<_>>(); recipes.sort_by(|left, right| left.name.cmp(&right.name));
    let lines = recipes.into_iter().map(|recipe| { let output = ctx.db.object_definition().id().find(&recipe.output_definition_id).map(|item| item.name).unwrap_or(recipe.output_definition_id.clone()); let station = if recipe_station_available(ctx, room_id, &recipe) { "ready" } else { "station missing" }; format!("• {} → {} x{} · level {} · {station}", recipe.name, output, recipe.output_quantity, recipe.required_level) }).collect::<Vec<_>>();
    rpg_message(ctx, room_id, actor_id, "system", format!("[CRAFTING · LEVEL {level}]\n{}\n\nUse `craft <recipe>`.", if lines.is_empty() { "• No recipes authored".to_string() } else { lines.join("\n") }));
}

fn craft_recipe(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) {
    let Some(recipe) = ctx.db.crafting_recipe().iter().find(|recipe| recipe.active && (recipe.id.eq_ignore_ascii_case(query) || recipe.name.eq_ignore_ascii_case(query) || recipe.name.to_lowercase().starts_with(&query.to_lowercase()))) else { rpg_message(ctx, room_id, actor_id, "error", "No active recipe matches that name.".to_string()); return };
    if ensure_actor_progression(ctx, actor_id).level < recipe.required_level { rpg_message(ctx, room_id, actor_id, "error", format!("{} requires level {}.", recipe.name, recipe.required_level)); return; }
    if !recipe_station_available(ctx, room_id, &recipe) { rpg_message(ctx, room_id, actor_id, "error", format!("{} requires a nearby {} station.", recipe.name, recipe.station_tag.unwrap_or_default())); return; }
    let ingredients = ctx.db.crafting_ingredient().iter().filter(|ingredient| ingredient.recipe_id == recipe.id).collect::<Vec<_>>();
    if ingredients.iter().any(|ingredient| actor_item_quantity(ctx, actor_id, &ingredient.definition_id) < ingredient.quantity) { rpg_message(ctx, room_id, actor_id, "error", "You do not have all required ingredients.".to_string()); return; }
    if let Some(currency) = recipe.currency_id.as_ref() { if currency_balance(ctx, actor_id, currency) < recipe.currency_cost { rpg_message(ctx, room_id, actor_id, "error", "You cannot afford the crafting cost.".to_string()); return; } }
    if let Err(error) = grant_inventory_item(ctx, actor_id, &recipe.output_definition_id, recipe.output_quantity, "crafted") { rpg_message(ctx, room_id, actor_id, "error", error); return; }
    for ingredient in ingredients.into_iter().filter(|ingredient| ingredient.consumed) { consume_actor_items(ctx, actor_id, &ingredient.definition_id, ingredient.quantity); }
    if let Some(currency) = recipe.currency_id.as_ref() { let _ = change_currency(ctx, actor_id, currency, -recipe.currency_cost); }
    refresh_actor_acquire_quests(ctx, actor_id); rpg_message(ctx, room_id, actor_id, "system", format!("You craft {}.", recipe.name));
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
        "acquire_item" | "deliver_item" | "interact_object" => ctx.db.object_definition().id().find(&objective.target_id).map(|row| row.name),
        "kill_npc" | "talk_npc" | "escort_npc" => ctx.db.npc().id().find(&objective.target_id).map(|row| row.name),
        "kill_faction" => ctx.db.faction_definition().id().find(&objective.target_id).map(|row| row.name),
        _ => None,
    }.unwrap_or_else(|| objective.target_id.clone());
    match objective.objective_type.as_str() {
        "explore_room" => format!("Explore {target}"),
        "acquire_item" => format!("Acquire {target}"),
        "deliver_item" => format!("Deliver {target}"),
        "interact_object" => format!("Interact with {target}"),
        "kill_npc" => format!("Defeat {target}"),
        "kill_faction" => format!("Defeat members of {target}"),
        "talk_npc" => format!("Speak with {target}"),
        "escort_npc" => format!("Escort {target}"),
        "pay_gold" => format!("Pay {} gold", objective.required_count),
        "choice" => "Make a quest choice".to_string(),
        "survive" => format!("Survive for {} seconds", objective.required_count),
        _ => target,
    }
}

fn objective_progress(ctx: &ReducerContext, actor_id: &str, objective: &QuestObjective) -> u32 {
    if matches!(objective.objective_type.as_str(), "acquire_item" | "deliver_item") {
        return actor_item_quantity(ctx, actor_id, &objective.target_id).min(objective.required_count);
    }
    if objective.objective_type == "pay_gold" { return u32::try_from(ensure_wallet(ctx, actor_id).gold.max(0)).unwrap_or(u32::MAX).min(objective.required_count); }
    if objective.objective_type == "choice" { return u32::from(ctx.db.actor_quest_choice().id().find(&format!("{actor_id}::{}", objective.quest_id)).is_some()).min(objective.required_count); }
    if objective.objective_type == "survive" {
        let elapsed = ctx.db.actor_quest().id().find(&actor_quest_id(actor_id, &objective.quest_id)).map(|quest| ctx.timestamp.to_micros_since_unix_epoch().saturating_sub(quest.accepted_at.to_micros_since_unix_epoch()) / 1_000_000).unwrap_or(0);
        return u32::try_from(elapsed.max(0)).unwrap_or(u32::MAX).min(objective.required_count);
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
    if matches!(actor_quest.status.as_str(), "completed" | "failed") { return Some(actor_quest); }
    if let Some(rule) = ctx.db.quest_rule().quest_id().find(&quest_id.to_string()) {
        let elapsed = ctx.timestamp.to_micros_since_unix_epoch().saturating_sub(actor_quest.accepted_at.to_micros_since_unix_epoch());
        if rule.time_limit_seconds > 0 && elapsed > i64::from(rule.time_limit_seconds) * 1_000_000 {
            actor_quest.status = "failed".to_string(); actor_quest.updated_at = ctx.timestamp; ctx.db.actor_quest().id().update(actor_quest.clone()); return Some(actor_quest);
        }
    }
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
    if let Some(rule) = ctx.db.quest_rule().quest_id().find(&quest.id) {
        if let Some(prerequisite) = rule.prerequisite_quest_id.as_ref() {
            let completions = ctx.db.actor_quest().id().find(&actor_quest_id(actor_id, prerequisite)).map(|row| row.completion_count).unwrap_or(0);
            if completions < rule.prerequisite_completions.max(1) { return Some(format!("Requires completing {} first.", ctx.db.quest_definition().id().find(prerequisite).map(|row| row.title).unwrap_or_else(|| prerequisite.clone()))); }
        }
        let completions = ctx.db.actor_quest().id().find(&actor_quest_id(actor_id, &quest.id)).map(|row| row.completion_count).unwrap_or(0);
        if rule.maximum_completions > 0 && completions >= rule.maximum_completions { return Some("Completion limit reached.".to_string()); }
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
    if existing.as_ref().map(|row| !matches!(row.status.as_str(), "completed" | "failed")).unwrap_or(false) {
        rpg_message(ctx, room_id, actor_id, "error", format!("{} is already in your quest log.", quest.title));
        return;
    }
    if existing.as_ref().map(|row| row.status == "completed").unwrap_or(false) && !quest.repeatable {
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
    let objectives = ctx.db.quest_objective().iter().filter(|objective| objective.quest_id == quest.id && matches!(objective.objective_type.as_str(), "acquire_item" | "deliver_item") && objective.consume_on_turn_in).collect::<Vec<_>>();
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
    let gold_payment = ctx.db.quest_objective().iter().filter(|objective| objective.quest_id == quest.id && objective.objective_type == "pay_gold" && objective.consume_on_turn_in).map(|objective| objective.required_count).max().unwrap_or(0);
    if wallet.gold < i32::try_from(gold_payment).unwrap_or(i32::MAX) { rpg_message(ctx, room_id, actor_id, "error", "You no longer have the gold required for this quest.".to_string()); refresh_actor_quest(ctx, actor_id, &quest.id); return; }
    wallet.gold = wallet.gold.saturating_sub(i32::try_from(gold_payment).unwrap_or(i32::MAX));
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
    if let Some(rule) = ctx.db.quest_rule().quest_id().find(&quest.id) { if let Some(next_id) = rule.next_quest_id { if let Some(next) = ctx.db.quest_definition().id().find(&next_id) { reward_lines.push(format!("Follow-up unlocked: {}", next.title)); } } }
    rpg_message(ctx, room_id, actor_id, "system", format!("[QUEST COMPLETE] {}\n{} accepts your report.\n{}", quest.title, turn_in_npc.name, reward_lines.join("\n")));
}

fn choose_quest_branch(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) {
    let active_ids = ctx.db.actor_quest().iter().filter(|row| row.actor_id == actor_id && row.status == "active").map(|row| row.quest_id).collect::<Vec<_>>();
    let Some(choice) = ctx.db.quest_choice().iter().find(|choice| active_ids.contains(&choice.quest_id) && (choice.id.eq_ignore_ascii_case(query) || choice.label.eq_ignore_ascii_case(query) || choice.label.to_lowercase().starts_with(&query.to_lowercase()))) else { rpg_message(ctx, room_id, actor_id, "error", format!("No active quest offers the choice \"{}\".", query.trim())); return };
    let id = format!("{actor_id}::{}", choice.quest_id);
    if ctx.db.actor_quest_choice().id().find(&id).is_some() { rpg_message(ctx, room_id, actor_id, "error", "You have already made this quest choice.".to_string()); return; }
    ctx.db.actor_quest_choice().insert(ActorQuestChoice { id, actor_id: actor_id.to_string(), quest_id: choice.quest_id.clone(), choice_id: choice.id.clone(), chosen_at: ctx.timestamp });
    if choice.gold_reward != 0 { let mut wallet = ensure_wallet(ctx, actor_id); wallet.gold = wallet.gold.saturating_add(choice.gold_reward).max(0); wallet.updated_at = ctx.timestamp; ctx.db.actor_wallet().id().update(wallet); }
    if let Some(faction) = choice.reputation_faction_id.as_ref() { change_reputation(ctx, actor_id, faction, choice.reputation_reward); }
    advance_quest_event(ctx, actor_id, "choice", &choice.id, 1);
    refresh_actor_quest(ctx, actor_id, &choice.quest_id);
    let follow_up = choice.next_quest_id.as_ref().and_then(|id| ctx.db.quest_definition().id().find(id)).map(|quest| format!(" Follow-up unlocked: {}.", quest.title)).unwrap_or_default();
    rpg_message(ctx, room_id, actor_id, "system", format!("[CHOICE MADE] {} — {}{}", choice.label, choice.description, follow_up));
}

fn list_quests(ctx: &ReducerContext, room_id: &str, actor_id: &str) {
    refresh_actor_acquire_quests(ctx, actor_id);
    let wallet = ensure_wallet(ctx, actor_id);
    let active = ctx.db.actor_quest().iter().filter(|row| row.actor_id == actor_id && matches!(row.status.as_str(), "active" | "ready")).collect::<Vec<_>>();
    let mut sections = Vec::new();
    for actor_quest in active {
        let Some(quest) = ctx.db.quest_definition().id().find(&actor_quest.quest_id) else { continue };
        let mut objectives = ctx.db.quest_objective().iter().filter(|objective| objective.quest_id == quest.id).collect::<Vec<_>>();
        objectives.sort_by_key(|objective| objective.sort_order);
        let lines = objectives.into_iter().map(|objective| format!("{} {}/{}", quest_objective_label(ctx, &objective), objective_progress(ctx, actor_id, &objective), objective.required_count)).collect::<Vec<_>>();
        sections.push(format!("[{} - {}]\n{}\nTurn in to: {}", quest.title, actor_quest.status.to_uppercase(), if lines.is_empty() { "No objectives".to_string() } else { lines.join("\n") }, ctx.db.npc().id().find(&quest.turn_in_npc_id).map(|npc| npc.name).unwrap_or_else(|| quest.turn_in_npc_id.clone())));
        let mut choices = ctx.db.quest_choice().iter().filter(|choice| choice.quest_id == quest.id).collect::<Vec<_>>();
        choices.sort_by_key(|choice| choice.sort_order);
        if !choices.is_empty() && ctx.db.actor_quest_choice().id().find(&format!("{actor_id}::{}", quest.id)).is_none() { sections.push(format!("[CHOICE - {}]\n{}\nUse `choose <option>`.", quest.title, choices.into_iter().map(|choice| format!("• {} — {}", choice.label, choice.description)).collect::<Vec<_>>().join("\n"))); }
    }
    let nearby_npcs = ctx.db.npc().iter().filter(|npc| npc.current_room.as_deref() == Some(room_id)).map(|npc| npc.id).collect::<Vec<_>>();
    let offers = ctx.db.quest_definition().iter().filter(|quest| {
        if !quest.active || !nearby_npcs.contains(&quest.quest_giver_npc_id) || quest_requirement_error(ctx, actor_id, quest).is_some() { return false; }
        let state = ctx.db.actor_quest().id().find(&actor_quest_id(actor_id, &quest.id));
        state.is_none() || state.as_ref().map(|row| row.status == "failed").unwrap_or(false) || (state.map(|row| row.status == "completed").unwrap_or(false) && quest.repeatable)
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
    let escorted = ctx.db.quest_objective().iter().filter(|objective| objective.objective_type == "escort_npc")
        .filter(|objective| ctx.db.actor_quest().id().find(&actor_quest_id(actor_id, &objective.quest_id)).map(|quest| quest.status == "active").unwrap_or(false))
        .filter(|objective| ctx.db.npc().id().find(&objective.target_id).map(|npc| npc.current_room.as_deref() == Some(room_id)).unwrap_or(false))
        .map(|objective| objective.target_id).collect::<Vec<_>>();
    for npc_id in escorted { advance_quest_event(ctx, actor_id, "escort_npc", &npc_id, 1); }
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

fn actor_role_value(ctx: &ReducerContext, actor_id: &str, role: &str) -> i32 {
    stat_definition_by_role(ctx, role).map(|definition| actor_stat_value(ctx, actor_id, &definition)).unwrap_or(0)
}

fn actor_is_player(ctx: &ReducerContext, actor_id: &str) -> bool {
    let key = actor_id.to_string();
    ctx.db.character().id().find(&key).is_some() || ctx.db.profile().id().find(&key).is_some()
}

fn resolve_combat_damage(ctx: &ReducerContext, attacker_id: &str, target_id: &str, base_damage: i32, school: &str, armor_applies: bool) -> (i32, String) {
    let config = world_combat_config(ctx);
    let seed = format!("{attacker_id}:{target_id}:{school}:{}", ctx.timestamp.to_micros_since_unix_epoch());
    let hit = i64::from(config.base_hit_chance_percent)
        .saturating_add(i64::from(actor_role_value(ctx, attacker_id, "accuracy")))
        .saturating_sub(i64::from(config.base_dodge_chance_percent))
        .saturating_sub(i64::from(actor_role_value(ctx, target_id, "dodge"))).clamp(5, 100) as u32;
    if deterministic_roll(&format!("{seed}:hit")) % 100 >= hit { return (0, "dodge".to_string()); }
    let parry = config.base_parry_chance_percent.saturating_add(u32::try_from(actor_role_value(ctx, target_id, "parry").max(0)).unwrap_or(0)).min(100);
    if deterministic_roll(&format!("{seed}:parry")) % 100 < parry { return (0, "parry".to_string()); }

    let crit = config.base_crit_chance_percent.saturating_add(u32::try_from(actor_role_value(ctx, attacker_id, "crit").max(0)).unwrap_or(0)).min(100);
    let critical = deterministic_roll(&format!("{seed}:crit")) % 100 < crit;
    let mut damage = base_damage.max(1);
    if critical { damage = i64::from(damage).saturating_mul(i64::from(config.crit_damage_percent)).saturating_div(100).max(1) as i32; }

    if armor_applies {
        let innate_defense = actor_role_value(ctx, target_id, "defense").max(0);
        let armor = ctx.db.world_object().iter()
            .filter(|object| object.location_kind == "equipped" && object.location_id == target_id && object.durability > 0)
            .filter_map(|object| object_definition_for(ctx, &object))
            .map(|definition| definition.armor_value.max(0)).sum::<i32>();
        let effective_armor = i64::from(innate_defense.saturating_add(armor)).saturating_mul(i64::from(config.armor_effectiveness_percent)).saturating_div(100);
        damage = i64::from(damage).saturating_mul(100).saturating_div(100i64.saturating_add(effective_armor).max(1)).max(1) as i32;
    }

    let resistance_role = format!("resistance:{}", school.to_lowercase());
    let resistance = actor_role_value(ctx, target_id, &resistance_role).clamp(0, 90);
    damage = damage.saturating_mul(100i32.saturating_sub(resistance)).saturating_div(100).max(1);
    if actor_is_player(ctx, attacker_id) && actor_is_player(ctx, target_id) {
        damage = i64::from(damage).saturating_mul(i64::from(config.pvp_damage_percent)).saturating_div(100).max(1) as i32;
    }

    let block = config.base_block_chance_percent.saturating_add(u32::try_from(actor_role_value(ctx, target_id, "block").max(0)).unwrap_or(0)).min(100);
    let blocked = deterministic_roll(&format!("{seed}:block")) % 100 < block;
    if blocked { damage = damage.saturating_mul(100u32.saturating_sub(config.block_damage_reduction_percent) as i32).saturating_div(100).max(1); }
    (damage, if blocked { "block" } else if critical { "critical" } else { "hit" }.to_string())
}

fn combat_damage(ctx: &ReducerContext, attacker_id: &str, target_id: &str) -> (i32, String, String) {
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
    let (damage, outcome) = resolve_combat_damage(ctx, attacker_id, target_id, attack, "physical", true);
    (damage, equipped_weapon.map(|weapon| weapon.name).unwrap_or_else(|| "bare hands".to_string()), outcome)
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

fn record_npc_threat(ctx: &ReducerContext, npc_id: &str, actor_id: &str, damage: i32) {
    if damage <= 0 { return; }
    let config = world_combat_config(ctx);
    if !config.threat_enabled { return; }
    let id = format!("{npc_id}::{actor_id}");
    let amount = u32::try_from(damage).unwrap_or(u32::MAX);
    if let Some(row) = ctx.db.npc_threat().id().find(&id) {
        ctx.db.npc_threat().id().update(NpcThreat {
            threat: row.threat.saturating_add(amount), damage_contributed: row.damage_contributed.saturating_add(amount),
            updated_at_micros: ctx.timestamp.to_micros_since_unix_epoch(), ..row
        });
    } else {
        ctx.db.npc_threat().insert(NpcThreat {
            id, npc_id: npc_id.to_string(), actor_id: actor_id.to_string(), threat: amount,
            damage_contributed: amount, updated_at_micros: ctx.timestamp.to_micros_since_unix_epoch(),
        });
    }
}

fn award_npc_experience(ctx: &ReducerContext, npc: &Npc, killer_id: &str, room_id: &str) {
    let config = world_combat_config(ctx);
    let cutoff = ctx.timestamp.to_micros_since_unix_epoch().saturating_sub(i64::from(config.threat_decay_seconds) * 1_000_000);
    let threat_rows = ctx.db.npc_threat().iter().filter(|row| row.npc_id == npc.id).collect::<Vec<_>>();
    let mut recipients = threat_rows.iter()
        .filter(|row| row.updated_at_micros >= cutoff && actor_current_room(ctx, &row.actor_id).as_deref() == Some(room_id))
        .map(|row| row.actor_id.clone()).collect::<Vec<_>>();
    if !recipients.iter().any(|id| id == killer_id) { recipients.push(killer_id.to_string()); }
    recipients.sort();
    recipients.dedup();
    for actor_id in recipients {
        let amount = if actor_id == killer_id { npc.xp_reward }
            else { u64::from(npc.xp_reward).saturating_mul(u64::from(config.assist_xp_percent)).saturating_div(100) as u32 };
        let message = award_experience(ctx, &actor_id, amount);
        rpg_message(ctx, room_id, &actor_id, "system", if actor_id == killer_id { message } else { format!("Assist reward: {message}") });
    }
    for row in threat_rows { ctx.db.npc_threat().id().delete(&row.id); }
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

fn ability_effect_power(ctx: &ReducerContext, actor_id: &str, effect: &AbilityEffectDefinition) -> i32 {
    let range = effect.power_max.saturating_sub(effect.power_min).saturating_add(1).max(1) as u32;
    let rolled = effect.power_min.saturating_add((deterministic_roll(&format!("{actor_id}:{}:{}", effect.id, ctx.timestamp.to_micros_since_unix_epoch())) % range) as i32);
    let scaling = effect.scales_with_stat.as_ref().and_then(|id| ctx.db.stat_definition().id().find(id))
        .map(|definition| actor_stat_value(ctx, actor_id, &definition).saturating_mul(effect.scaling_percent) / 100).unwrap_or(0);
    rolled.saturating_add(scaling)
}

fn effect_targets(
    ctx: &ReducerContext,
    room_id: &str,
    actor_id: &str,
    actor_name: &str,
    primary: &(String, String, bool),
    scope: &str,
) -> Vec<(String, String, bool)> {
    if scope == "primary" { return vec![primary.clone()]; }
    if scope == "self" { return vec![(actor_id.to_string(), actor_name.to_string(), false)]; }
    let pvp = region_for_room(ctx, room_id).map(|region| region.pvp_enabled).unwrap_or(false);
    let mut targets = Vec::new();
    if matches!(scope, "all_allies" | "room") { targets.push((actor_id.to_string(), actor_name.to_string(), false)); }
    if matches!(scope, "all_enemies" | "all_allies" | "room") {
        for npc in ctx.db.npc().iter().filter(|npc| npc.current_room.as_deref() == Some(room_id) && npc.defeated_at.is_none()) {
            let enemy = npc_disposition(&npc) != "friendly";
            if scope == "room" || (scope == "all_enemies" && enemy) || (scope == "all_allies" && !enemy) { targets.push((npc.id, npc.name, true)); }
        }
        for character in ctx.db.character().iter().filter(|row| row.current_room.as_deref() == Some(room_id) && row.id != actor_id) {
            if scope == "room" || scope == "all_allies" || (scope == "all_enemies" && pvp) { targets.push((character.id, character.name, false)); }
        }
        for profile in ctx.db.profile().iter().filter(|row| row.current_room.as_deref() == Some(room_id) && row.id != actor_id) {
            if scope == "room" || scope == "all_allies" || (scope == "all_enemies" && pvp) { targets.push((profile.id.clone(), profile.name.or(profile.handle).unwrap_or_else(|| "Traveler".to_string()), false)); }
        }
    }
    targets.sort_by(|left, right| left.0.cmp(&right.0));
    targets.dedup_by(|left, right| left.0 == right.0);
    targets
}

fn apply_status_effect(ctx: &ReducerContext, source_actor_id: &str, target_actor_id: &str, ability_id: &str, effect: &AbilityEffectDefinition) {
    let id = format!("{target_actor_id}::{}", effect.id);
    let existing = ctx.db.actor_status_effect().id().find(&id);
    let stacks = existing.as_ref().map(|row| row.stacks.saturating_add(1)).unwrap_or(1).min(effect.max_stacks.max(1));
    let expires_at_micros = ctx.timestamp.to_micros_since_unix_epoch().saturating_add(i64::from(effect.duration_ms.max(1)) * 1_000);
    let row = ActorStatusEffect {
        id: id.clone(), actor_id: target_actor_id.to_string(), source_actor_id: source_actor_id.to_string(), ability_id: ability_id.to_string(), effect_id: effect.id.clone(),
        name: effect.status_name.clone(), kind: effect.effect_kind.clone(), stat_id: effect.stat_id.clone(), modifier_value: effect.modifier_value,
        stacks, expires_at_micros, updated_at: ctx.timestamp,
    };
    if existing.is_some() { ctx.db.actor_status_effect().id().update(row); } else { ctx.db.actor_status_effect().insert(row); }
}

fn revive_actor_in_place(ctx: &ReducerContext, actor_id: &str, room_id: &str) {
    let config = world_lifecycle_config(ctx);
    if !config.allow_ability_revive { return; }
    if let Some(npc) = ctx.db.npc().id().find(&actor_id.to_string()) {
        ctx.db.npc().id().update(Npc { current_room: Some(room_id.to_string()), defeated_at: None, ..npc });
    } else {
        let _ = move_actor_to_room(ctx, actor_id, room_id);
        let state = ensure_actor_life_state(ctx, actor_id);
        ctx.db.actor_life_state().id().update(ActorLifeState { state: "alive".to_string(), death_room_id: None, pending_spawn_point_id: None, respawn_available_at_micros: 0, updated_at: ctx.timestamp, ..state });
    }
    restore_actor_after_respawn(ctx, actor_id, &config);
}

fn apply_effect_to_target(
    ctx: &ReducerContext,
    room_id: &str,
    source_actor_id: &str,
    source_actor_name: &str,
    ability: &AbilityDefinition,
    effect: &AbilityEffectDefinition,
    target: &(String, String, bool),
) {
    let (target_id, target_name, target_is_npc) = target;
    match effect.effect_kind.as_str() {
        "damage" => {
            if target_id != source_actor_id && !*target_is_npc && !region_for_room(ctx, room_id).map(|region| region.pvp_enabled).unwrap_or(false) { return; }
            if *target_is_npc && ctx.db.npc().id().find(target_id).map(|npc| npc_disposition(&npc) == "friendly").unwrap_or(false) { return; }
            let stat = effect.stat_id.as_ref().and_then(|id| ctx.db.stat_definition().id().find(id)).or_else(|| stat_definition_by_role(ctx, "health"));
            let Some(stat) = stat else { return };
            let current = actor_stat_row(ctx, target_id, &stat);
            if current.current_value <= stat.minimum { return; }
            let base = ability_effect_power(ctx, source_actor_id, effect).max(0);
            let (damage, outcome) = resolve_combat_damage(ctx, source_actor_id, target_id, base, &ability.school, effect.mitigation_type == "armor");
            let next = current.current_value.saturating_sub(damage).max(stat.minimum);
            if damage > 0 {
                interrupt_actor_casts(ctx, target_id, room_id, "by taking damage");
                if effect.mitigation_type == "armor" { wear_equipped_armor(ctx, target_id, room_id); }
                if *target_is_npc { record_npc_threat(ctx, target_id, source_actor_id, damage); }
            }
            set_actor_stat_current(ctx, target_id, &stat, next);
            add_message(ctx, Some(room_id.to_string()), Some(source_actor_id.to_string()), Some(source_actor_name.to_string()), None, "combat", format!("{source_actor_name}'s {} hits {target_name} for {damage} damage ({outcome}).", ability.name), None, None);
            if next <= stat.minimum && damage > 0 {
                if let Some(npc) = ctx.db.npc().id().find(target_id) {
                    penalize_npc_attack(ctx, room_id, source_actor_id, source_actor_name, &npc, true);
                    advance_quest_event(ctx, source_actor_id, "kill_npc", &npc.id, 1);
                    if let Some(faction_id) = npc.faction.as_ref() { advance_quest_event(ctx, source_actor_id, "kill_faction", faction_id, 1); }
                    award_npc_experience(ctx, &npc, source_actor_id, room_id);
                    let drops = defeat_npc(ctx, npc, room_id);
                    if !drops.is_empty() { rpg_message(ctx, room_id, source_actor_id, "system", format!("{target_name} drops {}.", drops.join(", "))); }
                } else { defeat_player(ctx, target_id, room_id, target_name, Some(source_actor_name)); }
            }
        }
        "heal" | "restore" => {
            let stat = effect.stat_id.as_ref().and_then(|id| ctx.db.stat_definition().id().find(id)).or_else(|| stat_definition_by_role(ctx, "health"));
            let Some(stat) = stat else { return };
            let current = actor_stat_row(ctx, target_id, &stat);
            let power = ability_effect_power(ctx, source_actor_id, effect).max(0);
            set_actor_stat_current(ctx, target_id, &stat, current.current_value.saturating_add(power).min(current.base_value));
        }
        "buff" | "debuff" | "stun" => apply_status_effect(ctx, source_actor_id, target_id, &ability.id, effect),
        "damage_over_time" | "heal_over_time" => {
            apply_status_effect(ctx, source_actor_id, target_id, &ability.id, effect);
            let ticks = effect.duration_ms.saturating_add(effect.tick_interval_ms.saturating_sub(1)).saturating_div(effect.tick_interval_ms.max(1)).max(1);
            let at = ctx.timestamp + TimeDuration::from_micros(i64::from(effect.tick_interval_ms.max(1)) * 1_000);
            ctx.db.scheduled_effect_tick().insert(ScheduledEffectTick { scheduled_id: 0, scheduled_at: at.into(), source_actor_id: source_actor_id.to_string(), source_actor_name: source_actor_name.to_string(), target_actor_id: target_id.clone(), ability_id: ability.id.clone(), effect_id: effect.id.clone(), remaining_ticks: ticks });
        }
        "interrupt" => interrupt_actor_casts(ctx, target_id, room_id, "by an interrupt"),
        "cleanse" => {
            let ids = ctx.db.actor_status_effect().iter().filter(|status| status.actor_id == *target_id && matches!(status.kind.as_str(), "debuff" | "stun" | "damage_over_time")).map(|status| status.id).collect::<Vec<_>>();
            for id in ids { ctx.db.actor_status_effect().id().delete(&id); }
        }
        "teleport" => { if let Some(destination) = effect.destination_room_id.as_ref() { let _ = move_actor_to_room(ctx, target_id, destination); } }
        "revive" => revive_actor_in_place(ctx, target_id, room_id),
        "summon" => {
            if let Some(npc_id) = effect.summon_npc_id.as_ref() {
                if let Some(npc) = ctx.db.npc().id().find(npc_id) { ctx.db.npc().id().update(Npc { current_room: Some(room_id.to_string()), defeated_at: None, ..npc }); }
            }
        }
        _ => {}
    }
}

fn execute_ability_effects(ctx: &ReducerContext, room_id: &str, actor_id: &str, actor_name: &str, ability: &AbilityDefinition, primary: &(String, String, bool), effects: Vec<AbilityEffectDefinition>) {
    for effect in effects {
        if deterministic_roll(&format!("{}:{}:{}", actor_id, effect.id, ctx.timestamp.to_micros_since_unix_epoch())) % 100 >= effect.chance_percent { continue; }
        let targets = effect_targets(ctx, room_id, actor_id, actor_name, primary, &effect.target_scope);
        for target in targets { apply_effect_to_target(ctx, room_id, actor_id, actor_name, ability, &effect, &target); }
    }
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
    let global_remaining = cooldown_remaining_ms(ctx, actor_id, "global-cooldown");
    if global_remaining > 0 {
        rpg_message(ctx, room_id, actor_id, "error", format!("You can use another ability in {:.1} seconds.", global_remaining as f32 / 1000.0));
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
    let mut authored_effects = ctx.db.ability_effect_definition().iter()
        .filter(|effect| effect.ability_id == ability.id)
        .collect::<Vec<_>>();
    authored_effects.sort_by(|left, right| left.sort_order.cmp(&right.sort_order).then(left.id.cmp(&right.id)));
    let legacy_effect_stat = if authored_effects.is_empty() {
        ability.effect_stat_id.as_ref()
            .and_then(|id| ctx.db.stat_definition().id().find(id))
            .or_else(|| if matches!(ability.effect_type.as_str(), "damage" | "heal" | "restore") { stat_definition_by_role(ctx, "health") } else { None })
    } else { None };
    if authored_effects.is_empty() && legacy_effect_stat.is_none() {
        rpg_message(ctx, room_id, actor_id, "error", "This ability has no configured effects.".to_string());
        return;
    }
    let legacy_target_row = legacy_effect_stat.as_ref().map(|stat| actor_stat_row(ctx, &target_id, stat));
    if ability.effect_type == "damage" && legacy_target_row.as_ref().zip(legacy_effect_stat.as_ref()).map(|(row, stat)| row.current_value <= stat.minimum).unwrap_or(false) {
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
    let global_cooldown_ms = world_combat_config(ctx).global_cooldown_ms;
    if global_cooldown_ms > 0 { set_cooldown(ctx, actor_id, "global-cooldown", global_cooldown_ms); }
    if !authored_effects.is_empty() {
        let primary = (target_id, target_name, target_is_npc);
        execute_ability_effects(ctx, room_id, actor_id, actor_name, &ability, &primary, authored_effects);
        return;
    }
    let effect_stat = legacy_effect_stat.expect("legacy effect stat was validated above");
    let target_row = legacy_target_row.expect("legacy target stat was loaded above");
    let mut power = ability_power(ctx, actor_id, &ability);
    let mut damage_outcome = "hit".to_string();
    if ability.effect_type == "damage" {
        (power, damage_outcome) = resolve_combat_damage(ctx, actor_id, &target_id, power, &ability.school, ability.mitigation_type == "armor");
    }

    match ability.effect_type.as_str() {
        "damage" => {
            let next = target_row.current_value.saturating_sub(power).max(effect_stat.minimum);
            if let Some(npc) = target_npc.as_ref() { record_npc_threat(ctx, &npc.id, actor_id, power); }
            if power > 0 {
                interrupt_actor_casts(ctx, &target_id, room_id, "by taking damage");
                if ability.mitigation_type == "armor" { wear_equipped_armor(ctx, &target_id, room_id); }
            }
            set_actor_stat_current(ctx, &target_id, &effect_stat, next);
            let result = if power == 0 { format!(" {target_name} {} the ability.", if damage_outcome == "parry" { "parries" } else { "dodges" }) } else if next <= effect_stat.minimum { format!(" {target_name} is defeated.") } else { format!(" {target_name} has {next} {} remaining.", effect_stat.name) };
            add_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), Some(actor_name.to_string()), None, "combat",
                format!("{actor_name} uses {} {} on {target_name} for {power} damage ({damage_outcome}).{result}", ability.icon, ability.name), None, None);
            if next <= effect_stat.minimum {
                if let Some(npc) = target_npc {
                    penalize_npc_attack(ctx, room_id, actor_id, actor_name, &npc, true);
                    advance_quest_event(ctx, actor_id, "kill_npc", &npc.id, 1);
                    if let Some(faction_id) = npc.faction.as_ref() { advance_quest_event(ctx, actor_id, "kill_faction", faction_id, 1); }
                    award_npc_experience(ctx, &npc, actor_id, room_id);
                    let drops = defeat_npc(ctx, npc, room_id);
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

#[reducer]
pub fn resolve_scheduled_effect_tick(ctx: &ReducerContext, tick: ScheduledEffectTick) -> Result<(), String> {
    if ctx.sender() != ctx.identity() {
        return Err("Scheduled effects may only be resolved by the module scheduler.".to_string());
    }
    let Some(ability) = ctx.db.ability_definition().id().find(&tick.ability_id) else { return Ok(()) };
    let Some(mut effect) = ctx.db.ability_effect_definition().id().find(&tick.effect_id) else { return Ok(()) };
    let status_id = format!("{}::{}", tick.target_actor_id, tick.effect_id);
    let Some(status) = ctx.db.actor_status_effect().id().find(&status_id) else { return Ok(()) };
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    if status.expires_at_micros < now {
        ctx.db.actor_status_effect().id().delete(&status_id);
        return Ok(());
    }
    let Some(room_id) = actor_current_room(ctx, &tick.target_actor_id) else { return Ok(()) };
    let Some(target_name) = actor_display_name(ctx, &tick.target_actor_id) else { return Ok(()) };
    effect.effect_kind = if effect.effect_kind == "damage_over_time" { "damage".to_string() } else { "heal".to_string() };
    apply_effect_to_target(
        ctx,
        &room_id,
        &tick.source_actor_id,
        &tick.source_actor_name,
        &ability,
        &effect,
        &(tick.target_actor_id.clone(), target_name, ctx.db.npc().id().find(&tick.target_actor_id).is_some()),
    );
    if tick.remaining_ticks > 1 && actor_current_room(ctx, &tick.target_actor_id).is_some() {
        let at = ctx.timestamp + TimeDuration::from_micros(i64::from(effect.tick_interval_ms.max(1)) * 1_000);
        ctx.db.scheduled_effect_tick().insert(ScheduledEffectTick {
            scheduled_id: 0,
            scheduled_at: at.into(),
            remaining_ticks: tick.remaining_ticks - 1,
            ..tick
        });
    } else {
        ctx.db.actor_status_effect().id().delete(&status_id);
    }
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
    corpse_id: Option<&str>,
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
                location_kind: if corpse_id.is_some() { "container".to_string() } else { "room".to_string() },
                location_id: corpse_id.unwrap_or(origin_room).to_string(),
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

fn create_actor_corpse(ctx: &ReducerContext, actor_id: &str, actor_name: &str, room_id: &str) -> String {
    let definition_id = "system-actor-corpse".to_string();
    if ctx.db.object_definition().id().find(&definition_id).is_none() {
        ctx.db.object_definition().insert(ObjectDefinition { id: definition_id.clone(), name: "Fallen adventurer".to_string(), description: "A body containing whatever death left behind.".to_string(), primitive_kind: "container".to_string(), icon: "†".to_string(), tags: "[\"corpse\"]".to_string(), portable: false, stackable: false, max_stack: 1, capacity: 9999, equipment_slot: None, weapon_damage: 0, armor_value: 0, scales_with_stat: None, fuel_value: 0, burn_rate: 0, accepted_fuel_tags: "[]".to_string(), stat_modifiers: "{}".to_string(), on_use: "{}".to_string(), created_at: ctx.timestamp, updated_at: ctx.timestamp, image_url: None, attack_cooldown_ms: 2000, inventory_slots_bonus: 0 });
    }
    let id = format!("corpse-{actor_id}-{}", ctx.timestamp.to_micros_since_unix_epoch());
    ctx.db.world_object().insert(WorldObject { id: id.clone(), definition_id, location_kind: "room".to_string(), location_id: room_id.to_string(), quantity: 1, equipped_slot: None, durability: 100, fuel_remaining: 0, is_active: false, state_json: format!(r#"{{"actor_id":"{actor_id}","actor_name":"{actor_name}"}}"#), created_at: ctx.timestamp, updated_at: ctx.timestamp });
    id
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
    let corpse_id = config.create_lootable_corpse.then(|| create_actor_corpse(ctx, actor_id, actor_name, origin_room));
    let (dropped, mut destroyed) = apply_death_item_loss(ctx, actor_id, origin_room, &config, corpse_id.as_deref());
    let (gold_lost, experience_lost) = apply_death_progression_loss(ctx, actor_id, &config);
    if config.reset_quests_on_death { reset_active_quests_on_death(ctx, actor_id); }
    let failed_quest_ids = ctx.db.actor_quest().iter().filter(|quest| quest.actor_id == actor_id && matches!(quest.status.as_str(), "active" | "ready"))
        .filter(|quest| ctx.db.quest_rule().quest_id().find(&quest.quest_id).map(|rule| rule.failure_on_death).unwrap_or(false))
        .map(|quest| quest.id).collect::<Vec<_>>();
    for id in failed_quest_ids { if let Some(quest) = ctx.db.actor_quest().id().find(&id) { ctx.db.actor_quest().id().update(ActorQuest { status: "failed".to_string(), updated_at: ctx.timestamp, ..quest }); } }
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

    let current_lives = if config.maximum_lives > 0 && previous.lives_remaining == 0 && previous.death_count == 0 { config.maximum_lives } else { previous.lives_remaining };
    let lives_remaining = if config.maximum_lives > 0 { current_lives.saturating_sub(1) } else { 0 };
    if (config.death_mode == "hardcore" || (config.maximum_lives > 0 && lives_remaining == 0)) && ctx.db.character().id().find(&actor_key).is_some() {
        let remaining = ctx.db.world_object().iter()
            .filter(|object| object.location_id == actor_id && matches!(object.location_kind.as_str(), "inventory" | "equipped"))
            .count() as u32;
        destroyed = destroyed.saturating_add(remaining);
        if let Some(record) = ctx.db.actor_death_record().id().find(&format!("{actor_id}:{}", ctx.timestamp.to_micros_since_unix_epoch())) {
            ctx.db.actor_death_record().id().update(ActorDeathRecord { item_stacks_destroyed: destroyed, ..record });
        }
        add_message(ctx, Some(origin_room.to_string()), Some(actor_key.clone()), None, Some(actor_key.clone()), "system",
            if config.death_mode == "hardcore" { "Hardcore death is permanent. This character has been lost; create a new character to return.".to_string() } else { "This character has spent their final life and is permanently lost.".to_string() }, None, None);
        delete_actor_rpg_state(ctx, &actor_key);
        ctx.db.character().id().delete(&actor_key);
        return;
    }

    let respawn_available_at_micros = ctx.timestamp.to_micros_since_unix_epoch()
        .saturating_add(i64::from(config.respawn_delay_seconds) * 1_000_000);
    ctx.db.actor_life_state().id().update(ActorLifeState {
        state: "dead".to_string(), death_room_id: Some(origin_room.to_string()),
        pending_spawn_point_id: spawn_point.map(|point| point.id), death_count: previous.death_count.saturating_add(1),
        died_at: Some(ctx.timestamp), respawn_available_at_micros, protected_until_micros: 0, lives_remaining, updated_at: ctx.timestamp, ..previous
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
    let (damage, weapon_name, outcome) = combat_damage(ctx, &npc.id, actor_id);
    let next_health = current_health.saturating_sub(damage).max(health.minimum);
    wear_equipped_weapon(ctx, &npc.id, room_id);
    if damage > 0 {
        interrupt_actor_casts(ctx, actor_id, room_id, "by taking damage");
        wear_equipped_armor(ctx, actor_id, room_id);
    }
    set_actor_stat_current(ctx, actor_id, health, next_health);
    ctx.db.npc().id().update(Npc { last_attack_at: Some(ctx.timestamp), ..npc.clone() });
    let result = if damage == 0 {
        format!(" {actor_name} {} the attack.", if outcome == "parry" { "parries" } else { "dodges" })
    } else if next_health <= health.minimum {
        format!(" {actor_name} is defeated.")
    } else {
        format!(" {actor_name} has {next_health} {} remaining.", health.name)
    };
    add_message(ctx, Some(room_id.to_string()), Some(npc.id.clone()), Some(npc.name.clone()), None, "combat",
        format!("{} attacks {actor_name} with {weapon_name} for {damage} damage ({outcome}).{result}", npc.name), None, None);
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
            let (target_id, target_name) = highest_threat_target(ctx, &npc.id, &room_id)
                .unwrap_or_else(|| (actor_id.to_string(), actor_name.to_string()));
            npc_attack_player(ctx, npc, &room_id, &target_id, &target_name, &health);
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

    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let stunned = ctx.db.actor_status_effect().iter().find(|status| status.actor_id == actor_id && status.kind == "stun" && status.expires_at_micros > now);
    if let Some(status) = stunned {
        if matches!(lower.as_str(), "status" | "statuses" | "effects" | "stats" | "sheet") {
            list_status_effects(ctx, room_id, actor_id);
        } else {
            let seconds = status.expires_at_micros.saturating_sub(now).saturating_add(999_999) / 1_000_000;
            rpg_message(ctx, room_id, actor_id, "error", format!("You are stunned by {} for another {seconds} second{}.", status.name, if seconds == 1 { "" } else { "s" }));
        }
        return Ok(true);
    }

    if matches!(lower.as_str(), "inventory" | "inv" | "i" | "equipment") {
        list_inventory(ctx, room_id, actor_id);
        return Ok(true);
    }
    if matches!(lower.as_str(), "origins" | "character options" | "classes" | "races" | "backgrounds") {
        let mut options = ctx.db.character_option_definition().iter().filter(|option| option.active).collect::<Vec<_>>(); options.sort_by(|left, right| left.option_kind.cmp(&right.option_kind).then(left.sort_order.cmp(&right.sort_order)));
        let lines = options.into_iter().map(|option| format!("• [{}] {} {} (`{}`) — {}", option.option_kind, option.icon, option.name, option.id, option.description)).collect::<Vec<_>>();
        rpg_message(ctx, room_id, actor_id, "system", format!("[CHARACTER OPTIONS]\n{}\n\nCreate with `create <name> | <race-id> | <class-id> | <background-id>`; omit any category the world does not require.", if lines.is_empty() { "• This world has no authored origins.".to_string() } else { lines.join("\n") }));
        return Ok(true);
    }
    if matches!(lower.as_str(), "stats" | "status" | "sheet") {
        list_stats(ctx, room_id, actor_id);
        return Ok(true);
    }
    if matches!(lower.as_str(), "statuses" | "effects" | "buffs" | "debuffs") {
        list_status_effects(ctx, room_id, actor_id);
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
    if matches!(lower.as_str(), "shop" | "vendor") {
        list_shop(ctx, room_id, actor_id, "");
        return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("shop ").or_else(|| lower.strip_prefix("vendor ")) { list_shop(ctx, room_id, actor_id, query); return Ok(true); }
    if let Some(query) = lower.strip_prefix("buy ") { buy_from_vendor(ctx, room_id, actor_id, query); return Ok(true); }
    if let Some(query) = lower.strip_prefix("sell ") { sell_to_vendor(ctx, room_id, actor_id, query); return Ok(true); }
    if let Some(query) = lower.strip_prefix("repair ") { repair_at_vendor(ctx, room_id, actor_id, query.trim()); return Ok(true); }
    if matches!(lower.as_str(), "recipes" | "crafting") { list_recipes(ctx, room_id, actor_id); return Ok(true); }
    if let Some(query) = lower.strip_prefix("craft ") { craft_recipe(ctx, room_id, actor_id, query.trim()); return Ok(true); }
    if matches!(lower.as_str(), "bank" | "bank inventory") {
        let items = ctx.db.world_object().iter().filter(|object| object.location_kind == "bank" && object.location_id == actor_id).filter_map(|object| object_definition_for(ctx, &object).map(|definition| format!("• {} {} x{}", definition.icon, definition.name, object.quantity))).collect::<Vec<_>>();
        rpg_message(ctx, room_id, actor_id, "system", format!("[BANK]\n{}\n\nUse `bank deposit <item>` or `bank withdraw <item>`.", if items.is_empty() { "• Empty".to_string() } else { items.join("\n") })); return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("bank deposit ") {
        if let Some((object, definition)) = find_carried_object(ctx, actor_id, query.trim()).filter(|(object, _)| object.location_kind == "inventory") { ctx.db.world_object().id().update(WorldObject { location_kind: "bank".to_string(), location_id: actor_id.to_string(), equipped_slot: None, updated_at: ctx.timestamp, ..object }); refresh_actor_acquire_quests(ctx, actor_id); rpg_message(ctx, room_id, actor_id, "system", format!("{} is secured in your bank.", definition.name)); } else { rpg_message(ctx, room_id, actor_id, "error", "You are not carrying that item loose in your inventory.".to_string()); } return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("bank withdraw ") {
        let found = ctx.db.world_object().iter().find(|object| object.location_kind == "bank" && object.location_id == actor_id && object_definition_for(ctx, object).map(|definition| definition.id.eq_ignore_ascii_case(query.trim()) || definition.name.eq_ignore_ascii_case(query.trim())).unwrap_or(false));
        if let Some(object) = found { if !inventory_has_space(ctx, actor_id, 1) { rpg_message(ctx, room_id, actor_id, "error", "Your inventory is full.".to_string()); } else { let name = object_definition_for(ctx, &object).map(|definition| definition.name).unwrap_or_else(|| object.definition_id.clone()); ctx.db.world_object().id().update(WorldObject { location_kind: "inventory".to_string(), updated_at: ctx.timestamp, ..object }); refresh_actor_acquire_quests(ctx, actor_id); rpg_message(ctx, room_id, actor_id, "system", format!("You withdraw {name}.")); } } else { rpg_message(ctx, room_id, actor_id, "error", "That item is not in your bank.".to_string()); } return Ok(true);
    }
    if let Some(rest) = lower.strip_prefix("pay ") {
        if let Some((amount_part, target_query)) = rest.split_once(" gold to ") {
            if let Ok(amount) = amount_part.parse::<i64>() { if amount > 0 { if let Some((target_id, target_name, false)) = target_actor_in_room(ctx, room_id, actor_id, target_query) { if change_currency(ctx, actor_id, "gold", -amount).is_ok() { let _ = change_currency(ctx, &target_id, "gold", amount); rpg_message(ctx, room_id, actor_id, "system", format!("You pay {target_name} {amount} gold.")); } else { rpg_message(ctx, room_id, actor_id, "error", "You do not have enough gold.".to_string()); } } else { rpg_message(ctx, room_id, actor_id, "error", "That player is not here.".to_string()); } return Ok(true); } }
        }
    }
    if let Some(rest) = lower.strip_prefix("give ") {
        if let Some((item_query, target_query)) = rest.split_once(" to ") { if let Some((target_id, target_name, false)) = target_actor_in_room(ctx, room_id, actor_id, target_query) { if !inventory_has_space(ctx, &target_id, 1) { rpg_message(ctx, room_id, actor_id, "error", format!("{target_name}'s inventory is full.")); } else if let Some((object, definition)) = find_carried_object(ctx, actor_id, item_query).filter(|(object, _)| object.location_kind == "inventory") { ctx.db.world_object().id().update(WorldObject { location_id: target_id.clone(), updated_at: ctx.timestamp, ..object }); refresh_actor_acquire_quests(ctx, actor_id); refresh_actor_acquire_quests(ctx, &target_id); rpg_message(ctx, room_id, actor_id, "system", format!("You give {} to {target_name}.", definition.name)); } else { rpg_message(ctx, room_id, actor_id, "error", "You are not carrying that item loose in your inventory.".to_string()); } } else { rpg_message(ctx, room_id, actor_id, "error", "That player is not here.".to_string()); } return Ok(true); }
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
    if let Some(query) = lower.strip_prefix("choose ") {
        choose_quest_branch(ctx, room_id, actor_id, query.trim());
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
    if let Some(query) = lower.strip_prefix("examine ").or_else(|| lower.strip_prefix("open ")).or_else(|| lower.strip_prefix("interact ")) {
        let query = query.trim();
        if let Some((_, definition)) = find_object_at(ctx, "room", room_id, query).or_else(|| find_carried_object(ctx, actor_id, query)) { advance_quest_event(ctx, actor_id, "interact_object", &definition.id, 1); }
        describe_object(ctx, room_id, actor_id, query);
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
        let (damage, weapon_name, outcome) = combat_damage(ctx, actor_id, &target_id);
        let current_health = actor_stat_row(ctx, &target_id, &health_definition).current_value;
        if current_health <= health_definition.minimum {
            rpg_message(ctx, room_id, actor_id, "error", format!("{target_name} is already defeated."));
            return Ok(true);
        }
        clear_actor_spawn_protection(ctx, actor_id);
        set_cooldown(ctx, actor_id, "basic-attack", basic_attack_cooldown_ms(ctx, actor_id));
        let next_health = current_health.saturating_sub(damage).max(health_definition.minimum);
        if let Some(npc) = target_npc.as_ref() { record_npc_threat(ctx, &npc.id, actor_id, damage); }
        wear_equipped_weapon(ctx, actor_id, room_id);
        if damage > 0 {
            interrupt_actor_casts(ctx, &target_id, room_id, "by taking damage");
            wear_equipped_armor(ctx, &target_id, room_id);
        }
        set_actor_stat_current(ctx, &target_id, &health_definition, next_health);
        let result = if damage == 0 { format!(" {target_name} {} the attack.", if outcome == "parry" { "parries" } else { "dodges" }) } else if next_health <= health_definition.minimum { format!(" {target_name} is defeated.") } else { format!(" {target_name} has {next_health} {} remaining.", health_definition.name) };
        add_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), Some(actor_name.to_string()), None, "combat",
            format!("{actor_name} attacks {target_name} with {weapon_name} for {damage} damage ({outcome}).{result}"), None, None);
        if next_health <= health_definition.minimum {
            if let Some(npc) = target_npc {
                penalize_npc_attack(ctx, room_id, actor_id, actor_name, &npc, true);
                advance_quest_event(ctx, actor_id, "kill_npc", &npc.id, 1);
                if let Some(faction_id) = npc.faction.as_ref() { advance_quest_event(ctx, actor_id, "kill_faction", faction_id, 1); }
                award_npc_experience(ctx, &npc, actor_id, room_id);
                let drops = defeat_npc(ctx, npc, room_id);
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
