/* eslint-disable @typescript-eslint/no-explicit-any */
import { DbConnection } from '../generated';

const uri = process.env.NEXT_PUBLIC_SPACETIMEDB_URI || 'http://127.0.0.1:3000';
const databaseName = process.env.SPACETIMEDB_TEST_DB || 'arkyv-engine-admin-test';
const startingRoom = 'a1b2c3d4-5678-90ab-cdef-123456789abc';
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
    const update = (tableName: string, ids: string[], payload: unknown) => connection.reducers.updateRows({ tableName, idsJson: JSON.stringify(ids), payloadJson: JSON.stringify(payload) });
    const remove = (tableName: string, ids: string[]) => connection.reducers.deleteRows({ tableName, idsJson: JSON.stringify(ids) });
    const configure = (tableName: string, payload: unknown) => connection.reducers.configureEngineRecord({ tableName, payloadJson: JSON.stringify(payload) });
    const expectRejected = async (operation: () => Promise<unknown>, label: string) => {
        let rejected = false;
        try { await operation(); } catch { rejected = true; }
        assert(rejected, `${label} was accepted unexpectedly.`);
    };

    try {
        await connection.reducers.installRpgStarterKit({});
        await new Promise<void>((resolve, reject) => {
            connection.subscriptionBuilder()
                .onApplied(() => resolve())
                .onError((_context: unknown, error: unknown) => reject(error))
                .subscribe([
                    'SELECT * FROM room',
                    'SELECT * FROM npc',
                    'SELECT * FROM exit',
                    'SELECT * FROM object_definition',
                    'SELECT * FROM world_object',
                    'SELECT * FROM character_option_definition',
                    'SELECT * FROM currency_definition',
                    'SELECT * FROM vendor_definition',
                    'SELECT * FROM vendor_stock',
                    'SELECT * FROM crafting_recipe',
                    'SELECT * FROM crafting_ingredient',
                    'SELECT * FROM quest_definition',
                    'SELECT * FROM quest_rule',
                    'SELECT * FROM ability_unlock_rule',
                    'SELECT * FROM object_rule',
                    'SELECT * FROM bank_config',
                    'SELECT * FROM vendor_restock_rule',
                    'SELECT * FROM profession_definition',
                    'SELECT * FROM recipe_rule',
                    'SELECT * FROM dialogue_node',
                    'SELECT * FROM dialogue_choice',
                    'SELECT * FROM exit_rule',
                    'SELECT * FROM world_trigger',
                    'SELECT * FROM world_simulation_config',
                ]);
        });

        await insert('rooms', { id: 'admin-smoke-room', name: 'Admin Smoke Room', description: 'A referenced room.', region: 'Admin Smoke', height: 0 });
        await insert('character_option_definitions', { id: 'admin-smoke-origin', option_kind: 'background', name: 'Admin Smoke Origin', description: '', starting_room_id: 'admin-smoke-room', starting_gold: 0, active: true, sort_order: 100 });
        await update('rooms', ['admin-smoke-room'], { name: 'Admin Smoke Room Updated' });

        await insert('npcs', [
            { id: 'admin-smoke-vendor-a', name: 'Vendor A', current_room: startingRoom, spawn_room: startingRoom, behavior_type: 'static', disposition: 'friendly' },
            { id: 'admin-smoke-vendor-b', name: 'Vendor B', current_room: startingRoom, spawn_room: startingRoom, behavior_type: 'static', disposition: 'friendly' },
        ]);
        await insert('currency_definitions', { id: 'admin-token', name: 'Admin Token', icon: 'T', maximum_balance: 1000, tradeable: true });
        await insert('vendor_definitions', { id: 'admin-smoke-vendor', npc_id: 'admin-smoke-vendor-a', name: 'Smoke Vendor', currency_id: 'gold', buys_from_players: true, sell_price_percent: 50, required_reputation: 0 });
        await update('vendor_definitions', ['admin-smoke-vendor'], { npc_id: 'admin-smoke-vendor-b', currency_id: 'admin-token', name: 'Smoke Vendor Updated' });
        await update('npcs', ['admin-smoke-vendor-b'], { name: 'Vendor B Updated' });

        await insert('vendor_stocks', { id: 'admin-smoke-stock', vendor_id: 'admin-smoke-vendor', definition_id: 'wood', price: 2, stock: 0, maximum_per_purchase: 5 });
        await update('vendor_stocks', ['admin-smoke-stock'], { definition_id: 'healing-potion', price: 9, maximum_per_purchase: 2 });

        await insert('crafting_recipes', { id: 'admin-smoke-recipe', name: 'Admin Smoke Recipe', description: '', output_definition_id: 'healing-potion', output_quantity: 1, required_level: 1, currency_cost: 0, active: true });
        await update('crafting_recipes', ['admin-smoke-recipe'], { currency_id: 'admin-token', currency_cost: 3 });
        await insert('crafting_ingredients', { id: 'admin-smoke-ingredient', recipe_id: 'admin-smoke-recipe', definition_id: 'wood', quantity: 1, consumed: true });
        await update('crafting_ingredients', ['admin-smoke-ingredient'], { definition_id: 'iron-sword', quantity: 2 });

        await insert('world_objects', { id: 'admin-smoke-container', definition_id: 'campfire', location_kind: 'room', location_id: startingRoom, quantity: 1 });
        await insert('world_objects', { id: 'admin-smoke-contained', definition_id: 'wood', location_kind: 'container', location_id: 'admin-smoke-container', quantity: 1 });
        await expectRejected(
            () => insert('world_objects', { id: 'admin-smoke-invalid', definition_id: 'wood', location_kind: 'room', location_id: 'missing-room', quantity: 1 }),
            'Missing-room object placement',
        );
        await expectRejected(
            () => update('world_objects', ['admin-smoke-container'], { location_kind: 'container', location_id: 'admin-smoke-contained' }),
            'Cyclic object placement',
        );

        await insert('quest_definitions', [
            { id: 'admin-smoke-quest-a', title: 'Quest A', description: '', quest_giver_npc_id: 'admin-smoke-vendor-a', turn_in_npc_id: 'admin-smoke-vendor-a', required_level: 1, repeatable: false, active: true, xp_reward: 0, gold_reward: 0 },
            { id: 'admin-smoke-quest-b', title: 'Quest B', description: '', quest_giver_npc_id: 'admin-smoke-vendor-a', turn_in_npc_id: 'admin-smoke-vendor-a', required_level: 1, repeatable: false, active: true, xp_reward: 0, gold_reward: 0 },
        ]);
        await insert('quest_rules', { quest_id: 'admin-smoke-quest-b', prerequisite_quest_id: 'admin-smoke-quest-a', prerequisite_completions: 1, time_limit_seconds: 0, failure_on_death: false, maximum_completions: 0 });
        await update('quest_definitions', ['admin-smoke-quest-a'], { title: 'Quest A Updated' });
        await insert('exits', { id: 'admin-smoke-exit', from_room: startingRoom, to_room: 'admin-smoke-room', verb: 'smokeway' });

        await configure('ability_unlock_rules', { ability_id: 'firebolt', required_option_id: 'admin-smoke-origin', required_quest_id: 'admin-smoke-quest-a', required_reputation: 0, talent_cost: 2 });
        await configure('object_rules', { definition_id: 'healing-potion', rarity: 'rare', item_level: 2, required_level: 1, maximum_durability: 1, base_value: 17, repairable: false, two_handed: false, bind_rule: 'none', tradeable: true });
        await configure('bank_configs', { id: 'world', access_mode: 'fixture_or_npc', required_npc_id: 'admin-smoke-vendor-a', slot_limit: 12, deposit_fee: 1, withdrawal_fee: 2, shared_by_identity: false, protects_from_death: true });
        await configure('vendor_restock_rules', { vendor_stock_id: 'admin-smoke-stock', target_stock: 8, restock_quantity: 2, restock_seconds: 30 });
        await configure('profession_definitions', { id: 'admin-smoke-profession', name: 'Smoke Craft', description: '', maximum_rank: 20, xp_per_craft: 3, active: true });
        await configure('recipe_rules', { recipe_id: 'admin-smoke-recipe', profession_id: 'admin-smoke-profession', required_profession_rank: 2, must_be_learned: true, success_percent: 90, cooldown_seconds: 4 });
        await configure('dialogue_nodes', { id: 'admin-smoke-dialogue', npc_id: 'admin-smoke-vendor-a', text: 'The editor works.', entry_node: true, required_quest_id: 'admin-smoke-quest-a', required_reputation: 0, sort_order: 10 });
        await configure('dialogue_choices', { id: 'admin-smoke-choice', node_id: 'admin-smoke-dialogue', label: 'Continue.', action_kind: 'learn_profession', action_reference_id: 'admin-smoke-profession', action_value: 1, sort_order: 10 });
        await configure('exit_rules', { exit_id: 'admin-smoke-exit', is_door: true, closed: true, locked: false, hidden: false, trap_damage: 1, required_option_id: 'admin-smoke-origin' });
        await configure('world_triggers', { id: 'admin-smoke-trigger', event_kind: 'room_enter', source_id: 'admin-smoke-room', conditions_json: { minimum_level: 1, required_option_id: 'admin-smoke-origin' }, actions_json: [{ kind: 'item', definition_id: 'wood', quantity: 1 }], once_per_actor: true, active: true });
        await configure('world_simulation_configs', { id: 'world', mode: 'turn_driven', tick_seconds: 5, day_length_minutes: 90, weather_enabled: true, active: true });

        await expectRejected(
            () => configure('recipe_rules', { recipe_id: 'admin-smoke-recipe', profession_id: 'missing-profession', success_percent: 100 }),
            'Broken recipe-rule reference',
        );
        await expectRejected(
            () => configure('world_triggers', { id: 'bad-trigger', event_kind: 'not_implemented', actions_json: [] }),
            'Unsupported trigger event',
        );

        await waitFor(() => [...connection.db.world_simulation_config.iter()].some((row: any) => row.id === 'world'), 'advanced configuration replication');
        assert([...connection.db.room.iter()].find((row: any) => row.id === 'admin-smoke-room')?.name === 'Admin Smoke Room Updated', 'Referenced room could not be edited.');
        assert([...connection.db.npc.iter()].find((row: any) => row.id === 'admin-smoke-vendor-b')?.name === 'Vendor B Updated', 'Vendor NPC could not be edited.');
        const vendor = [...connection.db.vendor_definition.iter()].find((row: any) => row.id === 'admin-smoke-vendor');
        assert(vendor?.npcId === 'admin-smoke-vendor-b' && vendor?.currencyId === 'admin-token', 'Vendor relationship edits were not persisted.');
        const stock = [...connection.db.vendor_stock.iter()].find((row: any) => row.id === 'admin-smoke-stock');
        assert(stock?.definitionId === 'healing-potion' && Number(stock?.price) === 9, 'Vendor-stock edits were not persisted.');
        const ingredient = [...connection.db.crafting_ingredient.iter()].find((row: any) => row.id === 'admin-smoke-ingredient');
        assert(ingredient?.definitionId === 'iron-sword' && ingredient?.quantity === 2, 'Ingredient edits were not persisted.');
        assert([...connection.db.quest_definition.iter()].find((row: any) => row.id === 'admin-smoke-quest-a')?.title === 'Quest A Updated', 'Referenced quest could not be edited.');
        assert([...connection.db.ability_unlock_rule.iter()].some((row: any) => row.abilityId === 'firebolt' && row.talentCost === 2), 'Ability unlock rule was not saved.');
        assert([...connection.db.object_rule.iter()].some((row: any) => row.definitionId === 'healing-potion' && Number(row.baseValue) === 17), 'Object rule was not saved.');
        assert([...connection.db.bank_config.iter()].some((row: any) => row.id === 'world' && Number(row.depositFee) === 1), 'Bank configuration was not saved.');
        assert([...connection.db.vendor_restock_rule.iter()].some((row: any) => row.vendorStockId === 'admin-smoke-stock' && row.targetStock === 8), 'Vendor restock rule was not saved.');
        assert([...connection.db.profession_definition.iter()].some((row: any) => row.id === 'admin-smoke-profession' && row.maximumRank === 20), 'Profession was not saved.');
        assert([...connection.db.recipe_rule.iter()].some((row: any) => row.recipeId === 'admin-smoke-recipe' && row.requiredProfessionRank === 2), 'Recipe rule was not saved.');
        assert([...connection.db.dialogue_node.iter()].some((row: any) => row.id === 'admin-smoke-dialogue'), 'Dialogue node was not saved.');
        assert([...connection.db.dialogue_choice.iter()].some((row: any) => row.id === 'admin-smoke-choice'), 'Dialogue choice was not saved.');
        assert([...connection.db.exit_rule.iter()].some((row: any) => row.exitId === 'admin-smoke-exit' && row.closed), 'Exit rule was not saved.');
        assert([...connection.db.world_trigger.iter()].some((row: any) => row.id === 'admin-smoke-trigger'), 'World trigger was not saved.');
        assert([...connection.db.world_simulation_config.iter()].some((row: any) => row.id === 'world' && row.dayLengthMinutes === 90), 'Simulation configuration was not saved.');
        await expectRejected(() => remove('rooms', ['admin-smoke-room']), 'Trigger source deletion');
        await connection.reducers.deleteEngineRecord({ tableName: 'recipe_rules', recordId: 'admin-smoke-recipe' });
        await expectRejected(
            () => connection.reducers.deleteEngineRecord({ tableName: 'profession_definitions', recordId: 'admin-smoke-profession' }),
            'Dialogue profession deletion',
        );

        console.log('Admin runtime smoke test passed: placement integrity, relationship edits, advanced systems, and dependency-safe deletion all passed authoritative validation.');
    } finally {
        connection?.disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
