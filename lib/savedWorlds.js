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

