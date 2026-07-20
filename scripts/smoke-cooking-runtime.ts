/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbConnection } from '../generated';

const uri = process.env.NEXT_PUBLIC_SPACETIMEDB_URI || 'http://127.0.0.1:3000';
const databaseName = process.env.SPACETIMEDB_TEST_DB || 'arkyv-engine-cooking-test';
const heroId = 'cooking-smoke-hero';
const stationId = 'cooking-smoke-oven-instance';

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

async function waitFor(predicate: () => boolean, label: string, timeout = 8_000) {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeout) throw new Error(`Timed out waiting for ${label}.`);
        await delay(50);
    }
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
            .build();
    });

    const insert = (tableName: string, payload: unknown) => connection.reducers.insertRows({ tableName, payloadJson: JSON.stringify(payload) });
    const command = async (id: string, raw: string) => {
        const roomId = [...connection.db.character.iter()].find((row: any) => row.id === heroId)?.currentRoom;
        if (!roomId) throw new Error('Cooking smoke-test hero has no room.');
        await connection.reducers.submitCommand({ commandId: id, raw, characterId: heroId, roomId, conversationHistory: null });
        await delay(50);
    };

    try {
        await connection.reducers.installRpgStarterKit({});
        await new Promise<void>((resolve, reject) => {
            connection.subscriptionBuilder()
                .onApplied(() => resolve())
                .onError((_context: unknown, error: unknown) => reject(error))
                .subscribe([
                    'SELECT * FROM room',
                    'SELECT * FROM character',
                    'SELECT * FROM npc',
                    'SELECT * FROM world_object',
                    'SELECT * FROM crafting_batch',
                    'SELECT * FROM actor_wallet',
                    'SELECT * FROM room_message',
                ]);
        });

        await insert('characters', { id: heroId, name: 'Cooking Smoke Hero', description: 'Validates timed station processing.' });
        await waitFor(() => [...connection.db.character.iter()].some((row: any) => row.id === heroId), 'cooking hero replication');
        const roomId = [...connection.db.character.iter()].find((row: any) => row.id === heroId)?.currentRoom;
        assert(roomId, 'Cooking hero did not receive an initial room.');

        await insert('object_definitions', [
            { id: 'cooking-smoke-raw', name: 'Raw Smoke Fish', description: 'An uncooked ingredient.', primitive_kind: 'item', icon: '◇', portable: true, stackable: true, max_stack: 10 },
            { id: 'cooking-smoke-cooked', name: 'Cooked Smoke Fish', description: 'A cooked output.', primitive_kind: 'consumable', icon: '◇', portable: true, stackable: true, max_stack: 10 },
            { id: 'cooking-smoke-oven', name: 'Smoke Oven', description: 'A fueled processing station.', primitive_kind: 'fixture', icon: '◇', portable: false, capacity: 4, burn_rate: 1, accepted_fuel_tags: ['fuel'] },
        ]);
        await insert('crafting_recipes', {
            id: 'cooking-smoke-recipe',
            name: 'Cooked Smoke Fish',
            description: 'Processes fish in a selected station.',
            output_definition_id: 'cooking-smoke-cooked',
            output_quantity: 1,
            station_definition_id: 'cooking-smoke-oven',
            process_seconds: 1,
            requires_active_station: true,
            required_level: 1,
            currency_cost: 0,
            active: true,
        });
        await insert('crafting_ingredients', { id: 'cooking-smoke-input', recipe_id: 'cooking-smoke-recipe', definition_id: 'cooking-smoke-raw', quantity: 1, consumed: true });
        await insert('world_objects', [
            { id: stationId, definition_id: 'cooking-smoke-oven', location_kind: 'room', location_id: roomId, quantity: 1 },
            { id: 'cooking-smoke-raw-instance', definition_id: 'cooking-smoke-raw', location_kind: 'inventory', location_id: heroId, quantity: 1 },
            { id: 'cooking-smoke-fuel', definition_id: 'wood', location_kind: 'inventory', location_id: heroId, quantity: 1 },
        ]);

        await command('cooking-smoke-fuel-command', 'put Firewood in Smoke Oven');
        await command('cooking-smoke-load-command', 'put Raw Smoke Fish in Smoke Oven');
        await command('cooking-smoke-light-command', 'light Smoke Oven');
        await command('cooking-smoke-start-command', 'cook Cooked Smoke Fish in Smoke Oven');
        assert([...connection.db.crafting_batch.iter()].some((row: any) => row.stationObjectId === stationId), 'Timed cooking batch did not start.');
        assert(![...connection.db.world_object.iter()].some((row: any) => row.id === 'cooking-smoke-raw-instance'), 'Placed ingredient was not consumed.');

        await command('cooking-smoke-pause-command', 'extinguish Smoke Oven');
        await delay(1_100);
        await command('cooking-smoke-paused-wait', 'wait');
        assert(![...connection.db.world_object.iter()].some((row: any) => row.definitionId === 'cooking-smoke-cooked'), 'Cooking advanced while the required station was inactive.');

        await command('cooking-smoke-resume-command', 'light Smoke Oven');
        await delay(1_100);
        await command('cooking-smoke-finish-command', 'wait');
        await waitFor(() => [...connection.db.world_object.iter()].some((row: any) => row.definitionId === 'cooking-smoke-cooked' && row.locationKind === 'container' && row.locationId === stationId), 'cooked output');

        await connection.reducers.configureEngineRecord({
            tableName: 'object_rules',
            payloadJson: JSON.stringify({ definition_id: 'cooking-smoke-cooked', rarity: 'common', item_level: 1, required_level: 1, maximum_durability: 100, base_value: 20, repairable: true, two_handed: false, bind_rule: 'none', tradeable: true }),
        });
        await insert('npcs', { id: 'cooking-smoke-merchant', name: 'Cooking Merchant', alias: 'merchant', description: 'Buys cooked goods.', current_room: roomId, spawn_room: roomId, behavior_type: 'static', disposition: 'friendly', respawn_seconds: 0 });
        await insert('vendor_definitions', { id: 'cooking-smoke-vendor', npc_id: 'cooking-smoke-merchant', name: 'Cooking Merchant', currency_id: 'gold', buys_from_players: true, sell_price_percent: 50, required_reputation: 0 });
        await command('cooking-smoke-take-command', 'take Cooked Smoke Fish from Smoke Oven');
        const goldBefore = [...connection.db.actor_wallet.iter()].find((row: any) => row.actorId === heroId)?.gold || 0;
        await command('cooking-smoke-sell-command', 'sell Cooked Smoke Fish to Cooking Merchant');
        const goldAfter = [...connection.db.actor_wallet.iter()].find((row: any) => row.actorId === heroId)?.gold || 0;
        assert(goldAfter === goldBefore + 10, `Expected the merchant to pay 10 gold from the base value, received ${goldAfter - goldBefore}.`);

        console.log('Cooking runtime smoke test passed: station placement, fuel, active-state pause/resume, timed output, and base-value merchant sale.');
    } finally {
        connection?.disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
