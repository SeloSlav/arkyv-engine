import { DbConnection } from '../generated';

const uri = process.env.NEXT_PUBLIC_SPACETIMEDB_URI || 'http://127.0.0.1:3000';
const databaseName = process.env.SPACETIMEDB_TEST_DB || 'arkyv-engine-runtime-test';
const startingRoom = 'a1b2c3d4-5678-90ab-cdef-123456789abc';
const roomA = 'runtime-test-a';
const roomB = 'runtime-test-b';
const heroId = 'runtime-test-hero';
const rivalId = 'runtime-test-rival';
const enemyId = 'runtime-test-enemy';
const guardId = 'runtime-test-guard';
const lawGuardId = 'runtime-test-law-guard';
const questGiverId = 'runtime-test-quest-giver';
const questTargetId = 'runtime-test-quest-target';
const patrollerId = 'runtime-test-patroller';
const spellTargetId = 'runtime-test-spell-target';
const hardcoreVictimId = 'runtime-test-hardcore-victim';
const replacementId = 'runtime-test-replacement';

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate: () => boolean, label: string, timeout = 8_000) {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeout) throw new Error(`Timed out waiting for ${label}.`);
        await delay(50);
    }
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

async function main() {
    let connection: any;
    await new Promise<void>((resolve, reject) => {
        connection = DbConnection.builder()
            .withUri(uri)
            .withDatabaseName(databaseName)
            .withConfirmedReads(true)
            .onConnect((connected) => {
                connection = connected;
                resolve();
            })
            .onConnectError((_context, error) => reject(error))
            .onDisconnect((_context, error) => {
                if (error) console.error('Disconnected during RPG runtime smoke test:', error);
            })
            .build();
    });

    const insert = async (tableName: string, payload: unknown) => {
        await connection.reducers.insertRows({ tableName, payloadJson: JSON.stringify(payload) });
    };
    const update = async (tableName: string, ids: string[], payload: unknown) => {
        await connection.reducers.updateRows({ tableName, idsJson: JSON.stringify(ids), payloadJson: JSON.stringify(payload) });
    };
    const commandAs = async (actorId: string, id: string, raw: string) => {
        const currentRoom = [...connection.db.character.iter()].find((row: any) => row.id === actorId)?.currentRoom;
        if (!currentRoom) throw new Error(`Runtime actor ${actorId} has no current room.`);
        await connection.reducers.submitCommand({ commandId: id, raw, characterId: actorId, roomId: currentRoom, conversationHistory: null });
        await delay(50);
    };
    const command = (id: string, raw: string) => commandAs(heroId, id, raw);

    try {
        await connection.reducers.installRpgStarterKit({});
        await new Promise<void>((resolve, reject) => {
            connection.subscriptionBuilder()
                .onApplied(() => resolve())
                .onError((_context: unknown, error: unknown) => reject(error))
                .subscribe([
                    'SELECT * FROM region', 'SELECT * FROM room', 'SELECT * FROM character', 'SELECT * FROM npc',
                    'SELECT * FROM exit', 'SELECT * FROM room_message',
                    'SELECT * FROM stat_definition', 'SELECT * FROM object_definition', 'SELECT * FROM world_object',
                    'SELECT * FROM actor_stat', 'SELECT * FROM loot_table_entry',
                    'SELECT * FROM progression_config', 'SELECT * FROM actor_progression',
                    'SELECT * FROM ability_definition', 'SELECT * FROM actor_ability', 'SELECT * FROM actor_cooldown',
                    'SELECT * FROM equipment_slot_definition',
                    'SELECT * FROM faction_definition', 'SELECT * FROM actor_faction_reputation', 'SELECT * FROM actor_crime',
                    'SELECT * FROM quest_definition', 'SELECT * FROM quest_objective', 'SELECT * FROM quest_item_reward',
                    'SELECT * FROM actor_quest', 'SELECT * FROM actor_quest_progress', 'SELECT * FROM actor_wallet',
                    'SELECT * FROM spawn_point', 'SELECT * FROM world_lifecycle_config',
                    'SELECT * FROM actor_life_state', 'SELECT * FROM actor_death_record',
                    'SELECT * FROM ability_unlock_rule', 'SELECT * FROM actor_talent_pool',
                    'SELECT * FROM party', 'SELECT * FROM party_member', 'SELECT * FROM guild', 'SELECT * FROM guild_member',
                    'SELECT * FROM my_private_messages', 'SELECT * FROM my_social_relationships',
                    'SELECT * FROM my_trade_sessions', 'SELECT * FROM my_trade_offers',
                    'SELECT * FROM bank_config', 'SELECT * FROM object_rule', 'SELECT * FROM vendor_restock_rule',
                    'SELECT * FROM profession_definition', 'SELECT * FROM recipe_rule', 'SELECT * FROM actor_profession', 'SELECT * FROM actor_learned_recipe',
                    'SELECT * FROM crafting_batch',
                    'SELECT * FROM dialogue_node', 'SELECT * FROM dialogue_choice', 'SELECT * FROM actor_dialogue_state',
                    'SELECT * FROM exit_rule', 'SELECT * FROM world_trigger', 'SELECT * FROM content_issue',
                ]);
        });

        await insert('regions', { name: 'runtime-test', display_name: 'Runtime Test', description: 'Isolated reducer smoke-test region.', color_scheme: {}, pvp_enabled: false, respawn_room_id: startingRoom });
        await insert('rooms', [
            { id: roomA, name: 'Runtime Test A', description: 'First test room.', region: 'Runtime Test', region_name: 'runtime-test', height: 0 },
            { id: roomB, name: 'Runtime Test B', description: 'Second test room.', region: 'Runtime Test', region_name: 'runtime-test', height: 0 },
        ]);
        await insert('exits', [
            { id: 'runtime-test-east', from_room: roomA, to_room: roomB, verb: 'east' },
            { id: 'runtime-test-west', from_room: roomB, to_room: roomA, verb: 'west' },
        ]);
        await insert('spawn_points', [
            { id: 'runtime-birth-cairn', name: 'Runtime Birth Cairn', description: 'Initial test entry.', room_id: roomA, allows_initial_spawn: true, allows_respawn: false, active: true, priority: 100 },
            { id: 'runtime-graveyard', name: 'Runtime Graveyard', description: 'Nearest recovery point.', room_id: roomB, allows_initial_spawn: false, allows_respawn: true, active: true, priority: 50 },
        ]);
        await update('world_lifecycle_configs', ['world'], {
            initial_spawn_policy: 'fixed', fixed_initial_spawn_point_id: 'runtime-birth-cairn',
            respawn_policy: 'nearest', inventory_loss_mode: 'keep', death_mode: 'respawn',
        });
        // Keep combat assertions deterministic now that authored hit, avoidance,
        // critical, and block probabilities are part of the runtime model.
        await update('world_combat_configs', ['world'], {
            base_hit_chance_percent: 100, base_crit_chance_percent: 0,
            base_dodge_chance_percent: 0, base_parry_chance_percent: 0,
            base_block_chance_percent: 0,
        });
        await insert('characters', [
            { id: heroId, name: 'Runtime Hero', current_room: startingRoom, description: 'Smoke-test hero.' },
            { id: rivalId, name: 'Runtime Rival', current_room: startingRoom, description: 'Smoke-test rival.' },
        ]);
        await insert('npcs', [
            { id: enemyId, name: 'Runtime Enemy', alias: 'enemy', description: 'Drops guaranteed loot.', current_room: roomA, spawn_room: roomA, behavior_type: 'static', disposition: 'hostile', attack_on_sight: false, respawn_seconds: 0, xp_reward: 100 },
            { id: patrollerId, name: 'Runtime Patroller', alias: 'patroller', description: 'Walks the test loop.', current_room: roomA, spawn_room: roomA, behavior_type: 'patrol', disposition: 'neutral', patrol_route: [roomA, roomB], patrol_interval_seconds: 1 },
        ]);
        await update('actor_stats', [`${heroId}::health`], { base_value: 20, current_value: 20 });
        await update('actor_stats', [`${rivalId}::health`], { base_value: 20, current_value: 20 });
        await insert('actor_stats', { actor_id: enemyId, stat_definition_id: 'health', base_value: 1, current_value: 1 });
        await insert('loot_table_entries', { id: 'runtime-test-drop', npc_id: enemyId, definition_id: 'healing-potion', minimum_quantity: 2, maximum_quantity: 2, chance_percent: 100 });
        await insert('world_objects', [
            { id: 'runtime-test-chest', definition_id: 'wooden-box', location_kind: 'room', location_id: roomA, quantity: 1 },
            { id: 'runtime-test-chest-potion', definition_id: 'healing-potion', location_kind: 'container', location_id: 'runtime-test-chest', quantity: 1 },
        ]);

        await waitFor(() => [...connection.db.character.iter()].some((row: any) => row.id === heroId), 'fixture replication');
        assert([...connection.db.character.iter()].find((row: any) => row.id === heroId)?.currentRoom === roomA, 'Fixed initial spawn point did not override the requested room.');

        let remoteRoomRejected = false;
        try {
            await connection.reducers.submitCommand({ commandId: 'runtime-wrong-room', raw: 'look', characterId: heroId, roomId: roomB, conversationHistory: null });
        } catch {
            remoteRoomRejected = true;
        }
        assert(remoteRoomRejected, 'A command was accepted for a room the hero was not in.');

        await connection.reducers.configureEngineRecord({ tableName: 'exit_rules', payloadJson: JSON.stringify({ exit_id: 'runtime-test-east', is_door: true, closed: true, locked: false, hidden: false, trap_damage: 0 }) });
        await command('runtime-closed-door', 'east');
        assert([...connection.db.character.iter()].find((row: any) => row.id === heroId)?.currentRoom === roomA, 'A closed authored door allowed movement.');
        await command('runtime-open-door', 'open east');
        await command('runtime-use-door', 'east');
        assert([...connection.db.character.iter()].find((row: any) => row.id === heroId)?.currentRoom === roomB, 'Opening an authored door did not allow movement.');
        await command('runtime-door-return', 'west');

        await command('runtime-party-create', 'party create Runtime Party');
        await command('runtime-party-invite', 'party invite Runtime Rival');
        await commandAs(rivalId, 'runtime-party-accept', 'party accept');
        await command('runtime-party-loot', 'party loot leader');
        assert([...connection.db.party_member.iter()].filter((row: any) => row.status === 'member').length === 2, 'Party invite/accept did not create two active members.');

        await insert('object_definitions', { id: 'runtime-trade-token', name: 'Runtime Trade Token', description: 'Moves only through a confirmed trade.', primitive_kind: 'item', icon: '¤', portable: true });
        await insert('world_objects', { id: 'runtime-trade-instance', definition_id: 'runtime-trade-token', location_kind: 'inventory', location_id: heroId, quantity: 1 });
        await command('runtime-trade-open', 'trade Runtime Rival');
        await command('runtime-trade-offer', 'trade add Runtime Trade Token');
        await commandAs(rivalId, 'runtime-trade-rival-confirm', 'trade confirm');
        await command('runtime-trade-hero-confirm', 'trade confirm');
        await waitFor(() => [...connection.db.world_object.iter()].find((row: any) => row.id === 'runtime-trade-instance')?.locationId === rivalId, 'secure trade completion');

        await command('runtime-private-whisper', 'whisper Runtime Rival private hello');
        assert([...connection.db.my_private_messages.iter()].some((row: any) => row.body.includes('private hello')), 'Whisper was not stored in the caller-private message view.');

        await insert('npcs', { id: 'runtime-mentor', name: 'Runtime Mentor', alias: 'mentor', description: 'Teaches a recipe through authored dialogue.', current_room: roomA, spawn_room: roomA, behavior_type: 'static', disposition: 'friendly', respawn_seconds: 0 });
        await insert('crafting_recipes', { id: 'runtime-recipe', name: 'Runtime Kindling', description: 'A learned test recipe.', output_definition_id: 'wood', output_quantity: 1, required_level: 1, currency_cost: 0, active: true });
        await connection.reducers.configureEngineRecord({ tableName: 'profession_definitions', payloadJson: JSON.stringify({ id: 'runtime-craft', name: 'Runtime Craft', description: 'Test profession', maximum_rank: 10, xp_per_craft: 1, active: true }) });
        await connection.reducers.configureEngineRecord({ tableName: 'recipe_rules', payloadJson: JSON.stringify({ recipe_id: 'runtime-recipe', profession_id: 'runtime-craft', required_profession_rank: 0, must_be_learned: true, success_percent: 100, cooldown_seconds: 0 }) });
        await connection.reducers.configureEngineRecord({ tableName: 'dialogue_nodes', payloadJson: JSON.stringify({ id: 'runtime-mentor-entry', npc_id: 'runtime-mentor', text: 'I can teach you kindling.', entry_node: true, required_reputation: 0, sort_order: 1 }) });
        await connection.reducers.configureEngineRecord({ tableName: 'dialogue_choices', payloadJson: JSON.stringify({ id: 'runtime-learn-recipe', node_id: 'runtime-mentor-entry', label: 'Teach me.', action_kind: 'learn_recipe', action_reference_id: 'runtime-recipe', action_value: 0, sort_order: 1 }) });
        await command('runtime-talk-mentor', 'talk mentor');
        await command('runtime-learn-recipe', 'respond runtime-learn-recipe');
        assert([...connection.db.actor_learned_recipe.iter()].some((row: any) => row.actorId === heroId && row.recipeId === 'runtime-recipe'), 'Authored dialogue did not teach the recipe.');
        await insert('npcs', { id: 'runtime-greeter', name: 'Runtime Greeter', alias: 'greeter', description: 'Repeats one authored line without AI.', authored_reply: 'The road is quiet today.', current_room: roomA, spawn_room: roomA, behavior_type: 'static', disposition: 'friendly', respawn_seconds: 0 });
        await command('runtime-talk-greeter-first', 'talk greeter');
        await command('runtime-talk-greeter-second', 'talk greeter');
        assert([...connection.db.room_message.iter()].filter((row: any) => row.body.includes('Runtime Greeter: "The road is quiet today."')).length === 2, 'A one-line authored dialogue did not repeat on each conversation.');

        await insert('object_definitions', [
            { id: 'runtime-raw-fish', name: 'Raw Runtime Fish', description: 'An uncooked test ingredient.', primitive_kind: 'item', icon: '◇', portable: true, stackable: true, max_stack: 10 },
            { id: 'runtime-cooked-fish', name: 'Cooked Runtime Fish', description: 'A finished test meal.', primitive_kind: 'consumable', icon: '◇', portable: true, stackable: true, max_stack: 10 },
            { id: 'runtime-oven', name: 'Runtime Oven', description: 'A fueled timed-processing station.', primitive_kind: 'fixture', icon: '◇', portable: false, capacity: 4, burn_rate: 1, accepted_fuel_tags: ['fuel'] },
        ]);
        await insert('crafting_recipes', {
            id: 'runtime-cooked-fish-recipe', name: 'Runtime Cooked Fish', description: 'Cooks one fish over time.',
            output_definition_id: 'runtime-cooked-fish', output_quantity: 1, station_definition_id: 'runtime-oven',
            process_seconds: 1, requires_active_station: true, required_level: 1, currency_cost: 0, active: true,
        });
        await insert('crafting_ingredients', { id: 'runtime-cooked-fish-input', recipe_id: 'runtime-cooked-fish-recipe', definition_id: 'runtime-raw-fish', quantity: 1, consumed: true });
        await insert('world_objects', [
            { id: 'runtime-oven-instance', definition_id: 'runtime-oven', location_kind: 'room', location_id: roomA, quantity: 1 },
            { id: 'runtime-raw-fish-instance', definition_id: 'runtime-raw-fish', location_kind: 'inventory', location_id: heroId, quantity: 1 },
            { id: 'runtime-cooking-fuel', definition_id: 'wood', location_kind: 'inventory', location_id: heroId, quantity: 1 },
        ]);
        await command('runtime-fuel-oven', 'put Firewood in Runtime Oven');
        await command('runtime-load-oven', 'put Raw Runtime Fish in Runtime Oven');
        await command('runtime-light-oven', 'light Runtime Oven');
        await command('runtime-start-cooking', 'cook Runtime Cooked Fish in Runtime Oven');
        assert([...connection.db.crafting_batch.iter()].some((row: any) => row.stationObjectId === 'runtime-oven-instance'), 'Timed cooking did not start after ingredients were placed in the configured station.');
        assert(![...connection.db.world_object.iter()].some((row: any) => row.id === 'runtime-raw-fish-instance'), 'Timed cooking did not consume the placed ingredient.');
        await command('runtime-pause-cooking', 'extinguish Runtime Oven');
        await delay(1_100);
        await command('runtime-check-paused-cooking', 'wait');
        assert(![...connection.db.world_object.iter()].some((row: any) => row.definitionId === 'runtime-cooked-fish'), 'Cooking progressed while its required station was inactive.');
        await command('runtime-resume-cooking', 'light Runtime Oven');
        await delay(1_100);
        await command('runtime-finish-cooking', 'wait');
        await waitFor(() => [...connection.db.world_object.iter()].some((row: any) => row.definitionId === 'runtime-cooked-fish' && row.locationKind === 'container' && row.locationId === 'runtime-oven-instance'), 'timed cooking output');
        await connection.reducers.configureEngineRecord({ tableName: 'object_rules', payloadJson: JSON.stringify({ definition_id: 'runtime-cooked-fish', rarity: 'common', item_level: 1, required_level: 1, maximum_durability: 100, base_value: 20, repairable: true, two_handed: false, bind_rule: 'none', tradeable: true }) });
        await insert('vendor_definitions', { id: 'runtime-cook-vendor', npc_id: 'runtime-mentor', name: 'Runtime Cook Vendor', currency_id: 'gold', buys_from_players: true, sell_price_percent: 50, required_reputation: 0 });
        await command('runtime-take-cooked-fish', 'take Cooked Runtime Fish from Runtime Oven');
        const cookingGoldBefore = [...connection.db.actor_wallet.iter()].find((row: any) => row.actorId === heroId)?.gold || 0;
        await command('runtime-sell-cooked-fish', 'sell Cooked Runtime Fish to Runtime Cook Vendor');
        const cookingGoldAfter = [...connection.db.actor_wallet.iter()].find((row: any) => row.actorId === heroId)?.gold || 0;
        assert(cookingGoldAfter === cookingGoldBefore + 10, `Base merchant value did not sell at the vendor percentage (expected +10, got +${cookingGoldAfter - cookingGoldBefore}).`);

        await command('runtime-safe-pvp', 'attack Runtime Rival');
        const safeHealth = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${rivalId}::health`)?.currentValue;
        assert(safeHealth === 20, `Safe-zone PvP changed rival health to ${safeHealth}.`);

        await update('regions', ['runtime-test'], { pvp_enabled: true });
        await command('runtime-open-pvp', 'attack Runtime Rival');
        await waitFor(() => [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${rivalId}::health`)?.currentValue < 20, 'PvP damage');
        const rivalAfterFirstAttack = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${rivalId}::health`)?.currentValue;
        await command('runtime-attack-speed', 'attack Runtime Rival');
        const rivalDuringCooldown = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${rivalId}::health`)?.currentValue;
        assert(rivalDuringCooldown === rivalAfterFirstAttack, 'Basic attack ignored the server cooldown.');

        await update('progression_configs', ['world'], { base_inventory_slots: 1, inventory_slots_per_level: 0 });
        await command('runtime-chest', 'take all from Wooden Box');
        const chestPotion = [...connection.db.world_object.iter()].find((row: any) => row.id === 'runtime-test-chest-potion');
        assert(chestPotion?.locationKind === 'inventory' && chestPotion.locationId === heroId, 'Chest contents did not move into hero inventory.');
        await insert('world_objects', { id: 'runtime-test-overflow', definition_id: 'wood', location_kind: 'room', location_id: roomA, quantity: 1 });
        await command('runtime-capacity', 'take Firewood');
        const overflow = [...connection.db.world_object.iter()].find((row: any) => row.id === 'runtime-test-overflow');
        assert(overflow?.locationKind === 'room', 'Inventory capacity did not reject an extra stack.');
        await update('progression_configs', ['world'], { base_inventory_slots: 10 });

        await command('runtime-patrol', 'wait');
        await waitFor(() => [...connection.db.npc.iter()].find((row: any) => row.id === patrollerId)?.currentRoom === roomB, 'NPC patrol movement');

        await delay(2_100);
        await command('runtime-enemy-loot', 'attack Runtime Enemy');
        await waitFor(() => [...connection.db.npc.iter()].find((row: any) => row.id === enemyId)?.currentRoom == null, 'enemy defeat');
        const enemyDrop = [...connection.db.world_object.iter()].find((row: any) => row.id.startsWith(`drop-${enemyId}-`));
        assert(enemyDrop?.locationKind === 'room' && enemyDrop.locationId === roomA && enemyDrop.quantity === 2, 'Guaranteed enemy loot was not created in the room.');
        assert(JSON.parse(enemyDrop.stateJson).loot_owner === heroId, 'Leader-only party loot was not assigned to the party leader.');
        const heroProgression = [...connection.db.actor_progression.iter()].find((row: any) => row.actorId === heroId);
        assert(heroProgression?.level === 2, `Enemy XP did not level the hero to 2 (got ${heroProgression?.level}).`);
        const leveledHealth = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::health`);
        assert(leveledHealth?.baseValue === 25, `Per-level health growth was not applied (got ${leveledHealth?.baseValue}).`);
        assert([...connection.db.actor_talent_pool.iter()].find((row: any) => row.actorId === heroId)?.availablePoints === 1, 'Level-up did not award a talent point.');

        await insert('npcs', { id: spellTargetId, name: 'Spell Dummy', alias: 'dummy', description: 'Receives a spell.', current_room: roomA, spawn_room: roomA, behavior_type: 'static', disposition: 'hostile', attack_on_sight: false, respawn_seconds: 0, xp_reward: 0 });
        await insert('actor_stats', { actor_id: spellTargetId, stat_definition_id: 'health', base_value: 1, current_value: 1 });
        const manaBeforeCast = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::mana`)?.currentValue;
        await command('runtime-firebolt', 'cast Firebolt at Spell Dummy');
        await waitFor(() => [...connection.db.npc.iter()].find((row: any) => row.id === spellTargetId)?.currentRoom == null, 'ability defeat');
        const manaAfterCast = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::mana`)?.currentValue;
        assert(manaAfterCast < manaBeforeCast, 'Ability resource cost was not paid.');
        await delay(1_100);
        await command('runtime-regeneration', 'stats');
        const manaAfterRegen = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::mana`)?.currentValue;
        assert(manaAfterRegen > manaAfterCast, 'Elapsed-time mana regeneration did not apply.');

        await insert('object_definitions', { id: 'runtime-ring', name: 'Runtime Ring', description: 'Tests a two-capacity slot.', primitive_kind: 'armor', icon: '○', portable: true, equipment_slot: 'finger' });
        await insert('world_objects', [1, 2, 3].map((number) => ({ id: `runtime-ring-${number}`, definition_id: 'runtime-ring', location_kind: 'inventory', location_id: heroId, quantity: 1 })));
        await command('runtime-ring-one', 'equip Runtime Ring');
        await command('runtime-ring-two', 'equip Runtime Ring');
        await command('runtime-ring-three', 'equip Runtime Ring');
        const equippedRings = [...connection.db.world_object.iter()].filter((row: any) => row.definitionId === 'runtime-ring' && row.locationKind === 'equipped');
        assert(equippedRings.length === 2, `Finger slot capacity should retain two rings, found ${equippedRings.length}.`);

        await update('regions', ['runtime-test'], { pvp_enabled: false });
        await insert('faction_definitions', {
            id: 'runtime-watch', name: 'Runtime Watch', description: 'Protects the smoke-test settlement.', starting_reputation: 0,
            minimum_reputation: -1000, maximum_reputation: 1000, hostile_threshold: -500, friendly_threshold: 500,
            attack_penalty: -75, kill_penalty: -300,
        });
        await insert('npcs', [
            { id: lawGuardId, name: 'Runtime Watchman', alias: 'watchman', description: 'Enforces the safe region.', current_room: roomA, spawn_room: roomA, faction: 'runtime-watch', behavior_type: 'static', disposition: 'neutral', is_guard: true, guard_greeting: 'The Runtime Watch keeps this room safe.', protect_players: true, protect_faction_members: true, guard_wanted_seconds: 120, attack_interval_seconds: 1, respawn_seconds: 0 },
            { id: questGiverId, name: 'Runtime Questgiver', alias: 'questgiver', description: 'Offers and receives a quest.', current_room: roomA, spawn_room: roomA, faction: 'runtime-watch', behavior_type: 'static', disposition: 'friendly', respawn_seconds: 0 },
            { id: questTargetId, name: 'Runtime Marauder', alias: 'marauder', description: 'A quest target.', current_room: roomA, spawn_room: roomA, behavior_type: 'static', disposition: 'hostile', attack_on_sight: false, respawn_seconds: 0, xp_reward: 0 },
        ]);
        await insert('actor_stats', { actor_id: questTargetId, stat_definition_id: 'health', base_value: 1, current_value: 1 });
        await insert('quest_definitions', {
            id: 'runtime-patrol-quest', title: 'Runtime Patrol', description: 'Explore, gather supplies, and stop a marauder.',
            quest_giver_npc_id: questGiverId, turn_in_npc_id: questGiverId, required_level: 1, repeatable: false, active: true,
            xp_reward: 25, gold_reward: 40, reputation_faction_id: 'runtime-watch', reputation_reward: 125,
        });
        await insert('quest_objectives', [
            { id: 'runtime-objective-explore', quest_id: 'runtime-patrol-quest', objective_type: 'explore_room', target_id: roomB, description: 'Explore Runtime Test B', required_count: 1, sort_order: 1 },
            { id: 'runtime-objective-item', quest_id: 'runtime-patrol-quest', objective_type: 'acquire_item', target_id: 'wood', description: 'Bring Firewood', required_count: 1, sort_order: 2, consume_on_turn_in: true },
            { id: 'runtime-objective-kill', quest_id: 'runtime-patrol-quest', objective_type: 'kill_npc', target_id: questTargetId, description: 'Defeat the Runtime Marauder', required_count: 1, sort_order: 3 },
        ]);
        await insert('quest_item_rewards', { id: 'runtime-quest-reward', quest_id: 'runtime-patrol-quest', definition_id: 'iron-sword', quantity: 1 });

        await command('runtime-accept-quest', 'accept Runtime Patrol');
        await command('runtime-explore-quest', 'east');
        await waitFor(() => [...connection.db.actor_quest_progress.iter()].find((row: any) => row.objectiveId === 'runtime-objective-explore')?.progress === 1, 'exploration quest progress');
        await command('runtime-return-quest', 'west');
        await command('runtime-guard-greeting', '__GREET');
        assert([...connection.db.room_message.iter()].some((row: any) => row.body.includes('Runtime Watch keeps this room safe')), 'Guard did not address the player on room entry.');
        await command('runtime-quest-item', 'take Firewood');
        await delay(2_100);
        await command('runtime-quest-kill', 'attack Runtime Marauder');
        await waitFor(() => [...connection.db.actor_quest.iter()].find((row: any) => row.questId === 'runtime-patrol-quest')?.status === 'ready', 'quest ready state');
        await command('runtime-turn-in', 'turn in Runtime Patrol');
        await waitFor(() => [...connection.db.actor_quest.iter()].find((row: any) => row.questId === 'runtime-patrol-quest')?.status === 'completed', 'quest turn-in');
        assert([...connection.db.actor_wallet.iter()].find((row: any) => row.actorId === heroId)?.gold === 40, 'Quest gold reward was not deposited.');
        assert([...connection.db.actor_faction_reputation.iter()].find((row: any) => row.actorId === heroId && row.factionId === 'runtime-watch')?.reputation === 125, 'Quest reputation reward was not applied.');
        assert([...connection.db.world_object.iter()].some((row: any) => row.locationKind === 'inventory' && row.locationId === heroId && row.definitionId === 'iron-sword'), 'Quest item reward was not granted.');

        await insert('npcs', { id: guardId, name: 'Runtime Guard', alias: 'guard', description: 'Attacks on sight.', current_room: roomA, spawn_room: roomA, behavior_type: 'static', disposition: 'hostile', attack_on_sight: true, attack_interval_seconds: 1, respawn_seconds: 0 });
        const healthBeforeGuard = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::health`)?.currentValue;
        await command('runtime-hostile', 'wait');
        await waitFor(() => [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::health`)?.currentValue < healthBeforeGuard, 'hostile NPC attack');

        await insert('world_objects', { id: 'runtime-death-item', definition_id: 'healing-potion', location_kind: 'inventory', location_id: heroId, quantity: 1 });
        await insert('world_objects', { id: 'runtime-bank-death-item', definition_id: 'wood', location_kind: 'inventory', location_id: heroId, quantity: 1 });
        await connection.reducers.configureEngineRecord({ tableName: 'bank_configs', payloadJson: JSON.stringify({ id: 'world', access_mode: 'anywhere', slot_limit: 20, deposit_fee: 0, withdrawal_fee: 0, shared_by_identity: false, protects_from_death: false }) });
        await command('runtime-bank-deposit', 'bank deposit Firewood');
        await update('world_lifecycle_configs', ['world'], {
            death_mode: 'respawn', respawn_policy: 'nearest', respawn_delay_seconds: 1,
            inventory_loss_mode: 'drop_inventory', include_equipped_in_loss: false,
            gold_loss_percent: 25, experience_loss_percent: 50,
            respawn_health_percent: 50, respawn_resource_percent: 25, spawn_protection_seconds: 2,
        });
        const xpBeforeDeath = [...connection.db.actor_progression.iter()].find((row: any) => row.actorId === heroId)?.experience;
        await update('actor_stats', [`${heroId}::health`], { current_value: 1 });
        await delay(1_100);
        await command('runtime-defeat', 'wait');
        await waitFor(() => [...connection.db.actor_life_state.iter()].find((row: any) => row.actorId === heroId)?.state === 'dead', 'delayed player death state');
        assert([...connection.db.character.iter()].find((row: any) => row.id === heroId)?.currentRoom === roomA, 'A delayed respawn moved the player before they chose to respawn.');
        const droppedDeathItem = [...connection.db.world_object.iter()].find((row: any) => row.id === 'runtime-death-item');
        assert(droppedDeathItem?.locationKind === 'room' && droppedDeathItem.locationId === roomA, 'Inventory death loss did not drop the carried item in the death room.');
        const droppedBankItem = [...connection.db.world_object.iter()].find((row: any) => row.id === 'runtime-bank-death-item');
        assert(droppedBankItem?.locationKind === 'room' && droppedBankItem.locationId === roomA, 'A bank configured without death protection incorrectly preserved its item.');
        assert([...connection.db.actor_wallet.iter()].find((row: any) => row.actorId === heroId)?.gold === 30, 'Configured gold loss was not applied.');
        const xpAfterDeath = [...connection.db.actor_progression.iter()].find((row: any) => row.actorId === heroId)?.experience;
        assert(xpAfterDeath === xpBeforeDeath - Math.floor(xpBeforeDeath / 2), 'Configured current-level XP loss was not applied.');
        await delay(1_100);
        await command('runtime-respawn', 'respawn');
        await waitFor(() => [...connection.db.character.iter()].find((row: any) => row.id === heroId)?.currentRoom === roomB, 'graph-nearest player respawn');
        const recoveredHealth = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::health`)?.currentValue;
        assert(recoveredHealth === 12, `Player recovered with ${recoveredHealth} health instead of the configured 50%.`);
        const recoveredState = [...connection.db.actor_life_state.iter()].find((row: any) => row.actorId === heroId);
        assert(recoveredState?.state === 'alive' && Number(recoveredState.protectedUntilMicros) > Date.now() * 1000, 'Respawn protection was not activated.');
        assert([...connection.db.actor_death_record.iter()].some((row: any) => row.actorId === heroId && row.spawnPointId === 'runtime-graveyard' && row.itemStacksDropped > 0), 'Death history did not record the chosen spawn point and item loss.');

        await update('characters', [heroId], { current_room: roomA });
        await update('actor_stats', [`${heroId}::health`], { current_value: 25 });
        await delay(2_100);
        const rivalBeforeCrime = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${rivalId}::health`)?.currentValue;
        const heroBeforeCrime = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::health`)?.currentValue;
        await command('runtime-safe-crime', 'attack Runtime Rival');
        await waitFor(() => [...connection.db.actor_crime.iter()].some((row: any) => row.actorId === heroId && row.regionId === 'runtime-test'), 'safe-region wanted state');
        const rivalAfterCrime = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${rivalId}::health`)?.currentValue;
        const heroAfterCrime = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::health`)?.currentValue;
        assert(rivalAfterCrime === rivalBeforeCrime, 'A safe-region crime attempt damaged the protected player.');
        assert(heroAfterCrime < heroBeforeCrime, 'A present guard did not attack the safe-region offender.');

        await update('npcs', [guardId, lawGuardId], { current_room: roomB });
        await update('regions', ['runtime-test'], { pvp_enabled: true });
        await update('world_lifecycle_configs', ['world'], { death_mode: 'hardcore', inventory_loss_mode: 'destroy_all', respawn_delay_seconds: 0 });
        await insert('characters', { id: hardcoreVictimId, name: 'Runtime Doomed', current_room: startingRoom, description: 'Must be permanently deleted.' });
        await update('actor_stats', [`${hardcoreVictimId}::health`], { base_value: 1, current_value: 1 });
        assert([...connection.db.character.iter()].find((row: any) => row.id === hardcoreVictimId)?.currentRoom === roomA, 'Hardcore test character did not use the fixed initial spawn point.');
        await delay(2_100);
        await command('runtime-hardcore', 'attack Runtime Doomed');
        await waitFor(() => ![...connection.db.character.iter()].some((row: any) => row.id === hardcoreVictimId), 'hardcore character deletion');
        assert([...connection.db.actor_death_record.iter()].some((row: any) => row.actorId === hardcoreVictimId && row.deathMode === 'hardcore'), 'Hardcore death was not preserved in death history.');
        assert(![...connection.db.actor_stat.iter()].some((row: any) => row.actorId === hardcoreVictimId), 'Hardcore deletion left actor runtime stats behind.');
        await insert('characters', { id: replacementId, name: 'Runtime Reborn', current_room: startingRoom, description: 'Replacement after hardcore loss.' });
        assert([...connection.db.character.iter()].find((row: any) => row.id === replacementId)?.currentRoom === roomA, 'A replacement character could not enter through the initial spawn point.');

        await connection.reducers.validateWorldContent({});

        console.log('RPG runtime smoke test passed: rooms, doors, private messaging, parties and loot rules, secure trade, authored dialogue and recipe learning, PvP, attack speed, inventory capacity, patrol, XP/levels/talents, abilities, resources, equipment, hostile AI, graph-nearest delayed respawn, bank death policy, death losses/protection/history, hardcore deletion/recreation, loot, guard greetings/crimes, faction reputation, quest objectives, turn-in rewards, and content validation.');
    } finally {
        connection?.disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
