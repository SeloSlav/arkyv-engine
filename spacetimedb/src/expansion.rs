//! Additive engine systems which sit above the compact core world schema.
//!
//! These records intentionally extend existing definitions rather than changing
//! their layouts, allowing an existing 2.0.1 database to accept the upgrade
//! without a destructive publish.

use super::*;
use spacetimedb::ViewContext;

#[spacetimedb::table(accessor = private_message,
    index(accessor = recipient, btree(columns = [recipient_identity])),
    index(accessor = sender, btree(columns = [sender_identity])))]
#[derive(Clone)]
pub struct PrivateMessage {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub recipient_identity: Identity,
    pub sender_identity: Identity,
    pub room_id: Option<String>,
    pub character_id: Option<String>,
    pub character_name: Option<String>,
    pub target_character_id: String,
    pub kind: String,
    pub body: String,
    pub created_at: Timestamp,
}

#[spacetimedb::view(accessor = my_private_messages, public)]
fn my_private_messages(ctx: &ViewContext) -> Vec<PrivateMessage> {
    let mut rows = ctx.db.private_message().recipient().filter(ctx.sender()).collect::<Vec<_>>();
    rows.extend(ctx.db.private_message().sender().filter(ctx.sender()));
    rows.sort_by_key(|row| row.id);
    rows.dedup_by_key(|row| row.id);
    rows
}

#[spacetimedb::table(accessor = provider_request_window)]
#[derive(Clone)]
pub struct ProviderRequestWindow {
    #[primary_key]
    pub id: String,
    pub owner: Identity,
    pub route: String,
    pub window_started_micros: i64,
    pub request_count: u32,
}

#[spacetimedb::table(accessor = ability_unlock_rule, public)]
#[derive(Clone)]
pub struct AbilityUnlockRule {
    #[primary_key]
    pub ability_id: String,
    pub required_option_id: Option<String>,
    pub prerequisite_ability_id: Option<String>,
    pub required_quest_id: Option<String>,
    pub required_faction_id: Option<String>,
    pub required_reputation: i32,
    pub talent_cost: u32,
    pub exclusive_group: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_talent_pool, public)]
#[derive(Clone)]
pub struct ActorTalentPool {
    #[primary_key]
    pub actor_id: String,
    pub available_points: u32,
    pub spent_points: u32,
    pub last_level_awarded: u32,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = party, public)]
#[derive(Clone)]
pub struct Party {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub leader_actor_id: String,
    pub loot_rule: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = party_member, public)]
#[derive(Clone)]
pub struct PartyMember {
    #[primary_key]
    pub id: String,
    pub party_id: String,
    pub actor_id: String,
    pub status: String,
    pub invited_by_actor_id: String,
    pub joined_at: Timestamp,
}

#[spacetimedb::table(accessor = guild, public)]
#[derive(Clone)]
pub struct Guild {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub leader_actor_id: String,
    pub description: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = guild_member, public)]
#[derive(Clone)]
pub struct GuildMember {
    #[primary_key]
    pub id: String,
    pub guild_id: String,
    pub actor_id: String,
    pub rank: String,
    pub status: String,
    pub invited_by_actor_id: String,
    pub joined_at: Timestamp,
}

#[spacetimedb::table(accessor = social_relationship, index(accessor = owner_index, btree(columns = [owner])))]
#[derive(Clone)]
pub struct SocialRelationship {
    #[primary_key]
    pub id: String,
    pub owner: Identity,
    pub source_actor_id: String,
    pub target_actor_id: String,
    pub relationship_kind: String,
    pub created_at: Timestamp,
}

#[spacetimedb::view(accessor = my_social_relationships, public)]
fn my_social_relationships(ctx: &ViewContext) -> Vec<SocialRelationship> {
    ctx.db.social_relationship().owner_index().filter(ctx.sender()).collect()
}

#[spacetimedb::table(accessor = trade_session,
    index(accessor = first_identity_index, btree(columns = [first_identity])),
    index(accessor = second_identity_index, btree(columns = [second_identity])))]
#[derive(Clone)]
pub struct TradeSession {
    #[primary_key]
    pub id: String,
    pub first_actor_id: String,
    pub first_identity: Identity,
    pub second_actor_id: String,
    pub second_identity: Identity,
    pub first_confirmed: bool,
    pub second_confirmed: bool,
    pub status: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::view(accessor = my_trade_sessions, public)]
fn my_trade_sessions(ctx: &ViewContext) -> Vec<TradeSession> {
    let mut rows = ctx.db.trade_session().first_identity_index().filter(ctx.sender()).collect::<Vec<_>>();
    rows.extend(ctx.db.trade_session().second_identity_index().filter(ctx.sender()));
    rows.sort_by(|left, right| left.id.cmp(&right.id));
    rows.dedup_by(|left, right| left.id == right.id);
    rows
}

#[spacetimedb::table(accessor = trade_offer, index(accessor = trade_id_index, btree(columns = [trade_id])))]
#[derive(Clone)]
pub struct TradeOffer {
    #[primary_key]
    pub id: String,
    pub trade_id: String,
    pub actor_id: String,
    pub offer_kind: String,
    pub reference_id: String,
    pub quantity: i64,
    pub created_at: Timestamp,
}

#[spacetimedb::view(accessor = my_trade_offers, public)]
fn my_trade_offers(ctx: &ViewContext) -> Vec<TradeOffer> {
    let mut sessions = ctx.db.trade_session().first_identity_index().filter(ctx.sender()).collect::<Vec<_>>();
    sessions.extend(ctx.db.trade_session().second_identity_index().filter(ctx.sender()));
    let mut rows = Vec::new();
    for session in sessions { rows.extend(ctx.db.trade_offer().trade_id_index().filter(&session.id)); }
    rows.sort_by(|left, right| left.id.cmp(&right.id));
    rows.dedup_by(|left, right| left.id == right.id);
    rows
}

#[spacetimedb::table(accessor = object_rule, public)]
#[derive(Clone)]
pub struct ObjectRule {
    #[primary_key]
    pub definition_id: String,
    pub rarity: String,
    pub item_level: u32,
    pub required_level: u32,
    pub required_option_id: Option<String>,
    pub maximum_durability: i32,
    pub base_value: i64,
    pub repairable: bool,
    pub two_handed: bool,
    pub weapon_type: Option<String>,
    pub damage_school: Option<String>,
    pub bind_rule: String,
    pub tradeable: bool,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = bank_config, public)]
#[derive(Clone)]
pub struct BankConfig {
    #[primary_key]
    pub id: String,
    pub access_mode: String,
    pub required_room_tag: Option<String>,
    pub required_npc_id: Option<String>,
    pub slot_limit: u32,
    pub deposit_fee: i64,
    pub withdrawal_fee: i64,
    pub shared_by_identity: bool,
    pub protects_from_death: bool,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = vendor_restock_rule, public)]
#[derive(Clone)]
pub struct VendorRestockRule {
    #[primary_key]
    pub vendor_stock_id: String,
    pub target_stock: i32,
    pub restock_quantity: u32,
    pub restock_seconds: u32,
    pub last_restock_at_micros: i64,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = profession_definition, public)]
#[derive(Clone)]
pub struct ProfessionDefinition {
    #[primary_key]
    pub id: String,
    pub name: String,
    pub description: String,
    pub maximum_rank: u32,
    pub xp_per_craft: u32,
    pub active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = recipe_rule, public)]
#[derive(Clone)]
pub struct RecipeRule {
    #[primary_key]
    pub recipe_id: String,
    pub profession_id: Option<String>,
    pub required_profession_rank: u32,
    pub must_be_learned: bool,
    pub success_percent: u32,
    pub cooldown_seconds: u32,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_profession, public)]
#[derive(Clone)]
pub struct ActorProfession {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub profession_id: String,
    pub rank: u32,
    pub experience: u32,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_learned_recipe, public)]
#[derive(Clone)]
pub struct ActorLearnedRecipe {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub recipe_id: String,
    pub learned_at: Timestamp,
}

#[spacetimedb::table(accessor = dialogue_node, public)]
#[derive(Clone)]
pub struct DialogueNode {
    #[primary_key]
    pub id: String,
    pub npc_id: String,
    pub text: String,
    pub entry_node: bool,
    pub required_quest_id: Option<String>,
    pub required_faction_id: Option<String>,
    pub required_reputation: i32,
    pub sort_order: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = dialogue_choice, public)]
#[derive(Clone)]
pub struct DialogueChoice {
    #[primary_key]
    pub id: String,
    pub node_id: String,
    pub label: String,
    pub next_node_id: Option<String>,
    pub action_kind: String,
    pub action_reference_id: Option<String>,
    pub action_value: i32,
    pub sort_order: u32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_dialogue_state, public)]
#[derive(Clone)]
pub struct ActorDialogueState {
    #[primary_key]
    pub actor_id: String,
    pub npc_id: String,
    pub node_id: String,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = exit_rule, public)]
#[derive(Clone)]
pub struct ExitRule {
    #[primary_key]
    pub exit_id: String,
    pub is_door: bool,
    pub closed: bool,
    pub locked: bool,
    pub key_definition_id: Option<String>,
    pub hidden: bool,
    pub trap_damage: i32,
    pub required_quest_id: Option<String>,
    pub required_option_id: Option<String>,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = world_trigger, public)]
#[derive(Clone)]
pub struct WorldTrigger {
    #[primary_key]
    pub id: String,
    pub event_kind: String,
    pub source_id: Option<String>,
    pub conditions_json: String,
    pub actions_json: String,
    pub once_per_actor: bool,
    pub active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = actor_trigger_state, public)]
#[derive(Clone)]
pub struct ActorTriggerState {
    #[primary_key]
    pub id: String,
    pub actor_id: String,
    pub trigger_id: String,
    pub fire_count: u32,
    pub last_fired_at: Timestamp,
}

#[spacetimedb::table(accessor = player_sanction, index(accessor = scope_index, btree(columns = [scope])))]
#[derive(Clone)]
pub struct PlayerSanction {
    #[primary_key]
    pub id: String,
    pub scope: String,
    pub actor_id: String,
    pub sanction_kind: String,
    pub reason: String,
    pub expires_at_micros: i64,
    pub issued_by_profile_id: String,
    pub created_at: Timestamp,
}

#[spacetimedb::table(accessor = player_report, index(accessor = scope_index, btree(columns = [scope])))]
#[derive(Clone)]
pub struct PlayerReport {
    #[primary_key]
    pub id: String,
    pub scope: String,
    pub reporter_actor_id: String,
    pub target_actor_id: String,
    pub reason: String,
    pub status: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = admin_audit, index(accessor = scope_index, btree(columns = [scope])))]
#[derive(Clone)]
pub struct AdminAudit {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scope: String,
    pub profile_id: String,
    pub action: String,
    pub target: String,
    pub details: String,
    pub created_at: Timestamp,
}

#[spacetimedb::view(accessor = admin_audit_log, public)]
fn admin_audit_log(ctx: &ViewContext) -> Vec<AdminAudit> {
    if view_has_permission(ctx, "world.manage") { ctx.db.admin_audit().scope_index().filter("world").collect() } else { Vec::new() }
}

#[spacetimedb::view(accessor = admin_player_sanctions, public)]
fn admin_player_sanctions(ctx: &ViewContext) -> Vec<PlayerSanction> {
    if view_has_permission(ctx, "players.moderate") { ctx.db.player_sanction().scope_index().filter("world").collect() } else { Vec::new() }
}

#[spacetimedb::view(accessor = admin_player_reports, public)]
fn admin_player_reports(ctx: &ViewContext) -> Vec<PlayerReport> {
    if view_has_permission(ctx, "players.moderate") { ctx.db.player_report().scope_index().filter("world").collect() } else { Vec::new() }
}

#[spacetimedb::table(accessor = content_issue, public)]
#[derive(Clone)]
pub struct ContentIssue {
    #[primary_key]
    pub id: String,
    pub severity: String,
    pub category: String,
    pub record_id: String,
    pub message: String,
    pub detected_at: Timestamp,
}

#[spacetimedb::table(accessor = world_snapshot, index(accessor = scope_index, btree(columns = [scope])))]
#[derive(Clone)]
pub struct WorldSnapshot {
    #[primary_key]
    pub id: String,
    pub scope: String,
    pub name: String,
    pub schema_version: u32,
    pub content_json: String,
    pub created_by_profile_id: String,
    pub created_at: Timestamp,
}

#[spacetimedb::view(accessor = admin_world_snapshots, public)]
fn admin_world_snapshots(ctx: &ViewContext) -> Vec<WorldSnapshot> {
    if view_has_permission(ctx, "world.manage") { ctx.db.world_snapshot().scope_index().filter("world").collect() } else { Vec::new() }
}

#[spacetimedb::table(accessor = world_simulation_config, public)]
#[derive(Clone)]
pub struct WorldSimulationConfig {
    #[primary_key]
    pub id: String,
    pub mode: String,
    pub tick_seconds: u32,
    pub day_length_minutes: u32,
    pub weather_enabled: bool,
    pub active: bool,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(accessor = scheduled_world_tick, scheduled(resolve_world_tick))]
#[derive(Clone)]
pub struct ScheduledWorldTick {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

#[spacetimedb::reducer]
pub fn resolve_world_tick(ctx: &ReducerContext, _tick: ScheduledWorldTick) -> Result<(), String> {
    if ctx.sender() != ctx.identity() { return Err("World ticks may only be resolved by the module scheduler.".to_string()); }
    run_world_tick(ctx);
    Ok(())
}

fn actor_identity(ctx: &ReducerContext, actor_id: &str) -> Option<Identity> {
    ctx.db.character().id().find(&actor_id.to_string()).map(|row| row.owner)
        .or_else(|| ctx.db.profile().id().find(&actor_id.to_string()).map(|row| row.owner))
}

pub(super) fn insert_private_message(
    ctx: &ReducerContext,
    room_id: Option<String>,
    character_id: Option<String>,
    character_name: Option<String>,
    target_character_id: String,
    kind: &str,
    body: String,
) -> bool {
    let Some(recipient_identity) = actor_identity(ctx, &target_character_id) else { return false };
    let sender_identity = character_id.as_deref().and_then(|id| actor_identity(ctx, id)).unwrap_or(recipient_identity);
    ctx.db.private_message().insert(PrivateMessage {
        id: 0, recipient_identity, sender_identity, room_id, character_id, character_name,
        target_character_id, kind: kind.to_string(), body, created_at: ctx.timestamp,
    });
    true
}

pub(super) fn migrate_legacy_private_messages(ctx: &ReducerContext) {
    let rows = ctx.db.room_message().iter().filter(|row| row.target_character_id.is_some()).collect::<Vec<_>>();
    for row in rows {
        if let Some(target_id) = row.target_character_id.clone() {
            if insert_private_message(ctx, row.room_id.clone(), row.character_id.clone(), row.character_name.clone(), target_id, &row.kind, row.body.clone()) {
                ctx.db.room_message().id().delete(row.id);
            }
        }
    }
}

fn audit(ctx: &ReducerContext, action: &str, target: &str, details: &str) {
    let profile_id = profile_for(ctx, ctx.sender()).map(|row| row.id).unwrap_or_default();
    ctx.db.admin_audit().insert(AdminAudit {
        id: 0, scope: "world".to_string(), profile_id, action: action.to_string(), target: target.to_string(),
        details: details.to_string(), created_at: ctx.timestamp,
    });
}

#[spacetimedb::reducer]
pub fn authorize_provider_request(ctx: &ReducerContext, route: String) -> Result<(), String> {
    ensure_profile(ctx);
    let profile = require_profile(ctx)?;
    if active_sanction(ctx, &profile.id, "ban").is_some() { return Err("This saved world is banned.".to_string()); }
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let route = normalized_key(&route);
    if route != "npc-response" {
        require_permission(ctx, if route == "generate-item-image" { "systems.manage" } else { "world.manage" })?;
    }
    let id = format!("{}::{route}", identity_id(ctx.sender()));
    let limit = if route.contains("image") || route.contains("portrait") { 10 } else { 30 };
    let existing = ctx.db.provider_request_window().id().find(&id);
    let mut row = existing.clone().unwrap_or(ProviderRequestWindow {
        id: id.clone(), owner: ctx.sender(), route, window_started_micros: now, request_count: 0,
    });
    if now.saturating_sub(row.window_started_micros) >= 60_000_000 {
        row.window_started_micros = now;
        row.request_count = 0;
    }
    if row.request_count >= limit { return Err("Provider request rate limit exceeded. Try again in a minute.".to_string()); }
    row.request_count = row.request_count.saturating_add(1);
    if existing.is_some() { ctx.db.provider_request_window().id().update(row); } else { ctx.db.provider_request_window().insert(row); }
    Ok(())
}

fn active_sanction(ctx: &ReducerContext, actor_id: &str, kind: &str) -> Option<PlayerSanction> {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let profile_id = actor_identity(ctx, actor_id)
        .and_then(|owner| ctx.db.profile().owner().filter(owner).next())
        .map(|profile| profile.id);
    ctx.db.player_sanction().iter().find(|row| (row.actor_id == actor_id || profile_id.as_deref() == Some(&row.actor_id)) && row.sanction_kind == kind && (row.expires_at_micros == 0 || row.expires_at_micros > now))
}

pub(super) fn command_sanction_error(ctx: &ReducerContext, actor_id: &str, lower: &str) -> Option<String> {
    if let Some(row) = active_sanction(ctx, actor_id, "ban") { return Some(format!("You are banned: {}", row.reason)); }
    if (lower.starts_with("say ") || lower.starts_with("whisper ") || lower.starts_with("party say ") || lower.starts_with("guild say ")) && active_sanction(ctx, actor_id, "mute").is_some() {
        return Some("You are currently muted.".to_string());
    }
    None
}

fn party_for_actor(ctx: &ReducerContext, actor_id: &str) -> Option<(Party, PartyMember)> {
    let member = ctx.db.party_member().iter().find(|row| row.actor_id == actor_id && row.status == "member")?;
    ctx.db.party().id().find(&member.party_id).map(|party| (party, member))
}

fn guild_for_actor(ctx: &ReducerContext, actor_id: &str) -> Option<(Guild, GuildMember)> {
    let member = ctx.db.guild_member().iter().find(|row| row.actor_id == actor_id && row.status == "member")?;
    ctx.db.guild().id().find(&member.guild_id).map(|guild| (guild, member))
}

fn send_group_message(ctx: &ReducerContext, actor_id: &str, actor_name: &str, group_kind: &str, group_id: &str, body: &str) {
    let recipients = if group_kind == "party" {
        ctx.db.party_member().iter().filter(|row| row.party_id == group_id && row.status == "member").map(|row| row.actor_id).collect::<Vec<_>>()
    } else {
        ctx.db.guild_member().iter().filter(|row| row.guild_id == group_id && row.status == "member").map(|row| row.actor_id).collect::<Vec<_>>()
    };
    for recipient in recipients {
        insert_private_message(ctx, actor_current_room(ctx, actor_id), Some(actor_id.to_string()), Some(actor_name.to_string()), recipient, &format!("{group_kind}_chat"), format!("[{group_kind}] {actor_name}: {body}"));
    }
}

fn relationship_id(source: &str, target: &str, kind: &str) -> String { format!("{source}::{target}::{kind}") }

fn is_blocked(ctx: &ReducerContext, source: &str, target: &str) -> bool {
    ctx.db.social_relationship().id().find(&relationship_id(source, target, "block")).is_some()
        || ctx.db.social_relationship().id().find(&relationship_id(target, source, "block")).is_some()
}

fn trade_for_actor(ctx: &ReducerContext, actor_id: &str) -> Option<TradeSession> {
    ctx.db.trade_session().iter().find(|row| row.status == "open" && (row.first_actor_id == actor_id || row.second_actor_id == actor_id))
}

fn cancel_trade(ctx: &ReducerContext, trade: TradeSession) {
    let offer_ids = ctx.db.trade_offer().iter().filter(|row| row.trade_id == trade.id).map(|row| row.id).collect::<Vec<_>>();
    for id in offer_ids { ctx.db.trade_offer().id().delete(&id); }
    ctx.db.trade_session().id().update(TradeSession { status: "cancelled".to_string(), updated_at: ctx.timestamp, ..trade });
}

fn reset_trade_confirmation(ctx: &ReducerContext, trade: TradeSession) {
    ctx.db.trade_session().id().update(TradeSession { first_confirmed: false, second_confirmed: false, updated_at: ctx.timestamp, ..trade });
}

fn complete_trade(ctx: &ReducerContext, trade: TradeSession) -> Result<(), String> {
    if actor_current_room(ctx, &trade.first_actor_id) != actor_current_room(ctx, &trade.second_actor_id) { return Err("Both traders must remain in the same room.".to_string()); }
    let offers = ctx.db.trade_offer().iter().filter(|row| row.trade_id == trade.id).collect::<Vec<_>>();
    for offer in &offers {
        if offer.offer_kind == "item" {
            let object = ctx.db.world_object().id().find(&offer.reference_id).ok_or_else(|| "An offered item no longer exists.".to_string())?;
            if object.location_kind != "inventory" || object.location_id != offer.actor_id { return Err("An offered item is no longer available.".to_string()); }
            if !object_transfer_allowed(ctx, &object) { return Err("An offered item cannot be traded.".to_string()); }
        } else {
            let currency = offer.reference_id.as_str();
            if currency != "gold" && !ctx.db.currency_definition().id().find(&currency.to_string()).map(|row| row.tradeable).unwrap_or(false) { return Err("An offered currency cannot be traded.".to_string()); }
            if currency_balance(ctx, &offer.actor_id, currency) < offer.quantity { return Err("An offered currency balance changed.".to_string()); }
        }
    }
    for offer in offers {
        let recipient = if offer.actor_id == trade.first_actor_id { &trade.second_actor_id } else { &trade.first_actor_id };
        if offer.offer_kind == "item" {
            let object = ctx.db.world_object().id().find(&offer.reference_id).ok_or_else(|| "Offered item disappeared.".to_string())?;
            if !inventory_has_space(ctx, recipient, 1) { return Err("The recipient does not have an inventory slot for the trade.".to_string()); }
            ctx.db.world_object().id().update(WorldObject { location_id: recipient.clone(), updated_at: ctx.timestamp, ..object });
        } else {
            change_currency(ctx, &offer.actor_id, &offer.reference_id, -offer.quantity)?;
            change_currency(ctx, recipient, &offer.reference_id, offer.quantity)?;
        }
        ctx.db.trade_offer().id().delete(&offer.id);
    }
    ctx.db.trade_session().id().update(TradeSession { status: "completed".to_string(), updated_at: ctx.timestamp, ..trade });
    Ok(())
}

fn ensure_talent_pool(ctx: &ReducerContext, actor_id: &str) -> ActorTalentPool {
    if let Some(row) = ctx.db.actor_talent_pool().actor_id().find(&actor_id.to_string()) { return row; }
    let level = ensure_actor_progression(ctx, actor_id).level;
    let row = ActorTalentPool { actor_id: actor_id.to_string(), available_points: level.saturating_sub(1), spent_points: 0, last_level_awarded: level, updated_at: ctx.timestamp };
    ctx.db.actor_talent_pool().insert(row.clone()); row
}

pub(super) fn award_talent_points_for_level(ctx: &ReducerContext, actor_id: &str, level: u32) {
    let mut pool = ensure_talent_pool(ctx, actor_id);
    if level > pool.last_level_awarded {
        pool.available_points = pool.available_points.saturating_add(level - pool.last_level_awarded);
        pool.last_level_awarded = level;
        pool.updated_at = ctx.timestamp;
        ctx.db.actor_talent_pool().actor_id().update(pool);
    }
}

pub(super) fn ability_rule_allows(ctx: &ReducerContext, actor_id: &str, ability_id: &str) -> bool {
    let Some(rule) = ctx.db.ability_unlock_rule().ability_id().find(&ability_id.to_string()) else { return true };
    if rule.talent_cost > 0 { return false; }
    rule.required_option_id.as_ref().map(|id| ctx.db.actor_character_option().iter().any(|row| row.actor_id == actor_id && row.option_id == *id)).unwrap_or(true)
        && rule.prerequisite_ability_id.as_ref().map(|id| ctx.db.actor_ability().id().find(&format!("{actor_id}::{id}")).is_some()).unwrap_or(true)
        && rule.required_quest_id.as_ref().map(|id| ctx.db.actor_quest().id().find(&format!("{actor_id}::{id}")).map(|row| row.status == "completed").unwrap_or(false)).unwrap_or(true)
        && rule.required_faction_id.as_ref().map(|id| actor_reputation(ctx, actor_id, id) >= rule.required_reputation).unwrap_or(true)
}

pub(super) fn quest_branch_requirement_error(ctx: &ReducerContext, actor_id: &str, quest_id: &str) -> Option<String> {
    let branches = ctx.db.quest_choice().iter().filter(|choice| choice.next_quest_id.as_deref() == Some(quest_id)).collect::<Vec<_>>();
    if branches.is_empty() { return None; }
    if branches.iter().any(|choice| ctx.db.actor_quest_choice().iter().any(|selected| selected.actor_id == actor_id && selected.choice_id == choice.id)) { None }
    else { Some("locked by an unchosen quest branch".to_string()) }
}

fn learn_talent(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) {
    let Some(ability) = find_ability(ctx, query) else { rpg_message(ctx, room_id, actor_id, "error", "No ability matches that name.".to_string()); return };
    let Some(rule) = ctx.db.ability_unlock_rule().ability_id().find(&ability.id) else { rpg_message(ctx, room_id, actor_id, "error", "That ability is not an authored talent.".to_string()); return };
    if rule.talent_cost == 0 { rpg_message(ctx, room_id, actor_id, "error", "That ability is learned automatically when its requirements are met.".to_string()); return; }
    if ctx.db.actor_ability().id().find(&format!("{actor_id}::{}", ability.id)).is_some() { rpg_message(ctx, room_id, actor_id, "error", "You already know that ability.".to_string()); return; }
    let level = ensure_actor_progression(ctx, actor_id).level;
    if level < ability.required_level { rpg_message(ctx, room_id, actor_id, "error", format!("{} requires level {}.", ability.name, ability.required_level)); return; }
    let requirements_met = rule.required_option_id.as_ref().map(|id| ctx.db.actor_character_option().iter().any(|row| row.actor_id == actor_id && row.option_id == *id)).unwrap_or(true)
        && rule.prerequisite_ability_id.as_ref().map(|id| ctx.db.actor_ability().id().find(&format!("{actor_id}::{id}")).is_some()).unwrap_or(true)
        && rule.required_quest_id.as_ref().map(|id| ctx.db.actor_quest().id().find(&format!("{actor_id}::{id}")).map(|row| row.status == "completed").unwrap_or(false)).unwrap_or(true)
        && rule.required_faction_id.as_ref().map(|id| actor_reputation(ctx, actor_id, id) >= rule.required_reputation).unwrap_or(true);
    if !requirements_met { rpg_message(ctx, room_id, actor_id, "error", "You do not meet that talent's class, quest, prerequisite, or reputation requirements.".to_string()); return; }
    if let Some(group) = rule.exclusive_group.as_ref() {
        if ctx.db.actor_ability().iter().filter(|row| row.actor_id == actor_id).any(|row| ctx.db.ability_unlock_rule().ability_id().find(&row.ability_id).and_then(|candidate| candidate.exclusive_group).as_ref() == Some(group)) {
            rpg_message(ctx, room_id, actor_id, "error", format!("You already selected a talent in the exclusive {group} group.")); return;
        }
    }
    let mut pool = ensure_talent_pool(ctx, actor_id);
    if pool.available_points < rule.talent_cost { rpg_message(ctx, room_id, actor_id, "error", format!("{} costs {} talent point(s); you have {}.", ability.name, rule.talent_cost, pool.available_points)); return; }
    pool.available_points -= rule.talent_cost; pool.spent_points = pool.spent_points.saturating_add(rule.talent_cost); pool.updated_at = ctx.timestamp;
    ctx.db.actor_talent_pool().actor_id().update(pool);
    ctx.db.actor_ability().insert(ActorAbility { id: format!("{actor_id}::{}", ability.id), actor_id: actor_id.to_string(), ability_id: ability.id, granted_at: ctx.timestamp });
    rpg_message(ctx, room_id, actor_id, "system", format!("You learn {}.", ability.name));
}

fn respec_talents(ctx: &ReducerContext, room_id: &str, actor_id: &str) {
    let talent_ids = ctx.db.actor_ability().iter().filter(|row| row.actor_id == actor_id)
        .filter(|row| ctx.db.ability_unlock_rule().ability_id().find(&row.ability_id).map(|rule| rule.talent_cost > 0).unwrap_or(false))
        .map(|row| row.id).collect::<Vec<_>>();
    for id in talent_ids { ctx.db.actor_ability().id().delete(&id); }
    let mut pool = ensure_talent_pool(ctx, actor_id); pool.available_points = pool.available_points.saturating_add(pool.spent_points); pool.spent_points = 0; pool.updated_at = ctx.timestamp;
    ctx.db.actor_talent_pool().actor_id().update(pool.clone());
    rpg_message(ctx, room_id, actor_id, "system", format!("Your talents have been reset. {} point(s) are available.", pool.available_points));
}

fn run_world_tick(ctx: &ReducerContext) {
    restock_vendors(ctx);
    let config = ctx.db.world_simulation_config().id().find(&"world".to_string());
    let Some(config) = config.filter(|row| row.active && row.mode == "scheduled") else { return };
    let actors = ctx.db.character().iter().filter_map(|row| row.current_room.map(|_| (row.id, row.name))).collect::<Vec<_>>();
    for (actor_id, actor_name) in actors { advance_world(ctx, &actor_id, &actor_name); }
    let at = ctx.timestamp + TimeDuration::from_micros(i64::from(config.tick_seconds.max(1)).saturating_mul(1_000_000));
    ctx.db.scheduled_world_tick().insert(ScheduledWorldTick { scheduled_id: 0, scheduled_at: at.into() });
}

pub(super) fn restock_vendors(ctx: &ReducerContext) {
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let rules = ctx.db.vendor_restock_rule().iter().collect::<Vec<_>>();
    for mut rule in rules {
        if rule.restock_seconds == 0 || now.saturating_sub(rule.last_restock_at_micros) < i64::from(rule.restock_seconds).saturating_mul(1_000_000) { continue; }
        if let Some(mut stock) = ctx.db.vendor_stock().id().find(&rule.vendor_stock_id) {
            if stock.stock >= 0 {
                stock.stock = stock.stock.saturating_add(i32::try_from(rule.restock_quantity).unwrap_or(i32::MAX)).min(rule.target_stock.max(0));
                stock.updated_at = ctx.timestamp;
                ctx.db.vendor_stock().id().update(stock);
            }
        }
        rule.last_restock_at_micros = now; rule.updated_at = ctx.timestamp;
        ctx.db.vendor_restock_rule().vendor_stock_id().update(rule);
    }
}

pub(super) fn bank_config_for_death(ctx: &ReducerContext) -> BankConfig {
    ctx.db.bank_config().id().find(&"world".to_string()).unwrap_or(BankConfig {
        id: "world".to_string(), access_mode: "anywhere".to_string(), required_room_tag: None,
        required_npc_id: None, slot_limit: 0, deposit_fee: 0, withdrawal_fee: 0,
        shared_by_identity: false, protects_from_death: true, updated_at: ctx.timestamp,
    })
}

fn bank_accessible(ctx: &ReducerContext, room_id: &str, config: &BankConfig) -> bool {
    if config.access_mode == "anywhere" { return true; }
    if let Some(npc_id) = config.required_npc_id.as_ref() {
        if ctx.db.npc().id().find(npc_id).map(|row| row.current_room.as_deref() == Some(room_id)).unwrap_or(false) { return true; }
    }
    if let Some(tag) = config.required_room_tag.as_ref() {
        if ctx.db.world_object().iter().filter(|row| row.location_kind == "room" && row.location_id == room_id)
            .filter_map(|row| ctx.db.object_definition().id().find(&row.definition_id))
            .any(|definition| serde_json::from_str::<Vec<String>>(&definition.tags).unwrap_or_default().iter().any(|value| value.eq_ignore_ascii_case(tag))) { return true; }
    }
    false
}

pub(super) fn bank_owner_for_actor(ctx: &ReducerContext, actor_id: &str, config: &BankConfig) -> String {
    if config.shared_by_identity { actor_identity(ctx, actor_id).map(identity_id).unwrap_or_else(|| actor_id.to_string()) } else { actor_id.to_string() }
}

fn handle_bank_command(ctx: &ReducerContext, lower: &str, room_id: &str, actor_id: &str) -> bool {
    if lower != "bank" && lower != "bank inventory" && !lower.starts_with("bank deposit ") && !lower.starts_with("bank withdraw ") { return false; }
    let config = bank_config_for_death(ctx);
    if !bank_accessible(ctx, room_id, &config) { rpg_message(ctx, room_id, actor_id, "error", "A configured bank fixture or banker must be present.".to_string()); return true; }
    let owner = bank_owner_for_actor(ctx, actor_id, &config);
    if let Some(query) = lower.strip_prefix("bank deposit ") {
        let used = ctx.db.world_object().iter().filter(|row| row.location_kind == "bank" && row.location_id == owner).count() as u32;
        if config.slot_limit > 0 && used >= config.slot_limit { rpg_message(ctx, room_id, actor_id, "error", "Your bank has no free slots.".to_string()); return true; }
        let Some((object, definition)) = find_carried_object(ctx, actor_id, query.trim()).filter(|(row, _)| row.location_kind == "inventory") else { rpg_message(ctx, room_id, actor_id, "error", "You are not carrying that item loose in your inventory.".to_string()); return true };
        if config.deposit_fee > 0 && change_currency(ctx, actor_id, "gold", -config.deposit_fee).is_err() { rpg_message(ctx, room_id, actor_id, "error", format!("The bank charges {} gold for a deposit.", config.deposit_fee)); return true; }
        ctx.db.world_object().id().update(WorldObject { location_kind: "bank".to_string(), location_id: owner, equipped_slot: None, updated_at: ctx.timestamp, ..object });
        rpg_message(ctx, room_id, actor_id, "system", format!("{} is secured in your bank.", definition.name)); return true;
    }
    if let Some(query) = lower.strip_prefix("bank withdraw ") {
        let found = ctx.db.world_object().iter().find(|row| row.location_kind == "bank" && row.location_id == owner && object_definition_for(ctx, row).map(|definition| definition.id.eq_ignore_ascii_case(query.trim()) || definition.name.eq_ignore_ascii_case(query.trim())).unwrap_or(false));
        let Some(object) = found else { rpg_message(ctx, room_id, actor_id, "error", "That item is not in your bank.".to_string()); return true };
        if !inventory_has_space(ctx, actor_id, 1) { rpg_message(ctx, room_id, actor_id, "error", "Your inventory is full.".to_string()); return true; }
        if config.withdrawal_fee > 0 && change_currency(ctx, actor_id, "gold", -config.withdrawal_fee).is_err() { rpg_message(ctx, room_id, actor_id, "error", format!("The bank charges {} gold for a withdrawal.", config.withdrawal_fee)); return true; }
        let name = object_definition_for(ctx, &object).map(|row| row.name).unwrap_or_else(|| object.definition_id.clone());
        ctx.db.world_object().id().update(WorldObject { location_kind: "inventory".to_string(), location_id: actor_id.to_string(), updated_at: ctx.timestamp, ..object });
        rpg_message(ctx, room_id, actor_id, "system", format!("You withdraw {name}.")); return true;
    }
    let lines = ctx.db.world_object().iter().filter(|row| row.location_kind == "bank" && row.location_id == owner)
        .filter_map(|row| object_definition_for(ctx, &row).map(|definition| format!("- {} {} x{}", definition.icon, definition.name, row.quantity))).collect::<Vec<_>>();
    rpg_message(ctx, room_id, actor_id, "system", format!("[BANK · {}/{} SLOTS]\n{}\n\nUse `bank deposit <item>` or `bank withdraw <item>`.", lines.len(), if config.slot_limit == 0 { "unlimited".to_string() } else { config.slot_limit.to_string() }, if lines.is_empty() { "- Empty".to_string() } else { lines.join("\n") }));
    true
}

fn show_social(ctx: &ReducerContext, room_id: &str, actor_id: &str) {
    let lines = ctx.db.social_relationship().iter().filter(|row| row.source_actor_id == actor_id)
        .map(|row| format!("- {}: {}", row.relationship_kind, actor_name(ctx, &row.target_actor_id))).collect::<Vec<_>>();
    rpg_message(ctx, room_id, actor_id, "system", format!("[SOCIAL]\n{}", if lines.is_empty() { "- No friends or blocked players".to_string() } else { lines.join("\n") }));
}

fn actor_name(ctx: &ReducerContext, actor_id: &str) -> String {
    ctx.db.character().id().find(&actor_id.to_string()).map(|row| row.name)
        .or_else(|| ctx.db.profile().id().find(&actor_id.to_string()).and_then(|row| row.name.or(row.handle)))
        .unwrap_or_else(|| actor_id.to_string())
}

fn show_trade(ctx: &ReducerContext, room_id: &str, actor_id: &str, trade: &TradeSession) {
    let offers = ctx.db.trade_offer().iter().filter(|row| row.trade_id == trade.id).map(|row| {
        let label = if row.offer_kind == "item" { ctx.db.world_object().id().find(&row.reference_id).and_then(|object| object_definition_for(ctx, &object)).map(|definition| definition.name).unwrap_or_else(|| "missing item".to_string()) } else { format!("{} {}", row.quantity, row.reference_id) };
        format!("- {} offers {label}", actor_name(ctx, &row.actor_id))
    }).collect::<Vec<_>>();
    rpg_message(ctx, room_id, actor_id, "system", format!("[TRADE WITH {}]\n{}\n{}: {} · {}: {}\nUse `trade add <item>`, `trade add <amount> <currency>`, `trade confirm`, or `trade cancel`.", actor_name(ctx, if trade.first_actor_id == actor_id { &trade.second_actor_id } else { &trade.first_actor_id }), if offers.is_empty() { "- Nothing offered".to_string() } else { offers.join("\n") }, actor_name(ctx, &trade.first_actor_id), if trade.first_confirmed { "confirmed" } else { "reviewing" }, actor_name(ctx, &trade.second_actor_id), if trade.second_confirmed { "confirmed" } else { "reviewing" }));
}

fn dialogue_node_available(ctx: &ReducerContext, actor_id: &str, node: &DialogueNode) -> bool {
    node.required_quest_id.as_ref().map(|id| ctx.db.actor_quest().id().find(&format!("{actor_id}::{id}")).map(|row| row.status == "completed").unwrap_or(false)).unwrap_or(true)
        && node.required_faction_id.as_ref().map(|id| actor_reputation(ctx, actor_id, id) >= node.required_reputation).unwrap_or(true)
}

fn show_dialogue_node(ctx: &ReducerContext, room_id: &str, actor_id: &str, npc: &Npc, node: DialogueNode) {
    let mut choices = ctx.db.dialogue_choice().iter().filter(|row| row.node_id == node.id).collect::<Vec<_>>(); choices.sort_by_key(|row| row.sort_order);
    let lines = choices.iter().map(|row| format!("- {} (`respond {}`)", row.label, row.id)).collect::<Vec<_>>();
    let state = ActorDialogueState { actor_id: actor_id.to_string(), npc_id: npc.id.clone(), node_id: node.id, updated_at: ctx.timestamp };
    if ctx.db.actor_dialogue_state().actor_id().find(&actor_id.to_string()).is_some() { ctx.db.actor_dialogue_state().actor_id().update(state); } else { ctx.db.actor_dialogue_state().insert(state); }
    rpg_message(ctx, room_id, actor_id, "npc_speech", format!("{}: \"{}\"{}", npc.name, node.text, if lines.is_empty() { String::new() } else { format!("\n{}", lines.join("\n")) }));
}

fn handle_dialogue(ctx: &ReducerContext, lower: &str, room_id: &str, actor_id: &str) -> bool {
    if let Some(rest) = lower.strip_prefix("talk ") {
        let alias = rest.split_whitespace().next().unwrap_or_default();
        let Some(npc) = ctx.db.npc().iter().find(|npc| npc.current_room.as_deref() == Some(room_id) && npc_matches(npc, alias)) else { return false };
        let mut nodes = ctx.db.dialogue_node().iter().filter(|node| node.npc_id == npc.id && node.entry_node && dialogue_node_available(ctx, actor_id, node)).collect::<Vec<_>>(); nodes.sort_by_key(|row| row.sort_order);
        if let Some(node) = nodes.into_iter().next() { advance_quest_event(ctx, actor_id, "talk_npc", &npc.id, 1); show_dialogue_node(ctx, room_id, actor_id, &npc, node); return true; }
        return false;
    }
    let Some(query) = lower.strip_prefix("respond ") else { return false };
    let Some(state) = ctx.db.actor_dialogue_state().actor_id().find(&actor_id.to_string()) else { rpg_message(ctx, room_id, actor_id, "error", "You are not in an authored conversation.".to_string()); return true };
    let Some(choice) = ctx.db.dialogue_choice().iter().find(|row| row.node_id == state.node_id && (row.id.eq_ignore_ascii_case(query.trim()) || row.label.eq_ignore_ascii_case(query.trim()))) else { rpg_message(ctx, room_id, actor_id, "error", "That response is not available.".to_string()); return true };
    match choice.action_kind.as_str() {
        "start_quest" => if let Some(id) = choice.action_reference_id.as_ref() { accept_quest(ctx, room_id, actor_id, id); },
        "gold" => { let _ = change_currency(ctx, actor_id, "gold", i64::from(choice.action_value)); },
        "reputation" => if let Some(id) = choice.action_reference_id.as_ref() { change_reputation(ctx, actor_id, id, choice.action_value); },
        "give_item" => if let Some(id) = choice.action_reference_id.as_ref() { let _ = grant_inventory_item(ctx, actor_id, id, u32::try_from(choice.action_value.max(1)).unwrap_or(1), "dialogue"); },
        "learn_recipe" => if let Some(id) = choice.action_reference_id.as_ref() {
            if ctx.db.crafting_recipe().id().find(id).is_some() {
                let learned_id = format!("{actor_id}::{id}");
                if ctx.db.actor_learned_recipe().id().find(&learned_id).is_none() {
                    ctx.db.actor_learned_recipe().insert(ActorLearnedRecipe { id: learned_id, actor_id: actor_id.to_string(), recipe_id: id.clone(), learned_at: ctx.timestamp });
                }
            }
        },
        "learn_profession" => if let Some(id) = choice.action_reference_id.as_ref() {
            if ctx.db.profession_definition().id().find(id).is_some() {
                let profession_id = format!("{actor_id}::{id}");
                let rank = u32::try_from(choice.action_value.max(0)).unwrap_or(0);
                let row = ActorProfession { id: profession_id.clone(), actor_id: actor_id.to_string(), profession_id: id.clone(), rank, experience: 0, updated_at: ctx.timestamp };
                if ctx.db.actor_profession().id().find(&profession_id).is_some() { ctx.db.actor_profession().id().update(row); }
                else { ctx.db.actor_profession().insert(row); }
            }
        },
        _ => {}
    }
    let Some(npc) = ctx.db.npc().id().find(&state.npc_id) else { return true };
    if let Some(next) = choice.next_node_id.and_then(|id| ctx.db.dialogue_node().id().find(&id)).filter(|row| dialogue_node_available(ctx, actor_id, row)) { show_dialogue_node(ctx, room_id, actor_id, &npc, next); }
    else { ctx.db.actor_dialogue_state().actor_id().delete(&actor_id.to_string()); rpg_message(ctx, room_id, actor_id, "system", "The conversation ends.".to_string()); }
    true
}

pub(super) fn npc_uses_authored_dialogue(ctx: &ReducerContext, npc_id: &str) -> bool {
    ctx.db.dialogue_node().iter().any(|row| row.npc_id == npc_id && row.entry_node)
}

pub(super) fn whisper_allowed(ctx: &ReducerContext, source_actor_id: &str, target_actor_id: &str) -> bool {
    !is_blocked(ctx, source_actor_id, target_actor_id)
}

fn actor_has_item(ctx: &ReducerContext, actor_id: &str, definition_id: &str) -> bool {
    actor_item_quantity(ctx, actor_id, definition_id) > 0
}

pub(super) fn exit_access_error(ctx: &ReducerContext, actor_id: &str, exit: &Exit) -> Option<String> {
    let rule = ctx.db.exit_rule().exit_id().find(&exit.id)?;
    if rule.hidden { return Some("You cannot find a usable way through there.".to_string()); }
    if rule.locked { return Some("That way is locked.".to_string()); }
    if rule.closed { return Some("That way is closed. Use `open <direction>`.".to_string()); }
    if rule.required_quest_id.as_ref().map(|id| ctx.db.actor_quest().id().find(&format!("{actor_id}::{id}")).map(|row| row.status == "completed").unwrap_or(false)).unwrap_or(true) == false { return Some("A quest requirement prevents you from using that exit.".to_string()); }
    if rule.required_option_id.as_ref().map(|id| ctx.db.actor_character_option().iter().any(|row| row.actor_id == actor_id && row.option_id == *id)).unwrap_or(true) == false { return Some("Your character origin cannot use that exit.".to_string()); }
    None
}

pub(super) fn apply_exit_trap(ctx: &ReducerContext, actor_id: &str, room_id: &str, exit_id: &str) {
    let damage = ctx.db.exit_rule().exit_id().find(&exit_id.to_string()).map(|row| row.trap_damage).unwrap_or(0).max(0);
    if damage == 0 { return; }
    if let Some(health) = stat_definition_by_role(ctx, "health") {
        let current = actor_stat_row(ctx, actor_id, &health).current_value;
        set_actor_stat_current(ctx, actor_id, &health, current.saturating_sub(damage));
        rpg_message(ctx, room_id, actor_id, "combat", format!("A trap strikes you for {damage} damage."));
    }
}

fn handle_door_command(ctx: &ReducerContext, lower: &str, room_id: &str, actor_id: &str) -> bool {
    let operations = [("open ", "open"), ("close ", "close"), ("unlock ", "unlock"), ("lock ", "lock")];
    let Some((query, operation)) = operations.iter().find_map(|(prefix, op)| lower.strip_prefix(prefix).map(|query| (query.trim(), *op))) else { return false };
    let Some(exit) = ctx.db.exit().iter().find(|row| row.from_room.as_deref() == Some(room_id) && (row.id.eq_ignore_ascii_case(query) || row.verb.eq_ignore_ascii_case(query))) else { rpg_message(ctx, room_id, actor_id, "error", "No exit in this room matches that direction.".to_string()); return true };
    let Some(mut rule) = ctx.db.exit_rule().exit_id().find(&exit.id) else { rpg_message(ctx, room_id, actor_id, "error", "That exit is not a door.".to_string()); return true };
    match operation {
        "open" if rule.locked => { rpg_message(ctx, room_id, actor_id, "error", "The door is locked.".to_string()); return true; }
        "open" => rule.closed = false,
        "close" => rule.closed = true,
        "unlock" => { if let Some(key) = rule.key_definition_id.as_ref() { if !actor_has_item(ctx, actor_id, key) { rpg_message(ctx, room_id, actor_id, "error", "You do not have the required key.".to_string()); return true; } } rule.locked = false; },
        "lock" => { if let Some(key) = rule.key_definition_id.as_ref() { if !actor_has_item(ctx, actor_id, key) { rpg_message(ctx, room_id, actor_id, "error", "You do not have the required key.".to_string()); return true; } } rule.locked = true; rule.closed = true; },
        _ => {}
    }
    rule.updated_at = ctx.timestamp; ctx.db.exit_rule().exit_id().update(rule);
    rpg_message(ctx, room_id, actor_id, "system", format!("You {operation} the way {}.", exit.verb)); true
}

fn trigger_conditions_match(ctx: &ReducerContext, actor_id: &str, conditions: &Value) -> bool {
    let level = ensure_actor_progression(ctx, actor_id).level;
    conditions.get("minimum_level").and_then(Value::as_u64).map(|value| u64::from(level) >= value).unwrap_or(true)
        && conditions.get("required_quest_id").and_then(Value::as_str).map(|id| ctx.db.actor_quest().id().find(&format!("{actor_id}::{id}")).map(|row| row.status == "completed").unwrap_or(false)).unwrap_or(true)
        && conditions.get("required_option_id").and_then(Value::as_str).map(|id| ctx.db.actor_character_option().iter().any(|row| row.actor_id == actor_id && row.option_id == id)).unwrap_or(true)
}

pub(super) fn fire_world_triggers(ctx: &ReducerContext, actor_id: &str, room_id: &str, event_kind: &str, source_id: Option<&str>) {
    let triggers = ctx.db.world_trigger().iter().filter(|row| row.active && row.event_kind == event_kind && row.source_id.as_deref().map(|id| Some(id) == source_id).unwrap_or(true)).collect::<Vec<_>>();
    for trigger in triggers {
        let state_id = format!("{actor_id}::{}", trigger.id);
        if trigger.once_per_actor && ctx.db.actor_trigger_state().id().find(&state_id).is_some() { continue; }
        let conditions = serde_json::from_str::<Value>(&trigger.conditions_json).unwrap_or(Value::Null);
        if !trigger_conditions_match(ctx, actor_id, &conditions) { continue; }
        let actions = serde_json::from_str::<Vec<Value>>(&trigger.actions_json).unwrap_or_default();
        for action in actions {
            match action.get("kind").and_then(Value::as_str).unwrap_or("") {
                "message" => rpg_message(ctx, room_id, actor_id, "system", action.get("text").and_then(Value::as_str).unwrap_or_default().to_string()),
                "gold" => { let _ = change_currency(ctx, actor_id, "gold", action.get("amount").and_then(Value::as_i64).unwrap_or(0)); },
                "item" => if let Some(id) = action.get("definition_id").and_then(Value::as_str) { let _ = grant_inventory_item(ctx, actor_id, id, action.get("quantity").and_then(Value::as_u64).and_then(|value| u32::try_from(value).ok()).unwrap_or(1), "trigger"); },
                "reputation" => if let Some(id) = action.get("faction_id").and_then(Value::as_str) { change_reputation(ctx, actor_id, id, action.get("amount").and_then(Value::as_i64).and_then(|value| i32::try_from(value).ok()).unwrap_or(0)); },
                _ => {}
            }
        }
        let row = ActorTriggerState { id: state_id.clone(), actor_id: actor_id.to_string(), trigger_id: trigger.id, fire_count: ctx.db.actor_trigger_state().id().find(&state_id).map(|row| row.fire_count.saturating_add(1)).unwrap_or(1), last_fired_at: ctx.timestamp };
        if ctx.db.actor_trigger_state().id().find(&state_id).is_some() { ctx.db.actor_trigger_state().id().update(row); } else { ctx.db.actor_trigger_state().insert(row); }
    }
}

pub(super) fn handle_expansion_command(ctx: &ReducerContext, raw: &str, room_id: &str, actor_id: &str, actor_name_value: &str) -> Result<bool, String> {
    let lower = raw.trim().to_lowercase();
    if let Some(error) = command_sanction_error(ctx, actor_id, &lower) { rpg_message(ctx, room_id, actor_id, "error", error); return Ok(true); }
    restock_vendors(ctx);
    if handle_dialogue(ctx, &lower, room_id, actor_id) || handle_bank_command(ctx, &lower, room_id, actor_id) || handle_door_command(ctx, &lower, room_id, actor_id) { return Ok(true); }
    if matches!(lower.as_str(), "talents" | "talent") {
        let pool = ensure_talent_pool(ctx, actor_id); let mut rules = ctx.db.ability_unlock_rule().iter().filter(|row| row.talent_cost > 0).collect::<Vec<_>>(); rules.sort_by(|a,b| a.ability_id.cmp(&b.ability_id));
        let lines = rules.into_iter().filter_map(|rule| ctx.db.ability_definition().id().find(&rule.ability_id).map(|ability| format!("- {} · level {} · {} point(s){}", ability.name, ability.required_level, rule.talent_cost, if ctx.db.actor_ability().id().find(&format!("{actor_id}::{}", ability.id)).is_some() { " · learned" } else { "" }))).collect::<Vec<_>>();
        rpg_message(ctx, room_id, actor_id, "system", format!("[TALENTS · {} AVAILABLE]\n{}\nUse `learn <ability>` or `respec talents`.", pool.available_points, if lines.is_empty() { "- No authored talent abilities".to_string() } else { lines.join("\n") })); return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("learn ") { learn_talent(ctx, room_id, actor_id, query); return Ok(true); }
    if lower == "respec talents" { respec_talents(ctx, room_id, actor_id); return Ok(true); }

    if let Some(name) = lower.strip_prefix("party create ") {
        if party_for_actor(ctx, actor_id).is_some() { rpg_message(ctx, room_id, actor_id, "error", "Leave your current party first.".to_string()); return Ok(true); }
        let id = format!("party-{actor_id}"); let display_name = name.trim(); if display_name.is_empty() { return Ok(true); }
        ctx.db.party().insert(Party { id: id.clone(), name: display_name.to_string(), leader_actor_id: actor_id.to_string(), loot_rule: "round_robin".to_string(), created_at: ctx.timestamp, updated_at: ctx.timestamp });
        ctx.db.party_member().insert(PartyMember { id: format!("{id}::{actor_id}"), party_id: id, actor_id: actor_id.to_string(), status: "member".to_string(), invited_by_actor_id: actor_id.to_string(), joined_at: ctx.timestamp });
        rpg_message(ctx, room_id, actor_id, "system", "Party created.".to_string()); return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("party invite ") {
        let Some((party, _)) = party_for_actor(ctx, actor_id).filter(|(party, _)| party.leader_actor_id == actor_id) else { rpg_message(ctx, room_id, actor_id, "error", "Only a party leader can invite.".to_string()); return Ok(true) };
        let Some((target_id, target_name_value, false)) = target_actor_in_room(ctx, room_id, actor_id, query.trim()) else { rpg_message(ctx, room_id, actor_id, "error", "That player is not here.".to_string()); return Ok(true) };
        if party_for_actor(ctx, &target_id).is_some() { rpg_message(ctx, room_id, actor_id, "error", "That player already belongs to a party.".to_string()); return Ok(true); }
        let id = format!("{}::{target_id}", party.id); let row = PartyMember { id: id.clone(), party_id: party.id, actor_id: target_id.clone(), status: "invited".to_string(), invited_by_actor_id: actor_id.to_string(), joined_at: ctx.timestamp };
        if ctx.db.party_member().id().find(&id).is_some() { ctx.db.party_member().id().update(row); } else { ctx.db.party_member().insert(row); }
        insert_private_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), Some(actor_name_value.to_string()), target_id, "party_invite", format!("{actor_name_value} invites you to a party. Use `party accept`."));
        rpg_message(ctx, room_id, actor_id, "system", format!("You invite {target_name_value}.")); return Ok(true);
    }
    if lower == "party accept" {
        let Some(mut invite) = ctx.db.party_member().iter().find(|row| row.actor_id == actor_id && row.status == "invited") else { rpg_message(ctx, room_id, actor_id, "error", "You have no party invitation.".to_string()); return Ok(true) };
        invite.status = "member".to_string(); invite.joined_at = ctx.timestamp; ctx.db.party_member().id().update(invite.clone());
        if let Some(party) = ctx.db.party().id().find(&invite.party_id) { rpg_message(ctx, room_id, actor_id, "system", format!("You join {}.", party.name)); } return Ok(true);
    }
    if let Some(body) = lower.strip_prefix("party say ") { if let Some((party, _)) = party_for_actor(ctx, actor_id) { send_group_message(ctx, actor_id, actor_name_value, "party", &party.id, body); } else { rpg_message(ctx, room_id, actor_id, "error", "You are not in a party.".to_string()); } return Ok(true); }
    if let Some(rule) = lower.strip_prefix("party loot ") {
        let Some((mut party, _)) = party_for_actor(ctx, actor_id).filter(|(party, _)| party.leader_actor_id == actor_id) else { rpg_message(ctx, room_id, actor_id, "error", "Only the party leader can change loot rules.".to_string()); return Ok(true) };
        if !matches!(rule.trim(), "round_robin" | "leader" | "free_for_all") { rpg_message(ctx, room_id, actor_id, "error", "Loot rule must be round_robin, leader, or free_for_all.".to_string()); return Ok(true); }
        party.loot_rule = rule.trim().to_string(); party.updated_at = ctx.timestamp; ctx.db.party().id().update(party);
        rpg_message(ctx, room_id, actor_id, "system", format!("Party loot is now {}.", rule.trim())); return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("party kick ") {
        let Some((party, _)) = party_for_actor(ctx, actor_id).filter(|(party, _)| party.leader_actor_id == actor_id) else { rpg_message(ctx, room_id, actor_id, "error", "Only the party leader can remove members.".to_string()); return Ok(true) };
        let target = ctx.db.party_member().iter().find(|row| row.party_id == party.id && row.actor_id != actor_id && actor_name(ctx, &row.actor_id).eq_ignore_ascii_case(query.trim()));
        if let Some(member) = target { ctx.db.party_member().id().delete(&member.id); rpg_message(ctx, room_id, actor_id, "system", "Party member removed.".to_string()); }
        else { rpg_message(ctx, room_id, actor_id, "error", "That player is not in your party.".to_string()); }
        return Ok(true);
    }
    if lower == "party leave" { if let Some((party, member)) = party_for_actor(ctx, actor_id) { ctx.db.party_member().id().delete(&member.id); if party.leader_actor_id == actor_id { let ids = ctx.db.party_member().iter().filter(|row| row.party_id == party.id).map(|row| row.id).collect::<Vec<_>>(); for id in ids { ctx.db.party_member().id().delete(&id); } ctx.db.party().id().delete(&party.id); } rpg_message(ctx, room_id, actor_id, "system", "You leave the party.".to_string()); } return Ok(true); }
    if lower == "party" { if let Some((party, _)) = party_for_actor(ctx, actor_id) { let members = ctx.db.party_member().iter().filter(|row| row.party_id == party.id && row.status == "member").map(|row| actor_name(ctx, &row.actor_id)).collect::<Vec<_>>(); rpg_message(ctx, room_id, actor_id, "system", format!("[PARTY · {} · {}]\n{}", party.name, party.loot_rule, members.join("\n"))); } else { rpg_message(ctx, room_id, actor_id, "system", "You are not in a party. Use `party create <name>`.".to_string()); } return Ok(true); }

    if let Some(name) = lower.strip_prefix("guild create ") {
        if guild_for_actor(ctx, actor_id).is_some() || ctx.db.guild().iter().any(|row| row.name.eq_ignore_ascii_case(name.trim())) { rpg_message(ctx, room_id, actor_id, "error", "You already have a guild or that name is taken.".to_string()); return Ok(true); }
        let id = format!("guild-{actor_id}"); ctx.db.guild().insert(Guild { id: id.clone(), name: name.trim().to_string(), leader_actor_id: actor_id.to_string(), description: String::new(), created_at: ctx.timestamp, updated_at: ctx.timestamp });
        ctx.db.guild_member().insert(GuildMember { id: format!("{id}::{actor_id}"), guild_id: id, actor_id: actor_id.to_string(), rank: "leader".to_string(), status: "member".to_string(), invited_by_actor_id: actor_id.to_string(), joined_at: ctx.timestamp }); rpg_message(ctx, room_id, actor_id, "system", "Guild created.".to_string()); return Ok(true);
    }
    if let Some(query) = lower.strip_prefix("guild invite ") {
        let Some((guild, _)) = guild_for_actor(ctx, actor_id).filter(|(guild, _)| guild.leader_actor_id == actor_id) else { rpg_message(ctx, room_id, actor_id, "error", "Only the guild leader can invite.".to_string()); return Ok(true) };
        let Some((target_id, _, false)) = target_actor_in_room(ctx, room_id, actor_id, query.trim()) else { rpg_message(ctx, room_id, actor_id, "error", "That player is not here.".to_string()); return Ok(true) };
        let id = format!("{}::{target_id}", guild.id); let row = GuildMember { id: id.clone(), guild_id: guild.id, actor_id: target_id.clone(), rank: "member".to_string(), status: "invited".to_string(), invited_by_actor_id: actor_id.to_string(), joined_at: ctx.timestamp };
        if ctx.db.guild_member().id().find(&id).is_some() { ctx.db.guild_member().id().update(row); } else { ctx.db.guild_member().insert(row); } insert_private_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), Some(actor_name_value.to_string()), target_id, "guild_invite", format!("{actor_name_value} invites you to a guild. Use `guild accept`.")); return Ok(true);
    }
    if lower == "guild accept" { if let Some(mut invite) = ctx.db.guild_member().iter().find(|row| row.actor_id == actor_id && row.status == "invited") { invite.status = "member".to_string(); invite.joined_at = ctx.timestamp; ctx.db.guild_member().id().update(invite); rpg_message(ctx, room_id, actor_id, "system", "You join the guild.".to_string()); } else { rpg_message(ctx, room_id, actor_id, "error", "You have no guild invitation.".to_string()); } return Ok(true); }
    if let Some(body) = lower.strip_prefix("guild say ") { if let Some((guild, _)) = guild_for_actor(ctx, actor_id) { send_group_message(ctx, actor_id, actor_name_value, "guild", &guild.id, body); } else { rpg_message(ctx, room_id, actor_id, "error", "You are not in a guild.".to_string()); } return Ok(true); }
    if let Some(query) = lower.strip_prefix("guild kick ") {
        let Some((guild, _)) = guild_for_actor(ctx, actor_id).filter(|(guild, _)| guild.leader_actor_id == actor_id) else { rpg_message(ctx, room_id, actor_id, "error", "Only the guild leader can remove members.".to_string()); return Ok(true) };
        let target = ctx.db.guild_member().iter().find(|row| row.guild_id == guild.id && row.actor_id != actor_id && actor_name(ctx, &row.actor_id).eq_ignore_ascii_case(query.trim()));
        if let Some(member) = target { ctx.db.guild_member().id().delete(&member.id); rpg_message(ctx, room_id, actor_id, "system", "Guild member removed.".to_string()); }
        else { rpg_message(ctx, room_id, actor_id, "error", "That player is not in your guild.".to_string()); }
        return Ok(true);
    }
    if lower == "guild leave" { if let Some((guild, member)) = guild_for_actor(ctx, actor_id) { ctx.db.guild_member().id().delete(&member.id); if guild.leader_actor_id == actor_id { let ids = ctx.db.guild_member().iter().filter(|row| row.guild_id == guild.id).map(|row| row.id).collect::<Vec<_>>(); for id in ids { ctx.db.guild_member().id().delete(&id); } ctx.db.guild().id().delete(&guild.id); } } return Ok(true); }
    if lower == "guild" { if let Some((guild, _)) = guild_for_actor(ctx, actor_id) { let members = ctx.db.guild_member().iter().filter(|row| row.guild_id == guild.id && row.status == "member").map(|row| format!("- {} ({})", actor_name(ctx, &row.actor_id), row.rank)).collect::<Vec<_>>(); rpg_message(ctx, room_id, actor_id, "system", format!("[GUILD · {}]\n{}", guild.name, members.join("\n"))); } else { rpg_message(ctx, room_id, actor_id, "system", "You are not in a guild. Use `guild create <name>`.".to_string()); } return Ok(true); }

    if lower == "social" || lower == "friends" { show_social(ctx, room_id, actor_id); return Ok(true); }
    for (prefix, kind) in [("friend add ", "friend"), ("block ", "block")] {
        if let Some(query) = lower.strip_prefix(prefix) { if let Some((target_id, target_name_value, false)) = target_actor_in_room(ctx, room_id, actor_id, query.trim()) { let id = relationship_id(actor_id, &target_id, kind); if ctx.db.social_relationship().id().find(&id).is_none() { ctx.db.social_relationship().insert(SocialRelationship { id, owner: ctx.sender(), source_actor_id: actor_id.to_string(), target_actor_id: target_id, relationship_kind: kind.to_string(), created_at: ctx.timestamp }); } rpg_message(ctx, room_id, actor_id, "system", format!("{target_name_value} added to your {kind} list.")); } return Ok(true); }
    }
    if let Some(query) = lower.strip_prefix("unblock ") { if let Some((target_id, _, false)) = target_actor_in_room(ctx, room_id, actor_id, query.trim()) { ctx.db.social_relationship().id().delete(&relationship_id(actor_id, &target_id, "block")); } return Ok(true); }
    if let Some(rest) = lower.strip_prefix("report ") {
        let words = rest.split_whitespace().collect::<Vec<_>>();
        let match_with_reason = (1..words.len()).rev().find_map(|split| target_actor_in_room(ctx, room_id, actor_id, &words[..split].join(" ")).map(|target| (target, words[split..].join(" "))));
        if let Some(((target_id, _, false), reason)) = match_with_reason {
            let id = format!("report-{actor_id}-{}", ctx.timestamp.to_micros_since_unix_epoch());
            ctx.db.player_report().insert(PlayerReport { id, scope: "world".to_string(), reporter_actor_id: actor_id.to_string(), target_actor_id: target_id, reason, status: "open".to_string(), created_at: ctx.timestamp, updated_at: ctx.timestamp });
            rpg_message(ctx, room_id, actor_id, "system", "Your report has been recorded.".to_string());
        } else { rpg_message(ctx, room_id, actor_id, "error", "Use `report <player> <reason>` while that player is nearby.".to_string()); }
        return Ok(true);
    }

    if let Some(query) = lower.strip_prefix("trade ").filter(|rest| !rest.starts_with("add ") && *rest != "confirm" && *rest != "cancel" && *rest != "review") {
        if trade_for_actor(ctx, actor_id).is_some() { rpg_message(ctx, room_id, actor_id, "error", "Finish or cancel your current trade first.".to_string()); return Ok(true); }
        let Some((target_id, target_name_value, false)) = target_actor_in_room(ctx, room_id, actor_id, query.trim()) else { rpg_message(ctx, room_id, actor_id, "error", "That player is not here.".to_string()); return Ok(true) };
        if is_blocked(ctx, actor_id, &target_id) { rpg_message(ctx, room_id, actor_id, "error", "A block prevents this trade.".to_string()); return Ok(true); }
        let Some(target_identity) = actor_identity(ctx, &target_id) else { return Ok(true) }; let id = format!("trade-{actor_id}-{target_id}-{}", ctx.timestamp.to_micros_since_unix_epoch());
        ctx.db.trade_session().insert(TradeSession { id: id.clone(), first_actor_id: actor_id.to_string(), first_identity: ctx.sender(), second_actor_id: target_id.clone(), second_identity: target_identity, first_confirmed: false, second_confirmed: false, status: "open".to_string(), created_at: ctx.timestamp, updated_at: ctx.timestamp });
        insert_private_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), Some(actor_name_value.to_string()), target_id, "trade", format!("{actor_name_value} opens a secure trade with you. Use `trade review`.")); rpg_message(ctx, room_id, actor_id, "system", format!("Trade opened with {target_name_value}.")); return Ok(true);
    }
    if lower == "trade" || lower == "trade review" { if let Some(trade) = trade_for_actor(ctx, actor_id) { show_trade(ctx, room_id, actor_id, &trade); } else { rpg_message(ctx, room_id, actor_id, "system", "No active trade. Use `trade <player>`.".to_string()); } return Ok(true); }
    if let Some(query) = lower.strip_prefix("trade add ") { let Some(trade) = trade_for_actor(ctx, actor_id) else { rpg_message(ctx, room_id, actor_id, "error", "You have no open trade.".to_string()); return Ok(true) }; let parts = query.rsplit_once(' '); if let Some((amount_text, currency)) = parts.filter(|(amount, _)| amount.parse::<i64>().is_ok()) { let amount = amount_text.parse::<i64>().unwrap_or(0); if amount <= 0 || currency_balance(ctx, actor_id, currency) < amount { rpg_message(ctx, room_id, actor_id, "error", "That currency offer is not available.".to_string()); return Ok(true); } let id = format!("{}::{actor_id}::currency::{currency}", trade.id); let row = TradeOffer { id: id.clone(), trade_id: trade.id.clone(), actor_id: actor_id.to_string(), offer_kind: "currency".to_string(), reference_id: currency.to_string(), quantity: amount, created_at: ctx.timestamp }; if ctx.db.trade_offer().id().find(&id).is_some() { ctx.db.trade_offer().id().update(row); } else { ctx.db.trade_offer().insert(row); } } else if let Some((object, _definition)) = find_carried_object(ctx, actor_id, query).filter(|(row, _)| row.location_kind == "inventory") { if !object_transfer_allowed(ctx, &object) { rpg_message(ctx, room_id, actor_id, "error", "That item cannot be traded.".to_string()); return Ok(true); } let id = format!("{}::{actor_id}::item::{}", trade.id, object.id); ctx.db.trade_offer().insert(TradeOffer { id, trade_id: trade.id.clone(), actor_id: actor_id.to_string(), offer_kind: "item".to_string(), reference_id: object.id, quantity: 1, created_at: ctx.timestamp }); } else { rpg_message(ctx, room_id, actor_id, "error", "You are not carrying that item.".to_string()); return Ok(true); } reset_trade_confirmation(ctx, trade); return Ok(true); }
    if lower == "trade cancel" { if let Some(trade) = trade_for_actor(ctx, actor_id) { cancel_trade(ctx, trade); } return Ok(true); }
    if lower == "trade confirm" { let Some(mut trade) = trade_for_actor(ctx, actor_id) else { return Ok(true) }; if trade.first_actor_id == actor_id { trade.first_confirmed = true; } else { trade.second_confirmed = true; } trade.updated_at = ctx.timestamp; if trade.first_confirmed && trade.second_confirmed { match complete_trade(ctx, trade) { Ok(()) => rpg_message(ctx, room_id, actor_id, "system", "Trade completed.".to_string()), Err(error) => rpg_message(ctx, room_id, actor_id, "error", error) } } else { ctx.db.trade_session().id().update(trade); rpg_message(ctx, room_id, actor_id, "system", "Trade confirmed. Waiting for the other player.".to_string()); } return Ok(true); }

    if let Some(rest) = lower.strip_prefix("pay ") {
        let words = rest.split_whitespace().collect::<Vec<_>>();
        if words.len() >= 4 && words[2] == "to" { if let Ok(amount) = words[0].parse::<i64>() { let currency = words[1]; let target_query = words[3..].join(" "); if currency != "gold" && !ctx.db.currency_definition().id().find(&currency.to_string()).map(|row| row.tradeable).unwrap_or(false) { rpg_message(ctx, room_id, actor_id, "error", "That currency is not player-transferable.".to_string()); return Ok(true); } if let Some((target_id, target_name_value, false)) = target_actor_in_room(ctx, room_id, actor_id, &target_query) { if amount > 0 && change_currency(ctx, actor_id, currency, -amount).is_ok() { let _ = change_currency(ctx, &target_id, currency, amount); rpg_message(ctx, room_id, actor_id, "system", format!("You pay {target_name_value} {amount} {currency}.")); } else { rpg_message(ctx, room_id, actor_id, "error", "You do not have enough currency.".to_string()); } } return Ok(true); } }
    }
    Ok(false)
}

fn clean_optional(row: &Value, key: &str) -> Option<String> {
    optional_string(row, key).filter(|value| !value.trim().is_empty())
}

pub(super) fn object_maximum_durability(ctx: &ReducerContext, definition_id: &str) -> i32 {
    ctx.db.object_rule().definition_id().find(&definition_id.to_string()).map(|row| row.maximum_durability).unwrap_or(100).max(0)
}

pub(super) fn object_transfer_allowed(ctx: &ReducerContext, object: &WorldObject) -> bool {
    if serde_json::from_str::<Value>(&object.state_json).ok().and_then(|value| value.get("bound_to").cloned()).is_some() { return false; }
    ctx.db.object_rule().definition_id().find(&object.definition_id).map(|row| row.tradeable && row.bind_rule != "bound").unwrap_or(true)
}

pub(super) fn equip_rule_error(ctx: &ReducerContext, actor_id: &str, definition: &ObjectDefinition) -> Option<String> {
    let rule = ctx.db.object_rule().definition_id().find(&definition.id)?;
    let level = ensure_actor_progression(ctx, actor_id).level;
    if level < rule.required_level { return Some(format!("{} requires level {}.", definition.name, rule.required_level)); }
    if rule.required_option_id.as_ref().map(|id| ctx.db.actor_character_option().iter().any(|row| row.actor_id == actor_id && row.option_id == *id)).unwrap_or(true) == false { return Some(format!("Your character class or origin cannot equip {}.", definition.name)); }
    if rule.two_handed && ctx.db.world_object().iter().filter(|row| row.location_kind == "equipped" && row.location_id == actor_id).filter_map(|row| object_definition_for(ctx, &row)).any(|row| row.equipment_slot.as_deref() == Some("off-hand")) { return Some("Unequip your off-hand item before using a two-handed weapon.".to_string()); }
    if definition.equipment_slot.as_deref() == Some("off-hand") && ctx.db.world_object().iter().filter(|row| row.location_kind == "equipped" && row.location_id == actor_id).any(|row| ctx.db.object_rule().definition_id().find(&row.definition_id).map(|rule| rule.two_handed).unwrap_or(false)) { return Some("A two-handed weapon prevents equipping an off-hand item.".to_string()); }
    None
}

pub(super) fn bind_object_on_equip(ctx: &ReducerContext, actor_id: &str, mut object: WorldObject) -> WorldObject {
    if ctx.db.object_rule().definition_id().find(&object.definition_id).map(|row| row.bind_rule == "bind_on_equip").unwrap_or(false) {
        let mut state = serde_json::from_str::<Value>(&object.state_json).unwrap_or_else(|_| serde_json::json!({}));
        if let Some(map) = state.as_object_mut() { map.insert("bound_to".to_string(), Value::String(actor_id.to_string())); }
        object.state_json = state.to_string();
    }
    object
}

pub(super) fn recipe_rule_error(ctx: &ReducerContext, actor_id: &str, recipe_id: &str) -> Option<String> {
    let rule = ctx.db.recipe_rule().recipe_id().find(&recipe_id.to_string())?;
    if rule.must_be_learned && ctx.db.actor_learned_recipe().id().find(&format!("{actor_id}::{recipe_id}")).is_none() { return Some("You have not learned that recipe.".to_string()); }
    if let Some(profession_id) = rule.profession_id.as_ref() {
        let rank = ctx.db.actor_profession().id().find(&format!("{actor_id}::{profession_id}")).map(|row| row.rank).unwrap_or(0);
        if rank < rule.required_profession_rank { return Some(format!("This recipe requires {profession_id} rank {}.", rule.required_profession_rank)); }
    }
    let remaining = cooldown_remaining_ms(ctx, actor_id, &format!("recipe:{recipe_id}"));
    if remaining > 0 { return Some(format!("That recipe is ready again in {:.1} seconds.", remaining as f32 / 1000.0)); }
    None
}

pub(super) fn recipe_attempt_succeeds(ctx: &ReducerContext, actor_id: &str, recipe_id: &str) -> bool {
    let chance = ctx.db.recipe_rule().recipe_id().find(&recipe_id.to_string()).map(|row| row.success_percent).unwrap_or(100).min(100);
    deterministic_roll(&format!("craft:{actor_id}:{recipe_id}:{}", ctx.timestamp.to_micros_since_unix_epoch())) % 100 < chance
}

pub(super) fn finish_recipe_attempt(ctx: &ReducerContext, actor_id: &str, recipe_id: &str) {
    let Some(rule) = ctx.db.recipe_rule().recipe_id().find(&recipe_id.to_string()) else { return };
    if rule.cooldown_seconds > 0 { set_cooldown(ctx, actor_id, &format!("recipe:{recipe_id}"), rule.cooldown_seconds.saturating_mul(1000)); }
    let Some(profession_id) = rule.profession_id else { return };
    let Some(definition) = ctx.db.profession_definition().id().find(&profession_id) else { return };
    let id = format!("{actor_id}::{profession_id}"); let existing = ctx.db.actor_profession().id().find(&id);
    let mut row = existing.clone().unwrap_or(ActorProfession { id: id.clone(), actor_id: actor_id.to_string(), profession_id, rank: 0, experience: 0, updated_at: ctx.timestamp });
    row.experience = row.experience.saturating_add(definition.xp_per_craft); while row.rank < definition.maximum_rank && row.experience >= row.rank.saturating_add(1).saturating_mul(10) { row.rank = row.rank.saturating_add(1); }
    row.updated_at = ctx.timestamp; if existing.is_some() { ctx.db.actor_profession().id().update(row); } else { ctx.db.actor_profession().insert(row); }
}

pub(super) fn party_members_in_room(ctx: &ReducerContext, actor_id: &str, room_id: &str) -> Vec<String> {
    let Some((party, _)) = party_for_actor(ctx, actor_id) else { return Vec::new() };
    ctx.db.party_member().iter().filter(|row| row.party_id == party.id && row.status == "member" && actor_current_room(ctx, &row.actor_id).as_deref() == Some(room_id)).map(|row| row.actor_id).collect()
}

pub(super) fn same_party(ctx: &ReducerContext, first_actor_id: &str, second_actor_id: &str) -> bool {
    party_for_actor(ctx, first_actor_id).zip(party_for_actor(ctx, second_actor_id)).map(|(first, second)| first.0.id == second.0.id).unwrap_or(false)
}

pub(super) fn party_loot_owner(ctx: &ReducerContext, actor_id: &str, room_id: &str, seed: &str) -> Option<String> {
    let (party, _) = party_for_actor(ctx, actor_id)?;
    match party.loot_rule.as_str() {
        "free_for_all" => None,
        "leader" => Some(party.leader_actor_id),
        _ => {
            let mut members = party_members_in_room(ctx, actor_id, room_id);
            members.sort();
            if members.is_empty() { Some(actor_id.to_string()) }
            else { Some(members[(deterministic_roll(seed) as usize) % members.len()].clone()) }
        }
    }
}

pub(super) fn loot_claim_allowed(object: &WorldObject, actor_id: &str) -> bool {
    serde_json::from_str::<Value>(&object.state_json).ok()
        .and_then(|value| value.get("loot_owner").and_then(Value::as_str).map(str::to_string))
        .map(|owner| owner == actor_id)
        .unwrap_or(true)
}

pub(super) fn clear_loot_claim(mut object: WorldObject) -> WorldObject {
    if let Ok(mut state) = serde_json::from_str::<Value>(&object.state_json) {
        if let Some(map) = state.as_object_mut() { map.remove("loot_owner"); }
        object.state_json = state.to_string();
    }
    object
}

#[spacetimedb::reducer]
pub fn configure_engine_record(ctx: &ReducerContext, table_name: String, payload_json: String) -> Result<(), String> {
    ensure_profile(ctx); require_permission(ctx, table_permission(&table_name))?;
    let row: Value = serde_json::from_str(&payload_json).map_err(|error| format!("Invalid configuration JSON: {error}"))?;
    let record_id = string(&row, if table_name == "ability_unlock_rules" { "ability_id" } else if table_name == "object_rules" { "definition_id" } else if table_name == "vendor_restock_rules" { "vendor_stock_id" } else if table_name == "recipe_rules" { "recipe_id" } else if table_name == "exit_rules" { "exit_id" } else { "id" }, "");
    if record_id.trim().is_empty() { return Err("A stable record id is required.".to_string()); }
    match table_name.as_str() {
        "ability_unlock_rules" => {
            if ctx.db.ability_definition().id().find(&record_id).is_none() { return Err("Ability does not exist.".to_string()); }
            let value = AbilityUnlockRule { ability_id: record_id.clone(), required_option_id: clean_optional(&row, "required_option_id"), prerequisite_ability_id: clean_optional(&row, "prerequisite_ability_id"), required_quest_id: clean_optional(&row, "required_quest_id"), required_faction_id: clean_optional(&row, "required_faction_id"), required_reputation: i32_value(&row, "required_reputation", 0), talent_cost: u32_value(&row, "talent_cost", 0), exclusive_group: clean_optional(&row, "exclusive_group"), created_at: ctx.db.ability_unlock_rule().ability_id().find(&record_id).map(|old| old.created_at).unwrap_or(ctx.timestamp), updated_at: ctx.timestamp };
            if ctx.db.ability_unlock_rule().ability_id().find(&record_id).is_some() { ctx.db.ability_unlock_rule().ability_id().update(value); } else { ctx.db.ability_unlock_rule().insert(value); }
        }
        "object_rules" => {
            if ctx.db.object_definition().id().find(&record_id).is_none() { return Err("Object definition does not exist.".to_string()); }
            let value = ObjectRule { definition_id: record_id.clone(), rarity: string(&row, "rarity", "common"), item_level: u32_value(&row, "item_level", 1).max(1), required_level: u32_value(&row, "required_level", 1).max(1), required_option_id: clean_optional(&row, "required_option_id"), maximum_durability: i32_value(&row, "maximum_durability", 100).max(0), base_value: i64_value(&row, "base_value", 0).max(0), repairable: bool_value(&row, "repairable", true), two_handed: bool_value(&row, "two_handed", false), weapon_type: clean_optional(&row, "weapon_type"), damage_school: clean_optional(&row, "damage_school"), bind_rule: string(&row, "bind_rule", "none"), tradeable: bool_value(&row, "tradeable", true), updated_at: ctx.timestamp };
            if ctx.db.object_rule().definition_id().find(&record_id).is_some() { ctx.db.object_rule().definition_id().update(value); } else { ctx.db.object_rule().insert(value); }
        }
        "bank_configs" => {
            let value = BankConfig { id: record_id.clone(), access_mode: string(&row, "access_mode", "anywhere"), required_room_tag: clean_optional(&row, "required_room_tag"), required_npc_id: clean_optional(&row, "required_npc_id"), slot_limit: u32_value(&row, "slot_limit", 0), deposit_fee: i64_value(&row, "deposit_fee", 0).max(0), withdrawal_fee: i64_value(&row, "withdrawal_fee", 0).max(0), shared_by_identity: bool_value(&row, "shared_by_identity", false), protects_from_death: bool_value(&row, "protects_from_death", true), updated_at: ctx.timestamp };
            if ctx.db.bank_config().id().find(&record_id).is_some() { ctx.db.bank_config().id().update(value); } else { ctx.db.bank_config().insert(value); }
        }
        "vendor_restock_rules" => {
            if ctx.db.vendor_stock().id().find(&record_id).is_none() { return Err("Vendor stock does not exist.".to_string()); }
            let value = VendorRestockRule { vendor_stock_id: record_id.clone(), target_stock: i32_value(&row, "target_stock", 0).max(0), restock_quantity: u32_value(&row, "restock_quantity", 1).max(1), restock_seconds: u32_value(&row, "restock_seconds", 300), last_restock_at_micros: ctx.db.vendor_restock_rule().vendor_stock_id().find(&record_id).map(|old| old.last_restock_at_micros).unwrap_or(ctx.timestamp.to_micros_since_unix_epoch()), updated_at: ctx.timestamp };
            if ctx.db.vendor_restock_rule().vendor_stock_id().find(&record_id).is_some() { ctx.db.vendor_restock_rule().vendor_stock_id().update(value); } else { ctx.db.vendor_restock_rule().insert(value); }
        }
        "profession_definitions" => {
            let value = ProfessionDefinition { id: record_id.clone(), name: string(&row, "name", "Profession"), description: string(&row, "description", ""), maximum_rank: u32_value(&row, "maximum_rank", 100).max(1), xp_per_craft: u32_value(&row, "xp_per_craft", 1), active: bool_value(&row, "active", true), created_at: ctx.db.profession_definition().id().find(&record_id).map(|old| old.created_at).unwrap_or(ctx.timestamp), updated_at: ctx.timestamp };
            if ctx.db.profession_definition().id().find(&record_id).is_some() { ctx.db.profession_definition().id().update(value); } else { ctx.db.profession_definition().insert(value); }
        }
        "recipe_rules" => {
            if ctx.db.crafting_recipe().id().find(&record_id).is_none() { return Err("Recipe does not exist.".to_string()); }
            let value = RecipeRule { recipe_id: record_id.clone(), profession_id: clean_optional(&row, "profession_id"), required_profession_rank: u32_value(&row, "required_profession_rank", 0), must_be_learned: bool_value(&row, "must_be_learned", false), success_percent: u32_value(&row, "success_percent", 100).min(100), cooldown_seconds: u32_value(&row, "cooldown_seconds", 0), updated_at: ctx.timestamp };
            if ctx.db.recipe_rule().recipe_id().find(&record_id).is_some() { ctx.db.recipe_rule().recipe_id().update(value); } else { ctx.db.recipe_rule().insert(value); }
        }
        "dialogue_nodes" => {
            let npc_id = string(&row, "npc_id", ""); if ctx.db.npc().id().find(&npc_id).is_none() { return Err("Dialogue NPC does not exist.".to_string()); }
            let text = string(&row, "text", "").trim().to_string(); if text.is_empty() { return Err("Dialogue text is required.".to_string()); }
            let value = DialogueNode { id: record_id.clone(), npc_id, text, entry_node: bool_value(&row, "entry_node", false), required_quest_id: clean_optional(&row, "required_quest_id"), required_faction_id: clean_optional(&row, "required_faction_id"), required_reputation: i32_value(&row, "required_reputation", 0), sort_order: u32_value(&row, "sort_order", 100), created_at: ctx.db.dialogue_node().id().find(&record_id).map(|old| old.created_at).unwrap_or(ctx.timestamp), updated_at: ctx.timestamp };
            if ctx.db.dialogue_node().id().find(&record_id).is_some() { ctx.db.dialogue_node().id().update(value); } else { ctx.db.dialogue_node().insert(value); }
        }
        "dialogue_choices" => {
            let node_id = string(&row, "node_id", ""); if ctx.db.dialogue_node().id().find(&node_id).is_none() { return Err("Dialogue node does not exist.".to_string()); }
            let label = string(&row, "label", "").trim().to_string(); if label.is_empty() { return Err("Dialogue response text is required.".to_string()); }
            let next_node_id = clean_optional(&row, "next_node_id");
            if let Some(next_id) = next_node_id.as_ref() {
                let source_npc_id = ctx.db.dialogue_node().id().find(&node_id).map(|node| node.npc_id).unwrap_or_default();
                let next_node = ctx.db.dialogue_node().id().find(next_id).ok_or_else(|| "The next dialogue node does not exist.".to_string())?;
                if next_node.npc_id != source_npc_id { return Err("A dialogue response cannot lead to another NPC's dialogue.".to_string()); }
            }
            let value = DialogueChoice { id: record_id.clone(), node_id, label, next_node_id, action_kind: string(&row, "action_kind", "none"), action_reference_id: clean_optional(&row, "action_reference_id"), action_value: i32_value(&row, "action_value", 0), sort_order: u32_value(&row, "sort_order", 100), created_at: ctx.db.dialogue_choice().id().find(&record_id).map(|old| old.created_at).unwrap_or(ctx.timestamp), updated_at: ctx.timestamp };
            if ctx.db.dialogue_choice().id().find(&record_id).is_some() { ctx.db.dialogue_choice().id().update(value); } else { ctx.db.dialogue_choice().insert(value); }
        }
        "exit_rules" => {
            if ctx.db.exit().id().find(&record_id).is_none() { return Err("Exit does not exist.".to_string()); }
            let value = ExitRule { exit_id: record_id.clone(), is_door: bool_value(&row, "is_door", true), closed: bool_value(&row, "closed", false), locked: bool_value(&row, "locked", false), key_definition_id: clean_optional(&row, "key_definition_id"), hidden: bool_value(&row, "hidden", false), trap_damage: i32_value(&row, "trap_damage", 0).max(0), required_quest_id: clean_optional(&row, "required_quest_id"), required_option_id: clean_optional(&row, "required_option_id"), updated_at: ctx.timestamp };
            if ctx.db.exit_rule().exit_id().find(&record_id).is_some() { ctx.db.exit_rule().exit_id().update(value); } else { ctx.db.exit_rule().insert(value); }
        }
        "world_triggers" => {
            let conditions_json = json_string(row.get("conditions_json"), "{}"); let actions_json = json_string(row.get("actions_json"), "[]");
            serde_json::from_str::<Value>(&conditions_json).map_err(|_| "Trigger conditions are invalid JSON.".to_string())?; serde_json::from_str::<Vec<Value>>(&actions_json).map_err(|_| "Trigger actions must be a JSON array.".to_string())?;
            let value = WorldTrigger { id: record_id.clone(), event_kind: string(&row, "event_kind", "room_enter"), source_id: clean_optional(&row, "source_id"), conditions_json, actions_json, once_per_actor: bool_value(&row, "once_per_actor", false), active: bool_value(&row, "active", true), created_at: ctx.db.world_trigger().id().find(&record_id).map(|old| old.created_at).unwrap_or(ctx.timestamp), updated_at: ctx.timestamp };
            if ctx.db.world_trigger().id().find(&record_id).is_some() { ctx.db.world_trigger().id().update(value); } else { ctx.db.world_trigger().insert(value); }
        }
        "world_simulation_configs" => {
            let value = WorldSimulationConfig { id: record_id.clone(), mode: string(&row, "mode", "turn_driven"), tick_seconds: u32_value(&row, "tick_seconds", 5).max(1), day_length_minutes: u32_value(&row, "day_length_minutes", 60).max(1), weather_enabled: bool_value(&row, "weather_enabled", false), active: bool_value(&row, "active", false), updated_at: ctx.timestamp };
            let should_schedule = value.active && value.mode == "scheduled" && ctx.db.scheduled_world_tick().iter().next().is_none();
            if ctx.db.world_simulation_config().id().find(&record_id).is_some() { ctx.db.world_simulation_config().id().update(value.clone()); } else { ctx.db.world_simulation_config().insert(value.clone()); }
            if should_schedule { let at = ctx.timestamp + TimeDuration::from_micros(i64::from(value.tick_seconds).saturating_mul(1_000_000)); ctx.db.scheduled_world_tick().insert(ScheduledWorldTick { scheduled_id: 0, scheduled_at: at.into() }); }
        }
        _ => return Err(format!("Unsupported engine configuration table: {table_name}")),
    }
    audit(ctx, "configure", &format!("{table_name}:{record_id}"), &payload_json);
    Ok(())
}

#[spacetimedb::reducer]
pub fn delete_engine_record(ctx: &ReducerContext, table_name: String, record_id: String) -> Result<(), String> {
    ensure_profile(ctx); require_permission(ctx, table_permission(&table_name))?;
    match table_name.as_str() {
        "ability_unlock_rules" => { ctx.db.ability_unlock_rule().ability_id().delete(&record_id); }
        "object_rules" => { ctx.db.object_rule().definition_id().delete(&record_id); }
        "bank_configs" => { ctx.db.bank_config().id().delete(&record_id); }
        "vendor_restock_rules" => { ctx.db.vendor_restock_rule().vendor_stock_id().delete(&record_id); }
        "profession_definitions" => { if ctx.db.recipe_rule().iter().any(|row| row.profession_id.as_deref() == Some(&record_id)) { return Err("Profession is used by a recipe rule.".to_string()); } ctx.db.profession_definition().id().delete(&record_id); }
        "recipe_rules" => { ctx.db.recipe_rule().recipe_id().delete(&record_id); }
        "dialogue_nodes" => {
            let ids = ctx.db.dialogue_choice().iter().filter(|row| row.node_id == record_id || row.next_node_id.as_deref() == Some(record_id.as_str())).map(|row| row.id).collect::<Vec<_>>();
            for id in ids { ctx.db.dialogue_choice().id().delete(&id); }
            let actor_ids = ctx.db.actor_dialogue_state().iter().filter(|row| row.node_id == record_id).map(|row| row.actor_id).collect::<Vec<_>>();
            for actor_id in actor_ids { ctx.db.actor_dialogue_state().actor_id().delete(&actor_id); }
            ctx.db.dialogue_node().id().delete(&record_id);
        }
        "dialogue_choices" => { ctx.db.dialogue_choice().id().delete(&record_id); }
        "exit_rules" => { ctx.db.exit_rule().exit_id().delete(&record_id); }
        "world_triggers" => { ctx.db.world_trigger().id().delete(&record_id); }
        "world_simulation_configs" => { ctx.db.world_simulation_config().id().delete(&record_id); }
        _ => return Err(format!("Unsupported engine configuration table: {table_name}")),
    }
    audit(ctx, "delete", &format!("{table_name}:{record_id}"), "{}"); Ok(())
}

#[spacetimedb::reducer]
pub fn moderate_player(ctx: &ReducerContext, actor_id: String, action: String, reason: String, duration_seconds: u32) -> Result<(), String> {
    ensure_profile(ctx); require_permission(ctx, "players.moderate")?; if !actor_exists(ctx, &actor_id) { return Err("Actor does not exist.".to_string()); }
    if action == "clear" { let ids = ctx.db.player_sanction().iter().filter(|row| row.actor_id == actor_id).map(|row| row.id).collect::<Vec<_>>(); for id in ids { ctx.db.player_sanction().id().delete(&id); } }
    else if matches!(action.as_str(), "ban" | "mute") { let id = format!("{actor_id}::{action}"); let row = PlayerSanction { id: id.clone(), scope: "world".to_string(), actor_id: actor_id.clone(), sanction_kind: action.clone(), reason, expires_at_micros: if duration_seconds == 0 { 0 } else { ctx.timestamp.to_micros_since_unix_epoch().saturating_add(i64::from(duration_seconds).saturating_mul(1_000_000)) }, issued_by_profile_id: require_profile(ctx)?.id, created_at: ctx.timestamp }; if ctx.db.player_sanction().id().find(&id).is_some() { ctx.db.player_sanction().id().update(row); } else { ctx.db.player_sanction().insert(row); } }
    else if action == "kick" { /* A kick is represented as an audited forced return to the creation chamber. */ move_actor_to_room(ctx, &actor_id, CREATION_ROOM_ID)?; }
    else { return Err("Moderation action must be ban, mute, kick, or clear.".to_string()); }
    audit(ctx, &format!("moderation.{action}"), &actor_id, "{}"); Ok(())
}

#[spacetimedb::reducer]
pub fn resolve_player_report(ctx: &ReducerContext, report_id: String, status: String) -> Result<(), String> {
    ensure_profile(ctx); require_permission(ctx, "players.moderate")?; if !matches!(status.as_str(), "open" | "resolved" | "dismissed") { return Err("Invalid report status.".to_string()); }
    let row = ctx.db.player_report().id().find(&report_id).ok_or_else(|| "Report does not exist.".to_string())?; ctx.db.player_report().id().update(PlayerReport { status: status.clone(), updated_at: ctx.timestamp, ..row }); audit(ctx, "report.resolve", &report_id, &status); Ok(())
}

#[spacetimedb::reducer]
pub fn save_world_snapshot(ctx: &ReducerContext, snapshot_id: String, name: String, content_json: String) -> Result<(), String> {
    ensure_profile(ctx); require_permission(ctx, "world.manage")?; serde_json::from_str::<Value>(&content_json).map_err(|error| format!("Snapshot is not valid JSON: {error}"))?;
    if content_json.len() > 16_000_000 { return Err("Snapshot exceeds the 16 MB safety limit.".to_string()); }
    let row = WorldSnapshot { id: snapshot_id.clone(), scope: "world".to_string(), name, schema_version: 1, content_json, created_by_profile_id: require_profile(ctx)?.id, created_at: ctx.timestamp };
    if ctx.db.world_snapshot().id().find(&snapshot_id).is_some() { ctx.db.world_snapshot().id().update(row); } else { ctx.db.world_snapshot().insert(row); } audit(ctx, "snapshot.save", &snapshot_id, "{}"); Ok(())
}

#[spacetimedb::reducer]
pub fn delete_world_snapshot(ctx: &ReducerContext, snapshot_id: String) -> Result<(), String> { ensure_profile(ctx); require_permission(ctx, "world.manage")?; ctx.db.world_snapshot().id().delete(&snapshot_id); audit(ctx, "snapshot.delete", &snapshot_id, "{}"); Ok(()) }

fn add_issue(ctx: &ReducerContext, severity: &str, category: &str, record_id: &str, message: String) {
    let id = format!("{category}:{record_id}:{}", normalized_key(&message));
    ctx.db.content_issue().insert(ContentIssue { id, severity: severity.to_string(), category: category.to_string(), record_id: record_id.to_string(), message, detected_at: ctx.timestamp });
}

#[spacetimedb::reducer]
pub fn validate_world_content(ctx: &ReducerContext) -> Result<(), String> {
    ensure_profile(ctx); require_admin(ctx)?; let ids = ctx.db.content_issue().iter().map(|row| row.id).collect::<Vec<_>>(); for id in ids { ctx.db.content_issue().id().delete(&id); }
    for room in ctx.db.room().iter() { if room.region_name.as_ref().map(|id| ctx.db.region().name().find(id).is_none()).unwrap_or(false) { add_issue(ctx, "error", "room", &room.id, "Room references a missing region.".to_string()); } }
    for exit in ctx.db.exit().iter() { if exit.from_room.as_ref().map(|id| ctx.db.room().id().find(id).is_none()).unwrap_or(true) || exit.to_room.as_ref().map(|id| ctx.db.room().id().find(id).is_none()).unwrap_or(true) { add_issue(ctx, "error", "exit", &exit.id, "Exit has a missing endpoint.".to_string()); } }
    for npc in ctx.db.npc().iter() { if npc.current_room.as_ref().map(|id| ctx.db.room().id().find(id).is_none()).unwrap_or(true) { add_issue(ctx, "warning", "npc", &npc.id, "NPC is not placed in a valid room.".to_string()); } if let Some(route) = npc.patrol_route.as_ref().and_then(|value| serde_json::from_str::<Vec<String>>(value).ok()) { for pair in route.windows(2) { if !ctx.db.exit().iter().any(|exit| exit.from_room.as_ref() == pair.first() && exit.to_room.as_ref() == pair.get(1)) { add_issue(ctx, "warning", "npc", &npc.id, format!("Patrol has no directed exit from {} to {}.", pair[0], pair[1])); } } } }
    for quest in ctx.db.quest_definition().iter() { if ctx.db.npc().id().find(&quest.quest_giver_npc_id).is_none() || ctx.db.npc().id().find(&quest.turn_in_npc_id).is_none() { add_issue(ctx, "error", "quest", &quest.id, "Quest giver or turn-in NPC is missing.".to_string()); } if ctx.db.quest_objective().iter().all(|row| row.quest_id != quest.id) { add_issue(ctx, "warning", "quest", &quest.id, "Quest has no objectives.".to_string()); } }
    for choice in ctx.db.quest_choice().iter() { if choice.next_quest_id.as_ref().map(|id| ctx.db.quest_definition().id().find(id).is_none()).unwrap_or(false) { add_issue(ctx, "error", "quest_choice", &choice.id, "Choice points to a missing follow-up quest.".to_string()); } }
    for stock in ctx.db.vendor_stock().iter() { if ctx.db.vendor_definition().id().find(&stock.vendor_id).is_none() || ctx.db.object_definition().id().find(&stock.definition_id).is_none() { add_issue(ctx, "error", "vendor_stock", &stock.id, "Vendor stock has a missing vendor or object.".to_string()); } }
    for recipe in ctx.db.crafting_recipe().iter() { if ctx.db.object_definition().id().find(&recipe.output_definition_id).is_none() { add_issue(ctx, "error", "recipe", &recipe.id, "Recipe output is missing.".to_string()); } }
    if let Some(start) = ctx.db.room().iter().next() { let reachable = room_distances(ctx, &start.id); for room in ctx.db.room().iter() { if !reachable.contains_key(&room.id) { add_issue(ctx, "warning", "room", &room.id, format!("Room is unreachable from {} when exits are treated bidirectionally.", start.name)); } } }
    audit(ctx, "content.validate", "world", "{}"); Ok(())
}
