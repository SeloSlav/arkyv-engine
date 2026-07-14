import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import getSpacetimeClient, {
  connectSpacetime,
  disconnectSpacetime,
  getSpacetimeConnection,
} from '@/lib/spacetimedbClient';
import {
  createSavedWorld,
  getActiveWorldId,
  readSavedWorlds,
  removeSavedWorld,
  setActiveWorldId,
  upsertSavedWorld,
} from '@/lib/savedWorlds';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [savedWorlds, setSavedWorlds] = useState([]);
  const [activeWorld, setActiveWorld] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(null);
  const spacetime = useMemo(() => getSpacetimeClient(), []);

  const refreshWorlds = () => {
    const worlds = readSavedWorlds();
    setSavedWorlds(worlds);
    return worlds;
  };

  const activate = async (world) => {
    setLoading(true);
    setConnectionError(null);
    try {
      const connected = await connectSpacetime(world.token || undefined);
      const identity = connected.identity.toHexString();
      const updated = {
        ...world,
        token: connected.token,
        identity,
        lastUsedAt: new Date().toISOString(),
      };
      upsertSavedWorld(updated);
      setActiveWorldId(updated.id);
      setActiveWorld(updated);
      refreshWorlds();

      const user = { id: identity, user_metadata: { world_name: updated.name } };
      setSession({ user, access_token: connected.token });
      const { data } = await spacetime.from('profiles').select('*').eq('id', identity).maybeSingle();
      setProfile(data || null);
      return updated;
    } catch (error) {
      disconnectSpacetime();
      setSession(null);
      setProfile(null);
      setConnectionError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const worlds = refreshWorlds();
    const activeId = getActiveWorldId();
    const world = worlds.find((candidate) => candidate.id === activeId);
    if (world) activate(world).catch(() => {});
    else setLoading(false);
    return () => disconnectSpacetime();
  }, []);

  const createWorld = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Give the saved world a name.');
    if (savedWorlds.some((world) => world.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('A saved world with that name already exists.');
    }
    const world = createSavedWorld(trimmed);
    upsertSavedWorld(world);
    refreshWorlds();
    return activate(world);
  };

  const selectWorld = async (id) => {
    const world = readSavedWorlds().find((candidate) => candidate.id === id);
    if (!world) throw new Error('Saved world not found.');
    return activate(world);
  };

  const signOut = async () => {
    disconnectSpacetime();
    setActiveWorldId(null);
    setActiveWorld(null);
    setSession(null);
    setProfile(null);
    setConnectionError(null);
  };

  const deleteWorld = async (id) => {
    const world = readSavedWorlds().find((candidate) => candidate.id === id);
    if (!world) return;
    const previousWorld = activeWorld?.id && activeWorld.id !== id ? activeWorld : null;
    if (activeWorld?.id !== id || !getSpacetimeConnection()) await activate(world);
    const { error } = await spacetime.rpc('delete_user_account');
    if (error) throw error;
    disconnectSpacetime();
    const worlds = removeSavedWorld(id);
    setSavedWorlds(worlds);
    if (previousWorld) {
      await activate(previousWorld);
    } else {
      setActiveWorld(null);
      setSession(null);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (!session?.user?.id) return null;
    const { data, error } = await spacetime.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error) throw error;
    setProfile(data);
    return data;
  };

  const value = {
    session,
    user: session?.user || null,
    profile,
    loading,
    connectionError,
    savedWorlds,
    activeWorld,
    createWorld,
    selectWorld,
    deleteWorld,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
