import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';

const TypingDots = () => (
    <span className="inline-flex ml-1">
        <span className="animate-pulse">.</span>
        <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>.</span>
        <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>.</span>
    </span>
);

// Helper function to convert markdown-style formatting to HTML
const formatMarkdown = (text) => {
    if (!text || typeof text !== 'string') return text;
    
    let formatted = text;
    
    // Replace ### Heading with larger text (h3 style)
    formatted = formatted.replace(/^### (.+)$/gm, '<span class="text-base font-semibold block mt-2 mb-1">$1</span>');
    
    // Replace **text** with <strong>text</strong> (do this before single asterisks)
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>');
    
    // Replace *text* with <em>text</em> (italic)
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
    
    return formatted;
};

const normalizeRegionName = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
};

const buildRealtimeFilter = (regionName) => {
    const normalized = normalizeRegionName(regionName);
    if (!normalized) {
        return null;
    }
    // Supabase realtime filters follow REST filter syntax; values with spaces must be URI encoded.
    return `region_name=eq.${encodeURIComponent(normalized)}`;
};

const formatTimestamp = (timestamp) => {
    if (!timestamp) {
        return '';
    }

    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const RoomChatWindow = ({
    regionName = null,
    activeCharacter = null,
    latestMessage = null,
    disabled = false,
    className = '',
    onExecuteCommand = null
}) => {
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [inputMessage, setInputMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const supabase = useMemo(() => getSupabaseClient(), []);
    const messagesEndRef = useRef(null);
    const messagesSnapshotRef = useRef([]);
    const lastFetchedRegionRef = useRef('');

    const visibleRegion = normalizeRegionName(regionName);

    useEffect(() => {
        messagesSnapshotRef.current = messages;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!latestMessage) {
            return;
        }

        const payload = latestMessage.payload ?? latestMessage;
        const rawMessage = payload?.originalMessage ?? payload;

        if (!rawMessage || rawMessage.kind !== 'say') {
            return;
        }

        const messageRegion = normalizeRegionName(
            rawMessage.region_name ?? rawMessage.region ?? rawMessage.rooms?.region_name ?? rawMessage.rooms?.region ?? ''
        );

        if (!messageRegion || messageRegion !== visibleRegion) {
            return;
        }

        // Filter out other users' messages in apartment region
        const isApartment = messageRegion === 'your-apartment' || messageRegion === 'Your Apartment';
        if (isApartment && activeCharacter && rawMessage.character_id !== activeCharacter.id) {
            return;
        }

        const messageId = rawMessage.id ?? latestMessage.id;
        if (!messageId) {
            return;
        }

        setMessages((prev) => {
            if (prev.some((entry) => entry.id === messageId)) {
                return prev;
            }

            const nextMessage = {
                id: messageId,
                region: rawMessage.region ?? messageRegion,
                region_name: messageRegion,
                room_id: rawMessage.room_id,
                character_id: rawMessage.character_id,
                character_name: rawMessage.character_name,
                kind: rawMessage.kind,
                body: rawMessage.body,
                created_at: rawMessage.created_at ?? new Date().toISOString()
            };

            return [...prev, nextMessage];
        });
    }, [latestMessage, visibleRegion, activeCharacter]);

    const fetchRegionMessages = useCallback(async (region) => {
        const normalizedRegion = normalizeRegionName(region);

        if (!normalizedRegion) {
            setMessages([]);
            setIsLoading(false);
            lastFetchedRegionRef.current = '';
            return;
        }

        const shouldShowLoader =
            lastFetchedRegionRef.current !== normalizedRegion || messagesSnapshotRef.current.length === 0;

        if (shouldShowLoader) {
            setIsLoading(true);
        }

        try {
            const { data, error } = await supabase
                .from('region_chats')
                .select('id, region, region_name, room_id, character_id, character_name, kind, body, created_at')
                .eq('region_name', normalizedRegion)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error loading region chat messages:', error);
                if (shouldShowLoader) {
                    setMessages([]);
                }
            } else if (Array.isArray(data)) {
                // Filter messages for apartment region - only show own messages
                const isApartment = normalizedRegion === 'your-apartment' || normalizedRegion === 'Your Apartment';
                const filteredData = isApartment && activeCharacter
                    ? data.filter(msg => msg.character_id === activeCharacter.id)
                    : data;
                
                setMessages(filteredData);
                lastFetchedRegionRef.current = normalizedRegion;
            }
        } catch (error) {
            console.error('Failed to load region chat messages:', error);
            if (shouldShowLoader) {
                setMessages([]);
            }
        } finally {
            setIsLoading(false);
        }
    }, [supabase, activeCharacter]);

    useEffect(() => {
        fetchRegionMessages(regionName);
    }, [regionName, fetchRegionMessages]);

    useEffect(() => {
        const fetchRegionDisplayName = async () => {
            const normalizedRegion = normalizeRegionName(regionName);
            if (!normalizedRegion) {
                setDisplayName('');
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('regions')
                    .select('display_name')
                    .eq('name', normalizedRegion)
                    .single();

                if (error) {
                    console.error('Error fetching region display name:', error);
                    setDisplayName(normalizedRegion);
                } else if (data?.display_name) {
                    setDisplayName(data.display_name);
                } else {
                    setDisplayName(normalizedRegion);
                }
            } catch (error) {
                console.error('Failed to fetch region display name:', error);
                setDisplayName(normalizedRegion);
            }
        };

        fetchRegionDisplayName();
    }, [regionName, supabase]);

    useEffect(() => {
        const normalizedRegion = normalizeRegionName(regionName);
        if (!normalizedRegion) {
            return undefined;
        }

        const filter = buildRealtimeFilter(normalizedRegion);
        const channel = supabase
            .channel(`region-chat-${normalizedRegion}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'region_chats',
                    filter: filter || undefined
                },
                (payload) => {
                    const newMessage = payload.new;
                    if (!newMessage || normalizeRegionName(newMessage.region_name) !== normalizedRegion) {
                        return;
                    }

                    setMessages((prev) => {
                        if (prev.some((entry) => entry.id && entry.id === newMessage.id)) {
                            return prev;
                        }
                        return [...prev, newMessage];
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [regionName, supabase, fetchRegionMessages]);

    const formatMessage = useCallback((message) => {
        const type = message.kind || message.type || 'system';
        const isOwn = Boolean(activeCharacter && message.character_id === activeCharacter.id);

        if (type === 'say') {
            const actorLabel = message.character_name
                || (isOwn && activeCharacter?.name)
                || message.character_id
                || 'unknown';

            return {
                text: `${actorLabel}: ${message.body}`,
                isOwn,
                type
            };
        }

        if (type === 'npc_typing') {
            const baseText = (message.body || '').replace('is thinking...', 'is thinking');
            return {
                text: baseText,
                isOwn: false,
                type,
                isThinking: true
            };
        }

        if (type === 'npc_speech' || type === 'npc_whisper') {
            return {
                text: message.body || '',
                isOwn: false,
                type
            };
        }

        return {
            text: message.body || '',
            isOwn: false,
            type
        };
    }, [activeCharacter]);

    const handleSendMessage = useCallback(async () => {
        if (!inputMessage.trim() || !onExecuteCommand || isSending) {
            return;
        }

        setIsSending(true);
        try {
            await onExecuteCommand(`say ${inputMessage.trim()}`);
            setInputMessage('');
        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setIsSending(false);
        }
    }, [inputMessage, onExecuteCommand, isSending]);

    const handleKeyPress = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    }, [handleSendMessage]);

    if (disabled) {
        return (
            <div className={`bg-gray-900 border border-cyan-400/60 rounded-lg shadow-lg shadow-cyan-400/10 overflow-hidden min-h-[12rem] sm:min-h-[20rem] ${className}`.trim()}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between px-3 py-2 sm:px-4 sm:py-3 border-b border-cyan-400/40 gap-1 sm:gap-0">
                    <span className="text-xs font-terminal text-gray-400">Region Chat</span>
                    <span className="text-xs font-terminal text-hot-pink">Offline</span>
                </div>
                <div className="px-4 py-5 h-full flex items-center justify-center">
                    <div className="text-gray-600 font-terminal text-sm">Region chat unavailable</div>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-gray-900 border border-cyan-400/60 rounded-lg shadow-lg shadow-cyan-400/10 overflow-hidden flex flex-col min-h-[12rem] sm:min-h-[20rem] md:min-h-[20rem] ${className}`.trim()}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between px-3 py-2 sm:px-4 sm:py-3 border-b border-cyan-400/40 flex-shrink-0 gap-1 sm:gap-0">
                <span className="text-xs font-terminal text-gray-400">Region Chat</span>
                <span className="text-xs font-terminal text-hot-pink truncate max-w-full sm:max-w-[50%] sm:text-right">
                    {displayName || 'No Region'}
                </span>
            </div>

            <div
                className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 space-y-2 terminal-scroll"
                style={{
                    scrollbarWidth: 'thin',
                    WebkitOverflowScrolling: 'touch',
                    msOverflowStyle: 'auto'
                }}
            >
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-cyan-400 font-terminal text-xs animate-pulse">
                            Loading chat history...
                        </div>
                    </div>
                ) : !visibleRegion ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-gray-600 font-terminal text-xs">
                            No region selected
                        </div>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-gray-600 font-terminal text-xs">
                            No messages in this region yet
                        </div>
                    </div>
                ) : (
                    messages.map((message) => {
                        const formatted = formatMessage(message);
                        return (
                            <div key={message.id ?? `${message.room_id}-${message.created_at}`} className="group">
                                <div className="flex flex-col sm:flex-row sm:items-start sm:gap-2 text-xs">
                                    <div className="flex-1 min-w-0">
                                        <div
                                            className={`font-terminal break-words text-[0.72rem] sm:text-xs leading-snug ${
                                                formatted.type === 'say'
                                                    ? formatted.isOwn
                                                        ? 'text-cyan-300'
                                                        : 'text-white'
                                                    : formatted.type === 'system'
                                                        ? 'text-cyan-300'
                                                        : formatted.type === 'npc_typing'
                                                            ? 'text-purple-300'
                                                            : formatted.type === 'npc_speech'
                                                                ? 'text-purple-200'
                                                                : 'text-gray-300'
                                            }`}
                                        >
                                            {formatted.isThinking ? (
                                                <>
                                                    {formatted.text}
                                                    <TypingDots />
                                                </>
                                            ) : (
                                                <span
                                                    dangerouslySetInnerHTML={{
                                                        __html: formatMarkdown(formatted.text)
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-gray-500 font-terminal sm:flex-shrink-0 sm:mt-0 mt-1 leading-none text-[0.6rem] sm:text-[0.7rem]">
                                        {formatTimestamp(message.created_at)}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Message Input - Always visible for debugging */}
            <div className="border-t border-cyan-400/40 px-3 py-2 sm:px-4 flex-shrink-0">
                {onExecuteCommand && activeCharacter ? (
                    <div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Type a message..."
                                className="flex-1 bg-slate-800/70 border border-slate-600/60 rounded-md px-3 py-2 text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:border-cyan-400/60 transition-colors"
                                disabled={isSending}
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputMessage.trim() || isSending}
                                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 rounded-md text-cyan-200 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-terminal uppercase tracking-[0.2em]"
                            >
                                {isSending ? '...' : 'Send'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-slate-500 font-terminal text-center">
                        {!activeCharacter ? 'Enter a character to send messages' : 'Chat input unavailable'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RoomChatWindow;