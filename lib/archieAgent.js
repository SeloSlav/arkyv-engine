import { Agent, OpenAIProvider, Runner, tool } from '@openai/agents';
import { z } from 'zod';
import { getAgentAIConfig } from '@/lib/aiProvider';
import {
  ARCHIE_CONTENT_TABLES,
  ARCHIE_ENGINE_TABLES,
  ARCHIE_TABLE_GUIDES,
  getArchiePrimaryKey,
  summarizeArchieOperations,
} from '@/lib/archieWorld';

const MAX_WORLD_BYTES = 3_500_000;
const MAX_WORLD_ROWS = 3_000;
const MAX_CHANGED_RECORDS = 220;
const MAX_TOOL_CALLS = 28;
const MAX_INSPECT_ROWS = 20;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CHARS = 12_000;
const TABLE_SET = new Set(ARCHIE_CONTENT_TABLES);

const REFERENCES = {
  rooms: { region_name: 'regions' },
  exits: { from_room: 'rooms', to_room: 'rooms' },
  npcs: { current_room: 'rooms', spawn_room: 'rooms', faction: 'faction_definitions' },
  actor_stats: { actor_id: 'npcs', stat_definition_id: 'stat_definitions' },
  world_objects: { definition_id: 'object_definitions' },
  loot_table_entries: { npc_id: 'npcs', definition_id: 'object_definitions' },
  ability_effect_definitions: { ability_id: 'ability_definitions' },
  quest_definitions: {
    quest_giver_npc_id: 'npcs',
    turn_in_npc_id: 'npcs',
    required_faction_id: 'faction_definitions',
    reputation_faction_id: 'faction_definitions',
  },
  quest_objectives: { quest_id: 'quest_definitions' },
  quest_item_rewards: { quest_id: 'quest_definitions', definition_id: 'object_definitions' },
  quest_rules: {
    quest_id: 'quest_definitions',
    prerequisite_quest_id: 'quest_definitions',
    required_option_id: 'character_option_definitions',
    required_faction_id: 'faction_definitions',
  },
  quest_choices: { quest_id: 'quest_definitions' },
  character_option_definitions: { starting_room_id: 'rooms' },
  character_option_grants: { option_id: 'character_option_definitions' },
  vendor_definitions: { npc_id: 'npcs' },
  vendor_stocks: { vendor_id: 'vendor_definitions', definition_id: 'object_definitions' },
  crafting_recipes: {
    output_definition_id: 'object_definitions',
    station_definition_id: 'object_definitions',
  },
  crafting_ingredients: { recipe_id: 'crafting_recipes', definition_id: 'object_definitions' },
  spawn_points: {
    room_id: 'rooms',
    required_option_id: 'character_option_definitions',
    required_faction_id: 'faction_definitions',
  },
  ability_unlock_rules: {
    ability_id: 'ability_definitions',
    required_option_id: 'character_option_definitions',
    prerequisite_ability_id: 'ability_definitions',
    required_quest_id: 'quest_definitions',
    required_faction_id: 'faction_definitions',
  },
  object_rules: { definition_id: 'object_definitions', required_option_id: 'character_option_definitions' },
  vendor_restock_rules: { vendor_stock_id: 'vendor_stocks' },
  recipe_rules: { recipe_id: 'crafting_recipes', profession_id: 'profession_definitions' },
  dialogue_nodes: {
    npc_id: 'npcs',
    required_quest_id: 'quest_definitions',
    required_faction_id: 'faction_definitions',
  },
  dialogue_choices: { node_id: 'dialogue_nodes', next_node_id: 'dialogue_nodes' },
  exit_rules: {
    exit_id: 'exits',
    key_definition_id: 'object_definitions',
    required_quest_id: 'quest_definitions',
    required_option_id: 'character_option_definitions',
  },
  world_triggers: { source_id: 'rooms' },
};

const stringify = (value) => JSON.stringify(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizedText = (value) => String(value || '').trim().toLowerCase();

function assertTable(table) {
  if (!TABLE_SET.has(table)) throw new Error(`Archie cannot access table "${table}".`);
}

function parseJson(value, label, expected) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
  if (expected === 'array' && !Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
  if (expected === 'object' && (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function compactValue(value) {
  if (typeof value === 'string' && value.length > 1_200) return `${value.slice(0, 1_200)}…`;
  if (Array.isArray(value)) return value.map(compactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, compactValue(nested)]));
  }
  return value;
}

function sanitizeWorld(world) {
  if (world?.format !== 'arkyv-world' || !world.tables || typeof world.tables !== 'object') {
    throw new Error('Archie requires a current Arkyv world bundle.');
  }
  const tables = {};
  let rowCount = 0;
  for (const table of ARCHIE_CONTENT_TABLES) {
    const rows = world.tables[table];
    if (!Array.isArray(rows)) throw new Error(`World bundle is missing table "${table}".`);
    tables[table] = rows.map((row) => {
      if (!row || Array.isArray(row) || typeof row !== 'object') {
        throw new Error(`World table "${table}" contains an invalid record.`);
      }
      return clone(row);
    });
    rowCount += rows.length;
  }
  if (rowCount > MAX_WORLD_ROWS) {
    throw new Error(`This world has ${rowCount} authored rows; Archie currently supports at most ${MAX_WORLD_ROWS} per run.`);
  }
  if (stringify(tables).length > MAX_WORLD_BYTES) {
    throw new Error('This world is too large for a single Archie run. Ask Archie to work from a smaller exported scope.');
  }
  return tables;
}

class ArchieDraft {
  constructor(worldTables, emit) {
    this.base = clone(worldTables);
    this.tables = clone(worldTables);
    this.emit = emit;
    this.toolCalls = 0;
  }

  call(name, detail) {
    this.toolCalls += 1;
    if (this.toolCalls > MAX_TOOL_CALLS) {
      throw new Error(`Archie reached the ${MAX_TOOL_CALLS}-tool safety limit.`);
    }
    this.emit({ type: 'tool', name, detail, sequence: this.toolCalls });
  }

  schema(table) {
    assertTable(table);
    this.call('inspect_schema', `Inspecting ${table}`);
    const rows = this.tables[table] || [];
    const example = rows[0] ? compactValue(rows[0]) : null;
    const observedFields = [...new Set(rows.slice(0, 8).flatMap((row) => Object.keys(row)))].sort();
    return {
      table,
      primary_key: getArchiePrimaryKey(table),
      engine_record: ARCHIE_ENGINE_TABLES.has(table),
      guide: ARCHIE_TABLE_GUIDES[table] || {
        purpose: 'Admin-authored world content.',
        required: [getArchiePrimaryKey(table)],
        notes: 'Inspect existing records before staging changes.',
      },
      observed_fields: observedFields,
      example,
      record_count: rows.length,
    };
  }

  inspect(table, query, limit) {
    assertTable(table);
    const requestedLimit = Math.max(1, Math.min(Number(limit) || 10, MAX_INSPECT_ROWS));
    const needle = normalizedText(query);
    const rows = (this.tables[table] || []).filter(
      (row) => !needle || normalizedText(stringify(row)).includes(needle),
    );
    this.call('inspect_world', `Read ${Math.min(rows.length, requestedLimit)} ${table} record${rows.length === 1 ? '' : 's'}`);
    return {
      table,
      total_matches: rows.length,
      records: rows.slice(0, requestedLimit).map(compactValue),
    };
  }

  findRooms(query, limit) {
    const needle = normalizedText(query);
    const requestedLimit = Math.max(1, Math.min(Number(limit) || 10, MAX_INSPECT_ROWS));
    const rows = this.tables.rooms.filter((room) => (
      !needle
      || normalizedText(room.id).includes(needle)
      || normalizedText(room.name).includes(needle)
      || normalizedText(room.region_name || room.region).includes(needle)
    ));
    this.call('find_rooms', `Found ${Math.min(rows.length, requestedLimit)} matching room${rows.length === 1 ? '' : 's'}`);
    return rows.slice(0, requestedLimit).map(compactValue);
  }

  changedRecordCount() {
    return summarizeArchieOperations(this.buildOperations()).records;
  }

  assertChangeBudget() {
    const changed = this.changedRecordCount();
    if (changed > MAX_CHANGED_RECORDS) {
      throw new Error(`That would change ${changed} records; Archie is limited to ${MAX_CHANGED_RECORDS} per run.`);
    }
  }

  insert(table, records) {
    assertTable(table);
    if (records.length === 0 || records.length > 50) throw new Error('Stage between 1 and 50 records per call.');
    const key = getArchiePrimaryKey(table);
    const current = this.tables[table];
    const existingIds = new Set(current.map((row) => String(row[key])));
    const callIds = new Set();
    for (const record of records) {
      if (!record || Array.isArray(record) || typeof record !== 'object') throw new Error('Every staged record must be an object.');
      const id = record[key];
      if (id == null || String(id).trim() === '') throw new Error(`${table} records require primary key "${key}".`);
      if (existingIds.has(String(id)) || callIds.has(String(id))) throw new Error(`${table} record "${id}" already exists.`);
      callIds.add(String(id));
      current.push(clone(record));
    }
    this.assertChangeBudget();
    this.call('stage_insert', `Staged ${records.length} new ${table} record${records.length === 1 ? '' : 's'}`);
    return { staged: records.length, table, changed_records: this.changedRecordCount() };
  }

  update(table, recordId, changes) {
    assertTable(table);
    const key = getArchiePrimaryKey(table);
    const index = this.tables[table].findIndex((row) => String(row[key]) === String(recordId));
    if (index === -1) throw new Error(`${table} record "${recordId}" does not exist.`);
    if (Object.prototype.hasOwnProperty.call(changes, key) && String(changes[key]) !== String(recordId)) {
      throw new Error(`Archie cannot change the primary key "${key}".`);
    }
    this.tables[table][index] = { ...this.tables[table][index], ...clone(changes), [key]: this.tables[table][index][key] };
    this.assertChangeBudget();
    this.call('stage_update', `Staged an update to ${table} "${recordId}"`);
    return { staged: 1, table, record_id: recordId, changed_records: this.changedRecordCount() };
  }

  delete(table, ids) {
    assertTable(table);
    if (ids.length === 0 || ids.length > 50) throw new Error('Stage between 1 and 50 ids per call.');
    const key = getArchiePrimaryKey(table);
    const requested = new Set(ids.map(String));
    const found = new Set(
      this.tables[table].filter((row) => requested.has(String(row[key]))).map((row) => String(row[key])),
    );
    const missing = [...requested].filter((id) => !found.has(id));
    if (missing.length) throw new Error(`${table} record${missing.length === 1 ? '' : 's'} not found: ${missing.join(', ')}`);
    this.tables[table] = this.tables[table].filter((row) => !requested.has(String(row[key])));
    this.assertChangeBudget();
    this.call('stage_delete', `Staged deletion of ${ids.length} ${table} record${ids.length === 1 ? '' : 's'}`);
    return { staged: ids.length, table, changed_records: this.changedRecordCount(), requires_admin_approval: true };
  }

  validate() {
    const errors = [];
    const warnings = [];
    const idsByTable = new Map();
    const baseIdsByTable = new Map();
    const changedIdsByTable = new Map();
    for (const table of ARCHIE_CONTENT_TABLES) {
      const key = getArchiePrimaryKey(table);
      const ids = new Set();
      const baseRows = this.base[table] || [];
      const baseById = new Map(baseRows.map((row) => [String(row[key]), row]));
      const changedIds = new Set();
      for (const row of this.tables[table]) {
        const id = row[key];
        if (id == null || String(id).trim() === '') {
          errors.push(`${table} contains a record without primary key "${key}".`);
          continue;
        }
        if (ids.has(String(id))) errors.push(`${table} contains duplicate "${id}".`);
        ids.add(String(id));
        const baseRow = baseById.get(String(id));
        if (!baseRow || stringify(baseRow) !== stringify(row)) {
          changedIds.add(String(id));
          const required = ARCHIE_TABLE_GUIDES[table]?.required || [key];
          for (const field of required) {
            if (row[field] == null || (typeof row[field] === 'string' && !row[field].trim())) {
              errors.push(`${table}:${id} is missing required field "${field}".`);
            }
          }
        }
      }
      idsByTable.set(table, ids);
      baseIdsByTable.set(table, new Set(baseRows.map((row) => String(row[key]))));
      changedIdsByTable.set(table, changedIds);
    }

    for (const [table, references] of Object.entries(REFERENCES)) {
      const key = getArchiePrimaryKey(table);
      for (const row of this.tables[table] || []) {
        for (const [field, targetTable] of Object.entries(references)) {
          const value = row[field];
          if (value == null || value === '') continue;
          if (!idsByTable.get(targetTable)?.has(String(value))) {
            const sourceChanged = changedIdsByTable.get(table)?.has(String(row[key]));
            const targetWasDeleted = baseIdsByTable.get(targetTable)?.has(String(value));
            if (sourceChanged || targetWasDeleted) {
              errors.push(`${table}:${row[key]} references missing ${targetTable} "${value}" through ${field}.`);
            }
          }
        }
      }
    }

    const entryNodesByNpc = new Map();
    for (const node of this.tables.dialogue_nodes || []) {
      if (!node.entry_node) continue;
      entryNodesByNpc.set(node.npc_id, (entryNodesByNpc.get(node.npc_id) || 0) + 1);
    }
    for (const [npcId, count] of entryNodesByNpc) {
      if (count > 1) warnings.push(`NPC "${npcId}" has ${count} entry dialogue nodes.`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.slice(0, 80),
      warnings: warnings.slice(0, 80),
      changed_records: this.changedRecordCount(),
      operation_summary: summarizeArchieOperations(this.buildOperations()),
    };
  }

  buildOperations() {
    const operations = [];
    const deleteOperations = [];
    for (const table of ARCHIE_CONTENT_TABLES) {
      const key = getArchiePrimaryKey(table);
      const beforeRows = this.base[table] || [];
      const afterRows = this.tables[table] || [];
      const before = new Map(beforeRows.map((row) => [String(row[key]), row]));
      const after = new Map(afterRows.map((row) => [String(row[key]), row]));

      const inserted = afterRows.filter((row) => !before.has(String(row[key])));
      if (inserted.length) {
        if (ARCHIE_ENGINE_TABLES.has(table)) {
          for (const record of inserted) operations.push({ action: 'configure', table, record });
        } else {
          operations.push({ action: 'insert', table, records: inserted });
        }
      }

      for (const row of afterRows) {
        const id = String(row[key]);
        const old = before.get(id);
        if (!old || stringify(old) === stringify(row)) continue;
        if (ARCHIE_ENGINE_TABLES.has(table)) {
          operations.push({ action: 'configure', table, record: row });
        } else {
          const changes = Object.fromEntries(
            Object.entries(row).filter(([field, value]) => (
              field !== key && stringify(value) !== stringify(old[field])
            )),
          );
          operations.push({ action: 'update', table, ids: [id], changes });
        }
      }

      const deleted = beforeRows.filter((row) => !after.has(String(row[key]))).map((row) => String(row[key]));
      if (deleted.length) {
        deleteOperations.push({
          action: ARCHIE_ENGINE_TABLES.has(table) ? 'delete_engine' : 'delete',
          table,
          ids: deleted,
        });
      }
    }
    // Parent definitions are inserted first, while dependent records must be
    // removed first. Reverse dependency order keeps room exits, quest children,
    // recipe ingredients, and advanced rules ahead of their parents.
    return [...operations, ...deleteOperations.reverse()];
  }
}

function compactHistory(history) {
  if (!Array.isArray(history)) return [];
  let used = 0;
  const selected = [];
  for (const message of history.slice(-MAX_HISTORY_MESSAGES).reverse()) {
    if (!['user', 'assistant'].includes(message?.role) || typeof message.content !== 'string') continue;
    const content = message.content.slice(0, 3_000);
    if (used + content.length > MAX_HISTORY_CHARS) break;
    selected.unshift({ role: message.role, content });
    used += content.length;
  }
  return selected;
}

function buildInstructions(worldTables) {
  const counts = Object.fromEntries(
    ARCHIE_CONTENT_TABLES.map((table) => [table, worldTables[table]?.length || 0]),
  );
  return `You are Archie, Arkyv's careful worldwright inside the visual admin editor.

You may inspect and stage changes to this MUD through the supplied tools. Work autonomously on the requested in-scope game content, then stop and report exactly what you staged.

Rules:
- Inspect relevant schemas and existing records before changing anything.
- Never invent a referenced id without also staging the referenced record first.
- Use stable lowercase slug ids, concise player-facing names, and atmospheric playable prose.
- For normal two-way room connections, create both directed exit records with reverse verbs.
- Never edit administrator roles, profiles, player characters, credentials, live inventories, or live player progress.
- Never put secrets, HTML, executable code, SQL, or shell commands in content.
- Updates and new content may be staged autonomously. Deletions are staged but always require the administrator's explicit approval before commit.
- Keep the request coherent and playable. Do not expand the scope merely to use more tools.
- Call validate_draft after staging. If it reports errors, fix them and validate again.
- Finish with a concise report naming the created/updated systems and any important design choices. Do not expose private chain-of-thought.

Current authored record counts:
${JSON.stringify(counts)}

Available content tables:
${ARCHIE_CONTENT_TABLES.join(', ')}`;
}

function createTools(draft) {
  return [
    tool({
      name: 'inspect_schema',
      description: 'Inspect a world-content table purpose, primary key, observed fields, and one current example before authoring it.',
      parameters: z.object({ table: z.enum(ARCHIE_CONTENT_TABLES) }),
      execute: async ({ table }) => stringify(draft.schema(table)),
    }),
    tool({
      name: 'inspect_world',
      description: 'Read current or already-staged records from one content table. Use a blank query to list records.',
      parameters: z.object({
        table: z.enum(ARCHIE_CONTENT_TABLES),
        query: z.string().describe('Case-insensitive text to match anywhere in a record; use an empty string for all.'),
        limit: z.number().int().min(1).max(MAX_INSPECT_ROWS),
      }),
      execute: async ({ table, query, limit }) => stringify(draft.inspect(table, query, limit)),
    }),
    tool({
      name: 'find_rooms',
      description: 'Resolve rooms by stable id, player-facing name, or region before connecting or placing content.',
      parameters: z.object({
        query: z.string().describe('Room id, room name, region, or a partial match.'),
        limit: z.number().int().min(1).max(MAX_INSPECT_ROWS),
      }),
      execute: async ({ query, limit }) => stringify(draft.findRooms(query, limit)),
    }),
    tool({
      name: 'stage_insert',
      description: 'Stage new admin-authored records. records_json must be a JSON array of complete records using the inspected schema.',
      parameters: z.object({
        table: z.enum(ARCHIE_CONTENT_TABLES),
        records_json: z.string(),
      }),
      execute: async ({ table, records_json }) => stringify(draft.insert(table, parseJson(records_json, 'records_json', 'array'))),
    }),
    tool({
      name: 'stage_update',
      description: 'Stage changes to one existing record. changes_json is a JSON object containing only intended field values.',
      parameters: z.object({
        table: z.enum(ARCHIE_CONTENT_TABLES),
        record_id: z.string().min(1),
        changes_json: z.string(),
      }),
      execute: async ({ table, record_id, changes_json }) => stringify(
        draft.update(table, record_id, parseJson(changes_json, 'changes_json', 'object')),
      ),
    }),
    tool({
      name: 'stage_delete',
      description: 'Stage deletion of existing authored records. The administrator must explicitly approve the final patch before deletions are committed.',
      parameters: z.object({
        table: z.enum(ARCHIE_CONTENT_TABLES),
        record_ids: z.array(z.string().min(1)).min(1).max(50),
      }),
      execute: async ({ table, record_ids }) => stringify(draft.delete(table, record_ids)),
    }),
    tool({
      name: 'validate_draft',
      description: 'Validate staged primary keys, required fields, references, and dialogue entry nodes. Call after staging and repair every error.',
      parameters: z.object({}),
      execute: async () => {
        draft.call('validate_draft', 'Checking staged world references and required fields');
        return stringify(draft.validate());
      },
    }),
  ];
}

export async function runArchieAgent({ prompt, world, history, emit, signal }) {
  const trimmedPrompt = String(prompt || '').trim();
  if (!trimmedPrompt) throw new Error('Tell Archie what to build or change.');
  if (trimmedPrompt.length > 8_000) throw new Error('Archie prompts are limited to 8,000 characters.');

  const worldTables = sanitizeWorld(world);
  const providerConfig = getAgentAIConfig();
  const draft = new ArchieDraft(worldTables, emit);
  const provider = new OpenAIProvider({
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseUrl,
    useResponses: providerConfig.api === 'responses',
    strictFeatureValidation: false,
  });
  const runner = new Runner({
    modelProvider: provider,
    tracingDisabled: process.env.ARCHIE_TRACING !== 'true',
    traceIncludeSensitiveData: false,
    workflowName: 'Arkyv Archie worldwright',
  });

  const agent = new Agent({
    name: 'Archie',
    instructions: buildInstructions(worldTables),
    model: providerConfig.model,
    tools: createTools(draft),
    ...(providerConfig.provider === 'openai' && providerConfig.api === 'responses'
      ? {
          modelSettings: {
            reasoning: { effort: process.env.OPENAI_AGENT_REASONING_EFFORT?.trim() || 'low' },
            text: { verbosity: 'low' },
          },
        }
      : {}),
  });

  const compactedHistory = compactHistory(history);
  const input = compactedHistory.length
    ? [
        ...compactedHistory,
        { role: 'user', content: trimmedPrompt },
      ]
    : trimmedPrompt;

  emit({
    type: 'status',
    status: 'thinking',
    message: 'Archie is thinking…',
    provider: providerConfig.provider,
    model: providerConfig.model,
  });

  try {
    const result = await runner.run(agent, input, {
      maxTurns: 18,
      signal,
      toolNotFoundBehavior: 'return_error_to_model',
    });
    const operations = draft.buildOperations();
    const validation = draft.validate();
    const report = typeof result.finalOutput === 'string'
      ? result.finalOutput.trim()
      : stringify(result.finalOutput || 'Archie finished without a written report.');
    return {
      runId: `archie-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      report,
      operations,
      summary: summarizeArchieOperations(operations),
      validation,
      provider: providerConfig.provider,
      model: providerConfig.model,
      toolCalls: draft.toolCalls,
    };
  } finally {
    await provider.close().catch(() => {});
  }
}
