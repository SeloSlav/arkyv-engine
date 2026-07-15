//! Arkyv Engine's authoritative SpacetimeDB module.
//!
//! Browser identities are issued by SpacetimeDB and persisted in localStorage by
//! the client. All persistent game state and mutations live in this module.

use serde_json::Value;
use spacetimedb::{reducer, Identity, ReducerContext, Table, Timestamp};

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
    if profile_for(ctx, ctx.sender()).is_some() {
        return;
    }

    let id = identity_id(ctx.sender());
    let is_admin = !ctx.db.profile().iter().any(|profile| profile.is_admin);
    let short_id = id.chars().take(8).collect::<String>();
    ctx.db.profile().insert(Profile {
        id: id.clone(),
        owner: ctx.sender(),
        user_id: id,
        created_at: ctx.timestamp,
        description: None,
        current_room: Some(CREATION_ROOM_ID.to_string()),
        handle: Some(format!("Traveler-{short_id}")),
        name: None,
        membership_tier: Some("local".to_string()),
        is_admin,
    });
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
    let stats = [
        ("health", "Health", "How much harm an actor can withstand.", "health", 0, 9999, 20),
        ("strength", "Strength", "Physical power used by weapons and heavy actions.", "power", 0, 999, 3),
        ("defense", "Defense", "Innate resistance before equipped armor is applied.", "defense", 0, 999, 0),
    ];
    for (id, name, description, role, minimum, maximum, default_value) in stats {
        let id = id.to_string();
        if ctx.db.stat_definition().id().find(&id).is_none() {
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
            });
        }
    }

    let definitions = [
        ObjectDefinition {
            id: "wood".to_string(), name: "Firewood".to_string(), description: "A dry split log suitable for fuel.".to_string(),
            primitive_kind: "item".to_string(), icon: "🪵".to_string(), tags: r#"["fuel","wood"]"#.to_string(),
            portable: true, stackable: true, max_stack: 20, capacity: 0, equipment_slot: None,
            weapon_damage: 0, armor_value: 0, scales_with_stat: None, fuel_value: 300, burn_rate: 0,
            accepted_fuel_tags: "[]".to_string(), stat_modifiers: "{}".to_string(), on_use: "{}".to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
        },
        ObjectDefinition {
            id: "wooden-box".to_string(), name: "Wooden Box".to_string(), description: "A simple container for loose possessions.".to_string(),
            primitive_kind: "container".to_string(), icon: "📦".to_string(), tags: r#"["container","wood"]"#.to_string(),
            portable: true, stackable: false, max_stack: 1, capacity: 12, equipment_slot: None,
            weapon_damage: 0, armor_value: 0, scales_with_stat: None, fuel_value: 0, burn_rate: 0,
            accepted_fuel_tags: "[]".to_string(), stat_modifiers: "{}".to_string(), on_use: "{}".to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
        },
        ObjectDefinition {
            id: "campfire".to_string(), name: "Campfire".to_string(), description: "A stone-ringed fire that burns while it has fuel.".to_string(),
            primitive_kind: "fixture".to_string(), icon: "🔥".to_string(), tags: r#"["fire","light"]"#.to_string(),
            portable: false, stackable: false, max_stack: 1, capacity: 0, equipment_slot: None,
            weapon_damage: 0, armor_value: 0, scales_with_stat: None, fuel_value: 0, burn_rate: 1,
            accepted_fuel_tags: r#"["fuel"]"#.to_string(), stat_modifiers: "{}".to_string(), on_use: "{}".to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
        },
        ObjectDefinition {
            id: "iron-sword".to_string(), name: "Iron Sword".to_string(), description: "A dependable one-handed blade.".to_string(),
            primitive_kind: "weapon".to_string(), icon: "⚔️".to_string(), tags: r#"["weapon","blade"]"#.to_string(),
            portable: true, stackable: false, max_stack: 1, capacity: 0, equipment_slot: Some("main-hand".to_string()),
            weapon_damage: 5, armor_value: 0, scales_with_stat: Some("strength".to_string()), fuel_value: 0, burn_rate: 0,
            accepted_fuel_tags: "[]".to_string(), stat_modifiers: "{}".to_string(), on_use: "{}".to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
        },
        ObjectDefinition {
            id: "leather-armor".to_string(), name: "Leather Armor".to_string(), description: "Flexible protection made from boiled leather.".to_string(),
            primitive_kind: "armor".to_string(), icon: "🛡️".to_string(), tags: r#"["armor","leather"]"#.to_string(),
            portable: true, stackable: false, max_stack: 1, capacity: 0, equipment_slot: Some("body".to_string()),
            weapon_damage: 0, armor_value: 2, scales_with_stat: None, fuel_value: 0, burn_rate: 0,
            accepted_fuel_tags: "[]".to_string(), stat_modifiers: "{}".to_string(), on_use: "{}".to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
        },
        ObjectDefinition {
            id: "healing-potion".to_string(), name: "Healing Potion".to_string(), description: "A crimson restorative draught.".to_string(),
            primitive_kind: "consumable".to_string(), icon: "🧪".to_string(), tags: r#"["consumable","potion"]"#.to_string(),
            portable: true, stackable: true, max_stack: 10, capacity: 0, equipment_slot: None,
            weapon_damage: 0, armor_value: 0, scales_with_stat: None, fuel_value: 0, burn_rate: 0,
            accepted_fuel_tags: "[]".to_string(), stat_modifiers: "{}".to_string(),
            on_use: r#"{"stat_id":"health","delta":8,"consume":true}"#.to_string(),
            created_at: ctx.timestamp, updated_at: ctx.timestamp,
        },
    ];
    for definition in definitions {
        if ctx.db.object_definition().id().find(&definition.id).is_none() {
            ctx.db.object_definition().insert(definition);
        }
    }
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
        });
    }
}

#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    seed_world(ctx);
}

#[reducer(client_connected)]
pub fn client_connected(ctx: &ReducerContext) {
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
                ctx.db.character().insert(Character {
                    id,
                    owner: ctx.sender(),
                    user_id,
                    name,
                    current_room: optional_string(&row, "current_room").or_else(|| Some(STARTING_ROOM_ID.to_string())),
                    created_at: ctx.timestamp,
                    description: optional_string(&row, "description"),
                });
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
                ctx.db.actor_stat().insert(ActorStat { id, actor_id, stat_definition_id, base_value, current_value, updated_at: ctx.timestamp });
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
                ctx.db.npc().insert(Npc {
                    id,
                    name: string(&row, "name", "Unnamed NPC"),
                    description: optional_string(&row, "description"),
                    current_room: optional_string(&row, "current_room"),
                    dialogue_tree: row.get("dialogue_tree").filter(|value| !value.is_null()).map(|value| json_string(Some(value), "{}")),
                    faction: optional_string(&row, "faction"),
                    behavior_type: string(&row, "behavior_type", "static"),
                    created_at: ctx.timestamp,
                    alias: optional_string(&row, "alias"),
                    greeting_behavior: string(&row, "greeting_behavior", "none"),
                    portrait_url: optional_string(&row, "portrait_url"),
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
                ctx.db.actor_stat().id().update(ActorStat { base_value, current_value, updated_at: ctx.timestamp, ..existing });
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
                ctx.db.npc().id().update(Npc {
                    name: payload.get("name").and_then(Value::as_str).unwrap_or(&existing.name).to_string(),
                    description: payload.get("description").map(|_| optional_string(&payload, "description")).unwrap_or(existing.description),
                    current_room: payload.get("current_room").map(|_| optional_string(&payload, "current_room")).unwrap_or(existing.current_room),
                    dialogue_tree: payload.get("dialogue_tree").map(|value| if value.is_null() { None } else { Some(json_string(Some(value), "{}")) }).unwrap_or(existing.dialogue_tree),
                    faction: payload.get("faction").map(|_| optional_string(&payload, "faction")).unwrap_or(existing.faction),
                    behavior_type: payload.get("behavior_type").and_then(Value::as_str).unwrap_or(&existing.behavior_type).to_string(),
                    alias: payload.get("alias").map(|_| optional_string(&payload, "alias")).unwrap_or(existing.alias),
                    greeting_behavior: payload.get("greeting_behavior").and_then(Value::as_str).unwrap_or(&existing.greeting_behavior).to_string(),
                    portrait_url: payload.get("portrait_url").map(|_| optional_string(&payload, "portrait_url")).unwrap_or(existing.portrait_url),
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
            for id in ids { ctx.db.region().name().delete(&id); }
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
                ctx.db.stat_definition().id().delete(&id);
            }
        }
        "object_definitions" => {
            require_admin(ctx)?;
            for id in ids {
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
        "rooms" => {
            require_admin(ctx)?;
            for id in ids {
                let exits = ctx.db.exit().iter().filter(|exit| exit.from_room.as_deref() == Some(id.as_str()) || exit.to_room.as_deref() == Some(id.as_str())).map(|exit| exit.id).collect::<Vec<_>>();
                for exit_id in exits { ctx.db.exit().id().delete(&exit_id); }
                ctx.db.room().id().delete(&id);
            }
        }
        "npcs" => {
            require_admin(ctx)?;
            for id in ids {
                delete_actor_rpg_state(ctx, &id);
                ctx.db.npc().id().delete(&id);
            }
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

fn actor_stat_row(ctx: &ReducerContext, actor_id: &str, definition: &StatDefinition) -> ActorStat {
    let id = actor_stat_id(actor_id, &definition.id);
    ctx.db.actor_stat().id().find(&id).unwrap_or(ActorStat {
        id,
        actor_id: actor_id.to_string(),
        stat_definition_id: definition.id.clone(),
        base_value: definition.default_value,
        current_value: definition.default_value,
        updated_at: ctx.timestamp,
    })
}

fn equipment_stat_bonus(ctx: &ReducerContext, actor_id: &str, stat_id: &str) -> i32 {
    ctx.db.world_object().iter()
        .filter(|object| object.location_kind == "equipped" && object.location_id == actor_id)
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
    row.current_value = value.clamp(definition.minimum, definition.maximum);
    row.updated_at = ctx.timestamp;
    if exists {
        ctx.db.actor_stat().id().update(row);
    } else {
        ctx.db.actor_stat().insert(row);
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

fn rpg_message(ctx: &ReducerContext, room_id: &str, actor_id: &str, kind: &str, body: String) {
    add_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), None, None, kind, body, None, None);
}

fn list_inventory(ctx: &ReducerContext, room_id: &str, actor_id: &str) {
    let mut inventory = Vec::new();
    let mut equipment = Vec::new();
    for object in ctx.db.world_object().iter().filter(|object| object.location_id == actor_id) {
        let Some(definition) = object_definition_for(ctx, &object) else { continue };
        let label = if object.quantity > 1 { format!("{} {} ×{}", definition.icon, definition.name, object.quantity) } else { format!("{} {}", definition.icon, definition.name) };
        if object.location_kind == "equipped" {
            equipment.push(format!("• {} [{}]", label, object.equipped_slot.clone().unwrap_or_else(|| "equipped".to_string())));
        } else if object.location_kind == "inventory" {
            inventory.push(format!("• {label}"));
        }
    }
    let mut sections = Vec::new();
    sections.push(if inventory.is_empty() { "[INVENTORY]\n• Empty".to_string() } else { format!("[INVENTORY]\n{}", inventory.join("\n")) });
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
        if bonus == 0 {
            format!("• {}: {}/{}", definition.name, row.current_value, definition.maximum)
        } else {
            format!("• {}: {} ({:+} equipment) / {}", definition.name, row.current_value.saturating_add(bonus), bonus, definition.maximum)
        }
    }).collect::<Vec<_>>();
    rpg_message(ctx, room_id, actor_id, "system", format!("[HERO STATS]\n{}", lines.join("\n")));
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
    if definition.capacity > 0 {
        let contents = ctx.db.world_object().iter()
            .filter(|child| child.location_kind == "container" && child.location_id == object.id)
            .filter_map(|child| object_definition_for(ctx, &child).map(|child_definition| format!("• {} {} ×{}", child_definition.icon, child_definition.name, child.quantity)))
            .collect::<Vec<_>>();
        lines.push(if contents.is_empty() { "[CONTENTS]\n• Empty".to_string() } else { format!("[CONTENTS]\n{}", contents.join("\n")) });
    }
    rpg_message(ctx, room_id, actor_id, "system", lines.join("\n\n"));
}

fn target_actor_in_room(ctx: &ReducerContext, room_id: &str, actor_id: &str, query: &str) -> Option<(String, String)> {
    let query = query.trim();
    ctx.db.npc().iter()
        .find(|npc| npc.current_room.as_deref() == Some(room_id)
            && (npc.name.eq_ignore_ascii_case(query) || npc.alias.as_deref().map(|alias| alias.eq_ignore_ascii_case(query)).unwrap_or(false)))
        .map(|npc| (npc.id, npc.name))
        .or_else(|| ctx.db.character().iter()
            .find(|character| character.id != actor_id && character.current_room.as_deref() == Some(room_id) && character.name.eq_ignore_ascii_case(query))
            .map(|character| (character.id, character.name)))
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
    let lower = raw.to_lowercase();

    if matches!(lower.as_str(), "inventory" | "inv" | "i" | "equipment") {
        list_inventory(ctx, room_id, actor_id);
        return Ok(true);
    }
    if matches!(lower.as_str(), "stats" | "status" | "sheet") {
        list_stats(ctx, room_id, actor_id);
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
            let Some((object, definition)) = find_object_at(ctx, "container", &container.id, item_query.trim()) else {
                rpg_message(ctx, room_id, actor_id, "error", format!("{} does not contain that.", container_definition.name));
                return Ok(true);
            };
            if !definition.portable {
                rpg_message(ctx, room_id, actor_id, "error", format!("{} cannot be carried.", definition.name));
                return Ok(true);
            }
            ctx.db.world_object().id().update(WorldObject {
                location_kind: "inventory".to_string(), location_id: actor_id.to_string(), equipped_slot: None,
                updated_at: ctx.timestamp, ..object
            });
            rpg_message(ctx, room_id, actor_id, "system", format!("You take {} from {}.", definition.name, container_definition.name));
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
        ctx.db.world_object().id().update(WorldObject {
            location_kind: "inventory".to_string(), location_id: actor_id.to_string(), equipped_slot: None,
            is_active: false, updated_at: ctx.timestamp, ..object
        });
        rpg_message(ctx, room_id, actor_id, "system", format!("You take {}.", definition.name));
        return Ok(true);
    }

    if let Some(query) = lower.strip_prefix("drop ") {
        let Some((object, definition)) = find_carried_object(ctx, actor_id, query.trim()) else {
            rpg_message(ctx, room_id, actor_id, "error", format!("You are not carrying \"{}\".", query.trim()));
            return Ok(true);
        };
        ctx.db.world_object().id().update(WorldObject {
            location_kind: "room".to_string(), location_id: room_id.to_string(), equipped_slot: None,
            is_active: false, updated_at: ctx.timestamp, ..object
        });
        rpg_message(ctx, room_id, actor_id, "system", format!("You drop {}.", definition.name));
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
        let occupied = ctx.db.world_object().iter().find(|item| item.location_kind == "equipped" && item.location_id == actor_id && item.equipped_slot.as_deref() == Some(slot.as_str()));
        if let Some(occupied) = occupied {
            ctx.db.world_object().id().update(WorldObject {
                location_kind: "inventory".to_string(), equipped_slot: None, updated_at: ctx.timestamp, ..occupied
            });
        }
        ctx.db.world_object().id().update(WorldObject {
            location_kind: "equipped".to_string(), equipped_slot: Some(slot.clone()), updated_at: ctx.timestamp, ..object
        });
        rpg_message(ctx, room_id, actor_id, "system", format!("You equip {} in your {} slot.", definition.name, slot));
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
        return Ok(true);
    }

    if let Some(query) = lower.strip_prefix("attack ") {
        let Some(health_definition) = stat_definition_by_role(ctx, "health") else {
            rpg_message(ctx, room_id, actor_id, "error", "Combat is not configured: create a stat with the Health role.".to_string());
            return Ok(true);
        };
        let Some((target_id, target_name)) = target_actor_in_room(ctx, room_id, actor_id, query.trim()) else {
            rpg_message(ctx, room_id, actor_id, "error", format!("There is no attackable target named \"{}\" here.", query.trim()));
            return Ok(true);
        };
        let equipped_weapon = ctx.db.world_object().iter()
            .filter(|object| object.location_kind == "equipped" && object.location_id == actor_id)
            .filter_map(|object| object_definition_for(ctx, &object))
            .find(|definition| definition.weapon_damage > 0);
        let mut attack = equipped_weapon.as_ref().map(|weapon| weapon.weapon_damage).unwrap_or(1);
        if let Some(stat_id) = equipped_weapon.as_ref().and_then(|weapon| weapon.scales_with_stat.clone()) {
            if let Some(definition) = ctx.db.stat_definition().id().find(&stat_id) {
                attack = attack.saturating_add(actor_stat_value(ctx, actor_id, &definition));
            }
        } else if let Some(power) = stat_definition_by_role(ctx, "power") {
            attack = attack.saturating_add(actor_stat_value(ctx, actor_id, &power));
        }
        let innate_defense = stat_definition_by_role(ctx, "defense").map(|definition| actor_stat_value(ctx, &target_id, &definition)).unwrap_or(0);
        let armor = ctx.db.world_object().iter()
            .filter(|object| object.location_kind == "equipped" && object.location_id == target_id)
            .filter_map(|object| object_definition_for(ctx, &object))
            .map(|definition| definition.armor_value)
            .sum::<i32>();
        let damage = attack.saturating_sub(innate_defense.saturating_add(armor)).max(1);
        let current_health = actor_stat_row(ctx, &target_id, &health_definition).current_value;
        let next_health = current_health.saturating_sub(damage).max(health_definition.minimum);
        set_actor_stat_current(ctx, &target_id, &health_definition, next_health);
        let weapon_name = equipped_weapon.map(|weapon| weapon.name).unwrap_or_else(|| "bare hands".to_string());
        let result = if next_health <= health_definition.minimum { format!(" {target_name} is defeated.") } else { format!(" {target_name} has {next_health} {} remaining.", health_definition.name) };
        add_message(ctx, Some(room_id.to_string()), Some(actor_id.to_string()), Some(actor_name.to_string()), None, "combat",
            format!("{actor_name} attacks {target_name} with {weapon_name} for {damage} damage.{result}"), None, None);
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
    let room_id = room_id.ok_or_else(|| "A room is required.".to_string())?;
    let raw = raw.trim().to_string();
    ctx.db.command().insert(Command {
        id: command_id.clone(), owner: ctx.sender(), character_id: character_id.clone(), room_id: Some(room_id.clone()),
        raw: raw.clone(), created_at: ctx.timestamp, processed_at: None, conversation_history,
        user_id: if is_profile { Some(identity_id(ctx.sender())) } else { None },
    });

    if handle_rpg_command(ctx, &raw, &room_id, &actor_id, &actor_name)? {
        finish_command(ctx, &command_id);
        return Ok(());
    }

    if raw == "help" {
        add_message(ctx, Some(room_id), Some(actor_id.clone()), None, None, "system", "[AVAILABLE COMMANDS]\n\n• say <message> - Speak to everyone in the room\n• whisper <name> <message> - Send a private message\n• look - Examine your current location\n• talk <npc> <message> - Speak to an AI-powered NPC\n• who - See who is nearby\n• inspect <name> - Inspect a character\n• set handle <name> - Set your saved-world handle\n• <direction> - Move through an exit".to_string(), None, None);
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
            let region_label = room.region_name.as_ref().and_then(|name| ctx.db.region().name().find(name)).and_then(|region| region.display_name).or(room.region_name.clone());
            let heading = region_label.map(|region| format!("{} ({})", room.name.to_uppercase(), region.to_uppercase())).unwrap_or_else(|| room.name.to_uppercase());
            let mut body = room.image_url.as_ref().map(|url| format!("[IMAGE:{url}]\n")).unwrap_or_default();
            body.push_str(&format!("[LOCATION:{heading}]\n{}", room.description));
            let characters = ctx.db.character().iter().filter(|row| row.current_room.as_deref() == Some(room_id.as_str()) && row.id != actor_id).map(|row| format!("• {}", row.name)).collect::<Vec<_>>();
            if !characters.is_empty() { body.push_str(&format!("\n\n[CHARACTERS]\n{}", characters.join("\n"))); }
            let npcs = ctx.db.npc().iter().filter(|row| row.current_room.as_deref() == Some(room_id.as_str())).map(|row| format!("• {} [{}] - {}", row.name, row.alias.unwrap_or_default(), row.description.unwrap_or_default())).collect::<Vec<_>>();
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
        let npcs = ctx.db.npc().iter().filter(|row| row.current_room.as_deref() == Some(room_id.as_str())).map(|row| format!("• {} (talk {})", row.name, row.alias.unwrap_or_default())).collect::<Vec<_>>();
        if !npcs.is_empty() { lines.push(format!("[NPCs]\n{}", npcs.join("\n"))); }
        add_message(ctx, Some(room_id), Some(actor_id.clone()), None, None, "system", if lines.is_empty() { "You are alone here.".to_string() } else { lines.join("\n\n") }, None, None);
    } else if let Some(target) = raw.strip_prefix("inspect ") {
        let target = target.trim();
        let result = ctx.db.character().iter().find(|row| row.current_room.as_deref() == Some(room_id.as_str()) && row.name.eq_ignore_ascii_case(target));
        let body = result.map(|row| format!("[{}]\n{}", row.name.to_uppercase(), row.description.unwrap_or_else(|| "A persona inhabiting the Arkyv.".to_string()))).unwrap_or_else(|| "No one by that name is here.".to_string());
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
        if let Some(npc) = ctx.db.npc().iter().find(|npc| npc.current_room.as_deref() == Some(room_id.as_str()) && npc.alias.as_deref().map(|value| value.eq_ignore_ascii_case(alias)).unwrap_or(false)) {
            add_message(ctx, Some(room_id), Some(actor_id), None, None, "npc_typing", format!("{} is thinking...", npc.name), None, None);
            return Ok(());
        }
        add_message(ctx, Some(room_id), Some(actor_id.clone()), None, None, "system", format!("There is no one named \"{alias}\" here to talk to. Use 'who' to see who's present."), None, None);
    } else if raw == "__GREET" {
        for npc in ctx.db.npc().iter().filter(|npc| npc.current_room.as_deref() == Some(room_id.as_str()) && npc.greeting_behavior != "none") {
            let private = !is_profile && npc.greeting_behavior == "private";
            add_message(ctx, Some(room_id.clone()), Some(actor_id.clone()), None, if private { character_id.clone() } else { None }, if private { "npc_whisper" } else { "npc_speech" }, if private { format!("{} whispers to you: \"Welcome, {}.\"", npc.name, actor_name) } else { format!("{}: \"Welcome, {}.\"", npc.name, actor_name) }, None, None);
        }
    } else if let Some(exit) = ctx.db.exit().iter().find(|exit| exit.from_room.as_deref() == Some(room_id.as_str()) && exit.verb.eq_ignore_ascii_case(&raw)) {
        if let Some(destination) = exit.to_room {
            if is_profile {
                if let Some(profile) = ctx.db.profile().id().find(&actor_id) { ctx.db.profile().id().update(Profile { current_room: Some(destination.clone()), ..profile }); }
            } else if let Some(character) = ctx.db.character().id().find(&actor_id) {
                ctx.db.character().id().update(Character { current_room: Some(destination.clone()), ..character });
            }
            add_message(ctx, Some(destination), Some(actor_id), Some(actor_name.clone()), None, "system", format!("{actor_name} arrives."), None, None);
        }
    } else {
        add_message(ctx, Some(room_id), Some(actor_id), None, None, "system", format!("You cannot go \"{raw}\" from here. Type \"exits\" to see available directions."), None, None);
    }
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
