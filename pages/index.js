import React from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import HamburgerIcon from '@/components/HamburgerIcon';
import Footer from '@/components/Footer';

const CAPABILITIES = [
  { icon: 'world', label: 'World building', title: 'Visual world editor', body: 'Shape regions, rooms, directional exits, NPCs, descriptions, elevation, and atmosphere from one connected canvas.' },
  { icon: 'users', label: 'Multiplayer', title: 'A world that is live', body: 'Room chat, regional chat, movement, characters, and world state update for every connected player in real time.' },
  { icon: 'spark', label: 'Intelligence', title: 'AI characters with context', body: 'Give NPCs a personality and let players speak with them naturally through OpenAI or Grok-powered conversations.' },
  { icon: 'sword', label: 'Game systems', title: 'Your rules, not ours', body: 'Define hero stats, weapons, armor, slots, consumables, containers, fuel burners, stat effects, and combat behavior.' },
  { icon: 'shield', label: 'Authority', title: 'Server-owned outcomes', body: 'Rust reducers validate ownership and resolve combat, inventory, equipment, fuel, and stats on the authoritative backend.' },
  { icon: 'image', label: 'Generative media', title: 'Scenes with a face', body: 'Optionally generate pixel-art rooms, expressive NPC portraits, and readable inventory art with RetroDiffusion.' },
  { icon: 'characters', label: 'Identity', title: 'A cast of characters', body: 'Each saved world can hold multiple player characters, with persistent locations, gear, stats, and histories.' },
  { icon: 'archive', label: 'Persistence', title: 'Saved worlds, no passwords', body: 'Local signed identity tokens make creating, switching, and returning to a world quick—without an account service.' },
  { icon: 'terminal', label: 'Play', title: 'A modern command console', body: 'Explore, talk, fight, equip gear, manage inventory, and chat through a responsive terminal built for desktop and mobile.' },
  { icon: 'code', label: 'Ownership', title: 'Open source and self-hosted', body: 'Run the complete Next.js, SpacetimeDB, and Rust stack yourself. Extend the engine instead of renting the world.' },
];

const EDITOR_NODES = [
  { name: 'Whispering Grove', meta: 'Starting room', left: '7%', top: '16%', tone: 'emerald' },
  { name: 'Moonwell', meta: 'Lore encounter', left: '56%', top: '8%', tone: 'cyan' },
  { name: 'Old Watchtower', meta: 'Combat area', left: '61%', top: '60%', tone: 'pink' },
  { name: 'Hearthlight Inn', meta: 'Social hub', left: '9%', top: '69%', tone: 'amber' },
];

const ICONS = {
  world: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.2 2.2 3.3 4.9 3.3 8S14.2 17.8 12 20c-2.2-2.2-3.3-4.9-3.3-8S9.8 6.2 12 4Z" /></>,
  users: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="9" cy="7" r="3" /><path d="M16 4.2a3 3 0 0 1 0 5.6M22 20v-1.5a4 4 0 0 0-3-3.7" /></>,
  spark: <><path d="m12 3 1.3 4.2L17.5 9l-4.2 1.8L12 15l-1.3-4.2L6.5 9l4.2-1.8L12 3Z" /><path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14ZM5 13l.6 1.9 1.9.6-1.9.6L5 18l-.6-1.9-1.9-.6 1.9-.6L5 13Z" /></>,
  sword: <><path d="m14.5 5.5 4-2 2 2-2 4L9 19l-4 1 1-4 8.5-10.5Z" /><path d="m12 8 4 4M4 20l-1 1" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.6 3.1 7.8 7.5 9.5 4.4-1.7 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 4.5-4 3.5 3 2.5-2 5.5 4" /></>,
  characters: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-4 2.4-6 6-6s6 2 6 6M14 15c3.7-.4 6 1.3 7 4.5" /></>,
  archive: <><path d="M4 7h16v13H4zM3 3h18v4H3z" /><path d="M9 11h6" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 16h4" /></>,
  code: <><path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M14 4l-4 16" /></>,
};

function Icon({ name, className = 'h-5 w-5' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{ICONS[name]}</svg>;
}

function Arrow() {
  return <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const primaryAction = () => router.push(user ? '/play' : '/auth');
  const builderAction = () => router.push(user ? '/admin' : '/setup');

  return (
    <>
      <Head>
        <title>Arkyv Engine | Build worlds that remember</title>
        <meta name="description" content="Build and host living text worlds with a visual editor, real-time multiplayer, AI NPCs, custom RPG systems, generated pixel art, and an authoritative Rust backend." />
        <link rel="icon" href="/arkyv_logo.jpg" />
        <meta name="theme-color" content="#050711" />
      </Head>

      <div className="arkyv-app-shell landing-shell relative overflow-hidden text-white">
        <HamburgerIcon />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[58rem] overflow-hidden" aria-hidden="true"><div className="landing-aurora landing-aurora--cyan" /><div className="landing-aurora landing-aurora--pink" /><div className="landing-horizon" /></div>

        <header className="relative z-20 mx-auto flex h-20 w-full max-w-[1440px] items-center px-4 pr-20 sm:px-6 sm:pr-24 lg:px-10">
          <a href="#top" className="group flex items-center gap-3" aria-label="Arkyv Engine home">
            <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-cyan-300/25 bg-slate-950 shadow-lg shadow-cyan-950/50"><Image src="/arkyv_logo.jpg" alt="" width={40} height={40} className="h-full w-full object-cover transition duration-300 group-hover:scale-110" /></span>
            <span><span className="block text-sm font-black uppercase tracking-[0.2em] text-slate-100">Arkyv</span><span className="block text-[0.54rem] font-semibold uppercase tracking-[0.28em] text-cyan-300/65">World engine</span></span>
          </a>
          <nav className="ml-auto hidden items-center gap-7 pr-5 text-xs font-semibold text-slate-400 lg:flex" aria-label="Landing page navigation">
            <a href="#builder" className="transition hover:text-cyan-200">World builder</a><a href="#features" className="transition hover:text-cyan-200">Features</a><a href="#architecture" className="transition hover:text-cyan-200">How it works</a><a href="https://github.com/SeloSlav/arkyv-engine" target="_blank" rel="noopener noreferrer" className="transition hover:text-cyan-200">GitHub <span aria-hidden="true">↗</span></a>
          </nav>
        </header>

        <main id="top" className="relative z-10">
          <section className="mx-auto grid w-full max-w-[1440px] items-center gap-14 px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[minmax(0,0.92fr)_minmax(520px,1.08fr)] lg:gap-12 lg:px-10 lg:pb-24 lg:pt-12">
            <div className="relative z-10 max-w-3xl">
              <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-cyan-300/20 bg-cyan-300/[0.055] px-3.5 py-2 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-cyan-100 backdrop-blur-xl"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" /></span>Open-source multiplayer world engine</div>
              <h1 className="text-[clamp(3.2rem,7.1vw,6.9rem)] font-black leading-[0.88] tracking-[-0.064em] text-slate-50">Worlds with<span className="landing-gradient-text mt-1 block pb-2">memory.</span></h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">Design the map. Give every character a mind. Build the rules. Then step inside the same persistent world as your players.</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={primaryAction} className="landing-button landing-button--primary group"><span>{user ? 'Enter your world' : 'Create a saved world'}</span><Arrow /></button>
                <button type="button" onClick={builderAction} className="landing-button landing-button--secondary">{user ? 'Open world editor' : 'See how to run it'}</button>
              </div>
              <div className="mt-10 grid max-w-xl grid-cols-3 gap-5 border-t border-slate-800/80 pt-6">
                <div><p className="text-xl font-bold text-slate-100">Realtime</p><p className="mt-1 text-[0.62rem] uppercase tracking-[0.16em] text-slate-600">Every player</p></div>
                <div><p className="text-xl font-bold text-slate-100">No-code</p><p className="mt-1 text-[0.62rem] uppercase tracking-[0.16em] text-slate-600">World design</p></div>
                <div><p className="text-xl font-bold text-slate-100">Self-hosted</p><p className="mt-1 text-[0.62rem] uppercase tracking-[0.16em] text-slate-600">Your universe</p></div>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-3xl lg:mx-0">
              <div className="landing-orbit landing-orbit--one" aria-hidden="true" /><div className="landing-orbit landing-orbit--two" aria-hidden="true" />
              <div className="landing-game-window relative overflow-hidden rounded-2xl border border-slate-700/70 bg-[#070b16] p-2 shadow-2xl shadow-black/60 sm:p-3">
                <div className="flex h-10 items-center gap-2 px-2 text-[0.57rem] font-semibold uppercase tracking-[0.18em] text-slate-600"><span className="h-2 w-2 rounded-full bg-rose-400/80" /><span className="h-2 w-2 rounded-full bg-amber-300/80" /><span className="h-2 w-2 rounded-full bg-emerald-300/80" /><span className="ml-2">arkyv://whispering-grove</span><span className="ml-auto flex items-center gap-1.5 text-emerald-300/75"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> 4 online</span></div>
                <div className="grid min-h-[29rem] overflow-hidden rounded-xl border border-slate-800 bg-slate-950 md:grid-cols-[1.3fr_0.7fr]">
                  <div className="relative min-h-[22rem] overflow-hidden md:min-h-0">
                    <Image src="/starter-images/town-square.png" alt="Pixel-art town square inside an Arkyv world" fill sizes="(min-width: 768px) 32vw, 100vw" className="object-cover [image-rendering:pixelated]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050812] via-[#050812]/20 to-[#050812]/25" />
                    <div className="absolute left-4 top-4 rounded-lg border border-cyan-300/20 bg-slate-950/75 px-3 py-2 backdrop-blur-md"><p className="text-[0.5rem] font-bold uppercase tracking-[0.2em] text-cyan-300">Heartlight</p><p className="mt-0.5 text-xs font-semibold text-slate-200">Town Square</p></div>
                    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5"><p className="max-w-md text-sm leading-6 text-slate-200">Market voices drift across the cobbles. Archie waits beside the fountain, watching the road north.</p><div className="mt-3 flex flex-wrap gap-2"><span className="arkyv-chip arkyv-chip--accent">go north</span><span className="arkyv-chip">talk archie</span><span className="arkyv-chip">look</span></div></div>
                  </div>
                  <div className="flex min-h-[17rem] flex-col border-t border-slate-800 bg-[#070a13] p-4 font-terminal md:border-l md:border-t-0">
                    <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3"><span className="text-[0.56rem] uppercase tracking-[0.2em] text-slate-500">World console</span><span className="text-[0.52rem] text-emerald-300/70">SYNCHRONIZED</span></div>
                    <div className="space-y-3 text-[0.67rem] leading-5"><p><span className="text-cyan-300">&gt;</span> <span className="text-slate-300">talk archie</span></p><div className="rounded-lg border border-fuchsia-400/10 bg-fuchsia-400/[0.04] p-3"><div className="mb-2 flex items-center gap-2"><Image src="/starter-images/archie-portrait.png" alt="" width={28} height={28} className="h-7 w-7 rounded-md border border-cyan-300/20 object-cover [image-rendering:pixelated]" /><span className="text-[0.56rem] font-bold uppercase tracking-[0.15em] text-fuchsia-300">Archie · NPC</span></div><p className="text-slate-400">“The archive remembers every road. The question is—which one remembers you?”</p></div><p><span className="text-cyan-300">&gt;</span> <span className="text-slate-300">inventory</span></p><p className="text-slate-500"><span className="text-amber-300">◆</span> Lantern <span className="text-slate-700">·</span> Iron key <span className="text-slate-700">·</span> 3× Tonic</p></div>
                    <div className="mt-auto flex items-center gap-2 border-t border-slate-800 pt-3 text-[0.62rem]"><span className="text-cyan-300">❯</span><span className="text-slate-600">type a command...</span><span className="h-3 w-px animate-pulse bg-cyan-300" /></div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-5 -left-3 hidden items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-950/90 px-4 py-3 shadow-xl shadow-black/50 backdrop-blur-xl sm:flex"><span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-300/10 text-emerald-300"><Icon name="shield" className="h-4 w-4" /></span><span><span className="block text-[0.52rem] font-bold uppercase tracking-[0.17em] text-slate-500">Authoritative state</span><span className="mt-0.5 block text-xs font-semibold text-slate-200">Secured by Rust reducers</span></span></div>
            </div>
          </section>

          <section className="border-y border-slate-800/70 bg-slate-950/45 py-4" aria-label="Product capabilities"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 text-[0.58rem] font-bold uppercase tracking-[0.17em] text-slate-500 sm:gap-x-5">{['Visual world builder', 'AI NPCs', 'Realtime multiplayer', 'Custom RPG systems', 'Generated pixel art', 'Self-hosted'].map((item, index) => <React.Fragment key={item}><span>{item}</span>{index < 5 && <span className="text-cyan-400/50" aria-hidden="true">◆</span>}</React.Fragment>)}</div></section>

          <section id="builder" className="mx-auto w-full max-w-[1440px] px-4 py-24 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
            <div className="grid items-center gap-14 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
              <div className="max-w-xl">
                <p className="landing-kicker"><span>01</span> World building</p><h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.04em] text-slate-100 sm:text-5xl">From blank canvas to living world.</h2><p className="mt-6 text-base leading-7 text-slate-400 sm:text-lg">Build the place and the rules in the same studio. Arkyv turns world design into a connected, visual system—then makes it playable immediately.</p>
                <ul className="mt-8 space-y-4">{['Connect regions and rooms with directional exits', 'Place NPCs, encounters, objects, and generated scenes', 'Create stats, gear, consumables, containers, and fuel systems', 'Edit the shared world while the runtime stays authoritative'].map((item) => <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-300"><span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-cyan-300/25 bg-cyan-300/[0.06] text-[0.6rem] text-cyan-300">✓</span>{item}</li>)}</ul>
                <button type="button" onClick={builderAction} className="mt-9 inline-flex items-center gap-2 text-sm font-bold text-cyan-300 transition hover:text-cyan-200">{user ? 'Launch the world editor' : 'Read the setup guide'} <Arrow /></button>
              </div>
              <div className="landing-editor relative overflow-hidden rounded-2xl border border-slate-700/70 bg-[#080b15] shadow-2xl shadow-black/50">
                <div className="flex min-h-14 items-center border-b border-slate-800 px-4 sm:px-5"><div><p className="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-cyan-300/65">World editor</p><p className="mt-0.5 text-xs font-semibold text-slate-300">The Whispering Wilds</p></div><div className="ml-auto flex items-center gap-2"><span className="arkyv-chip hidden sm:inline-flex">Preview</span><span className="arkyv-chip arkyv-chip--accent">Published</span></div></div>
                <div className="grid min-h-[31rem] md:grid-cols-[1fr_13rem]">
                  <div className="landing-editor-grid relative min-h-[25rem] overflow-hidden border-b border-slate-800 md:border-b-0 md:border-r">
                    <svg className="absolute inset-0 h-full w-full" aria-hidden="true"><path d="M145 125 C230 75 300 75 385 105" fill="none" stroke="rgba(34,211,238,.28)" strokeWidth="1.5" strokeDasharray="5 6" /><path d="M130 160 C150 260 165 315 160 370" fill="none" stroke="rgba(245,158,11,.25)" strokeWidth="1.5" strokeDasharray="5 6" /><path d="M390 135 C390 245 390 285 410 350" fill="none" stroke="rgba(217,70,239,.25)" strokeWidth="1.5" strokeDasharray="5 6" /><path d="M200 390 C275 390 320 385 390 370" fill="none" stroke="rgba(52,211,153,.24)" strokeWidth="1.5" strokeDasharray="5 6" /></svg>
                    {EDITOR_NODES.map((node) => <div key={node.name} className={`landing-node landing-node--${node.tone}`} style={{ left: node.left, top: node.top }}><span className="landing-node__dot" /><span><span className="block text-[0.68rem] font-bold text-slate-200">{node.name}</span><span className="mt-0.5 block text-[0.5rem] uppercase tracking-[0.12em] text-slate-600">{node.meta}</span></span></div>)}
                    <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[0.54rem] uppercase tracking-[0.15em] text-slate-500 backdrop-blur"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> 4 rooms · 8 exits · 6 actors</div>
                  </div>
                  <aside className="bg-slate-950/35 p-4"><p className="text-[0.55rem] font-bold uppercase tracking-[0.18em] text-slate-500">Selected room</p><div className="mt-4 aspect-[4/3] overflow-hidden rounded-lg border border-slate-800"><Image src="/starter-images/character-creation-chamber.png" alt="Generated pixel-art room scene" width={384} height={256} className="h-full w-full object-cover [image-rendering:pixelated]" /></div><p className="mt-4 text-xs font-bold text-slate-200">Moonwell</p><p className="mt-2 text-[0.66rem] leading-5 text-slate-500">A mirror of starlight rests beneath the ancient canopy.</p><div className="mt-4 space-y-2">{['Description', 'Actors & objects', 'Exits', 'Atmosphere'].map((item, index) => <div key={item} className={`flex items-center rounded-md border px-2.5 py-2 text-[0.58rem] ${index === 1 ? 'border-cyan-300/20 bg-cyan-300/[0.05] text-cyan-200' : 'border-slate-800 text-slate-500'}`}><span>{item}</span><span className="ml-auto">›</span></div>)}</div></aside>
                </div>
              </div>
            </div>
          </section>

          <section className="border-y border-slate-800/70 bg-slate-950/40"><div className="mx-auto grid w-full max-w-[1440px] items-center gap-12 px-4 py-24 sm:px-6 sm:py-28 lg:grid-cols-2 lg:gap-20 lg:px-10 lg:py-32">
            <div className="relative mx-auto w-full max-w-xl"><div className="absolute -inset-12 rounded-full bg-fuchsia-500/[0.06] blur-3xl" aria-hidden="true" /><div className="relative grid grid-cols-[0.78fr_1.22fr] gap-3"><div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900 p-2 shadow-2xl shadow-black/50"><Image src="/starter-images/archie-portrait.png" alt="Pixel-art portrait of Archie, an AI-powered NPC" width={256} height={256} className="aspect-square h-auto w-full rounded-xl object-cover [image-rendering:pixelated]" /><div className="p-3"><p className="text-sm font-bold text-slate-100">Archie</p><p className="mt-1 text-[0.55rem] font-bold uppercase tracking-[0.15em] text-fuchsia-300">Archive keeper</p><div className="mt-3 flex gap-1.5"><span className="arkyv-chip">Curious</span><span className="arkyv-chip hidden sm:inline-flex">Cryptic</span></div></div></div><div className="flex flex-col justify-end gap-3 py-4"><div className="mr-6 rounded-2xl rounded-bl-sm border border-slate-700/70 bg-slate-900/90 p-3 text-[0.68rem] leading-5 text-slate-300 sm:p-4 sm:text-xs">The northern road is gone. Did the storm take it?</div><div className="ml-3 rounded-2xl rounded-br-sm border border-fuchsia-400/20 bg-fuchsia-400/[0.07] p-3 text-[0.68rem] leading-5 text-slate-200 sm:p-4 sm:text-xs">Roads do not disappear. They simply decide who they will carry. Bring me the iron key, and I’ll remind it of you.</div><div className="mr-10 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-[0.55rem] uppercase tracking-[0.14em] text-slate-600"><span className="flex gap-1"><span className="h-1 w-1 animate-pulse rounded-full bg-fuchsia-300" /><span className="h-1 w-1 animate-pulse rounded-full bg-fuchsia-300 [animation-delay:150ms]" /><span className="h-1 w-1 animate-pulse rounded-full bg-fuchsia-300 [animation-delay:300ms]" /></span> NPC reasoning from personality</div></div></div></div>
            <div className="max-w-xl lg:ml-auto"><p className="landing-kicker landing-kicker--pink"><span>02</span> Living characters</p><h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.04em] text-slate-100 sm:text-5xl">NPCs that are more than dialogue trees.</h2><p className="mt-6 text-base leading-7 text-slate-400 sm:text-lg">Write a personality, place the character in your world, and let every encounter unfold naturally. Recent conversation context keeps the exchange coherent without handing over your game state.</p><div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="landing-mini-card"><Icon name="spark" className="h-5 w-5 text-fuchsia-300" /><div><p>Natural conversation</p><span>OpenAI or Grok</span></div></div><div className="landing-mini-card"><Icon name="image" className="h-5 w-5 text-cyan-300" /><div><p>Generated portraits</p><span>Optional pixel art</span></div></div></div></div>
          </div></section>

          <section id="features" className="mx-auto w-full max-w-[1440px] px-4 py-24 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
            <div className="mx-auto max-w-3xl text-center"><p className="landing-kicker justify-center"><span>03</span> Complete engine</p><h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.04em] text-slate-100 sm:text-5xl">Everything a world needs to keep turning.</h2><p className="mt-5 text-base leading-7 text-slate-500 sm:text-lg">From the first room to a shared, persistent campaign—every system belongs to the same runtime.</p></div>
            <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{CAPABILITIES.map((feature, index) => <article key={feature.title} className={`landing-feature-card group ${index === 0 || index === 9 ? 'sm:col-span-2 lg:col-span-1' : ''}`}><div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700/70 bg-slate-950 text-cyan-300 transition group-hover:border-cyan-300/30 group-hover:bg-cyan-300/[0.06]"><Icon name={feature.icon} /></span><span className="text-[0.52rem] font-bold tracking-[0.16em] text-slate-700">{String(index + 1).padStart(2, '0')}</span></div><p className="mt-7 text-[0.54rem] font-bold uppercase tracking-[0.18em] text-cyan-300/60">{feature.label}</p><h3 className="mt-2 text-base font-bold leading-6 text-slate-100">{feature.title}</h3><p className="mt-3 text-xs leading-5 text-slate-500">{feature.body}</p></article>)}</div>
          </section>

          <section id="architecture" className="border-y border-slate-800/70 bg-[#060912]"><div className="mx-auto w-full max-w-[1440px] px-4 py-24 sm:px-6 sm:py-28 lg:px-10 lg:py-32">
            <div className="grid items-end gap-8 lg:grid-cols-[0.85fr_1.15fr]"><div><p className="landing-kicker"><span>04</span> One continuous loop</p><h2 className="mt-5 max-w-xl text-4xl font-black leading-[1.02] tracking-[-0.04em] text-slate-100 sm:text-5xl">Author. Synchronize. Play.</h2></div><p className="max-w-2xl text-base leading-7 text-slate-500 lg:ml-auto">The editor and the game are two views of the same world. No exports, rebuilds, or duplicated state between making an adventure and entering it.</p></div>
            <div className="relative mt-14 grid gap-4 lg:grid-cols-3"><div className="landing-flow-line hidden lg:block" aria-hidden="true" />{[
              { number: '01', icon: 'world', title: 'Author in the studio', body: 'Design locations, cast NPCs, place objects, and define the mechanics that make this world unique.', meta: 'Next.js · React · Visual editor' },
              { number: '02', icon: 'shield', title: 'Synchronize the truth', body: 'SpacetimeDB replicates live state while Rust reducers validate every mutation and resolve every outcome.', meta: 'SpacetimeDB · Rust · Realtime' },
              { number: '03', icon: 'terminal', title: 'Enter from anywhere', body: 'Players explore through a responsive terminal with world visuals, audio, chat, inventory, gear, and stats.', meta: 'Desktop · Mobile · Multiplayer' },
            ].map((step) => <article key={step.number} className="landing-flow-card relative"><div className="relative z-10 flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300"><Icon name={step.icon} /></span><span className="text-3xl font-black text-slate-800">{step.number}</span></div><h3 className="relative z-10 mt-8 text-xl font-bold text-slate-100">{step.title}</h3><p className="relative z-10 mt-3 text-sm leading-6 text-slate-500">{step.body}</p><p className="relative z-10 mt-8 border-t border-slate-800 pt-4 text-[0.56rem] font-bold uppercase tracking-[0.14em] text-slate-600">{step.meta}</p></article>)}</div>
          </div></section>

          <section className="mx-auto w-full max-w-[1440px] px-4 py-20 sm:px-6 sm:py-24 lg:px-10 lg:py-28"><div className="landing-cta relative overflow-hidden rounded-[1.75rem] border border-cyan-300/20 px-5 py-16 text-center shadow-2xl shadow-black/50 sm:px-10 sm:py-20"><div className="pointer-events-none absolute inset-0" aria-hidden="true"><div className="landing-cta-glow" /></div><div className="relative z-10 mx-auto max-w-3xl"><p className="text-[0.6rem] font-bold uppercase tracking-[0.24em] text-cyan-300">The archive is open</p><h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.045em] text-slate-50 sm:text-6xl">Your world is waiting to be remembered.</h2><p className="mx-auto mt-6 max-w-xl text-base leading-7 text-slate-400">Self-host the engine, shape the rules, invite your players, and keep everything you create.</p><div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={primaryAction} className="landing-button landing-button--primary group"><span>{user ? 'Return to your world' : 'Start a saved world'}</span><Arrow /></button><a href="https://github.com/SeloSlav/arkyv-engine" target="_blank" rel="noopener noreferrer" className="landing-button landing-button--secondary">View source on GitHub <span aria-hidden="true">↗</span></a></div></div></div></section>
        </main>
      </div>
      <Footer color="#04060d" />
    </>
  );
}
