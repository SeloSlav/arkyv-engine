import { DbConnection } from '@/generated';

const TABLES = {
  regions: 'region',
  rooms: 'room',
  characters: 'character',
  profiles: 'profile',
  npcs: 'npc',
  exits: 'exit',
  commands: 'command',
  room_messages: 'room_message',
  region_chats: 'region_chat',
};

const PRIMARY_KEYS = { regions: 'name' };
const JSON_FIELDS = new Set(['color_scheme', 'dialogue_tree', 'conversation_history']);
const SPACETIME_URI = (process.env.NEXT_PUBLIC_SPACETIMEDB_URI || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const DATABASE_NAME = process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME || 'arkyv-engine';

let connection = null;
let identity = null;
let connectionToken = null;
let readyPromise = Promise.resolve();
let activeConnectionId = 0;

const connectionListeners = new Set();

function emitConnection(state) {
  connectionListeners.forEach((listener) => listener(state));
}

function toSnakeCase(value) {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function normalizeValue(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
  }
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value?.toHexString === 'function') return value.toHexString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [toSnakeCase(key), normalizeValue(nested)]));
  }
  return value;
}

function normalizeRow(tableName, row) {
  const normalized = normalizeValue(row);
  for (const field of JSON_FIELDS) {
    if (typeof normalized[field] === 'string') {
      try {
        normalized[field] = JSON.parse(normalized[field]);
      } catch {
        // Keep malformed legacy JSON visible instead of dropping the row.
      }
    }
  }
  return normalized;
}

function tableHandle(tableName) {
  if (!connection) return null;
  const accessor = TABLES[tableName];
  return accessor ? connection.db[accessor] : null;
}

function plainRows(tableName) {
  const handle = tableHandle(tableName);
  if (!handle) return [];
  return [...handle.iter()].map((row) => normalizeRow(tableName, row));
}

function enrichRows(tableName, rows) {
  if (tableName === 'rooms') {
    const regions = new Map(plainRows('regions').map((region) => [region.name, region]));
    return rows.map((room) => ({ ...room, regions: regions.get(room.region_name) || null }));
  }
  if (tableName === 'exits') {
    const rooms = new Map(plainRows('rooms').map((room) => [room.id, room]));
    return rows.map((exit) => ({ ...exit, rooms: rooms.get(exit.to_room) || null }));
  }
  if (tableName === 'characters') {
    const regions = new Map(plainRows('regions').map((region) => [region.name, region]));
    const rooms = new Map(plainRows('rooms').map((room) => [room.id, { ...room, regions: regions.get(room.region_name) || null }]));
    return rows.map((character) => ({ ...character, rooms: rooms.get(character.current_room) || null }));
  }
  return rows;
}

function splitTopLevel(input) {
  const result = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === '(') depth += 1;
    else if (input[index] === ')') depth -= 1;
    else if (input[index] === ',' && depth === 0) {
      result.push(input.slice(start, index));
      start = index + 1;
    }
  }
  result.push(input.slice(start));
  return result.filter(Boolean);
}

function compareCondition(row, condition) {
  const firstDot = condition.indexOf('.');
  const secondDot = condition.indexOf('.', firstDot + 1);
  if (firstDot === -1 || secondDot === -1) return false;
  const field = condition.slice(0, firstDot);
  const operator = condition.slice(firstDot + 1, secondDot);
  const rawValue = condition.slice(secondDot + 1);
  const value = rawValue === 'null' ? null : rawValue;
  const actual = row[field];
  if (operator === 'eq') return String(actual) === String(value);
  if (operator === 'neq') return String(actual) !== String(value);
  if (operator === 'is') return value === null ? actual == null : String(actual) === String(value);
  if (operator === 'ilike') {
    const needle = String(value).replaceAll('%', '').toLowerCase();
    return String(actual || '').toLowerCase().includes(needle);
  }
  return false;
}

function matchesOr(row, expression) {
  return splitTopLevel(expression).some((part) => {
    const trimmed = part.trim();
    if (trimmed.startsWith('and(') && trimmed.endsWith(')')) {
      return splitTopLevel(trimmed.slice(4, -1)).every((condition) => compareCondition(row, condition));
    }
    return compareCondition(row, trimmed);
  });
}

function prepareRows(tableName, payload) {
  const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ ...row }));
  const now = new Date().toISOString();
  for (const row of rows) {
    if (tableName !== 'regions' && !row.id) row.id = crypto.randomUUID();
    if (['regions', 'characters', 'npcs', 'commands', 'region_chats'].includes(tableName) && !row.created_at) row.created_at = now;
    if (tableName === 'commands' && !row.id) row.id = crypto.randomUUID();
  }
  return rows;
}

function serializableRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !['owner', 'rooms', 'regions'].includes(key))));
}

async function callReducer(name, args) {
  await readyPromise;
  if (!connection) throw new Error('Not connected to SpacetimeDB. Select or create a saved world first.');
  const reducer = connection.reducers[name];
  if (!reducer) throw new Error(`Generated reducer ${name} is unavailable.`);
  await reducer(args);
}

async function completeAiCommand(row) {
  if (!row.raw?.trim().toLowerCase().startsWith('talk ')) return;
  const roomId = row.room_id;
  const [alias, ...messageParts] = row.raw.trim().slice(5).split(/\s+/);
  const npc = plainRows('npcs').find((candidate) => candidate.current_room === roomId && candidate.alias?.toLowerCase() === alias?.toLowerCase());
  if (!npc) return;

  let response = '*seems distracted and does not respond clearly*';
  try {
    const apiResponse = await fetch('/api/arkyv/npc-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npcName: npc.name,
        npcDescription: npc.description,
        personality: npc.dialogue_tree?.personality,
        playerMessage: messageParts.join(' ') || 'hello',
        conversationHistory: row.conversation_history || [],
      }),
    });
    const data = await apiResponse.json();
    if (apiResponse.ok && data.response) response = data.response;
  } catch (error) {
    console.error('NPC response generation failed:', error);
  }
  await callReducer('completeNpcCommand', { commandId: row.id, response });
}

class SpacetimeQuery {
  constructor(tableName) {
    this.tableName = tableName;
    this.filters = [];
    this.orExpression = null;
    this.ordering = null;
    this.maxRows = null;
    this.mode = 'many';
    this.mutation = null;
    this.payload = null;
    this.returning = false;
    this.filterFields = new Set();
  }

  select() { this.returning = true; return this; }
  insert(payload) { this.mutation = 'insert'; this.payload = payload; return this; }
  update(payload) { this.mutation = 'update'; this.payload = payload; return this; }
  delete() { this.mutation = 'delete'; return this; }
  eq(field, value) { this.filterFields.add(field); this.filters.push((row) => String(row[field]) === String(value)); return this; }
  neq(field, value) { this.filterFields.add(field); this.filters.push((row) => String(row[field]) !== String(value)); return this; }
  is(field, value) { this.filterFields.add(field); this.filters.push((row) => value === null ? row[field] == null : row[field] === value); return this; }
  in(field, values) { this.filterFields.add(field); this.filters.push((row) => values.map(String).includes(String(row[field]))); return this; }
  gt(field, value) { this.filters.push((row) => row[field] > value); return this; }
  gte(field, value) { this.filters.push((row) => row[field] >= value); return this; }
  lt(field, value) { this.filters.push((row) => row[field] < value); return this; }
  lte(field, value) { this.filters.push((row) => row[field] <= value); return this; }
  ilike(field, pattern) { const needle = String(pattern).replaceAll('%', '').toLowerCase(); this.filters.push((row) => String(row[field] || '').toLowerCase().includes(needle)); return this; }
  not(field, operator, value) { this.filters.push((row) => operator === 'is' ? row[field] !== value : String(row[field]) !== String(value)); return this; }
  match(values) { Object.entries(values).forEach(([field, value]) => this.eq(field, value)); return this; }
  or(expression) { this.orExpression = expression; return this; }
  order(field, options = {}) { this.ordering = { field, ascending: options.ascending !== false }; return this; }
  limit(value) { this.maxRows = value; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybeSingle'; return this; }

  applyFilters(rows) {
    let result = rows;
    const owner = identity?.toHexString?.();
    if (owner && this.tableName === 'characters' && !this.filterFields.has('current_room')) {
      result = result.filter((row) => row.owner === owner);
    }
    if (owner && ['profiles', 'commands'].includes(this.tableName) && !this.filterFields.has('current_room')) {
      result = result.filter((row) => row.owner === owner);
    }
    result = result.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.orExpression) result = result.filter((row) => matchesOr(row, this.orExpression));
    if (this.ordering) {
      const { field, ascending } = this.ordering;
      result.sort((left, right) => {
        const comparison = String(left[field] ?? '').localeCompare(String(right[field] ?? ''), undefined, { numeric: true });
        return ascending ? comparison : -comparison;
      });
    }
    if (this.maxRows !== null) result = result.slice(0, this.maxRows);
    return result;
  }

  shape(data) {
    if (this.mode === 'single') {
      if (data.length !== 1) return { data: null, error: new Error(`Expected one ${this.tableName} row, found ${data.length}.`) };
      return { data: data[0], error: null };
    }
    if (this.mode === 'maybeSingle') {
      if (data.length > 1) return { data: null, error: new Error(`Expected at most one ${this.tableName} row, found ${data.length}.`) };
      return { data: data[0] || null, error: null };
    }
    return { data, error: null };
  }

  async execute() {
    try {
      await readyPromise;
      const visibleRows = enrichRows(this.tableName, plainRows(this.tableName));
      const matched = this.applyFilters(visibleRows);

      if (this.mutation === 'insert') {
        const rows = prepareRows(this.tableName, this.payload);
        if (this.tableName === 'commands') {
          for (const row of rows) {
            await callReducer('submitCommand', {
              commandId: row.id,
              raw: row.raw,
              characterId: row.character_id || null,
              roomId: row.room_id || null,
              conversationHistory: row.conversation_history ? JSON.stringify(row.conversation_history) : null,
            });
            await completeAiCommand(row);
          }
        } else {
          await callReducer('insertRows', { tableName: this.tableName, payloadJson: JSON.stringify(serializableRows(rows)) });
        }
        return this.shape(rows);
      }

      if (this.mutation === 'update') {
        const primaryKey = PRIMARY_KEYS[this.tableName] || 'id';
        const ids = matched.map((row) => String(row[primaryKey]));
        await callReducer('updateRows', { tableName: this.tableName, idsJson: JSON.stringify(ids), payloadJson: JSON.stringify(this.payload) });
        return this.shape(matched.map((row) => ({ ...row, ...this.payload })));
      }

      if (this.mutation === 'delete') {
        const primaryKey = PRIMARY_KEYS[this.tableName] || 'id';
        const ids = matched.map((row) => String(row[primaryKey]));
        await callReducer('deleteRows', { tableName: this.tableName, idsJson: JSON.stringify(ids) });
        return { data: this.returning ? matched : null, error: null };
      }

      return this.shape(matched);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (normalized.message.includes('23505')) normalized.code = '23505';
      return { data: null, error: normalized };
    }
  }

  then(resolve, reject) { return this.execute().then(resolve, reject); }
}

class RealtimeChannel {
  constructor(name) {
    this.name = name;
    this.bindings = [];
    this.attached = [];
    this.statusHandler = null;
  }

  on(event, config, callback) {
    if (event === 'subscribe') this.statusHandler = typeof config === 'function' ? config : callback;
    else if (event === 'postgres_changes') this.bindings.push({ config, callback });
    return this;
  }

  subscribe() {
    readyPromise.then(() => {
      for (const binding of this.bindings) {
        const handle = tableHandle(binding.config.table);
        if (!handle) continue;
        const handler = (_context, row) => {
          const normalized = normalizeRow(binding.config.table, row);
          const filter = binding.config.filter;
          if (filter) {
            const match = filter.match(/^([^=]+)=eq\.(.+)$/);
            if (match && String(normalized[match[1]]) !== match[2]) return;
          }
          binding.callback({ eventType: 'INSERT', new: normalized, old: null });
        };
        handle.onInsert(handler);
        this.attached.push({ handle, handler });
      }
      this.statusHandler?.('SUBSCRIBED');
    }).catch((error) => this.statusHandler?.('CHANNEL_ERROR', error));
    return this;
  }

  unsubscribe() {
    this.attached.forEach(({ handle, handler }) => handle.removeOnInsert(handler));
    this.attached = [];
    return Promise.resolve('ok');
  }
}

class SpacetimeClient {
  constructor() {
    this.auth = {
      getSession: async () => {
        await readyPromise;
        const id = identity?.toHexString?.();
        return {
          data: {
            session: id ? { user: { id }, access_token: connectionToken } : null,
          },
          error: null,
        };
      },
      onAuthStateChange: (callback) => {
        const unsubscribe = subscribeToConnection((state) => {
          const id = state.identity?.toHexString?.();
          const session = state.status === 'connected' && id
            ? { user: { id }, access_token: state.token }
            : null;
          callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
        });
        return { data: { subscription: { unsubscribe } } };
      },
      signOut: async () => {
        disconnectSpacetime();
        return { error: null };
      },
    };
  }

  from(tableName) { return new SpacetimeQuery(tableName); }
  channel(name) { return new RealtimeChannel(name); }
  removeChannel(channel) { return channel?.unsubscribe?.() || Promise.resolve(); }
  async rpc(name) {
    if (name !== 'delete_user_account') return { data: null, error: new Error(`Unknown RPC: ${name}`) };
    try {
      await callReducer('deleteCurrentAccount', {});
      return { data: true, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }
}

const client = new SpacetimeClient();

export function getSpacetimeClient() { return client; }
export default getSpacetimeClient;

export function subscribeToConnection(listener) {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

export function getSpacetimeConnection() { return connection; }
export function getSpacetimeIdentity() { return identity; }
export function getSpacetimeToken() { return connectionToken; }
export function whenSpacetimeReady() { return readyPromise; }

export function disconnectSpacetime() {
  activeConnectionId += 1;
  if (connection) connection.disconnect();
  connection = null;
  identity = null;
  connectionToken = null;
  readyPromise = Promise.resolve();
  emitConnection({ status: 'disconnected' });
}

export function connectSpacetime(token) {
  disconnectSpacetime();
  const connectionId = ++activeConnectionId;
  readyPromise = new Promise((resolve, reject) => {
    let builder = DbConnection.builder()
      .withUri(SPACETIME_URI)
      .withDatabaseName(DATABASE_NAME)
      .withConfirmedReads(false)
      .onConnect((connected, connectedIdentity, issuedToken) => {
        if (connectionId !== activeConnectionId) return;
        connection = connected;
        identity = connectedIdentity;
        connectionToken = issuedToken;
        const queries = Object.values(TABLES).map((table) => `SELECT * FROM ${table}`);
        connected.subscriptionBuilder()
          .onApplied(() => {
            if (connectionId !== activeConnectionId) return;
            emitConnection({ status: 'connected', identity, token: connectionToken });
            resolve({ connection, identity, token: connectionToken });
          })
          .onError((_context, error) => reject(error))
          .subscribe(queries);
      })
      .onConnectError((_context, error) => {
        if (connectionId !== activeConnectionId) return;
        emitConnection({ status: 'error', error });
        reject(error);
      })
      .onDisconnect(() => {
        if (connectionId !== activeConnectionId) return;
        connection = null;
        identity = null;
        connectionToken = null;
        emitConnection({ status: 'disconnected' });
      });
    if (token) builder = builder.withToken(token);
    connection = builder.build();
  });
  emitConnection({ status: 'connecting' });
  return readyPromise;
}
