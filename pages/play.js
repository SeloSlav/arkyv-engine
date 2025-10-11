import React, { useState, useCallback } from 'react';
import Head from 'next/head';
import HamburgerIcon from '@/components/HamburgerIcon';
import ArkyvTerminal from '@/components/ArkyvTerminal';
import RoomChatWindow from '@/components/RoomChatWindow';
import ArkyvAudioManager from '@/components/ArkyvAudioManager';

export default function ArkyvAccess() {
    const [currentRoom, setCurrentRoom] = useState(null);
    const [activeCharacter, setActiveCharacter] = useState(null);
    const [currentRegion, setCurrentRegion] = useState(null);
    const [currentRoomName, setCurrentRoomName] = useState(null);
    const [latestRoomMessage, setLatestRoomMessage] = useState(null);
    const [environmentData, setEnvironmentData] = useState({ characters: [], npcs: [], exits: [] });
    const [activeConversation, setActiveConversation] = useState(null);
    const executeCommandRef = React.useRef(null);

    const handleRoomChange = (roomId, character, roomDetails = null) => {
        setCurrentRoom(roomId);
        setActiveCharacter(character);

        setCurrentRoomName((prevName) => {
            if (!roomId) {
                return null;
            }

            if (roomDetails?.name && typeof roomDetails.name === 'string') {
                return roomDetails.name;
            }

            return prevName ?? null;
        });

        setCurrentRegion((prevRegion) => {
            if (!roomId) {
                setCurrentRoomName(null);
                return null;
            }

            if (!roomDetails) {
                return prevRegion;
            }

            const normalize = (value) => {
                if (typeof value !== 'string') {
                    return null;
                }
                return value.trim().toLowerCase();
            };

            // Use region_name (the key) for querying region_chats
            const nextRegion = normalize(roomDetails.region_name || roomDetails.region);
            if (!nextRegion) {
                setCurrentRoomName(roomDetails.name ?? null);
                return prevRegion;
            }

            const currentNormalized = normalize(prevRegion);
            if (currentNormalized === nextRegion) {
                setCurrentRoomName((prevName) => roomDetails.name ?? prevName ?? null);
                return nextRegion; // Return the normalized key
            }

            setCurrentRoomName(roomDetails.name ?? null);
            return nextRegion; // Return the normalized key
        });
    };

    const handleRoomMessage = useCallback((message) => {
        if (!message) {
            return;
        }

        const normalizedRoomId = message.room_id ?? message.originalMessage?.room_id ?? null;
        setLatestRoomMessage({
            roomId: normalizedRoomId,
            id: message.id ?? `${Date.now()}`,
            payload: message,
            ts: Date.now()
        });

        // Parse environment data from system messages
        if (message.kind === 'system' && message.body) {
            let body = message.body;
            
            // Strip [ENV_DATA] header if present
            if (body.startsWith('[ENV_DATA]')) {
                body = body.replace('[ENV_DATA]\n', '').replace('[ENV_DATA]', '');
            }
            
            // Parse WHO/LOOK command output - supports both [SECTION] and ═══ SECTION ═══ formats
            const charMatch = body.match(/(?:\[CHARACTERS\]|═══ CHARACTERS ═══)\s*([\s\S]*?)(?:\[|═══|$)/);
            const npcMatch = body.match(/(?:\[NPCs\]|═══ NPCs ═══)\s*([\s\S]*?)(?:\[|═══|$)/);
            const exitMatch = body.match(/(?:\[EXITS\]|═══ EXITS ═══)\s*([\s\S]*?)(?:\[|═══|$)/);
            
            // If this is a WHO/LOOK response (has at least one section), update all sections
            // This ensures old data from previous rooms doesn't persist
            if (charMatch || npcMatch || exitMatch) {
                const updated = {
                    characters: [],
                    npcs: [],
                    exits: []
                };
                
                if (charMatch) {
                    const charText = charMatch[1];
                    const chars = charText.match(/• ([^\n]+)/g);
                    updated.characters = chars ? chars.map(c => c.replace('• ', '').trim()) : [];
                }
                
                if (npcMatch) {
                    const npcText = npcMatch[1];
                    const npcs = npcText.match(/• ([^\n]+)/g);
                    updated.npcs = npcs ? npcs.map(n => n.replace('• ', '').trim()) : [];
                }
                
                if (exitMatch) {
                    const exitText = exitMatch[1];
                    const exits = exitText.match(/• ([^\n]+)/g);
                    updated.exits = exits ? exits.map(e => e.replace('• ', '').trim()) : [];
                }
                
                setEnvironmentData(updated);
            }
        }
    }, []);

    return (
        <>
            <Head>
                <title>Arkyv Engine - Open Source Text-Based MUD</title>
                <meta name="description" content="An open-source multi-user dungeon (MUD) built with Next.js and AI. Explore text-based worlds, interact with NPCs, and collaborate with other players in real-time. Create characters, build narratives, and shape emergent stories." />
                <meta name="keywords" content="MUD, multi-user dungeon, text-based game, open source, Next.js, real-time multiplayer, interactive fiction, AI NPCs, text adventure" />
                
                {/* PWA Manifest and Favicon */}
                <link rel="icon" href="/arkyv_logo.jpg" />
                <link rel="apple-touch-icon" href="/arkyv_logo.jpg" />
                <meta name="theme-color" content="#89CFF0" />
                <meta name="apple-mobile-web-app-title" content="Arkyv Engine" />
                <meta name="application-name" content="Arkyv Engine" />
                
                {/* Open Graph / Facebook */}
                <meta property="og:type" content="website" />
                <meta property="og:title" content="Arkyv Engine - Open Source Text-Based MUD" />
                <meta property="og:description" content="An open-source multi-user dungeon (MUD) built with Next.js and AI. Explore text-based worlds, interact with NPCs, and collaborate with other players in real-time." />
                <meta property="og:site_name" content="Arkyv Engine" />
                
                {/* Twitter */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="Arkyv Engine - Open Source Text-Based MUD" />
                <meta name="twitter:description" content="An open-source multi-user dungeon (MUD) built with Next.js and AI. Explore text-based worlds, interact with NPCs, and collaborate with other players in real-time." />
                
                {/* Author and License */}
                <meta name="author" content="Arkyv Engine Contributors" />
                <link rel="license" href="https://opensource.org/licenses/MIT" />
            </Head>
            <div className="min-h-screen bg-black text-white flex flex-col relative">
                <HamburgerIcon />

                <div className="flex-grow flex flex-col px-2 pb-2 pt-2 md:px-4 md:pb-16 md:pt-6">
                    {/* Main content area */}
                    <div className="w-full max-w-7xl mx-auto flex flex-col md:grid md:grid-cols-[1fr_360px] gap-3 md:gap-6 h-full">
                        {/* Terminal - bottom on mobile, left on desktop */}
                        <div className="order-2 md:order-1 h-[52vh] md:h-[85vh]">
                            <ArkyvTerminal
                                disabled={false}
                                autoFocusTrigger={0}
                                onRoomChange={handleRoomChange}
                                onRoomMessage={handleRoomMessage}
                                onExecuteCommand={(cmd) => { executeCommandRef.current = cmd; }}
                                onConversationChange={setActiveConversation}
                                className="h-full"
                            />
                        </div>

                        {/* Right Column - top on mobile, right on desktop */}
                        <div className="order-1 md:order-2 h-auto md:h-[85vh] flex-shrink-0 md:relative">
                            {/* Logo - Desktop only */}
                            <div className="hidden md:block absolute top-6 left-6 right-6 z-10 pointer-events-none">
                                <div className="flex items-center space-x-4">
                                    <img
                                        src="/arkyv_logo.jpg"
                                        alt="Arkyv Logo"
                                        className="w-20 h-20 drop-shadow-lg"
                                    />
                                    <div className="space-y-1">
                                    <p className="font-terminal text-xs text-gray-400 tracking-[0.35em] uppercase">
                                        Open-Source Multi-User Dungeon
                                    </p>
                                    <h1 className="text-lg font-terminal text-hot-pink">
                                        Arkyv Engine
                                    </h1>
                                    </div>
                                </div>
                            </div>

                            {/* Mobile Layout - Side by Side */}
                            <div className="md:hidden flex gap-3 h-[36vh]">
                                <RoomChatWindow
                                    disabled={false}
                                    regionName={currentRegion}
                                    activeCharacter={activeCharacter}
                                    latestMessage={latestRoomMessage}
                                    onExecuteCommand={(cmd) => executeCommandRef.current?.(cmd)}
                                    className="flex-1"
                                />
                                <ArkyvAudioManager
                                    region={currentRegion}
                                    roomId={currentRoom}
                                    roomName={currentRoomName}
                                    environmentData={environmentData}
                                    activeConversation={activeConversation}
                                    onExecuteCommand={(cmd) => executeCommandRef.current?.(cmd)}
                                    className="w-[44vw] max-w-[240px]"
                                />
                            </div>

                            {/* Desktop Layout - Stacked */}
                            <div className="hidden md:flex md:flex-col h-full gap-3 pt-32">
                                <ArkyvAudioManager 
                                    region={currentRegion} 
                                    roomId={currentRoom} 
                                    roomName={currentRoomName} 
                                    environmentData={environmentData} 
                                    activeConversation={activeConversation}
                                    onExecuteCommand={(cmd) => executeCommandRef.current?.(cmd)}
                                    className="flex-shrink-0 h-[25vh]" 
                                />
                                <RoomChatWindow
                                    disabled={false}
                                    regionName={currentRegion}
                                    activeCharacter={activeCharacter}
                                    latestMessage={latestRoomMessage}
                                    onExecuteCommand={(cmd) => executeCommandRef.current?.(cmd)}
                                    className="flex-1 min-h-0"
                                />
                            </div>
                        </div>

                    </div>
                    
                </div>

            </div>
        </>
    );
}
