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

fn seed_world(ctx: &ReducerContext) {
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
                    ctx.db.character().id().delete(&id);
                }
            }
        }
        "profiles" => delete_current_account(ctx)?,
        "regions" => {
            require_admin(ctx)?;
            for id in ids { ctx.db.region().name().delete(&id); }
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
            for id in ids { ctx.db.npc().id().delete(&id); }
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
    for id in owned_characters { ctx.db.character().id().delete(&id); }
    let owned_commands = ctx.db.command().iter().filter(|row| row.owner == ctx.sender()).map(|row| row.id).collect::<Vec<_>>();
    for id in owned_commands { ctx.db.command().id().delete(&id); }
    let deleted_admin = profile.as_ref().map(|profile| profile.is_admin).unwrap_or(false);
    if let Some(profile) = profile {
        ctx.db.profile().id().delete(&profile.id);
    }
    if deleted_admin {
        if let Some(successor) = ctx.db.profile().iter().min_by_key(|profile| profile.created_at) {
            ctx.db.profile().id().update(Profile { is_admin: true, ..successor });
        }
    }
    Ok(())
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
