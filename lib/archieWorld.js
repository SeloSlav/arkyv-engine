import {
  ENGINE_SYSTEM_TABLES,
  WORLD_CONTENT_PRIMARY_KEYS,
  WORLD_CONTENT_TABLES,
  selectExportableNpcStats,
  selectExportableWorldObjects,
} from '@/lib/worldContentBundle';

// Archie authors game content, never administrator roles or live player state.
export const ARCHIE_CONTENT_TABLES = WORLD_CONTENT_TABLES.filter(
  (table) => table !== 'admin_role_definitions',
);

export const ARCHIE_ENGINE_TABLES = new Set(ENGINE_SYSTEM_TABLES);
export const ARCHIE_PRIMARY_KEYS = {
  ...WORLD_CONTENT_PRIMARY_KEYS,
  regions: 'name',
};

const ENRICHED_FIELDS = new Set([
  'owner',
  'rooms',
  'regions',
  'actors',
  'npcs',
  'object_definitions',
  'stat_definitions',
  'ability_definitions',
  'faction_definitions',
  'quest_definitions',
  'quest_giver',
  'turn_in_npc',
  'required_faction',
  'reputation_faction',
]);

export const ARCHIE_TABLE_GUIDES = {
  regions: {
    purpose: 'World-map regions. Rooms reference the stable region name.',
    required: ['name'],
    notes: 'Use display_name for the player-facing name and color_scheme as a JSON color object.',
  },
  rooms: {
    purpose: 'Playable locations.',
    required: ['id', 'name', 'description'],
    notes: 'Set region and region_name to an existing region name. height is the map floor, usually 0.',
  },
  exits: {
    purpose: 'Directed connections between rooms.',
    required: ['id', 'from_room', 'to_room', 'verb'],
    notes: 'Create two rows with opposite verbs for a two-way connection. Common verbs are north, south, east, west, up, and down.',
  },
  npcs: {
    purpose: 'Non-player characters placed in rooms.',
    required: ['id', 'name', 'alias', 'description', 'current_room'],
    notes: 'Use stable lowercase aliases. authored_reply supplies non-AI dialogue; dialogue nodes can provide branching conversation.',
  },
  dialogue_nodes: {
    purpose: 'Admin-authored NPC dialogue nodes.',
    required: ['id', 'npc_id', 'text'],
    notes: 'Exactly one normal entry node per NPC is recommended. Requirements are optional.',
  },
  dialogue_choices: {
    purpose: 'Player choices connecting dialogue nodes and optional game actions.',
    required: ['id', 'node_id', 'label'],
    notes: 'next_node_id may be null to end. Supported actions are visible in existing examples.',
  },
  object_definitions: {
    purpose: 'Item and fixture templates.',
    required: ['id', 'name', 'description'],
    notes: 'Merchant value is object_rules.base_value. Containers and stations use the existing container/fuel fields.',
  },
  object_rules: {
    purpose: 'Advanced value, equipment, durability, rarity, and trade rules for an item definition.',
    required: ['definition_id'],
    notes: 'base_value is the default merchant value; tradeable controls whether players may trade it.',
  },
  world_objects: {
    purpose: 'Physical item or fixture stacks placed in rooms or containers.',
    required: ['id', 'definition_id', 'location_kind', 'location_id'],
    notes: 'Use location_kind room with a room id, or container with another world object id.',
  },
  loot_table_entries: {
    purpose: 'NPC loot drops.',
    required: ['id', 'npc_id', 'definition_id'],
    notes: 'Inspect existing rows for chance and quantity field conventions.',
  },
  stat_definitions: {
    purpose: 'Reusable actor stats and resources.',
    required: ['id', 'name'],
    notes: 'Prefer inspecting existing definitions before adding a new combat stat.',
  },
  actor_stats: {
    purpose: 'NPC stat overrides included with authored world content.',
    required: ['id', 'actor_id', 'stat_definition_id'],
    notes: 'Archie must only author values for NPC actor ids, never player ids.',
  },
  progression_configs: {
    purpose: 'World-level leveling and experience rules.',
    required: ['id'],
    notes: 'Usually update the existing world record instead of creating another.',
  },
  equipment_slot_definitions: {
    purpose: 'Wearable equipment slots.',
    required: ['id', 'name'],
    notes: 'Use a stable slot id referenced by equipment grants.',
  },
  ability_definitions: {
    purpose: 'Combat and utility abilities.',
    required: ['id', 'name', 'description'],
    notes: 'Effects belong in ability_effect_definitions.',
  },
  ability_effect_definitions: {
    purpose: 'Ordered effects executed by an ability.',
    required: ['id', 'ability_id'],
    notes: 'Inspect existing effects for supported effect kinds and numeric fields.',
  },
  world_combat_configs: {
    purpose: 'World-level combat timing and balance rules.',
    required: ['id'],
    notes: 'Usually update the existing world record.',
  },
  faction_definitions: {
    purpose: 'Political and social factions with reputation thresholds.',
    required: ['id', 'name', 'description'],
    notes: 'NPCs and quests may reference faction ids.',
  },
  quest_definitions: {
    purpose: 'Quest metadata, giver, turn-in target, prerequisites, and rewards.',
    required: ['id', 'title', 'description'],
    notes: 'Add objectives separately. Use existing quest rows as the complete field template.',
  },
  quest_objectives: {
    purpose: 'Ordered goals belonging to quests.',
    required: ['id', 'quest_id'],
    notes: 'Inspect examples for supported objective kinds such as visit, kill, collect, and talk.',
  },
  quest_item_rewards: {
    purpose: 'Item stacks awarded when a quest completes.',
    required: ['id', 'quest_id', 'definition_id'],
    notes: 'The definition must exist before the reward.',
  },
  quest_rules: {
    purpose: 'Repeatability, level, option, faction, and prerequisite quest rules.',
    required: ['quest_id'],
    notes: 'One rule record per quest.',
  },
  quest_choices: {
    purpose: 'Quest completion choices and branching consequences.',
    required: ['id', 'quest_id'],
    notes: 'Inspect existing choices for supported action fields.',
  },
  character_option_definitions: {
    purpose: 'Admin-authored origins, callings, backgrounds, or other creation choices.',
    required: ['id', 'option_kind', 'name', 'description'],
    notes: 'Grants are separate character_option_grants records.',
  },
  character_option_grants: {
    purpose: 'Stats, items, abilities, factions, recipes, or professions granted by a character option.',
    required: ['id', 'option_id', 'grant_kind', 'reference_id'],
    notes: 'Create referenced definitions before grants.',
  },
  currency_definitions: {
    purpose: 'Currencies in addition to legacy gold.',
    required: ['id', 'name'],
    notes: 'Set tradeability and a sensible maximum balance.',
  },
  vendor_definitions: {
    purpose: 'Merchant behavior attached to NPCs.',
    required: ['id', 'npc_id'],
    notes: 'Stock and restocking are separate records.',
  },
  vendor_stocks: {
    purpose: 'Items sold and bought by a vendor.',
    required: ['id', 'vendor_id', 'definition_id'],
    notes: 'Inspect existing stock for buy/sell price and quantity conventions.',
  },
  crafting_recipes: {
    purpose: 'Crafting or timed cooking outputs.',
    required: ['id', 'name', 'output_definition_id'],
    notes: 'Timed cooking recipes select a container/station and use normal crafting_ingredients.',
  },
  crafting_ingredients: {
    purpose: 'Input item stacks consumed by a crafting or cooking recipe.',
    required: ['id', 'recipe_id', 'definition_id'],
    notes: 'Ingredients must physically be inside the selected station for timed recipes.',
  },
  recipe_rules: {
    purpose: 'Profession, learning, success, quality, and cooldown rules for recipes.',
    required: ['recipe_id'],
    notes: 'One advanced rule record per recipe.',
  },
  profession_definitions: {
    purpose: 'Admin-authored professions and their rank limits.',
    required: ['id', 'name', 'description'],
    notes: 'Recipe rules may require a profession and rank.',
  },
  vendor_restock_rules: {
    purpose: 'Timed stock replenishment for vendor stock rows.',
    required: ['vendor_stock_id'],
    notes: 'One rule per vendor stock row.',
  },
  spawn_points: {
    purpose: 'Initial spawn and respawn destinations.',
    required: ['id', 'name', 'room_id'],
    notes: 'Lifecycle policy chooses among active eligible spawn points.',
  },
  world_lifecycle_configs: {
    purpose: 'World spawn, death, respawn, inventory-loss, and protection rules.',
    required: ['id'],
    notes: 'Usually update the existing world record.',
  },
  ability_unlock_rules: {
    purpose: 'Level, quest, option, faction, prerequisite, and talent-cost rules for abilities.',
    required: ['ability_id'],
    notes: 'One advanced rule per ability.',
  },
  bank_configs: {
    purpose: 'World bank access, capacity, fees, and death-protection policy.',
    required: ['id'],
    notes: 'Usually update the existing world record.',
  },
  exit_rules: {
    purpose: 'Door, lock, key, visibility, trap, and prerequisite rules for exits.',
    required: ['exit_id'],
    notes: 'The exit must exist first. A two-way door normally needs a rule for each directed exit.',
  },
  world_triggers: {
    purpose: 'Conditional world events such as room-enter messages and actions.',
    required: ['id', 'event_kind'],
    notes: 'conditions_json and actions_json are structured JSON values.',
  },
  world_simulation_configs: {
    purpose: 'Turn-driven or scheduled world simulation settings.',
    required: ['id'],
    notes: 'Usually update the existing world record.',
  },
};

export function getArchiePrimaryKey(table) {
  return ARCHIE_PRIMARY_KEYS[table] || 'id';
}

export function stripEnrichedFields(row) {
  return Object.fromEntries(
    Object.entries(row || {}).filter(([key]) => !ENRICHED_FIELDS.has(key)),
  );
}

export async function collectArchieWorld(spacetime, tables = ARCHIE_CONTENT_TABLES) {
  const results = await Promise.all(tables.map((table) => spacetime.from(table).select('*')));
  const collected = {};
  tables.forEach((table, index) => {
    const result = results[index];
    if (result.error) throw result.error;
    collected[table] = (result.data || []).map(stripEnrichedFields);
  });
  if (collected.actor_stats) {
    collected.actor_stats = selectExportableNpcStats(collected.actor_stats, collected.npcs || []);
  }
  if (collected.world_objects) {
    collected.world_objects = selectExportableWorldObjects(collected.world_objects);
  }
  return {
    format: 'arkyv-world',
    version: 1,
    exported_at: new Date().toISOString(),
    tables: collected,
  };
}

export function summarizeArchieOperations(operations = []) {
  const summary = { inserts: 0, updates: 0, deletes: 0, configures: 0, records: 0 };
  for (const operation of operations) {
    const count = operation.records?.length || operation.ids?.length || (operation.record ? 1 : 0);
    summary.records += count;
    if (operation.action === 'insert') summary.inserts += count;
    else if (operation.action === 'update') summary.updates += count;
    else if (operation.action === 'delete' || operation.action === 'delete_engine') summary.deletes += count;
    else if (operation.action === 'configure') summary.configures += count;
  }
  return summary;
}
