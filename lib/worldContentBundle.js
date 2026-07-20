export const ENGINE_SYSTEM_TABLES = [
  'ability_unlock_rules',
  'object_rules',
  'bank_configs',
  'vendor_restock_rules',
  'profession_definitions',
  'recipe_rules',
  'dialogue_nodes',
  'dialogue_choices',
  'exit_rules',
  'world_triggers',
  'world_simulation_configs',
];

// Import order is dependency order. Keep parent definitions before records that
// reference them so the same bundle can be merged into a completely fresh world.
export const WORLD_CONTENT_TABLES = [
  'regions',
  'rooms',
  'stat_definitions',
  'object_definitions',
  'equipment_slot_definitions',
  'progression_configs',
  'world_combat_configs',
  'faction_definitions',
  'npcs',
  'actor_stats',
  'exits',
  'world_objects',
  'loot_table_entries',
  'ability_definitions',
  'ability_effect_definitions',
  'quest_definitions',
  'quest_objectives',
  'quest_item_rewards',
  'quest_rules',
  'quest_choices',
  'character_option_definitions',
  'character_option_grants',
  'currency_definitions',
  'vendor_definitions',
  'vendor_stocks',
  'crafting_recipes',
  'crafting_ingredients',
  'spawn_points',
  'world_lifecycle_configs',
  'admin_role_definitions',
  ...ENGINE_SYSTEM_TABLES,
];

export const WORLD_CONTENT_PRIMARY_KEYS = {
  regions: 'name',
  quest_rules: 'quest_id',
  ability_unlock_rules: 'ability_id',
  object_rules: 'definition_id',
  vendor_restock_rules: 'vendor_stock_id',
  recipe_rules: 'recipe_id',
  exit_rules: 'exit_id',
};

export function selectExportableWorldObjects(worldObjects = []) {
  const exportedIds = new Set(
    worldObjects
      .filter((object) => object.location_kind === 'room')
      .map((object) => object.id),
  );
  let addedNestedObject = true;
  while (addedNestedObject) {
    addedNestedObject = false;
    for (const object of worldObjects) {
      if (
        object.location_kind === 'container'
        && exportedIds.has(object.location_id)
        && !exportedIds.has(object.id)
      ) {
        exportedIds.add(object.id);
        addedNestedObject = true;
      }
    }
  }
  return worldObjects.filter((object) => exportedIds.has(object.id));
}

export function selectExportableNpcStats(actorStats = [], npcs = []) {
  const npcIds = new Set(npcs.map((npc) => npc.id));
  return actorStats.filter((stat) => npcIds.has(stat.actor_id));
}

export function orderWorldObjectsForRestore(worldObjects = []) {
  const remaining = [...worldObjects];
  const ordered = [];
  const availableIds = new Set();

  while (remaining.length > 0) {
    const ready = remaining.filter(
      (object) => object.location_kind !== 'container' || availableIds.has(object.location_id),
    );
    if (ready.length === 0) {
      const unresolved = remaining.map((object) => object.id).join(', ');
      throw new Error(`Placed objects contain a missing container or containment cycle: ${unresolved}`);
    }
    for (const object of ready) {
      ordered.push(object);
      availableIds.add(object.id);
      remaining.splice(remaining.indexOf(object), 1);
    }
  }

  return ordered;
}
