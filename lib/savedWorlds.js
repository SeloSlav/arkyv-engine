const WORLDS_KEY = 'arkyv.saved-worlds.v1';
const ACTIVE_WORLD_KEY = 'arkyv.active-world.v1';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

export function readSavedWorlds() {
  if (!canUseStorage()) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(WORLDS_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writeSavedWorlds(worlds) {
  if (canUseStorage()) {
    window.localStorage.setItem(WORLDS_KEY, JSON.stringify(worlds));
  }
  return worlds;
}

export function getActiveWorldId() {
  return canUseStorage() ? window.localStorage.getItem(ACTIVE_WORLD_KEY) : null;
}

export function setActiveWorldId(id) {
  if (!canUseStorage()) return;
  if (id) window.localStorage.setItem(ACTIVE_WORLD_KEY, id);
  else window.localStorage.removeItem(ACTIVE_WORLD_KEY);
}

export function createSavedWorld(name) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    token: null,
    identity: null,
    createdAt: now,
    lastUsedAt: now,
  };
}

export function upsertSavedWorld(world) {
  const worlds = readSavedWorlds();
  const index = worlds.findIndex((candidate) => candidate.id === world.id);
  if (index === -1) worlds.push(world);
  else worlds[index] = world;
  writeSavedWorlds(worlds);
  return world;
}

export function removeSavedWorld(id) {
  const worlds = readSavedWorlds().filter((world) => world.id !== id);
  writeSavedWorlds(worlds);
  if (getActiveWorldId() === id) setActiveWorldId(null);
  return worlds;
}

export function createSavedWorldsBackup(worlds = readSavedWorlds()) {
  return {
    format: 'arkyv-saved-worlds',
    version: 1,
    exportedAt: new Date().toISOString(),
    worlds,
  };
}

export function importSavedWorldsBackup(input) {
  const backup = typeof input === 'string' ? JSON.parse(input) : input;
  if (backup?.format !== 'arkyv-saved-worlds' || backup?.version !== 1 || !Array.isArray(backup.worlds)) {
    throw new Error('This is not a supported Arkyv saved-world backup.');
  }

  const existing = readSavedWorlds();
  const byId = new Map(existing.map((world) => [world.id, world]));
  const knownTokens = new Set(existing.map((world) => world.token).filter(Boolean));
  let imported = 0;

  for (const candidate of backup.worlds) {
    if (!candidate || typeof candidate.name !== 'string' || !candidate.name.trim()) continue;
    if (candidate.token != null && typeof candidate.token !== 'string') continue;
    if (candidate.identity != null && typeof candidate.identity !== 'string') continue;
    if (candidate.token && knownTokens.has(candidate.token)) continue;

    let id = typeof candidate.id === 'string' && candidate.id ? candidate.id : crypto.randomUUID();
    if (byId.has(id)) id = crypto.randomUUID();
    const now = new Date().toISOString();
    const world = {
      id,
      name: candidate.name.trim().slice(0, 40),
      token: candidate.token || null,
      identity: candidate.identity || null,
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
      lastUsedAt: typeof candidate.lastUsedAt === 'string' ? candidate.lastUsedAt : now,
    };
    byId.set(id, world);
    if (world.token) knownTokens.add(world.token);
    imported += 1;
  }

  writeSavedWorlds([...byId.values()]);
  return { worlds: readSavedWorlds(), imported };
}
