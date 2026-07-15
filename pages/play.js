import React, { useCallback, useRef, useState } from 'react';
import Head from 'next/head';
import HamburgerIcon from '@/components/HamburgerIcon';
import ArkyvTerminal from '@/components/ArkyvTerminal';
import RoomChatWindow from '@/components/RoomChatWindow';
import ArkyvAudioManager from '@/components/ArkyvAudioManager';
import RpgHud from '@/components/RpgHud';

const MOBILE_TABS = [
    { id: 'terminal', label: 'Play', glyph: '>' },
    { id: 'world', label: 'World', glyph: '◎' },
    { id: 'gear', label: 'Gear', glyph: '◇' },
    { id: 'chat', label: 'Chat', glyph: '#' },
];

function extractSection(body, label) {
    const match = body.match(new RegExp(`\\[${label}\\]\\s*([\\s\\S]*?)(?=\\n\\[[A-Z_]+\\]|$)`, 'i'));
    if (!match) return null;
    return match[1]
        .split('\n')
        .map((line) => line.replace(/^(?:•|-|\*)\s*/, '').trim())
        .filter(Boolean);
}

export default function ArkyvAccess() {
    const [currentRoom, setCurrentRoom] = useState(null);
    const [activeCharacter, setActiveCharacter] = useState(null);
    const [currentRegion, setCurrentRegion] = useState(null);
    const [currentRoomName, setCurrentRoomName] = useState(null);
    const [latestRoomMessage, setLatestRoomMessage] = useState(null);
    const [environmentData, setEnvironmentData] = useState({ characters: [], npcs: [], exits: [] });
    const [activeConversation, setActiveConversation] = useState(null);
    const [mobileTab, setMobileTab] = useState('terminal');
    const executeCommandRef = useRef(null);

    const execute = useCallback((command) => executeCommandRef.current?.(command), []);

    const handleRoomChange = useCallback((roomId, character, roomDetails = null) => {
        setCurrentRoom(roomId);
        setActiveCharacter(character);
        if (!roomId) {
            setCurrentRoomName(null);
            setCurrentRegion(null);
            setEnvironmentData({ characters: [], npcs: [], exits: [] });
            return;
        }
        if (roomDetails?.name) setCurrentRoomName(roomDetails.name);
        const region = roomDetails?.region_name || roomDetails?.region;
        if (typeof region === 'string' && region.trim()) setCurrentRegion(region.trim().toLowerCase());
    }, []);

    const handleRoomMessage = useCallback((message) => {
        if (!message) return;
        setLatestRoomMessage({
            roomId: message.room_id ?? message.originalMessage?.room_id ?? null,
            id: message.id ?? `${Date.now()}`,
            payload: message,
            ts: Date.now(),
        });

        if (message.kind !== 'system' || !message.body) return;
        const body = message.body.replace(/^\[ENV_DATA\]\s*/, '');
        const characters = extractSection(body, 'CHARACTERS');
        const npcs = extractSection(body, 'NPCs');
        const exits = extractSection(body, 'EXITS');
        if (characters || npcs || exits) {
            setEnvironmentData({ characters: characters || [], npcs: npcs || [], exits: exits || [] });
        }
    }, []);

    const terminal = (
        <ArkyvTerminal
            disabled={false}
            autoFocusTrigger={mobileTab === 'terminal' ? 1 : 0}
            onRoomChange={handleRoomChange}
            onRoomMessage={handleRoomMessage}
            onExecuteCommand={(command) => { executeCommandRef.current = command; }}
            onConversationChange={setActiveConversation}
            className="h-full"
        />
    );

    const world = (
        <ArkyvAudioManager
            region={currentRegion}
            roomId={currentRoom}
            roomName={currentRoomName}
            environmentData={environmentData}
            activeConversation={activeConversation}
            onExecuteCommand={execute}
            className="h-full"
        />
    );

    const gear = <RpgHud actor={activeCharacter} environmentData={environmentData} onExecuteCommand={execute} className="h-full" />;

    const chat = (
        <RoomChatWindow
            disabled={false}
            regionName={currentRegion}
            activeCharacter={activeCharacter}
            latestMessage={latestRoomMessage}
            onExecuteCommand={execute}
            className="h-full"
        />
    );

    return (
        <>
            <Head>
                <title>Play | Arkyv Engine</title>
                <meta name="description" content="Explore and play a real-time text world with inventory, equipment, combat, characters, and regional chat." />
                <link rel="icon" href="/arkyv_logo.jpg" />
                <meta name="theme-color" content="#050711" />
            </Head>
            <div className="arkyv-app-shell text-white">
                <HamburgerIcon />

                <main className="mx-auto flex h-[100dvh] min-h-0 w-full max-w-[1720px] flex-col overflow-hidden p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3 lg:p-4">
                    <header className="flex min-h-16 items-center gap-3 px-2 pr-16 lg:hidden">
                        <img src="/arkyv_logo.jpg" alt="" className="h-10 w-10 rounded-xl border border-cyan-300/20" />
                        <div className="min-w-0">
                            <p className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-cyan-300/70">{currentRegion || 'Arkyv Engine'}</p>
                            <h1 className="truncate text-base font-semibold text-slate-100">{currentRoomName || activeCharacter?.name || 'World console'}</h1>
                        </div>
                    </header>

                    <div className="hidden min-h-0 flex-1 gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
                        <section className="min-h-0">{terminal}</section>
                        <aside className="grid min-h-0 grid-rows-[auto_minmax(170px,0.75fr)_minmax(230px,1.15fr)_minmax(180px,0.85fr)] gap-3">
                            <div className="flex items-center gap-3 px-2 py-1 pr-16">
                                <img src="/arkyv_logo.jpg" alt="" className="h-12 w-12 rounded-xl border border-cyan-300/20 shadow-lg shadow-cyan-950" />
                                <div className="min-w-0">
                                    <p className="text-[0.58rem] font-semibold uppercase tracking-[0.25em] text-cyan-300/70">Arkyv Engine</p>
                                    <h1 className="truncate text-base font-semibold text-slate-100">{currentRoomName || 'World console'}</h1>
                                </div>
                            </div>
                            {world}
                            {gear}
                            {chat}
                        </aside>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col lg:hidden">
                        <nav className="arkyv-panel mb-2 grid grid-cols-4 gap-1 p-1" aria-label="Gameplay panels">
                            {MOBILE_TABS.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setMobileTab(item.id)}
                                    className={`flex min-h-12 flex-col items-center justify-center rounded-lg px-1 transition ${mobileTab === item.id ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'}`}
                                    aria-current={mobileTab === item.id ? 'page' : undefined}
                                >
                                    <span className="text-sm leading-none" aria-hidden="true">{item.glyph}</span>
                                    <span className="mt-1 text-[0.58rem] font-semibold uppercase tracking-[0.14em]">{item.label}</span>
                                </button>
                            ))}
                        </nav>
                        <div className="min-h-0 flex-1">
                            <section className={`${mobileTab === 'terminal' ? 'h-full' : 'hidden'}`}>{terminal}</section>
                            <section className={`${mobileTab === 'world' ? 'h-full' : 'hidden'}`}>{world}</section>
                            <section className={`${mobileTab === 'gear' ? 'h-full' : 'hidden'}`}>{gear}</section>
                            <section className={`${mobileTab === 'chat' ? 'h-full' : 'hidden'}`}>{chat}</section>
                        </div>
                    </div>
                </main>
            </div>
        </>
    );
}
