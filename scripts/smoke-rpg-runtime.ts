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
const patrollerId = 'runtime-test-patroller';
const spellTargetId = 'runtime-test-spell-target';

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
    const command = async (id: string, raw: string) => {
        await connection.reducers.submitCommand({ commandId: id, raw, characterId: heroId, roomId: roomA, conversationHistory: null });
        await delay(50);
    };

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
        await insert('characters', [
            { id: heroId, name: 'Runtime Hero', current_room: roomA, description: 'Smoke-test hero.' },
            { id: rivalId, name: 'Runtime Rival', current_room: roomA, description: 'Smoke-test rival.' },
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

        let remoteRoomRejected = false;
        try {
            await connection.reducers.submitCommand({ commandId: 'runtime-wrong-room', raw: 'look', characterId: heroId, roomId: roomB, conversationHistory: null });
        } catch {
            remoteRoomRejected = true;
        }
        assert(remoteRoomRejected, 'A command was accepted for a room the hero was not in.');

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
        const heroProgression = [...connection.db.actor_progression.iter()].find((row: any) => row.actorId === heroId);
        assert(heroProgression?.level === 2, `Enemy XP did not level the hero to 2 (got ${heroProgression?.level}).`);
        const leveledHealth = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::health`);
        assert(leveledHealth?.baseValue === 25, `Per-level health growth was not applied (got ${leveledHealth?.baseValue}).`);

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

        await insert('npcs', { id: guardId, name: 'Runtime Guard', alias: 'guard', description: 'Attacks on sight.', current_room: roomA, spawn_room: roomA, behavior_type: 'static', disposition: 'hostile', attack_on_sight: true, attack_interval_seconds: 1, respawn_seconds: 0 });
        const healthBeforeGuard = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::health`)?.currentValue;
        await command('runtime-hostile', 'wait');
        await waitFor(() => [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::health`)?.currentValue < healthBeforeGuard, 'hostile NPC attack');

        await update('actor_stats', [`${heroId}::health`], { current_value: 1 });
        await delay(1_100);
        await command('runtime-defeat', 'wait');
        await waitFor(() => [...connection.db.character.iter()].find((row: any) => row.id === heroId)?.currentRoom === startingRoom, 'player defeat recovery');
        const recoveredHealth = [...connection.db.actor_stat.iter()].find((row: any) => row.id === `${heroId}::health`)?.currentValue;
        assert(recoveredHealth === 25, `Player recovered with ${recoveredHealth} health instead of level-scaled base health.`);

        console.log('RPG runtime smoke test passed: rooms, PvP, attack speed, inventory capacity, patrol, XP/levels, stat growth, abilities, resource costs/regeneration, multi-item equipment slots, hostile AI, defeat recovery, and loot.');
    } finally {
        connection?.disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
