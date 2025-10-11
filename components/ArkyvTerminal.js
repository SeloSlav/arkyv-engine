import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import TerminalLine from '@/components/TerminalLine';
import getSupabaseClient from '@/lib/supabaseClient';

const COMMAND_PROMPT = '›';
const MAX_LINES = 300;
const DEFAULT_SYSTEM_MESSAGE = null; // No default welcome message
const COMMAND_HELP = `
Available commands:
• login                  - Authenticate with your Arkyv account
• register               - Create a new Arkyv account
• forgot                 - Reset your password via email
• cancel                 - Cancel the current login/registration/reset flow
• logout                 - Sign out of Arkyv
• whoami                 - Display current user identity
• help or ?              - Show this help message
• characters             - List your characters
• create &lt;name&gt;          - Create a new character
• enter &lt;name&gt;        - Enter Arkyv as a character
• disengage             - Leave your active character (stay logged in)
• set handle &lt;name&gt;      - Set your display name (profile mode only)
• say &lt;message&gt;          - Speak in the room
• whisper &lt;name&gt; &lt;message&gt; - Send a private message to a character
• look                   - Describe the current room and see who's here
• who                    - List all characters and NPCs in the room
• inspect &lt;name&gt;         - View detailed description of a character or NPC
• talk &lt;name&gt; [message]  - Start conversation with NPC
• exit                   - End current NPC conversation (or leave room)
• exits                  - Show available exits
• go &lt;direction&gt;         - Move through an exit (north, enter, etc.)
• &lt;direction&gt;            - Move directly (north, south, east, west, etc.)
• clear                  - Clear the terminal output

Movement:
• Use cardinal directions: north, south, east, west, northeast, northwest, southeast, southwest
• Use abbreviations: n, s, e, w, ne, nw, se, sw, u (up), d (down)
• Examples: 'north', 'n', 'go north' all work the same way

Tab Completion:
• Press TAB to autocomplete commands - works for:
  - Movement: 'n' + TAB → 'north', 'go nor' + TAB → 'go north'
  - Characters: 'enter al' + TAB → 'enter Alice'
  - Multiple matches: Keep pressing TAB to cycle through options
  - Priority: Shorter directions come first (north before northwest)

NPC Conversations:
• Use &#39;talk &lt;npc&gt; [message]&#39; to start a conversation
• After first message, you enter conversation mode
• Simply type your message (no need to type &#39;say&#39; or repeat &#39;talk &lt;npc&gt;&#39;)
• Type 'exit' to end the conversation
• Conversations end automatically when you leave the room

Syntax: &lt;required&gt; [optional]
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Direction abbreviation mappings
const DIRECTION_ALIASES = {
    'n': 'north',
    's': 'south',
    'e': 'east',
    'w': 'west',
    'ne': 'northeast',
    'nw': 'northwest',
    'se': 'southeast',
    'sw': 'southwest',
    'u': 'up',
    'd': 'down',
    'up': 'up',
    'down': 'down',
    'north': 'north',
    'south': 'south',
    'east': 'east',
    'west': 'west',
    'northeast': 'northeast',
    'northwest': 'northwest',
    'southeast': 'southeast',
    'southwest': 'southwest'
};

export default function ArkyvTerminal({ disabled = false, autoFocusTrigger = 0, onRoomChange = null, onRoomMessage = null, onExecuteCommand = null, onConversationChange = null, className = '' }) {
    const supabase = useMemo(() => getSupabaseClient(), []);

    const [lines, setLines] = useState([]);
    const [input, setInput] = useState('');
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [session, setSession] = useState(null);
    const [characters, setCharacters] = useState([]);
    const [profile, setProfile] = useState(null); // Real-world profile actor
    const profileRef = useRef(null);
    useEffect(() => { profileRef.current = profile; }, [profile]);
    const [activeCharacter, setActiveCharacterState] = useState(null);
    const activeCharacterRef = useRef(null);
    const setActiveCharacter = useCallback((character) => {
        setActiveCharacterState(character);
        activeCharacterRef.current = character;
    }, []);
    const [roomSubscription, setRoomSubscription] = useState(null);
    const [roomCache, setRoomCache] = useState({});
    const [authFlow, setAuthFlow] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [availableExits, setAvailableExits] = useState([]);
    const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
    const [roomNPCs, setRoomNPCs] = useState([]); // Track NPCs in current room
    const roomNPCsRef = useRef([]); // Ref to track NPCs for subscriptions
    const [roomCharacters, setRoomCharacters] = useState([]); // Track other characters in current room
    const [conversationMode, setConversationMode] = useState(null); // { npcName, npcAlias }
    const [conversationHistory, setConversationHistory] = useState([]); // Array of {role: 'user'|'assistant', content: string}
    const [isMusicEnabled, setIsMusicEnabled] = useState(false);
    const conversationModeRef = useRef(null); // Ref to track conversation mode for subscriptions

    // Listen for audio state changes to update music button
    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Initialize state from global variable
        if (typeof window.__babushkaAudioShouldPlay === 'boolean') {
            setIsMusicEnabled(window.__babushkaAudioShouldPlay);
        }

        const handleAudioStateChange = (event) => {
            if (event.detail && typeof event.detail.enabled === 'boolean') {
                setIsMusicEnabled(event.detail.enabled);
            }
        };

        window.addEventListener('babushkaAudioToggle', handleAudioStateChange);

        return () => {
            window.removeEventListener('babushkaAudioToggle', handleAudioStateChange);
        };
    }, []);

    const inputRef = useRef(null);
    const ceRef = useRef(null);
    const terminalRef = useRef(null);
    const welcomeRef = useRef(false);
    const messageRegistryRef = useRef(new Map());
    const currentRoomRef = useRef(null);
    const roomEntryTimesRef = useRef(new Map());
    const onboardingRef = useRef(false);
    const lastCharacterRefreshRef = useRef(0);
    const initialMessageShownRef = useRef(false);

    // Add initial welcome message only on client side to avoid hydration mismatch
    useEffect(() => {
        if (!initialMessageShownRef.current) {
            initialMessageShownRef.current = true;
            setLines([]); // Start with empty terminal
        }
    }, []);
    
    // Preload images for adjacent rooms when character moves
    useEffect(() => {
        if (!activeCharacter?.current_room) return;
        
        // Fetch exits for current room
        supabase
            .from('exits')
            .select('to_room')
            .eq('from_room', activeCharacter.current_room)
            .then(({ data: exits }) => {
                if (!exits || exits.length === 0) return;
                
                const adjacentRoomIds = exits.map(e => e.to_room);
                
                // Fetch image URLs for adjacent rooms
                supabase
                    .from('rooms')
                    .select('image_url')
                    .in('id', adjacentRoomIds)
                    .then(({ data: rooms }) => {
                        if (rooms) {
                            // Preload each image
                            rooms.forEach(room => {
                                if (room.image_url) {
                                    const img = new Image();
                                    img.src = room.image_url;
                                }
                            });
                        }
                    });
            });
    }, [activeCharacter?.current_room, supabase]);

    useEffect(() => {
        if (!disabled && inputRef.current) {
            inputRef.current.focus();
        }
    }, [disabled, autoFocusTrigger]);

    useEffect(() => {
        if (terminalRef.current && lines.length > 0) {
            // Force scroll to bottom when new lines are added
            requestAnimationFrame(() => {
                if (terminalRef.current) {
                    // Try multiple scroll methods to ensure it works
                    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;

                    // Also try scrolling the last element into view
                    const lastMessageElement = terminalRef.current.querySelector(`[data-message-id="${lines[lines.length - 1].id}"]`);
                    if (lastMessageElement) {
                        lastMessageElement.scrollIntoView({ behavior: 'auto', block: 'end' });
                    }

                    // Final fallback
                    setTimeout(() => {
                        if (terminalRef.current) {
                            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                        }
                    }, 10);
                }
            });
        }
    }, [lines]);

    useEffect(() => {
        const handleGlobalKeyPress = (event) => {
            if (disabled) return;
            
            // Check if the terminal input is already focused
            const activeElement = document.activeElement;
            const isTerminalInputFocused = activeElement === inputRef.current;
            
            // If terminal input is focused, let it handle the input normally
            if (isTerminalInputFocused) {
                return;
            }
            
            // Don't intercept if user is typing in another input/textarea
            if (activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable
            )) {
                return;
            }
            
            // Check if it's Enter key
            if (event.key === 'Enter') {
                event.preventDefault();
                inputRef.current?.focus();
                return;
            }
            
            // Check if it's a letter, number, or common punctuation (desktop mode only)
            const isPrintableChar = event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey;
            if (isPrintableChar && typeof window !== 'undefined' && window.innerWidth >= 640) {
                event.preventDefault();
                inputRef.current?.focus();
                // Add the typed character to the input
                setInput(prev => prev + event.key);
            }
        };

        document.addEventListener('keydown', handleGlobalKeyPress);
        return () => document.removeEventListener('keydown', handleGlobalKeyPress);
    }, [disabled]);

    // Ensure a profile exists and spawn it in the starting lobby on login
    const STARTING_LOBBY_ROOM_ID = 'e58caed0-8268-419e-abe8-faa3833a1de6';
    const ensureProfile = useCallback(async (user) => {
        if (!user) return null;
        try {
            // Try to read profile by auth user_id
            let { data: prof, error } = await supabase
                .from('profiles')
                .select('id, handle, current_room, user_id')
                .eq('id', user.id)
                .maybeSingle();
            if (error) {
                console.error('Failed to load profile:', error);
                return null;
            }
            if (!prof) {
                // Create default profile using email prefix as handle
                const defaultHandle = (user.email || 'guest').split('@')[0];
                const { data: newProf, error: insertErr } = await supabase
                    .from('profiles')
                    .insert({ user_id: user.id, handle: defaultHandle, current_room: STARTING_LOBBY_ROOM_ID })
                    .select('id, handle, current_room, user_id')
                    .single();
                if (insertErr) {
                    console.error('Failed to create profile:', insertErr);
                    return null;
                }
                prof = newProf;
            }
            if (!prof.current_room) {
                const { error: updErr } = await supabase
                    .from('profiles')
                    .update({ current_room: STARTING_LOBBY_ROOM_ID })
                    .eq('id', prof.id);
                if (updErr) {
                    console.error('Failed to set profile start room:', updErr);
                } else {
                    prof.current_room = STARTING_LOBBY_ROOM_ID;
                }
            }
            setProfile(prof);
            profileRef.current = prof; // Update ref immediately for synchronous access
            return prof;
        } catch (err) {
            console.error('ensureProfile error:', err);
            return null;
        }
    }, [supabase]);

    const getRegistry = useCallback((roomId = 'global') => {
        if (!messageRegistryRef.current.has(roomId)) {
            messageRegistryRef.current.set(roomId, new Set());
        }
        return messageRegistryRef.current.get(roomId);
    }, []);

    const registerLine = useCallback((line) => {
        if (!line) return null;
        if (line.type === 'message') {
            const registry = getRegistry(line.room_id ?? currentRoomRef.current ?? 'global');
            if (registry.has(line.id)) {
                return null;
            }
            registry.add(line.id);
        }
        return line;
    }, [getRegistry]);

    const appendLine = useCallback((line) => {
        const normalized = registerLine(line);
        if (!normalized) {
            return;
        }
        setLines((prev) => {
            const next = [...prev, normalized];
            if (next.length > MAX_LINES) {
                return next.slice(next.length - MAX_LINES);
            }
            return next;
        });
        
    }, [registerLine]);

    const appendLines = useCallback((entries) => {
        if (!entries || !entries.length) {
            return;
        }

        const filtered = entries
            .map((entry) => registerLine(entry))
            .filter(Boolean);

        if (!filtered.length) {
            return;
        }

        setLines((prev) => {
            const next = [...prev, ...filtered];
            if (next.length > MAX_LINES) {
                return next.slice(next.length - MAX_LINES);
            }
            return next;
        });

    }, [registerLine]);

    const greetUser = useCallback((email) => {
        if (!email || welcomeRef.current) {
            return;
        }
        appendLine(createSystemLine(`Welcome back, ${email}. Type 'help' for commands.`));
        welcomeRef.current = true;
    }, [appendLine]);

    const clearLines = useCallback(() => {
        messageRegistryRef.current.clear();
        roomEntryTimesRef.current.clear();
        currentRoomRef.current = null;
        setAvailableExits([]); // Clear exits when clearing terminal
        setLines([]); // Clear terminal on logout
        onRoomChange?.(null, activeCharacter);
    }, [onRoomChange, activeCharacter]);

    const unsubscribeFromRoom = useCallback((options = {}) => {
        const { notifyRoomChange = true } = options;

        if (roomSubscription) {
            const previousRoom = currentRoomRef.current;
            supabase.removeChannel(roomSubscription);
            setRoomSubscription(null);
            if (previousRoom) {
                roomEntryTimesRef.current.delete(previousRoom);
            }
            currentRoomRef.current = null;
            setAvailableExits([]); // Clear exits when leaving room
            setRoomNPCs([]); // Clear NPCs when leaving room
            setRoomCharacters([]); // Clear room characters when leaving room
            setConversationMode(null); // End any active conversation when leaving room
            setConversationHistory([]); // Clear conversation history when leaving room
            if (notifyRoomChange) {
                onRoomChange?.(null, activeCharacterRef.current ?? activeCharacter);
            }
        }
    }, [roomSubscription, supabase, onRoomChange, activeCharacter]);

    useEffect(() => {
        let isMounted = true;
        let hasShownInitialMessage = false;

        (async () => {
            const { data, error } = await supabase.auth.getSession();
            if (!isMounted) return;

            if (error) {
                appendLine(createErrorLine(formatError(error)));
                return;
            }

            if (data?.session) {
                setSession(data.session);
            } else {
                // Show welcome message for logged-out users
                if (!hasShownInitialMessage) {
                    hasShownInitialMessage = true;
                    appendLine(createSystemLine('Welcome to the Arkyv.\n\nType \'login\' to access the network, \'register\' to create a new account, or \'forgot\' to reset your password.\n\n'));
                }
            }
        })();

        const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
            if (!isMounted) return;
            setSession(newSession);

            if (!newSession) {
                console.log('🔄 Auth listener: Logout detected, resetting welcomeRef');
                welcomeRef.current = false;
                onboardingRef.current = false;
                setActiveCharacter(null);
                setCharacters([]);
                setAuthFlow(null);
                setProfile(null);
                profileRef.current = null;
                // Reset all initialization flags so next login works properly
                hasInitializedProfile.current = false;
                hasLoadedCharacters.current = false;
                hasShownPersonaList.current = false;
                lastCharacterRefreshRef.current = 0; // Reset rate limit so refreshCharacters works on next login
                unsubscribeFromRoom();
                // Don't show logout message here - it's already shown in the logout command
            } else {
                console.log('🔄 Auth listener: Login detected, welcomeRef should be false:', welcomeRef.current);
            }
        });

        return () => {
            isMounted = false;
            listener.subscription.unsubscribe();
        };
    }, [appendLine, supabase, unsubscribeFromRoom]);

    const loadAvailableExits = useCallback(async (roomId) => {
        if (!roomId) {
            setAvailableExits([]);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('exits')
                .select('verb')
                .eq('from_room', roomId);

            if (error) {
                console.error('Failed to load exits for autocomplete:', error);
                setAvailableExits([]);
                return;
            }

            // Sort exits by length (shorter first) for priority system
            // This ensures "north" comes before "northwest"
            const sortedExits = (data || [])
                .map(exit => exit.verb)
                .sort((a, b) => {
                    // First sort by length
                    if (a.length !== b.length) {
                        return a.length - b.length;
                    }
                    // Then alphabetically for same length
                    return a.localeCompare(b);
                });

            setAvailableExits(sortedExits);
        } catch (error) {
            console.error('Error loading exits for autocomplete:', error);
            setAvailableExits([]);
        }
    }, [supabase]);

    const loadRoomNPCs = useCallback(async (roomId) => {
        if (!roomId) {
            setRoomNPCs([]);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('npcs')
                .select('name, alias, description, portrait_url')
                .eq('current_room', roomId);

            if (error) {
                console.error('Failed to load NPCs for autocomplete:', error);
                setRoomNPCs([]);
                return;
            }

            setRoomNPCs(data || []);
        } catch (error) {
            console.error('Failed to load NPCs for autocomplete:', error);
            setRoomNPCs([]);
        }
    }, [supabase]);

    const loadRoomCharacters = useCallback(async (roomId) => {
        if (!roomId) {
            setRoomCharacters([]);
            return;
        }

        try {
            // Fetch from room_messages to get all character names in the room
            // This bypasses RLS issues with the characters table
            const { data: messages, error } = await supabase
                .from('room_messages')
                .select('character_name, character_id')
                .eq('room_id', roomId)
                .not('character_name', 'is', null)
                .not('character_id', 'is', null)
                .order('created_at', { ascending: false })
                .limit(100); // Get recent messages

            if (error) {
                console.error('Failed to load room characters for autocomplete:', error);
                setRoomCharacters([]);
                return;
            }

            // Extract unique characters from messages
            const uniqueChars = new Map();
            messages?.forEach(msg => {
                if (msg.character_id && msg.character_name) {
                    uniqueChars.set(msg.character_id, {
                        id: msg.character_id,
                        name: msg.character_name
                    });
                }
            });

            const charactersArray = Array.from(uniqueChars.values());
            setRoomCharacters(charactersArray);
        } catch (error) {
            console.error('Failed to load room characters for autocomplete:', error);
            setRoomCharacters([]);
        }
    }, [supabase]);

    const addToConversationHistory = useCallback((role, content) => {
        setConversationHistory(prev => {
            const newHistory = [...prev, { role, content }];
            // Keep only last 10 exchanges (20 messages) to avoid token limits
            return newHistory.slice(-20);
        });
    }, []);

    const subscribeToRoom = useCallback((roomId) => {
        if (!roomId) return;

        unsubscribeFromRoom({ notifyRoomChange: false });

        currentRoomRef.current = roomId;
        roomEntryTimesRef.current.set(roomId, Date.now());
        getRegistry(roomId).clear();
        const notifyRegion = async () => {
            const roomDetails = await loadRoomDetails(roomId);
            onRoomChange?.(roomId, activeCharacter, roomDetails);
        };

        // Don't await to avoid blocking UI; allow region to update when ready.
        notifyRegion();
        
        // Load available exits for autocomplete
        loadAvailableExits(roomId);
        loadRoomNPCs(roomId);
        loadRoomCharacters(roomId);

        console.log('🔥 Subscribing to room:', roomId);

        const channel = supabase
            .channel(`room-${roomId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'room_messages',
                    filter: `room_id=eq.${roomId}`
                },
                (payload) => {
                    console.log('🔥 SUBSCRIPTION TRIGGERED - Raw payload:', payload);

                    const entryTime = roomEntryTimesRef.current.get(roomId);
                    if (entryTime) {
                        const createdAt = payload.new?.created_at ? new Date(payload.new.created_at).getTime() : null;
                        // Add 10 second tolerance for NPC greetings and recent messages
                        const tolerance = 10000; // 10 seconds in milliseconds
                        if (createdAt && createdAt < (entryTime - tolerance)) {
                            console.log('🔍 Message too old, skipping:', createdAt, 'vs', entryTime);
                            return;
                        }
                    }

                    // Filter private messages - only show if they're public or targeted to current character
                    const message = payload.new;
                    const currentActiveCharacter = activeCharacterRef.current;
                    console.log('🔍 SUBSCRIPTION: New message received:', {
                        kind: message.kind,
                        body: message.body,
                        target_character_id: message.target_character_id,
                        character_id: message.character_id,
                        activeCharacterId: currentActiveCharacter?.id,
                        activeCharacterName: currentActiveCharacter?.name,
                        activeCharacterRefExists: !!currentActiveCharacter
                    });

                    if (message.target_character_id && message.target_character_id !== currentActiveCharacter?.id) {
                        console.log('🔍 SUBSCRIPTION: Filtered out private message for different character:', {
                            messageTargetId: message.target_character_id,
                            currentCharacterId: currentActiveCharacter?.id,
                            messageKind: message.kind
                        });
                        return; // Skip private messages not targeted to current character
                    }

                    console.log('🔍 SUBSCRIPTION: Message passed filter, will be displayed:', {
                        kind: message.kind,
                        targetId: message.target_character_id,
                        currentId: currentActiveCharacter?.id
                    });

                    // Check if this is a hidden environment data message
                    const isEnvData = message.kind === 'system' && message.body?.startsWith('[ENV_DATA]');
                    
                    if (isEnvData) {
                        // Don't display in terminal, but still update environment panel
                        onRoomMessage?.(message);
                    } else {
                        // Normal message - display in terminal
                        const messageLineData = createMessageLine(message, currentActiveCharacter, roomNPCsRef.current);
                        appendLine(messageLineData);
                        onRoomMessage?.(messageLineData.originalMessage ?? message);
                    }

                    // Extract character names from "who" and "look" command responses for autocomplete
                    if (message.kind === 'system' && message.body) {
                        const charMatch = message.body.match(/═══ CHARACTERS ═══\s*([\s\S]*?)(?:═══|$)/);
                        if (charMatch) {
                            const charList = charMatch[1];
                            const charNames = charList.match(/• ([^\s\n]+)/g);
                            if (charNames) {
                                const chars = charNames.map(name => ({
                                    name: name.replace('• ', '').trim(),
                                    id: null // We don't have IDs from this output, but name is enough for autocomplete
                                }));
                                setRoomCharacters(prev => {
                                    // Merge with existing, avoiding duplicates
                                    const merged = new Map(prev.map(c => [c.name, c]));
                                    chars.forEach(c => merged.set(c.name, c));
                                    return Array.from(merged.values());
                                });
                            }
                        }
                    }

                    // CONVERSATION HISTORY: Check if we should add NPC response to history
                    const currentConversationMode = conversationModeRef.current;
                    if (currentConversationMode && payload.new?.kind === 'npc_speech') {
                        const npcResponse = payload.new.body;
                        const colonIndex = npcResponse.indexOf(': ');
                        const messageContent = colonIndex !== -1 ? npcResponse.slice(colonIndex + 2) : npcResponse;
                        
                        // console.log('💬 Adding NPC response to conversation history:', messageContent);
                        addToConversationHistory('assistant', messageContent);
                    } else if (currentConversationMode) {
                        // console.log('💬 NOT adding to conversation history - kind:', payload.new?.kind, 'expected: npc_speech');
                    }
                }
            )
            .on('subscribe', (status, err) => {
                console.log('🔥 Subscription status:', status);
                if (err) console.error('🔥 Subscription error:', err);
                if (status === 'SUBSCRIBED') {
                    console.log('🔥 Successfully subscribed to room messages!');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('🔥 Channel error - real-time might not be enabled');
                } else if (status === 'TIMED_OUT') {
                    console.error('🔥 Subscription timed out');
                }
            })
            .on('error', (err) => {
                console.error('🔥 Real-time error:', err);
            })
            .subscribe();

        setRoomSubscription(channel);
    }, [appendLine, getRegistry, supabase, unsubscribeFromRoom, activeCharacter, loadAvailableExits, loadRoomNPCs, loadRoomCharacters, conversationMode, addToConversationHistory]);

    // Keep active character ref in sync
    useEffect(() => {
        activeCharacterRef.current = activeCharacter;
    }, [activeCharacter]);
    
    // Keep roomNPCs ref in sync
    useEffect(() => {
        roomNPCsRef.current = roomNPCs;
    }, [roomNPCs]);

    const loadRoomDetails = useCallback(async (roomId, { describe = false } = {}) => {
        if (!roomId) {
            return null;
        }

        const cached = roomCache[roomId];
        if (cached) {
            return cached;
        }

        try {
            const { data, error } = await supabase
                .from('rooms')
                .select('id, name, description, region, region_name, image_url, regions!rooms_region_name_fkey(display_name)')
                .eq('id', roomId)
                .maybeSingle();

            if (error) {
                appendLine(createErrorLine(`Unable to load room: ${formatError(error)}`));
                return null;
            }

            if (data) {
                setRoomCache((prev) => ({ ...prev, [roomId]: data }));
            }

            return data;
        } catch (error) {
            appendLine(createErrorLine(`Connection issue loading room: ${formatError(error)}`));
            return null;
        }
    }, [roomCache, supabase, setRoomCache]);

    const getAutocompleteMatches = useCallback((input) => {
        if (!input.trim()) return [];
        
        const trimmedInput = input.trim().toLowerCase();
        
        // Check if this is an "enter" command for character selection
        const isEnterCommand = trimmedInput.startsWith('enter ');
        if (isEnterCommand) {
            const characterQuery = trimmedInput.slice(6).trim();
            if (!characterQuery) {
                // If just "enter " with no character name, return all characters
                return characters.map(char => `enter ${char.name}`);
            }
            
            // Find matching characters by name or ID
            const matchingCharacters = characters.filter(char => 
                char.name.toLowerCase().startsWith(characterQuery) ||
                char.id.toLowerCase().startsWith(characterQuery)
            );
            
            return matchingCharacters.map(char => `enter ${char.name}`);
        }
        
        // Check if this is a "talk" command for NPC interaction
        const isTalkCommand = trimmedInput.startsWith('talk ');
        if (isTalkCommand) {
            const npcQuery = trimmedInput.slice(5).trim();
            
            if (!npcQuery) {
                // If just "talk " with no NPC name, return all NPCs
                return roomNPCs.map(npc => `talk ${npc.alias}`);
            }
            
            // Find matching NPCs by alias or name
            const matchingNPCs = roomNPCs.filter(npc => 
                npc.alias.toLowerCase().startsWith(npcQuery) ||
                npc.name.toLowerCase().startsWith(npcQuery)
            );
            
            return matchingNPCs.map(npc => `talk ${npc.alias}`);
        }
        
        // Check if this is an "inspect" command
        const isInspectCommand = trimmedInput.startsWith('inspect ');
        if (isInspectCommand) {
            const targetQuery = trimmedInput.slice(8).trim().toLowerCase();
            
            if (!targetQuery) {
                // If just "inspect " with no name, return all NPCs and characters (including yourself)
                const npcOptions = roomNPCs.map(npc => `inspect ${npc.alias}`);
                const charOptions = roomCharacters.map(char => `inspect ${char.name}`);
                return [...npcOptions, ...charOptions];
            }
            
            // Find matching NPCs by alias or name
            const matchingNPCs = roomNPCs.filter(npc => 
                npc.alias.toLowerCase().startsWith(targetQuery) ||
                npc.name.toLowerCase().startsWith(targetQuery)
            );
            
            // Find matching characters (including yourself)
            const matchingChars = roomCharacters.filter(char => 
                char.name.toLowerCase().startsWith(targetQuery)
            );
            
            return [
                ...matchingNPCs.map(npc => `inspect ${npc.alias}`),
                ...matchingChars.map(char => `inspect ${char.name}`)
            ];
        }
        
        // Check if this is a "whisper" command
        const isWhisperCommand = trimmedInput.startsWith('whisper ');
        if (isWhisperCommand) {
            const parts = trimmedInput.slice(8).trim().split(' ');
            const targetQuery = parts[0]?.toLowerCase() || '';
            
            if (!targetQuery) {
                // If just "whisper " with no name, return all characters in the room (except yourself)
                return roomCharacters
                    .filter(char => char.id !== activeCharacter?.id)
                    .map(char => `whisper ${char.name} `);
            }
            
            // Find matching characters (excluding yourself)
            const matchingChars = roomCharacters.filter(char => 
                char.id !== activeCharacter?.id &&
                char.name.toLowerCase().startsWith(targetQuery)
            );
            
            return matchingChars.map(char => `whisper ${char.name} `);
        }
        
        // Check if this is a "pet" command
        const isPetCommand = trimmedInput.startsWith('pet ');
        if (isPetCommand) {
            const targetQuery = trimmedInput.slice(4).trim().toLowerCase();
            
            if (!targetQuery) {
                // If just "pet " with no name, return all NPCs and characters
                const npcOptions = roomNPCs.map(npc => `pet ${npc.alias}`);
                const charOptions = roomCharacters.map(char => `pet ${char.name}`);
                return [...npcOptions, ...charOptions];
            }
            
            // Find matching NPCs by alias or name
            const matchingNPCs = roomNPCs.filter(npc => 
                npc.alias.toLowerCase().startsWith(targetQuery) ||
                npc.name.toLowerCase().startsWith(targetQuery)
            );
            
            // Find matching characters
            const matchingChars = roomCharacters.filter(char => 
                char.name.toLowerCase().startsWith(targetQuery)
            );
            
            return [
                ...matchingNPCs.map(npc => `pet ${npc.alias}`),
                ...matchingChars.map(char => `pet ${char.name}`)
            ];
        }
        
        // Check if this looks like a movement command
        if (!availableExits.length) return [];
        
        const isGoCommand = trimmedInput.startsWith('go ');
        const isDirectMovement = !isGoCommand && (
            availableExits.some(exit => exit.toLowerCase().startsWith(trimmedInput)) ||
            Object.keys(DIRECTION_ALIASES).some(alias => alias.startsWith(trimmedInput))
        );
        
        if (!isGoCommand && !isDirectMovement) return [];
        
        // Extract the direction part
        const direction = isGoCommand ? trimmedInput.slice(3).trim() : trimmedInput;
        if (!direction) {
            // If just "go " with no direction, return all exits with "go " prefix
            return isGoCommand ? availableExits.map(exit => `go ${exit}`) : [];
        }
        
        // Find matching exits and direction aliases
        const exitMatches = availableExits.filter(exit => 
            exit.toLowerCase().startsWith(direction.toLowerCase())
        );
        
        const aliasMatches = Object.keys(DIRECTION_ALIASES).filter(alias => 
            alias.startsWith(direction.toLowerCase()) &&
            availableExits.some(exit => exit.toLowerCase() === DIRECTION_ALIASES[alias].toLowerCase())
        );
        
        // Combine matches, prioritizing exact exit names over aliases
        const allMatches = [...exitMatches, ...aliasMatches.filter(alias => 
            !exitMatches.some(exit => exit.toLowerCase() === alias.toLowerCase())
        )];
        
        // Return with appropriate prefix
        return allMatches.map(match => isGoCommand ? `go ${match}` : match);
    }, [availableExits, roomCharacters, roomNPCs, activeCharacter, characters]);

    const enterConversationMode = useCallback((npcName, npcAlias) => {
        const mode = { npcName, npcAlias };
        setConversationMode(mode);
        conversationModeRef.current = mode; // Update ref for subscriptions
        setConversationHistory([]); // Start fresh conversation history
        appendLine(createSystemLine(`Entering conversation with ${npcName}. Type your message to speak, or type 'exit' to end conversation. (No need to type 'say' before your message.)`));
    }, [appendLine]);

    const exitConversationMode = useCallback(() => {
        if (conversationMode) {
            appendLine(createSystemLine(`Conversation with ${conversationMode.npcName} ended.`));
            setConversationMode(null);
            conversationModeRef.current = null; // Update ref for subscriptions
            setConversationHistory([]); // Clear conversation history
        }
    }, [conversationMode, appendLine]);

    const handleTabCompletion = useCallback(() => {
        const matches = getAutocompleteMatches(input);
        if (matches.length === 0) return;
        
        if (matches.length === 1) {
            // Single match - complete it
            setInput(matches[0]);
            setAutocompleteIndex(-1);
        } else {
            // Multiple matches - cycle through them
            const nextIndex = (autocompleteIndex + 1) % matches.length;
            setInput(matches[nextIndex]);
            setAutocompleteIndex(nextIndex);
        }
    }, [input, getAutocompleteMatches, autocompleteIndex]);

    const expandDirectionAlias = useCallback((command) => {
        const lowerCommand = command.toLowerCase().trim();
        return DIRECTION_ALIASES[lowerCommand] || command;
    }, []);

    const isMovementCommand = useCallback((command) => {
        const lowerCommand = command.toLowerCase().trim();
        // Check if it's a direction alias or if it matches an available exit
        return DIRECTION_ALIASES.hasOwnProperty(lowerCommand) || 
               availableExits.some(exit => exit.toLowerCase() === lowerCommand);
    }, [availableExits]);

    const loadRecentMessages = useCallback(async (roomId) => {
        if (!roomId) return;

        const activeCharId = activeCharacter?.id;
        console.log('🔍 Loading recent messages for room:', roomId, 'with active character:', activeCharId);

        let query = supabase
            .from('room_messages')
            .select('id, room_id, character_id, character_name, target_character_id, kind, body, created_at')
            .eq('room_id', roomId);

        // Filter to show public messages OR private messages targeted to this character
        if (activeCharId) {
            query = query.or(`target_character_id.is.null,target_character_id.eq.${activeCharId}`);
        } else {
            query = query.is('target_character_id', null);
        }

        const entryTime = roomEntryTimesRef.current.get(roomId);
        if (entryTime) {
            query = query.gte('created_at', new Date(entryTime).toISOString());
        }

        const { data, error } = await query
            .order('created_at', { ascending: true })
            .limit(50);

        if (error) {
            appendLine(createErrorLine(`Unable to load messages: ${formatError(error)}`));
            return;
        }

        console.log('🔍 Loaded messages:', data?.length || 0, data?.map(msg => ({ kind: msg.kind, body: msg.body, targetId: msg.target_character_id })));

        if (data?.length) {
            appendLines(data.map(msg => createMessageLine(msg, activeCharacter, roomNPCs)));
        }
    }, [appendLines, supabase, activeCharacter, roomNPCs]);

    const hasLoadedCharacters = useRef(false);

    const refreshCharacters = useCallback(async () => {
        console.log('🔄 refreshCharacters called, session:', !!session);
        
        if (!session) {
            console.log('❌ No session, returning empty array');
            hasLoadedCharacters.current = false;
            return [];
        }

        // Rate limiting: don't refresh more than once every 2 seconds
        const now = Date.now();
        const timeSinceLastRefresh = now - lastCharacterRefreshRef.current;
        console.log('⏱️ Time since last refresh:', timeSinceLastRefresh, 'ms');
        
        if (timeSinceLastRefresh < 2000) {
            console.log('⏸️ Rate limited, returning current characters:', characters.length);
            // Return current characters (could be empty if just logged out)
            return characters;
        }
        lastCharacterRefreshRef.current = now;

        console.log('📡 Fetching characters from database...');
        try {
            const { data, error } = await supabase
                .from('characters')
                .select('id, name, current_room, created_at, rooms!characters_current_room_fkey(id, name, region_name, regions!rooms_region_name_fkey(display_name))')
                .order('created_at', { ascending: true });

            if (error) {
                console.error('❌ Failed to load characters:', error);
                // Don't spam the terminal with errors during network issues
                return [];
            }

        const roster = (data || []).map((char) => ({
            ...char,
            room_name: char.rooms?.name ?? null,
            region_name: char.rooms?.regions?.display_name ?? char.rooms?.region_name ?? null,
        }));
        
        console.log('✅ Characters loaded from DB:', roster.length, 'characters');
        setCharacters(roster);
        hasLoadedCharacters.current = true; // Mark that we've loaded characters at least once

        const uniqueRoomIds = Array.from(new Set(
            roster
                .map((char) => char.current_room)
                .filter((roomId) => roomId && !roomCache[roomId])
        ));

        if (uniqueRoomIds.length) {
            await Promise.all(uniqueRoomIds.map((roomId) => loadRoomDetails(roomId)));
        }

        // Only update active character if one is currently active (check ref for most current state)
        const currentActiveChar = activeCharacterRef.current;
        if (currentActiveChar) {
            const updated = roster.find((char) => char.id === currentActiveChar.id);
            if (updated) {
                setActiveCharacter(updated);
            }
        }

        // Onboarding messages removed - now only shown when entering the Character Creation Chamber

            return roster;
        } catch (error) {
            console.error('Network error loading characters:', error);
            return [];
        }
    }, [activeCharacter, appendLine, appendLines, session, supabase, roomCache, loadRoomDetails]);

    const hasInitializedProfile = useRef(false);
    const hasGreetedUser = useRef(false);

    useEffect(() => {
        console.log('🎯 Greeting effect triggered:', {
            hasSession: !!session,
            hasEmail: !!session?.user?.email,
            welcomeRefValue: welcomeRef.current,
            hasInitializedProfile: hasInitializedProfile.current
        });

        // Wait for profile to be initialized (which happens after auth listener resets welcomeRef)
        if (session?.user?.email && hasInitializedProfile.current && !hasGreetedUser.current) {
            console.log('✅ Greeting and refreshing characters...');
            hasGreetedUser.current = true;
            greetUser(session.user.email);
            // Ensure characters are refreshed asynchronously
            (async () => {
                await refreshCharacters();
            })();
        } else {
            console.log('❌ Skipping greeting:', {
                reason: !session?.user?.email ? 'no session/email' : 
                       !hasInitializedProfile.current ? 'profile not initialized' : 'already greeted'
            });
        }
    }, [session, greetUser, refreshCharacters]);

    // Separate effect for profile initialization - only runs once when session is established
    useEffect(() => {
        const CHARACTER_CREATION_ROOM_ID = 'e58caed0-8268-419e-abe8-faa3833a1de6';
        
        if (!session?.user || hasInitializedProfile.current || activeCharacter) return;
        
        hasInitializedProfile.current = true;
        
        (async () => {
            const prof = await ensureProfile(session.user);
            if (prof?.current_room) {
                // Enter the starting lobby as profile
                currentRoomRef.current = prof.current_room;
                getRegistry(prof.current_room).clear();
                subscribeToRoom(prof.current_room);
                await loadRecentMessages(prof.current_room);
                const room = await loadRoomDetails(prof.current_room);
                onRoomChange?.(prof.current_room, { id: prof.id, name: prof.handle }, room);
                if (room) {
                    // Include image marker if room has an image
                    const roomDescription = room.image_url 
                        ? `[IMAGE:${room.image_url}]\n[LOCATION:${formatRoomNameWithRegion(room).toUpperCase()}]\n${room.description}`
                        : `[LOCATION:${formatRoomNameWithRegion(room).toUpperCase()}]\n${room.description}`;
                    appendLine(createSystemLine(roomDescription));
                }
                
                // Fetch environment data directly without showing a command
                try {
                    await sleep(50);
                    const [exitsResult, npcsResult, charsResult] = await Promise.all([
                        supabase.from('exits').select('verb, to_room, rooms!exits_to_room_fkey(name)').eq('from_room', prof.current_room),
                        supabase.from('npcs').select('name, alias').eq('current_room', prof.current_room),
                        supabase.from('characters').select('name').eq('current_room', prof.current_room)
                    ]);
                    
                    let envData = '';
                    if (exitsResult.data?.length) {
                        envData += '[EXITS]\n' + exitsResult.data.map(e => `• ${e.verb} → ${e.rooms?.name || 'unknown'}`).join('\n');
                    }
                    if (npcsResult.data?.length) {
                        if (envData) envData += '\n\n';
                        envData += '[NPCs]\n' + npcsResult.data.map(n => `• ${n.name} (talk ${n.alias})`).join('\n');
                    }
                    if (charsResult.data?.length) {
                        if (envData) envData += '\n\n';
                        envData += '[CHARACTERS]\n' + charsResult.data.map(c => `• ${c.name}`).join('\n');
                    }
                    
                    if (envData) {
                        onRoomMessage?.({ kind: 'system', body: `[ENV_DATA]\n${envData}` });
                    }
                } catch (err) {
                    console.error('Failed to fetch environment data:', err);
                }
                
                // Trigger NPC greetings for profile mode
                try {
                    console.log('🎯 Triggering profile greetings for room:', prof.current_room);
                    // Call the process-commands API directly with the greeting data
                    const response = await fetch('/api/process-commands', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            raw: '__GREET',
                            character_id: null, // Profile mode
                            room_id: prof.current_room
                        })
                    });
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('Profile greeting API error:', response.status, errorText);
                    } else {
                        console.log('✅ Profile greeting API success');
                    }
                } catch (err) {
                    console.error('Failed to trigger profile greetings:', err);
                }
                
                // Fetch and show persona roster AFTER room description if in Character Creation Chamber
                if (prof.current_room === CHARACTER_CREATION_ROOM_ID) {
                    hasShownPersonaList.current = true;
                    
                    // Fetch characters directly from database to avoid rate limiting issues
                    const { data: loadedCharacters, error: charsError } = await supabase
                        .from('characters')
                        .select('id, name, user_id, current_room, rooms(name, region_name, regions(display_name))')
                        .eq('user_id', session.user.id)
                        .order('created_at', { ascending: true });
                    
                    if (charsError) {
                        console.error('Failed to load characters:', charsError);
                    }
                    
                    if (loadedCharacters && loadedCharacters.length > 0) {
                        // User has existing characters - show roster
                        const personaLines = loadedCharacters.map((char) => {
                            const cachedRoom = roomCache[char.current_room] ?? null;
                            const roomName = char.rooms?.name ?? cachedRoom?.name ?? (char.current_room ? shortId(char.current_room) : null);
                            const regionName = char.rooms?.region_name
                                ?? char.rooms?.regions?.display_name
                                ?? cachedRoom?.regions?.display_name
                                ?? cachedRoom?.region_name
                                ?? (cachedRoom?.region_id ? shortId(cachedRoom.region_id) : null);

                            let locationDescriptor;
                            if (char.current_room) {
                                if (roomName && regionName) {
                                    locationDescriptor = `${roomName} (${regionName})`;
                                } else if (roomName) {
                                    locationDescriptor = roomName;
                                } else if (regionName) {
                                    locationDescriptor = `sector ${regionName}`;
                                } else {
                                    locationDescriptor = 'an undisclosed sector';
                                }
                            } else {
                                locationDescriptor = 'awaiting deployment';
                            }

                            return createRelayLine({ text: `• ${char.name} — ${locationDescriptor}` });
                        });

                        appendLines([
                            createRelayLine({ text: 'Personas synced.' }),
                            createRelayLine({ text: 'Active roster:' }),
                            ...personaLines,
                            createOracleLine(
                                "Welcome to the Arkyv! You're in the Character Creation Chamber.\n\n" +
                                "• Enter the world with an existing character: `enter &lt;name&gt;`\n" +
                                "• Create a new character: `create &lt;name&gt;`\n" +
                                "• View your characters: `characters`\n\n" +
                                "Tip: Once you're exploring, use `disengage` to return to this chamber and switch characters.\n\n" +
                                "You can also use directions like `north`, `west`, etc. to explore your starting area. Return here to manage your characters.\n\n"
                            )
                        ]);
                    } else {
                        // New user with no characters yet
                        appendLines([
                            createRelayLine({ text: 'Personas synced.' }),
                            createRelayLine({ text: 'Active roster:' }),
                            createRelayLine({ text: '• No characters found.' }),
                            createOracleLine('Create your first character with `create &lt;name&gt;`.')
                        ]);
                    }
                }
            }
        })();
    }, [session, activeCharacter, ensureProfile, subscribeToRoom, loadRecentMessages, loadRoomDetails, onRoomChange, onRoomMessage, appendLine, getRegistry, supabase, roomCache, appendLines]);

    // Flag to track if persona list has been shown in current session
    const hasShownPersonaList = useRef(false);

    const pollCharacterRoomChange = useCallback(async (actorId, previousRoomId, isProfile = false) => {
        for (let attempt = 0; attempt < 6; attempt += 1) {
            await sleep(400);

            let data, error;
            if (isProfile) {
                const result = await supabase
                    .from('profiles')
                    .select('id, handle, current_room')
                    .eq('id', actorId)
                    .maybeSingle();
                data = result.data;
                error = result.error;
                if (data) {
                    data.name = data.handle; // Normalize to match character structure
                }
            } else {
                const result = await supabase
                    .from('characters')
                    .select('id, name, current_room')
                    .eq('id', actorId)
                    .maybeSingle();
                data = result.data;
                error = result.error;
            }

            if (error) {
                appendLine(createErrorLine(`Unable to sync actor: ${formatError(error)}`));
                return null;
            }

            if (!data) {
                return null;
            }

            if (!isProfile) {
                setActiveCharacter(data);
            } else {
                setProfile(data);
                profileRef.current = data; // Update ref immediately for synchronous access
            }

            if (data.current_room && data.current_room !== previousRoomId) {
                const CHARACTER_CREATION_ROOM_ID = 'e58caed0-8268-419e-abe8-faa3833a1de6';
                
                // Reset persona list flag when leaving Character Creation Chamber
                if (previousRoomId === CHARACTER_CREATION_ROOM_ID && data.current_room !== CHARACTER_CREATION_ROOM_ID) {
                    hasShownPersonaList.current = false;
                }
                
                currentRoomRef.current = data.current_room;
                getRegistry(data.current_room).clear();
                subscribeToRoom(data.current_room);
                await loadRecentMessages(data.current_room);
        const room = await loadRoomDetails(data.current_room);
        onRoomChange?.(data.current_room, data, room);
        if (room) {
            // Include image marker if room has an image
            const roomDescription = room.image_url 
                ? `[IMAGE:${room.image_url}]\n[LOCATION:${formatRoomNameWithRegion(room).toUpperCase()}]\n${room.description}`
                : `[LOCATION:${formatRoomNameWithRegion(room).toUpperCase()}]\n${room.description}`;
            appendLine(createSystemLine(roomDescription));
            
            // Fetch environment data directly for the new room
            try {
                const [exitsResult, npcsResult, charsResult] = await Promise.all([
                    supabase.from('exits').select('verb, to_room, rooms!exits_to_room_fkey(name)').eq('from_room', data.current_room),
                    supabase.from('npcs').select('name, alias').eq('current_room', data.current_room),
                    isProfile 
                        ? supabase.from('characters').select('name').eq('current_room', data.current_room)
                        : supabase.from('characters').select('name').eq('current_room', data.current_room).neq('id', actorId)
                ]);
                
                let envData = '';
                if (exitsResult.data?.length) {
                    envData += '[EXITS]\n' + exitsResult.data.map(e => `• ${e.verb} → ${e.rooms?.name || 'unknown'}`).join('\n');
                }
                if (npcsResult.data?.length) {
                    if (envData) envData += '\n\n';
                    envData += '[NPCs]\n' + npcsResult.data.map(n => `• ${n.name} (talk ${n.alias})`).join('\n');
                }
                if (charsResult.data?.length) {
                    if (envData) envData += '\n\n';
                    envData += '[CHARACTERS]\n' + charsResult.data.map(c => `• ${c.name}`).join('\n');
                }
                
                if (envData) {
                    onRoomMessage?.({ kind: 'system', body: `[ENV_DATA]\n${envData}` });
                }
            } catch (err) {
                console.error('Failed to fetch environment data after room change:', err);
            }
            
            // Show character creation/entry prompt if in Character Creation Chamber and in profile mode
            if (isProfile && data.current_room === CHARACTER_CREATION_ROOM_ID && !hasShownPersonaList.current && session?.user?.id) {
                hasShownPersonaList.current = true;
                
                // Fetch fresh characters from database
                const { data: loadedCharacters, error: charsError } = await supabase
                    .from('characters')
                    .select('id, name, user_id, current_room, rooms(name, region_name, regions(display_name))')
                    .eq('user_id', session.user.id)
                    .order('created_at', { ascending: true });
                
                if (charsError) {
                    console.error('Failed to load characters:', charsError);
                }
                
                if (loadedCharacters && loadedCharacters.length > 0) {
                    const personaLines = loadedCharacters.map((char) => {
                        const cachedRoom = roomCache[char.current_room] ?? null;
                        const roomName = char.rooms?.name ?? cachedRoom?.name ?? (char.current_room ? shortId(char.current_room) : null);
                        const regionName = char.rooms?.region_name
                            ?? char.rooms?.regions?.display_name
                            ?? cachedRoom?.regions?.display_name
                            ?? cachedRoom?.region_name
                            ?? (cachedRoom?.region_id ? shortId(cachedRoom.region_id) : null);

                        let locationDescriptor;
                        if (char.current_room) {
                            if (roomName && regionName) {
                                locationDescriptor = `${roomName} (${regionName})`;
                            } else if (roomName) {
                                locationDescriptor = roomName;
                            } else if (regionName) {
                                locationDescriptor = `sector ${regionName}`;
                            } else {
                                locationDescriptor = 'an undisclosed sector';
                            }
                        } else {
                            locationDescriptor = 'awaiting deployment';
                        }

                        return createRelayLine({ text: `• ${char.name} — ${locationDescriptor}` });
                    });

                    appendLines([
                        createRelayLine({ text: 'Personas synced.' }),
                        createRelayLine({ text: 'Active roster:' }),
                        ...personaLines,
                        createOracleLine(
                            "Welcome to the Arkyv! You're in the Character Creation Chamber.\n\n" +
                            "• Enter the world with an existing character: `enter &lt;name&gt;`\n" +
                            "• Create a new character: `create &lt;name&gt;`\n" +
                            "• View your characters: `characters`\n\n" +
                            "Tip: Once you're exploring, use `disengage` to return to this chamber and switch characters.\n\n" +
                            "You can also use directions like `north`, `west`, etc. to explore your starting area. Return here to manage your characters.\n\n"
                        )
                    ]);
                } else {
                    // New user with no characters yet
                    appendLines([
                        createRelayLine({ text: 'Personas synced.' }),
                        createRelayLine({ text: 'Active roster:' }),
                        createRelayLine({ text: '• No characters found.' }),
                        createOracleLine('Create your first character with `create &lt;name&gt;`.')
                    ]);
                }
            }
        }
                return data;
            }

            if (!data.current_room && previousRoomId) {
                unsubscribeFromRoom({ notifyRoomChange: false });
                currentRoomRef.current = null;
                onRoomChange?.(null, data);
                return data;
            }
        }

        return null;
    }, [appendLine, appendLines, getRegistry, loadRecentMessages, loadRoomDetails, subscribeToRoom, supabase, unsubscribeFromRoom, onRoomChange, onRoomMessage, setProfile, roomCache, session]);

    const createCharacter = useCallback(async (name) => {
        if (!session) {
            appendLine(createErrorLine('Login required.'));
            return;
        }

        const trimmedName = name.trim();
        if (trimmedName.length < 3) {
            appendLine(createErrorLine('Character name must be at least 3 characters.'));
            return;
        }

        // Default starting room for new characters
        const STARTING_ROOM_ID = 'a1b2c3d4-5678-90ab-cdef-123456789abc';

        const insertPayload = {
            name: trimmedName,
            user_id: session.user.id,
            current_room: STARTING_ROOM_ID,
        };

        const { data, error } = await supabase
            .from('characters')
            .insert(insertPayload)
            .select('id, name, current_room')
            .maybeSingle();

        if (error) {
            if (error.code === '23505') {
                appendLine(createErrorLine('That character name is already taken. Choose another.'));
            } else {
                appendLine(createErrorLine(`Failed to create character: ${formatError(error)}`));
            }
            return;
        }

        // Add new character to state immediately for autocomplete
        setCharacters(prev => [...prev, {
            id: data.id,
            name: data.name,
            current_room: data.current_room,
            room_name: null,
            region_name: null,
            created_at: new Date().toISOString()
        }]);

        appendLines([
            createSystemLine(`Character created: ${data.name}`),
            createOracleLine(`Enter the Arkyv with \`enter ${data.name}\`.`)
        ]);

        await refreshCharacters();
    }, [appendLine, appendLines, refreshCharacters, session, supabase, roomCache]);

    const enterCharacter = useCallback(async (identifier) => {
        // Use cached characters instead of refreshing
        const target = findCharacterByIdentifier(characters, identifier);

        if (!target) {
            appendLine(createErrorLine('Character not found. Use "characters" to list your roster.'));
            return;
        }

        setActiveCharacter(target);
        appendLines([
            createSystemLine(`Entered the world as ${target.name}.`),
            createHelpLine('Type "help" to see all available commands. Use "look" to examine your surroundings in detail, "who" to see characters and NPCs nearby, "exits" to check room exits, "north", "west", etc. (or abbreviations like "n", "w") to move, "talk &lt;name&gt;" to converse with an NPC, or "say [message]" to chat with people in the room.')
        ]);

        if (target.current_room) {
            getRegistry(target.current_room).clear();
            subscribeToRoom(target.current_room);
            await loadRecentMessages(target.current_room);
            const room = await loadRoomDetails(target.current_room);
            onRoomChange?.(target.current_room, target, room);
            if (room) {
                // Include image marker if room has an image
                const roomDescription = room.image_url 
                    ? `[IMAGE:${room.image_url}]\n[LOCATION:${formatRoomNameWithRegion(room).toUpperCase()}]\n${room.description}`
                    : `[LOCATION:${formatRoomNameWithRegion(room).toUpperCase()}]\n${room.description}`;
                appendLine(createSystemLine(roomDescription));
            }
            
            // Ensure state is updated before allowing commands by using a small delay
            // This prevents the race condition where commands are executed before activeCharacter state is updated
            await sleep(50);
            
            // Trigger NPC greetings immediately for room entry
            try {
                console.log('👋 Inserting __GREET command for room:', target.current_room, 'character:', target.id);
                const { data: greetData, error: greetError } = await supabase.from('commands').insert({
                    character_id: target.id,
                    room_id: target.current_room,
                    raw: '__GREET'
                });
                if (greetError) {
                    console.error('❌ Failed to insert __GREET command:', greetError);
                } else {
                    console.log('✅ __GREET command inserted successfully, triggering processor...');
                    // Manually trigger the command processor
                    await fetch('/api/process-commands', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    console.log('✅ Command processor triggered for __GREET');
                }
            } catch (greetErr) {
                console.error('❌ Exception with __GREET command:', greetErr);
            }
            
            // Fetch environment data directly without showing a command
            try {
                const [exitsResult, npcsResult, charsResult] = await Promise.all([
                    supabase.from('exits').select('verb, to_room, rooms!exits_to_room_fkey(name)').eq('from_room', target.current_room),
                    supabase.from('npcs').select('name, alias').eq('current_room', target.current_room),
                    supabase.from('characters').select('name').eq('current_room', target.current_room).neq('id', target.id)
                ]);
                
                let envData = '';
                if (exitsResult.data?.length) {
                    envData += '[EXITS]\n' + exitsResult.data.map(e => `• ${e.verb} → ${e.rooms?.name || 'unknown'}`).join('\n');
                }
                if (npcsResult.data?.length) {
                    if (envData) envData += '\n\n';
                    envData += '[NPCs]\n' + npcsResult.data.map(n => `• ${n.name} (talk ${n.alias})`).join('\n');
                }
                if (charsResult.data?.length) {
                    if (envData) envData += '\n\n';
                    envData += '[CHARACTERS]\n' + charsResult.data.map(c => `• ${c.name}`).join('\n');
                }
                
                if (envData) {
                    onRoomMessage?.({ kind: 'system', body: `[ENV_DATA]\n${envData}` });
                }
            } catch (err) {
                console.error('Failed to fetch environment data:', err);
            }
        } else {
            appendLine(createSystemLine('Character is not currently in a room. Use "go <verb>" to enter.'));
        }
    }, [appendLine, characters, loadRoomDetails, loadRecentMessages, subscribeToRoom, onRoomChange, onRoomMessage, supabase]);

    const triggerCommandProcessor = useCallback(async () => {
        try {
            console.log('Triggering command processor API...');
            const response = await fetch('/api/process-commands', {
                method: 'POST',
            });

            console.log('API response status:', response.status);
            
            if (!response.ok) {
                const text = await response.text();
                console.error('API error response:', text);
                appendLine(createErrorLine(`Processor invoke failed: ${text || response.status}`));
            } else {
                const result = await response.json();
                console.log('API success response:', result);
            }
        } catch (err) {
            console.error('API call failed:', err);
            appendLine(createErrorLine(`Processor invoke failed: ${formatError(err)}`));
        }
    }, [appendLine]);

    const submitCommand = useCallback(async ({ raw, characterId, roomId, conversationHistory = null }) => {
        console.log('Current session:', session);
        console.log('Current user ID:', session?.user?.id);
        console.log('Active character:', activeCharacter);
        
        const insertData = { raw, character_id: characterId, room_id: roomId };
        // If character_id is null (profile mode), include user_id
        if (characterId === null && session?.user?.id) {
            insertData.user_id = session.user.id;
        }
        if (conversationHistory) {
            insertData.conversation_history = conversationHistory;
        }
        
        console.log('Inserting command into database:', insertData);
        
        const { data, error } = await supabase
            .from('commands')
            .insert(insertData)
            .select();

        if (error) {
            console.error('Error inserting command:', error);
            throw error;
        }

        console.log('Command inserted successfully:', data);
        console.log('Triggering command processor...');
        triggerCommandProcessor();
    }, [supabase, triggerCommandProcessor, session, activeCharacter]);

    const getActor = useCallback(() => {
        if (activeCharacter) {
            return { id: activeCharacter.id, current_room: activeCharacter.current_room, name: activeCharacter.name, type: 'character' };
        }
        const p = profileRef.current || profile;
        if (p) {
            return { id: p.id, current_room: p.current_room, name: p.handle, type: 'profile' };
        }
        return null;
    }, [activeCharacter, profile]);

    const ensureActor = useCallback(async () => {
        const existing = getActor();
        if (existing) return existing;
        if (!session?.user) return null;
        const prof = await ensureProfile(session.user);
        if (!prof) return null;
        return { id: prof.id, current_room: prof.current_room, name: prof.handle, type: 'profile' };
    }, [getActor, ensureProfile, session]);

    const handleSay = useCallback(async (message) => {
        const actor = await ensureActor();
        if (!actor?.current_room) {
            appendLine(createErrorLine('You are not in a room.'));
            return;
        }

        try {
            await submitCommand({
                raw: `say ${message}`,
                characterId: actor.type === 'character' ? actor.id : null,
                roomId: actor.current_room,
            });
        } catch (error) {
            appendLine(createErrorLine(`Failed to send message: ${formatError(error)}`));
        }
    }, [appendLine, submitCommand, ensureActor]);

    const handleLook = useCallback(async () => {
        const actor = await ensureActor();
        try {
            if (!actor) {
                appendLine(createErrorLine('Enter the world first.'));
                return;
            }
            console.log('Submitting look command for actor:', actor);
            const characterIdToSend = actor.type === 'character' ? actor.id : null;
            console.log('Character ID being sent:', characterIdToSend, 'Actor type:', actor.type);
            await submitCommand({
                raw: 'look',
                characterId: characterIdToSend,
                roomId: actor.current_room,
            });
            appendLine(createSystemLine('Requesting room description...'));
            console.log('Look command submitted successfully');
        } catch (error) {
            console.error('Error submitting look command:', error);
            appendLine(createErrorLine(`Failed to request description: ${formatError(error)}`));
        }
    }, [appendLine, submitCommand, ensureActor]);

    const handleExits = useCallback(async () => {
        const actor = await ensureActor();
        if (!actor?.current_room) {
            appendLine(createErrorLine('You are not in a room.'));
            return;
        }

        const { data, error } = await supabase
            .from('exits')
            .select('verb, to_room')
            .eq('from_room', actor.current_room);

        if (error) {
            appendLine(createErrorLine(`Failed to load exits: ${formatError(error)}`));
            return;
        }

        if (!data?.length) {
            appendLine(createSystemLine('No visible exits.'));
            return;
        }

        const exitLines = [];
        for (const exit of data) {
            let destinationText = '';
            if (exit.to_room) {
                const details = await loadRoomDetails(exit.to_room);
                destinationText = details ? ` → ${details.name}` : '';
            }
            exitLines.push(createSystemLine(`${exit.verb}${destinationText}`));
        }

        appendLines(exitLines);
    }, [appendLine, appendLines, loadRoomDetails, supabase, ensureActor]);

    const handleMovement = useCallback(async (verb) => {
        const actor = await ensureActor();
        if (!actor?.current_room) {
            appendLine(createErrorLine('You are not in a room.'));
            return;
        }

        const normalizedVerb = verb.trim().toLowerCase();
        if (!normalizedVerb) {
            appendLine(createErrorLine('Specify where to travel.'));
            return;
        }

        const previousRoom = actor.current_room;

        try {
            await submitCommand({
                raw: normalizedVerb,
                characterId: actor.type === 'character' ? actor.id : null,
                roomId: actor.current_room,
            });
            appendLine(createSystemLine(`Moving via "${normalizedVerb}"...`));
            await pollCharacterRoomChange(actor.id, previousRoom, actor.type === 'profile');
        } catch (error) {
            appendLine(createErrorLine(`Movement failed: ${formatError(error)}`));
        }
    }, [appendLine, pollCharacterRoomChange, submitCommand, ensureActor]);

    const handleAuthentication = useCallback(async ({ email, password, isSignup }) => {
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail || !password) {
            appendLine(createErrorLine('Email and password are required.'));
            return;
        }

        setIsProcessing(true);

        try {
            let authData, authError;

            if (isSignup) {
                // For signup, disable email confirmation by setting auto-confirm
                const { data, error } = await supabase.auth.signUp({
                    email: trimmedEmail,
                    password,
                    options: {
                        emailRedirectTo: undefined, // Disable email redirect
                        data: {
                            email_confirmed: true // Auto-confirm the email
                        }
                    }
                });
                authData = data;
                authError = error;
            } else {
                // For login, use normal sign in
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: trimmedEmail,
                    password
                });
                authData = data;
                authError = error;
            }   

            if (authError) {
                appendLine(createErrorLine(`Authentication failed: ${formatError(authError)}`));
                return;
            }

            if (authData?.session) {
                setSession(authData.session);
                greetUser(trimmedEmail);
                // Characters will be refreshed by the useEffect when session changes
            } else if (isSignup) {
                // Since we auto-confirmed the email, the user should be able to log in immediately
                appendLine(createSystemLine('Registration complete! You can now log in with your credentials.'));
            }
        } finally {
            setIsProcessing(false);
        }
    }, [appendLine, greetUser, refreshCharacters, supabase]);

    const executeCommand = useCallback(async (rawInput) => {
        if (disabled || isProcessing) return;

        const trimmed = rawInput.trim();
        if (!trimmed) return;

        const isPasswordStep = authFlow?.step === 'password' || authFlow?.step === 'confirm';
        const displayText = isPasswordStep ? '•'.repeat(trimmed.length || 6) : trimmed;

        appendLine(createInputLine(displayText));
        setInput('');

        if (authFlow) {
            if (trimmed.toLowerCase() === 'cancel') {
                setAuthFlow(null);
                appendLine(createSystemLine('Authentication cancelled.'));
                return;
            }

            if (authFlow.step === 'email') {
                // For forgot password, send reset email immediately
                if (authFlow.mode === 'forgot') {
                    setAuthFlow(null);
                    setIsProcessing(true);
                    
                    try {
                        const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
                            redirectTo: `${window.location.origin}/auth?mode=resetPassword`,
                        });
                        
                        if (error) {
                            appendLine(createErrorLine(`Password reset failed: ${error.message}`));
                        } else {
                            appendLine(createSystemLine(`Password reset email sent to ${trimmed}. Check your inbox for the reset link.`));
                        }
                    } catch (err) {
                        appendLine(createErrorLine(`Password reset failed: ${err.message || 'Unknown error'}`));
                    } finally {
                        setIsProcessing(false);
                    }
                    return;
                }
                
                // For login/register, proceed to password step
                setAuthFlow((prev) => (prev ? { ...prev, email: trimmed, step: 'password' } : null));
                appendLine(createSystemLine('Enter password:'));
                return;
            }

            if (authFlow.step === 'password') {
                // For registration, require password confirmation
                if (authFlow.mode === 'register') {
                    setAuthFlow((prev) => (prev ? { ...prev, password: trimmed, step: 'confirm' } : null));
                    appendLine(createSystemLine('Confirm password:'));
                    return;
                } else {
                    // For login, proceed directly
                    const flow = authFlow;
                    setAuthFlow(null);
                    await handleAuthentication({
                        email: flow.email,
                        password: trimmed,
                        isSignup: false,
                    });
                    return;
                }
            }

            if (authFlow.step === 'confirm') {
                // Validate password confirmation matches
                if (trimmed !== authFlow.password) {
                    setAuthFlow(null);
                    appendLine(createErrorLine('Passwords do not match. Registration cancelled. Please try again with "register".'));
                    return;
                }
                
                const flow = authFlow;
                setAuthFlow(null);
                await handleAuthentication({
                    email: flow.email,
                    password: flow.password,
                    isSignup: true,
                });
                return;
            }
        }

        setHistory((prev) => [...prev, trimmed]);
        setHistoryIndex(-1);

        // Ensure an actor exists (profile) if user is logged in but hasn't entered a character yet
        if (session && !activeCharacter && !profile) {
            await ensureProfile(session.user);
        }

        // Handle conversation mode
        if (conversationMode) {
            if (trimmed.toLowerCase() === 'exit') {
                exitConversationMode();
                return;
            }
            
            // Send message to the NPC we're in conversation with
            const actor = getActor();
            if (session && actor) {
                try {
                    // Add user message to conversation history
                    addToConversationHistory('user', trimmed);
                    
                    // console.log('💬 Conversation history length:', conversationHistory.length);
                    
                    // Send command with conversation history
                    await submitCommand({
                        raw: `talk ${conversationMode.npcAlias} ${trimmed}`,
                        characterId: actor.type === 'character' ? actor.id : null,
                        roomId: actor.current_room,
                        conversationHistory: conversationHistory
                    });
                } catch (error) {
                    appendLine(createErrorLine(`Failed to send message: ${formatError(error)}`));
                }
            }
            return;
        }

        const [cmd, ...rest] = trimmed.split(/\s+/);
        const command = cmd.toLowerCase();
        const args = rest;

        switch (command) {
            case 'help':
            case '?':
                appendLine(createHelpLine(COMMAND_HELP.trim()));
                break;

            case 'login':
                if (session) {
                    appendLine(createSystemLine(`Already logged in as ${session.user.email}. Use 'logout' to switch accounts.`));
                    break;
                }
                setAuthFlow({ mode: 'login', step: 'email', email: '' });
                appendLine(createSystemLine('Login initiated. Enter email:'));
                break;

            case 'register':
                if (session) {
                    appendLine(createSystemLine(`Already logged in as ${session.user.email}. Use 'logout' before registering.`));
                    break;
                }
                setAuthFlow({ mode: 'register', step: 'email', email: '' });
                appendLine(createSystemLine('Registration initiated. Enter email:'));
                break;

            case 'forgot':
                if (session) {
                    appendLine(createSystemLine(`Already logged in as ${session.user.email}. Use 'logout' first if you want to reset a different account.`));
                    break;
                }
                setAuthFlow({ mode: 'forgot', step: 'email', email: '' });
                appendLine(createSystemLine('Password reset initiated. Enter your email:'));
                break;

            case 'cancel':
                if (authFlow) {
                    setAuthFlow(null);
                    appendLine(createSystemLine('Authentication cancelled.'));
                } else {
                    appendLine(createSystemLine('Nothing to cancel.'));
                }
                break;

            case 'logout':
                await supabase.auth.signOut();
                setSession(null);
                setActiveCharacter(null);
                setCharacters([]);
                setAuthFlow(null);
                setProfile(null);
                profileRef.current = null;
                // Reset all initialization flags so next login works properly
                welcomeRef.current = false;
                hasInitializedProfile.current = false;
                hasLoadedCharacters.current = false;
                hasShownPersonaList.current = false;
                lastCharacterRefreshRef.current = 0; // Reset rate limit so refreshCharacters works on next login
                unsubscribeFromRoom({ notifyRoomChange: false });
                break;

            case 'disengage': {
                if (!session) {
                    appendLine(createErrorLine('Login required.'));
                    break;
                }

                if (!activeCharacter) {
                    appendLine(createRelayLine({ text: 'No character currently active.' }));
                    break;
                }

                unsubscribeFromRoom();
                const exitedCharacter = activeCharacter;
                setActiveCharacter(null);
                
                // Mark that we're showing the persona list to prevent useEffect from showing it
                hasShownPersonaList.current = true;
                
                // Return to Character Creation Chamber as profile
                const CHARACTER_CREATION_ROOM_ID = 'e58caed0-8268-419e-abe8-faa3833a1de6';
                
                // Update profile's current_room to Character Creation Chamber
                const { data: updatedProfileData, error: updateError } = await supabase
                    .from('profiles')
                    .update({ current_room: CHARACTER_CREATION_ROOM_ID })
                    .eq('id', session.user.id)
                    .select('id, handle, current_room, user_id')
                    .single();
                
                if (updateError) {
                    console.error('Failed to update profile room:', updateError);
                    break;
                }
                
                // Update profile state AND ref immediately for synchronous access
                setProfile(updatedProfileData);
                profileRef.current = updatedProfileData;
                
                // Refresh characters to get updated room locations BEFORE showing roster
                const updatedCharacters = await refreshCharacters();
                
                // Subscribe to Character Creation Chamber and show room description FIRST
                if (updatedProfileData?.current_room) {
                    getRegistry(updatedProfileData.current_room).clear();
                    subscribeToRoom(updatedProfileData.current_room);
                    await loadRecentMessages(updatedProfileData.current_room);
                    const room = await loadRoomDetails(updatedProfileData.current_room);
                    onRoomChange?.(updatedProfileData.current_room, updatedProfileData, room);
                    if (room) {
                        // Include image marker if room has an image
                        const roomDescription = room.image_url 
                            ? `[IMAGE:${room.image_url}]\n[LOCATION:${formatRoomNameWithRegion(room).toUpperCase()}]\n${room.description}`
                            : `[LOCATION:${formatRoomNameWithRegion(room).toUpperCase()}]\n${room.description}`;
                        appendLine(createSystemLine(roomDescription));
                    }
                    
                    // Fetch environment data directly without showing a command
                    try {
                        await sleep(50);
                        const [exitsResult, npcsResult, charsResult] = await Promise.all([
                            supabase.from('exits').select('verb, to_room, rooms!exits_to_room_fkey(name)').eq('from_room', updatedProfileData.current_room),
                            supabase.from('npcs').select('name, alias').eq('current_room', updatedProfileData.current_room),
                            supabase.from('characters').select('name').eq('current_room', updatedProfileData.current_room)
                        ]);
                        
                        let envData = '';
                        if (exitsResult.data?.length) {
                            envData += '[EXITS]\n' + exitsResult.data.map(e => `• ${e.verb} → ${e.rooms?.name || 'unknown'}`).join('\n');
                        }
                        if (npcsResult.data?.length) {
                            if (envData) envData += '\n\n';
                            envData += '[NPCs]\n' + npcsResult.data.map(n => `• ${n.name} (talk ${n.alias})`).join('\n');
                        }
                        if (charsResult.data?.length) {
                            if (envData) envData += '\n\n';
                            envData += '[CHARACTERS]\n' + charsResult.data.map(c => `• ${c.name}`).join('\n');
                        }
                        
                        if (envData) {
                            onRoomMessage?.({ kind: 'system', body: `[ENV_DATA]\n${envData}` });
                        }
                    } catch (err) {
                        console.error('Failed to fetch environment data:', err);
                    }
                }
                
                // Now show the roster AFTER room description with updated character locations
                appendLines([
                    createRelayLine({ text: 'Character disengaged.' }),
                    createOracleLine(`${exitedCharacter.name} has been returned to the roster.`),
                    createRelayLine({ text: 'Active roster:' }),
                    ...formatPersonaRoster(updatedCharacters || characters, roomCache),
                    createOracleLine('Use `enter &lt;name&gt;` to enter the world again, or `create &lt;name&gt;` to make a new character.'),
                ]);
                
                break;
            }

            case 'whoami':
                if (session) {
                    appendLine(createSystemLine(`User: ${session.user.email}`));
                } else {
                    appendLine(createSystemLine('You are not logged in.'));
                }
                break;

            case 'characters': {
                if (!session) {
                    appendLine(createErrorLine('Login required.'));
                    break;
                }

                // Use cached characters instead of refreshing
                if (!characters.length) {
                    appendLine(createSystemLine('No characters yet. Use "create &lt;name&gt;" to begin.'));
                } else {
                appendLines(characters.map((char) => {
                    const cachedRoom = roomCache[char.current_room] ?? null;
                    const roomLabel = char.current_room
                        ? char.room_name
                            ?? char.rooms?.name
                            ?? cachedRoom?.name
                            ?? shortId(char.current_room)
                        : null;
                    const regionLabel = char.current_room
                        ? char.region_name
                            ?? char.rooms?.regions?.display_name
                            ?? cachedRoom?.regions?.display_name
                            ?? cachedRoom?.region_name
                            ?? (cachedRoom?.region_id ? shortId(cachedRoom.region_id) : null)
                        : null;
                    const decoratedLocation = roomLabel
                        ? regionLabel
                            ? `${roomLabel} (${regionLabel})`
                            : roomLabel
                        : null;
                    const roomInfo = decoratedLocation ? ` – stationed in ${decoratedLocation}` : ' – awaiting deployment';
                    return createSystemLine(`• ${char.name}${roomInfo}`);
                }));
                }
                break;
            }

            case 'create': {
                if (!session) {
                    appendLine(createErrorLine('Login required.'));
                    break;
                }
                if (activeCharacter) {
                    appendLine(createErrorLine(`Cannot create character while active as ${activeCharacter.name}. Use 'logout' to exit character first.`));
                    break;
                }
                // Check if in Character Creation Chamber
                const CHARACTER_CREATION_ROOM_ID = 'e58caed0-8268-419e-abe8-faa3833a1de6';
                const actor = getActor();
                if (!actor || actor.current_room !== CHARACTER_CREATION_ROOM_ID) {
                    appendLine(createErrorLine('You must be in the Character Creation Chamber to create a new character.'));
                    break;
                }
                await createCharacter(args.join(' '));
                break;
            }

            case 'enter': {
                if (!session) {
                    appendLine(createErrorLine('Login required.'));
                    break;
                }
                if (!args.length) {
                    appendLine(createErrorLine('Usage: enter <characterId|name>'));
                    break;
                }
                // Check if in Character Creation Chamber
                const CHARACTER_CREATION_ROOM_ID = 'e58caed0-8268-419e-abe8-faa3833a1de6';
                const actor = getActor();
                if (!actor || actor.current_room !== CHARACTER_CREATION_ROOM_ID) {
                    appendLine(createErrorLine('You must be in the Character Creation Chamber to enter a character.'));
                    break;
                }
                await enterCharacter(args.join(' '));
                break;
            }

            case 'say': {
                if (!session) { appendLine(createErrorLine('Login required.')); break; }
                if (!args.length) { appendLine(createErrorLine('Usage: say <message>')); break; }
                await handleSay(args.join(' '));
                break;
            }

            case 'look': {
                if (!session) { appendLine(createErrorLine('Login required.')); break; }
                await handleLook();
                break;
            }

            case 'exits': {
                if (!session) { appendLine(createErrorLine('Login required.')); break; }
                await handleExits();
                break;
            }

            case 'go':
            case 'move': {
                if (!session) { appendLine(createErrorLine('Login required.')); break; }
                if (!args.length) { appendLine(createErrorLine('Usage: go <exit>')); break; }
                await handleMovement(args.join(' ').toLowerCase());
                break;
            }

            case 'clear':
                clearLines();
                break;

            case 'exit':
                if (conversationMode) {
                    exitConversationMode();
                } else {
                    appendLine(createSystemLine('Nothing to exit from.'));
                }
                break;

            case 'who': {
                if (!session) { appendLine(createErrorLine('Login required.')); break; }
                const actor = getActor();
                if (!actor?.current_room) { appendLine(createErrorLine('You are not in a room.')); break; }
                await submitCommand({ raw: 'who', characterId: actor.type === 'character' ? actor.id : null, roomId: actor.current_room });
                break;
            }

            case 'inspect': {
                if (!session) { appendLine(createErrorLine('Login required.')); break; }
                const actor = getActor();
                if (!actor?.current_room) { appendLine(createErrorLine('You are not in a room.')); break; }
                if (!args.length) { appendLine(createErrorLine('Usage: inspect <name>')); break; }
                
                const targetName = args.join(' ').toLowerCase();
                
                // First check if it's an NPC (by alias or name)
                const npc = roomNPCs.find(n => 
                    n.alias.toLowerCase() === targetName || 
                    n.name.toLowerCase() === targetName
                );
                
                if (npc) {
                    const description = npc.description || 'No description available.';
                    appendLine(createSystemLine(`[${npc.name.toUpperCase()}]\n${description}`));
                    break;
                }
                
                // If not an NPC, check if it's a character in the room
                await submitCommand({ 
                    raw: `inspect ${targetName}`, 
                    characterId: actor.type === 'character' ? actor.id : null, 
                    roomId: actor.current_room 
                });
                break;
            }

            case 'talk': {
                if (!session) { appendLine(createErrorLine('Login required.')); break; }
                const actor = getActor();
                if (!actor?.current_room) { appendLine(createErrorLine('You are not in a room.')); break; }
                if (!args.length) { appendLine(createErrorLine('Usage: talk <npc> [message]')); break; }
                const npcAlias = args[0].toLowerCase();
                const message = args.slice(1).join(' ') || 'hello';
                
                // Find NPC by alias to get proper name
                const npc = roomNPCs.find(n => n.alias.toLowerCase() === npcAlias);
                const npcName = npc ? npc.name : npcAlias;
                
                await submitCommand({ raw: `talk ${npcAlias} ${message}`, characterId: actor.type === 'character' ? actor.id : null, roomId: actor.current_room, conversationHistory: [] });
                enterConversationMode(npcName, npcAlias);
                addToConversationHistory('user', message);
                break;
            }

            case 'pet': {
                if (!session) { appendLine(createErrorLine('Login required.')); break; }
                const actor = getActor();
                if (!actor?.current_room) { appendLine(createErrorLine('You are not in a room.')); break; }
                if (!args.length) { appendLine(createErrorLine('Usage: pet <character/npc>')); break; }
                const targetName = args[0].toLowerCase();
                
                // Find target (NPC or character)
                const npc = roomNPCs.find(n => 
                    n.alias.toLowerCase() === targetName || 
                    n.name.toLowerCase() === targetName
                );
                const character = roomCharacters.find(c => 
                    c.name.toLowerCase() === targetName
                );
                
                if (!npc && !character) {
                    appendLine(createErrorLine(`No one named "${targetName}" found in this room.`));
                    break;
                }
                
                // Send to server for processing
                await submitCommand({ 
                    raw: `pet ${targetName}`, 
                    characterId: actor.type === 'character' ? actor.id : null, 
                    roomId: actor.current_room 
                });
                break;
            }

            default:
                // Check if it's a movement command (direct direction or abbreviation)
                // But exclude commands that start with known command words
                if (session && isMovementCommand(command) && !['pet', 'talk', 'say', 'whisper', 'inspect', 'who', 'look'].includes(command)) {
                    const expandedDirection = expandDirectionAlias(command);
                    await handleMovement(expandedDirection);
                    break;
                }
                
                // For other server-side commands
                if (!session || !getActor()) {
                    appendLine(createErrorLine('Enter the world first.'));
                    break;
                }
                // Try to send to server as other command
                {
                    const actor = getActor();
                    await submitCommand({ raw: trimmed, characterId: actor.type === 'character' ? actor.id : null, roomId: actor.current_room });
                }
                break;
        }
    }, [activeCharacter, appendLine, appendLines, authFlow, clearLines, createCharacter, disabled, enterCharacter, handleAuthentication, handleExits, handleLook, handleMovement, handleSay, isProcessing, refreshCharacters, session, submitCommand, supabase, unsubscribeFromRoom, isMovementCommand, expandDirectionAlias, conversationMode, exitConversationMode, enterConversationMode, addToConversationHistory, conversationHistory, profile, ensureProfile]);

    // Pass executeCommand to parent component
    useEffect(() => {
        if (onExecuteCommand) {
            onExecuteCommand(executeCommand);
        }
    }, [executeCommand, onExecuteCommand]);

    // Notify parent of conversation mode changes
    useEffect(() => {
        if (onConversationChange) {
            onConversationChange(conversationMode);
        }
    }, [conversationMode, onConversationChange]);

    const handleSend = useCallback(() => {
        if (disabled || isProcessing) return;
        if (!input.trim()) return;
        executeCommand(input);
    }, [disabled, executeCommand, input, isProcessing]);

    const handleKeyDown = useCallback((event) => {
        if (disabled) return;

        if (event.key === 'Tab') {
            event.preventDefault();
            handleTabCompletion();
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            executeCommand(input);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!history.length) return;
            const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(newIndex);
            setInput(history[newIndex] || '');
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!history.length) return;

            if (historyIndex === -1) {
                setInput('');
                return;
            }

            const newIndex = Math.min(history.length - 1, historyIndex + 1);
            if (newIndex === history.length - 1) {
                setHistoryIndex(-1);
                setInput('');
            } else {
                setHistoryIndex(newIndex);
                setInput(history[newIndex] || '');
            }
        }
    }, [disabled, executeCommand, history, historyIndex, input, handleTabCompletion]);

    return (
        <div className={`${className} bg-gray-900 border border-cyan-400 rounded-lg shadow-2xl shadow-cyan-400/20 transition-opacity duration-300 flex flex-col ${disabled ? 'opacity-60 saturate-75' : 'opacity-100'}`} style={{ fontFamily: "'JetBrains Mono', 'Consolas', 'Monaco', 'Courier New', monospace" }}>
            {/* Mobile-responsive header */}
            <div className="border-b border-cyan-400">
                {/* Desktop header - hidden on mobile */}
                <div className="hidden sm:flex items-center justify-between p-4">
                    <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full" />
                        <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                        <div className="w-3 h-3 bg-green-500 rounded-full" />
                    </div>
                    <div className="text-center">
                        <span className="text-gray-400 font-terminal text-sm">arkyv://terminal.babachain.zk</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Music Toggle Button - only show when logged in */}
                        {session && (
                            <button
                                onClick={() => {
                                    // Toggle global audio state
                                    if (typeof window !== 'undefined') {
                                        const newState = !window.__babushkaAudioShouldPlay;
                                        window.__babushkaAudioShouldPlay = newState;
                                        // Trigger a custom event to notify audio manager
                                        window.dispatchEvent(new CustomEvent('babushkaAudioToggle', { 
                                            detail: { enabled: newState } 
                                        }));
                                    }
                                }}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-[0.65rem] font-terminal uppercase tracking-[0.2em] transition-colors ${
                                    isMusicEnabled 
                                        ? 'bg-hot-pink/20 hover:bg-hot-pink/30 border border-hot-pink/60 text-hot-pink hover:text-white' 
                                        : 'bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 hover:text-white'
                                }`}
                                title={isMusicEnabled ? "Music is playing - click to stop" : "Music is off - click to start"}
                            >
                                <span className="text-xs">{isMusicEnabled ? '🔊' : '🔇'}</span>
                                <span className="hidden sm:inline">{isMusicEnabled ? 'On' : 'Off'}</span>
                            </button>
                        )}
                        <div className="text-gray-500 font-terminal text-xs">
                            {session ? `${session.user.email}` : 'Unauthenticated'}
                        </div>
                    </div>
                </div>
                
                {/* Mobile header - compressed single line */}
                <div className="sm:hidden p-2">
                    <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                            <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                            <div className="w-2 h-2 bg-yellow-500 rounded-full flex-shrink-0" />
                            <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                            <span className="text-gray-400 font-terminal text-xs ml-2 truncate">arkyv://terminal.babachain.zk</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Music Toggle Button - only show when logged in */}
                            {session && (
                                <button
                                    onClick={() => {
                                        // Toggle global audio state
                                        if (typeof window !== 'undefined') {
                                            const newState = !window.__babushkaAudioShouldPlay;
                                            window.__babushkaAudioShouldPlay = newState;
                                            // Trigger a custom event to notify audio manager
                                            window.dispatchEvent(new CustomEvent('babushkaAudioToggle', { 
                                                detail: { enabled: newState } 
                                            }));
                                        }
                                    }}
                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.6rem] font-terminal uppercase tracking-[0.2em] transition-colors ${
                                        isMusicEnabled 
                                            ? 'bg-hot-pink/20 hover:bg-hot-pink/30 border border-hot-pink/60 text-hot-pink hover:text-white' 
                                            : 'bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 hover:text-white'
                                    }`}
                                    title={isMusicEnabled ? "Music is playing - click to stop" : "Music is off - click to start"}
                                >
                                    <span className="text-xs">{isMusicEnabled ? '🔊' : '🔇'}</span>
                                </button>
                            )}
                            <div className="text-gray-500 font-terminal text-xs truncate max-w-[100px]" title={session ? session.user.email : 'Guest'}>
                                {session ? session.user.email : 'Guest'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Terminal output area - scrollable */}
            <div ref={terminalRef} className="p-2 sm:p-6 flex-1 sm:min-h-[22rem] md:min-h-0 md:max-h-none overflow-y-auto terminal-scroll">
                <div className="space-y-1">
                    {lines.map((entry) => (
                        <div key={entry.id} className="mb-1" data-message-id={entry.id}>
                            <TerminalLine
                                text={entry.text}
                                delay={0}
                                typeSpeed={entry.typeSpeed ?? 20}
                                color={entry.color}
                                prefix={entry.prefix ?? (entry.type === 'input' ? COMMAND_PROMPT : '')}
                                prefixColor={entry.prefixColor}
                                messageKind={entry.messageKind}
                                onNpcClick={(alias) => executeCommand(`talk ${alias}`)}
                                inConversation={!!conversationMode}
                                onStartTyping={() => {
                                    // Scroll to show the message when typing starts
                                    setTimeout(() => {
                                        if (terminalRef.current) {
                                            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                                        }
                                    }, 50);
                                }}
                                onComplete={() => {
                                    // Scroll to show the complete message
                                    setTimeout(() => {
                                        if (terminalRef.current) {
                                            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                                        }
                                    }, 100);
                                }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Input area - fixed at bottom */}
            <div className="border-t border-cyan-400/30 p-2 sm:p-3 flex-shrink-0">
                <div className="flex items-center space-x-2">
                    <span className="text-hot-pink font-terminal text-sm sm:text-base">{COMMAND_PROMPT}</span>
                    <div className="flex items-center flex-1 gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(event) => {
                                setInput(event.target.value);
                                setAutocompleteIndex(-1); // Reset autocomplete when typing
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder={(() => {
                                if (disabled) return 'Handshake in progress...';
                                if (isProcessing) return 'Processing...';
                                
                                // Check if mobile (sm breakpoint is 640px)
                                const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                                
                                if (conversationMode) {
                                    return isMobile 
                                        ? `Talking to ${conversationMode.npcName}`
                                        : `Talking to ${conversationMode.npcName} (type 'exit' to end, press Enter to send)...`;
                                }
                                
                                if (!session) {
                                    if (authFlow?.step === 'email') return 'Type email';
                                    if (authFlow?.step === 'password') return 'Type password';
                                    return 'Enter command';
                                }
                                
                                return isMobile ? 'Enter command' : 'Enter command (press Enter to send)';
                            })()}
                            className={`w-full bg-transparent border-none text-sm sm:text-base focus:outline-none font-terminal ${disabled ? 'text-gray-500' : 'text-cyan-400'} min-h-[32px] sm:min-h-[20px]`}
                            disabled={disabled || isProcessing}
                            autoComplete="off"
                        />
                        {!disabled && !isProcessing && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleTabCompletion}
                                    disabled={disabled || isProcessing || !input.trim()}
                                    className="sm:hidden bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 font-terminal text-xs uppercase tracking-[0.2em] px-3 py-1 rounded border border-cyan-400/40 transition disabled:opacity-40 disabled:hover:bg-cyan-500/20"
                                    aria-label="Tab completion"
                                >
                                    Tab
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSend}
                                    disabled={disabled || isProcessing || !input.trim()}
                                    className="sm:hidden bg-hot-pink/20 hover:bg-hot-pink/30 text-hot-pink font-terminal text-xs uppercase tracking-[0.2em] px-3 py-1 rounded border border-hot-pink/40 transition disabled:opacity-40 disabled:hover:bg-hot-pink/20"
                                    aria-label="Send command"
                                >
                                    Send
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {authFlow && !disabled && (
                    <div className="text-xs text-gray-500 font-terminal mt-1.5">Type 'cancel' to abort the current authentication flow.</div>
                )}
            </div>

            {/* Mobile-responsive footer */}
            <div className="border-t border-cyan-400 flex-shrink-0">
                {/* Desktop footer - hidden on mobile */}
                <div className="hidden sm:block p-3">
                    <div className="flex justify-between items-center text-xs font-terminal text-gray-400">
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                                <div className={`w-2 h-2 rounded-full ${session ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                                <span>Oracle Consensus: {session ? 'ACTIVE' : 'OFFLINE'}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className={`w-2 h-2 rounded-full ${activeCharacter ? 'bg-cyan-400 animate-pulse' : 'bg-gray-500'}`} />
                                <span>ZK-Rollup: {activeCharacter ? 'SYNCED' : 'AWAITING CHARACTER'}</span>
                            </div>
                        </div>
                        <div>
                            <span>{activeCharacter ? `Character: ${activeCharacter.name}` : 'No character active'}</span>
                        </div>
                    </div>
                </div>
                
                {/* Mobile footer - compressed single line */}
                <div className="sm:hidden p-1.5">
                    <div className="flex items-center justify-between text-xs font-terminal text-gray-400">
                        <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${session ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                                <span className="text-xs">{session ? 'ACTIVE' : 'OFFLINE'}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${activeCharacter ? 'bg-cyan-400 animate-pulse' : 'bg-gray-500'}`} />
                                <span className="text-xs">{activeCharacter ? 'SYNCED' : 'AWAITING'}</span>
                            </div>
                        </div>
                        {activeCharacter && (
                            <span className="text-xs">{activeCharacter.name}</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function createSystemLine(text) {
    return {
        id: `system-${Date.now()}-${Math.random()}`,
        type: 'system',
        text,
        color: 'text-cyan-300',
        prefix: 'Σ',
        prefixColor: 'text-cyan-400',
        typeSpeed: 10,
    };
}

function formatRoomNameWithRegion(room) {
    if (!room) {
        return 'Unknown';
    }

    const name = room.name ?? 'Unknown';
    const regionDisplayName = room.regions?.display_name ?? room.region_name;

    return regionDisplayName ? `${name} (${regionDisplayName})` : name;
}

function createRelayLine({ text }) {
    return {
        id: `relay-${Date.now()}-${Math.random()}`,
        type: 'oracle',
        text,
        color: 'text-blue-300',
        prefix: 'Ω',
        prefixColor: 'text-blue-400',
        typeSpeed: 10,
    };
}

function createOracleLine(text) {
    const isOracleRelay = text.startsWith('Oracle Relay:');
    return {
        id: `oracle-${Date.now()}-${Math.random()}`,
        type: 'oracle',
        text,
        color: isOracleRelay ? 'text-green-400' : 'text-purple-300',
        prefix: 'Ω',
        prefixColor: isOracleRelay ? 'text-green-500' : 'text-purple-400',
        typeSpeed: 10,
    };
}

function createInputLine(text) {
    return {
        id: `input-${Date.now()}-${Math.random()}`,
        type: 'input',
        text,
        color: 'text-gray-300',
        prefix: COMMAND_PROMPT,
        prefixColor: 'text-hot-pink',
        typeSpeed: 0,
    };
}

function createHelpLine(text) {
    return {
        id: `help-${Date.now()}-${Math.random()}`,
        type: 'help',
        text,
        color: 'text-green-400',
        prefix: 'ℹ',
        prefixColor: 'text-green-400',
        typeSpeed: 0,
    };
}

function createErrorLine(text) {
    return {
        id: `error-${Date.now()}-${Math.random()}`,
        type: 'error',
        text,
        color: 'text-red-400',
        prefix: '⚠',
        prefixColor: 'text-red-400',
        typeSpeed: 0,
    };
}

const ALLOWED_SYSTEM_TAGS = new Set(['span', 'strong', 'em', 'br']);
const ALLOWED_SYSTEM_CLASSES = [
    /^text-/,
    /^font-/,
    /^bg-/,
    /^terminal-/,
];

function sanitizeSystemMarkup(html) {
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        return html;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const container = doc.body.firstElementChild;

    if (!container) {
        return html;
    }

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null);
    const toStrip = [];

    while (walker.nextNode()) {
        const el = walker.currentNode;
        if (!(el instanceof HTMLElement)) {
            continue;
        }

        if (!ALLOWED_SYSTEM_TAGS.has(el.tagName.toLowerCase())) {
            toStrip.push(el);
            continue;
        }

        Array.from(el.classList).forEach((cls) => {
            const isAllowed = ALLOWED_SYSTEM_CLASSES.some((pattern) => pattern.test(cls));
            if (!isAllowed) {
                el.classList.remove(cls);
            }
        });

        Array.from(el.attributes).forEach((attr) => {
            if (attr.name.toLowerCase() !== 'class') {
                el.removeAttribute(attr.name);
            }
        });
    }

    toStrip.forEach((el) => {
        const parent = el.parentElement;
        if (!parent) {
            return;
        }
        const fragment = document.createDocumentFragment();
        while (el.firstChild) {
            fragment.appendChild(el.firstChild);
        }
        parent.replaceChild(fragment, el);
    });

    return container.innerHTML;
}

function createMessageLine(message, activeCharacter = null, roomNPCs = []) {
    console.log('🎨 CREATEMESSAGELINE called:', {
        kind: message.kind,
        body: message.body,
        target_character_id: message.target_character_id,
        character_id: message.character_id
    });

    const kind = message.kind ? message.kind.toUpperCase() : 'SYSTEM';
    const body = message.body || '';
    const isPlayerSpeech = message.kind === 'say';
    const isOwnMessage = activeCharacter && message.character_id === activeCharacter.id;
    const isNpcMessage = message.kind === 'npc_speech' || message.kind === 'npc_whisper';
    
    // Debug logging
    if (isPlayerSpeech) {
        console.warn('🔍 MESSAGE COLOR DEBUG:', {
            messageCharacterId: message.character_id,
            activeCharacterId: activeCharacter?.id,
            isOwnMessage,
            characterName: message.character_name,
            activeCharacterName: activeCharacter?.name,
            finalColor: isOwnMessage ? 'cyan' : 'white'
        });
    }

    let prefix = '✶';
    let prefixColor = 'text-gray-400';
    let color = 'text-white';
    let text = body;

    if (isPlayerSpeech) {
        // Use character name if available, otherwise fall back to character_id
        const actorLabel = message.character_name || 
                          (activeCharacter && message.character_id === activeCharacter.id ? activeCharacter.name : null) ||
                          message.character_id || 
                          'unknown';

        text = `${actorLabel}: ${body}`;
        
        // Different colors for own messages vs others
        if (isOwnMessage) {
            prefix = '✶';
            prefixColor = 'text-cyan-400';
            color = 'text-cyan-300';
        } else {
            prefix = '✶';
            prefixColor = 'text-gray-400';
            color = 'text-white';
        }
    } else if (message.kind === 'npc_speech') {
        // NPC dialogue
        prefix = '◆';
        prefixColor = 'text-purple-400';
        color = 'text-purple-200';
        text = body;
        
        // Look up NPC portrait if available
        if (isNpcMessage && roomNPCs.length > 0) {
            const colonIndex = body.indexOf(':');
            if (colonIndex !== -1) {
                const fullNamePart = body.substring(0, colonIndex).trim();
                const npcNameFromMessage = fullNamePart.trim();
                console.log('🖼️ Looking for NPC portrait:', { 
                    fullNamePart, 
                    npcNameFromMessage, 
                    availableNPCs: roomNPCs.map(n => ({ name: n.name, alias: n.alias, hasPortrait: !!n.portrait_url, portraitUrl: n.portrait_url }))
                });
                const npc = roomNPCs.find(n => 
                    n.name.toLowerCase() === npcNameFromMessage.toLowerCase() || 
                    n.alias.toLowerCase() === npcNameFromMessage.toLowerCase()
                );
                console.log('🖼️ Found NPC match:', npc ? { name: npc.name, hasPortrait: !!npc.portrait_url, portraitUrl: npc.portrait_url } : 'NO MATCH');
                if (npc?.portrait_url) {
                    console.log('🖼️ Adding portrait to message:', npc.portrait_url);
                    text = `[PORTRAIT:${npc.portrait_url}][NPCALIAS:${npc.alias || npc.name}]${body}`;
                } else {
                    console.log('🖼️ No portrait - NPC found but no portrait_url:', { npcFound: !!npc, npcName: npc?.name });
                    // Even without portrait, add alias for clickable name
                    if (npc?.alias) {
                        text = `[NPCALIAS:${npc.alias}]${body}`;
                    }
                }
            }
        }
    } else if (message.kind === 'whisper') {
        // Player whisper (private message between players)
        prefix = '◈';
        prefixColor = 'text-hot-pink';
        color = 'text-pink-200';
        text = body;
    } else if (message.kind === 'npc_whisper') {
        // Private NPC whisper (only visible to target character)
        prefix = '◈';
        prefixColor = 'text-cyan-400';
        color = 'text-cyan-200';
        text = body;
        
        // Look up NPC portrait if available
        // Whisper format: "NPC Name whispers to you: message"
        if (isNpcMessage && roomNPCs.length > 0) {
            const whisperMatch = body.match(/^(.+?)\s+whispers to you:/);
            if (whisperMatch) {
                const fullNamePart = whisperMatch[1].trim();
                const npcNameFromMessage = fullNamePart.trim();
                const npc = roomNPCs.find(n => 
                    n.name.toLowerCase() === npcNameFromMessage.toLowerCase() || 
                    n.alias.toLowerCase() === npcNameFromMessage.toLowerCase()
                );
                if (npc?.portrait_url) {
                    text = `[PORTRAIT:${npc.portrait_url}][NPCALIAS:${npc.alias || npc.name}]${body}`;
                } else if (npc?.alias) {
                    text = `[NPCALIAS:${npc.alias}]${body}`;
                }
            }
        }
    } else if (message.kind === 'npc_typing') {
        // NPC typing indicator with animated dots
        prefix = '◆';
        prefixColor = 'text-purple-400 animate-pulse';
        color = 'text-purple-300';
        text = body;
        
        // Look up NPC portrait if available
        if (isNpcMessage && roomNPCs.length > 0) {
            // Typing message format is usually "NPC Name is thinking..."
            const thinkingMatch = body.match(/^(.+?) is thinking/);
            if (thinkingMatch) {
                const fullNamePart = thinkingMatch[1].trim();
                const npcNameFromMessage = fullNamePart.trim();
                const npc = roomNPCs.find(n => 
                    n.name.toLowerCase() === npcNameFromMessage.toLowerCase() || 
                    n.alias.toLowerCase() === npcNameFromMessage.toLowerCase()
                );
                
                if (npc?.portrait_url) {
                    text = `[PORTRAIT:${npc.portrait_url}][NPCALIAS:${npc.alias || npc.name}]${body}`;
                } else if (npc?.alias) {
                    text = `[NPCALIAS:${npc.alias}]${body}`;
                }
            }
        }
    } else {
        prefix = '☍';
        prefixColor = 'text-cyan-300';
        color = 'text-cyan-200';
        if (kind === 'SYSTEM' || kind === 'system') {
            prefix = 'Σ';
            prefixColor = 'text-cyan-400';
            color = 'text-cyan-300';
            
            // Special styling for section headers in look command
            console.log('🎨 STYLING DEBUG:', { kind, body, hasHeaders: body.includes('[CHARACTERS]') || body.includes('[NPCs]') });
            if (body.includes('[LOCATION:') || body.includes('[CHARACTERS]') || body.includes('[NPCs]') || body.includes('[EXITS]')) {
                // Replace section headers with styled versions using HTML spans
                const formatted = body
                    .replace(/\[LOCATION:([^\]]+)\]/g, '<span class="text-cyan-400 font-bold text-lg">═══ $1 ═══</span>')
                    .replace(/\[CHARACTERS\]/g, '<span class="text-hot-pink font-bold">═══ CHARACTERS ═══</span>')
                    .replace(/\[NPCs\]/g, '<span class="text-purple-400 font-bold">═══ NPCs ═══</span>')
                    .replace(/\[EXITS\]/g, '<span class="text-yellow-400 font-bold">═══ EXITS ═══</span>')
                    // Style the bullet points and arrows
                    .replace(/• ([^[]+) \[([^\]]+)\]/g, '<span class="text-cyan-300">•</span> <span class="text-white font-semibold">$1</span> <span class="text-gray-400">[</span><span class="text-green-400">$2</span><span class="text-gray-400">]</span>')
                    .replace(/• ([^→]+) → (.+)/g, '<span class="text-cyan-300">•</span> <span class="text-yellow-300">$1</span> <span class="text-gray-400">→</span> <span class="text-blue-300">$2</span>')
                    .replace(/• ([^[→]+)$/gm, '<span class="text-cyan-300">•</span> <span class="text-white">$1</span>');

                text = sanitizeSystemMarkup(formatted);
            }
        }
    }

    return {
        id: `message-${message.id ?? `${Date.now()}-${Math.random()}`}`,
        type: 'message',
        text,
        color,
        prefix,
        prefixColor,
        typeSpeed: 0,
        room_id: message.room_id,
        character_id: message.character_id,
        messageKind: message.kind,
        originalMessage: message,
    };
}

function formatError(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    return JSON.stringify(error);
}

function findCharacterByIdentifier(list, identifier) {
    if (!identifier) return null;
    const lower = identifier.trim().toLowerCase();
    return list.find((char) => char.id === identifier || char.name.toLowerCase() === lower);
}

function shortId(value = '') {
    return value.slice(0, 6);
}

function formatPersonaRoster(roster = [], roomCache = {}) {
    if (!Array.isArray(roster) || roster.length === 0) {
        return [createRelayLine({ text: 'No characters found. Use `create <name>` to create your first character.' })];
    }

    return roster.map((char) => {
        const cachedRoom = roomCache[char.current_room] ?? null;

        const roomName = char.rooms?.name
            ?? cachedRoom?.name
            ?? (char.current_room ? shortId(char.current_room) : null);

        const regionName = char.region_name
            ?? char.rooms?.regions?.display_name
            ?? cachedRoom?.regions?.display_name
            ?? cachedRoom?.region_name
            ?? (cachedRoom?.region_id ? shortId(cachedRoom.region_id) : null);

        let locationDescriptor;
        if (char.current_room) {
            if (roomName && regionName) {
                locationDescriptor = `${roomName} (${regionName})`;
            } else if (roomName) {
                locationDescriptor = roomName;
            } else if (regionName) {
                locationDescriptor = `sector ${regionName}`;
            } else {
                locationDescriptor = 'an undisclosed sector';
            }
        } else {
            locationDescriptor = 'awaiting deployment';
        }

        return createRelayLine({ text: `• ${char.name} — ${locationDescriptor}` });
    });
}

