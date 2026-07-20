import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFile(resolve(root, path), 'utf8');
const [rustCore, rustExpansion, adminPage, rpgEditor, engineEditor, bundleSource] = await Promise.all([
  read('spacetimedb/src/lib.rs'),
  read('spacetimedb/src/expansion.rs'),
  read('pages/admin.js'),
  read('components/admin/RpgSystemsEditor.js'),
  read('components/admin/EngineSystemsEditor.js'),
  read('lib/worldContentBundle.js'),
]);

const directWorldTables = ['regions', 'rooms', 'exits', 'npcs'];
const rpgTables = [
  'stat_definitions',
  'object_definitions',
  'world_objects',
  'loot_table_entries',
  'progression_configs',
  'equipment_slot_definitions',
  'ability_definitions',
  'ability_effect_definitions',
  'world_combat_configs',
  'faction_definitions',
  'quest_definitions',
  'quest_objectives',
  'quest_item_rewards',
  'quest_rules',
  'quest_choices',
  'character_option_definitions',
  'character_option_grants',
  'admin_role_definitions',
  'currency_definitions',
  'vendor_definitions',
  'vendor_stocks',
  'crafting_recipes',
  'crafting_ingredients',
  'spawn_points',
  'world_lifecycle_configs',
];
const advancedTables = [
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

for (const table of directWorldTables) {
  assert(adminPage.includes(`'${table}'`) || adminPage.includes(`"${table}"`), `${table} is missing from the visual world editor`);
}
for (const table of rpgTables) {
  assert(rpgEditor.includes(`'${table}'`) || rpgEditor.includes(`"${table}"`), `${table} is missing from RPG Systems Studio`);
}
for (const table of advancedTables) {
  assert(engineEditor.includes(`table: '${table}'`), `${table} is missing from the advanced visual editor`);
  assert(rustExpansion.includes(`"${table}" =>`), `${table} is missing from configure_engine_record`);
  assert(rustExpansion.slice(rustExpansion.indexOf('pub fn delete_engine_record')).includes(`"${table}" =>`), `${table} is missing from delete_engine_record`);
}

for (const table of [...directWorldTables, ...rpgTables]) {
  const matchCount = rustCore.split(`"${table}" =>`).length - 1;
  // Exit endpoints are immutable in the visual graph: changing a connection is
  // intentionally delete + recreate, so exits only need insert/delete arms.
  const requiredReducerArms = table === 'exits' ? 2 : 3;
  assert(matchCount >= requiredReducerArms, `${table} does not have complete reducer coverage`);
  assert(bundleSource.includes(`'${table}'`), `${table} is missing from world snapshot/export coverage`);
}
for (const table of advancedTables) {
  assert(bundleSource.includes(`'${table}'`), `${table} is missing from world snapshot/export coverage`);
}

const bundleModule = await import(`data:text/javascript;base64,${Buffer.from(bundleSource).toString('base64')}`);
const nestedObjects = [
  { id: 'ingredient', location_kind: 'container', location_id: 'pan' },
  { id: 'unrelated-inventory', location_kind: 'inventory', location_id: 'player' },
  { id: 'pan', location_kind: 'container', location_id: 'campfire' },
  { id: 'campfire', location_kind: 'room', location_id: 'kitchen' },
];
assert.deepEqual(
  bundleModule.selectExportableWorldObjects(nestedObjects).map((row) => row.id).sort(),
  ['campfire', 'ingredient', 'pan'],
  'world export must include room-rooted nested objects and exclude player inventory',
);
assert.deepEqual(
  bundleModule.orderWorldObjectsForRestore(nestedObjects.filter((row) => row.id !== 'unrelated-inventory')).map((row) => row.id),
  ['campfire', 'pan', 'ingredient'],
  'world restore must place containers before their children',
);
assert.throws(
  () => bundleModule.orderWorldObjectsForRestore([
    { id: 'a', location_kind: 'container', location_id: 'b' },
    { id: 'b', location_kind: 'container', location_id: 'a' },
  ]),
  /containment cycle/,
);

console.log(`Admin coverage audit passed: ${directWorldTables.length + rpgTables.length + advancedTables.length} authored systems have editor, reducer, and export coverage.`);
