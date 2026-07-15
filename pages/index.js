import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import HamburgerIcon from '@/components/HamburgerIcon';
import Footer from '@/components/Footer';

const ROOMS = [
  { name: 'Moonlit Grove', x: 12, y: 22, color: '#34d399' },
  { name: 'Data Vault', x: 40, y: 10, color: '#22d3ee' },
  { name: 'Bone Chapel', x: 72, y: 25, color: '#d946ef' },
  { name: 'Bridge Deck', x: 28, y: 72, color: '#38bdf8' },
  { name: 'Gear Workshop', x: 66, y: 68, color: '#f59e0b' },
  { name: 'Clock Tower', x: 88, y: 86, color: '#fb7185' },
];

const FEATURES = [
  { mark: '01', title: 'Map a living world', body: 'Create rooms, directional exits, regions, characters, NPCs, dialogue, and generated pixel-art scenes in one visual editor.' },
  { mark: '02', title: 'Build real game systems', body: 'Define items, containers, consumables, stats, equipment slots, weapons, armor, fuel, and combat without rebuilding the runtime.' },
  { mark: '03', title: 'Play together instantly', body: 'SpacetimeDB keeps players, chat, inventory, and world state synchronized while the terminal stays fast on desktop and mobile.' },
];

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <>
      <Head>
        <title>Arkyv Engine | Build living text worlds</title>
        <meta name="description" content="A responsive open-source MUD engine and world editor with real-time multiplayer, AI NPCs, inventories, equipment, and combat." />
      </Head>
      <div className="arkyv-app-shell relative overflow-hidden text-white">
        <HamburgerIcon />
        <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden="true">
          <svg width="100%" height="100%" className="absolute inset-0">
            {ROOMS.slice(0, -1).map((room, index) => (
              <line key={room.name} x1={`${room.x}%`} y1={`${room.y}%`} x2={`${ROOMS[index + 1].x}%`} y2={`${ROOMS[index + 1].y}%`} stroke={room.color} strokeWidth="1" strokeDasharray="5 8" />
            ))}
          </svg>
          {ROOMS.map((room) => <span key={room.name} className="absolute hidden h-2 w-2 rounded-full shadow-[0_0_18px_currentColor] sm:block" style={{ left: `${room.x}%`, top: `${room.y}%`, color: room.color, backgroundColor: room.color }} />)}
        </div>

        <main className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-20 pt-24 sm:px-6 sm:pt-28 lg:px-8 lg:pb-28">
          <section className="grid items-center gap-12 lg:min-h-[650px] lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:gap-16">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-cyan-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_#6ee7b7]" /> Open-source multiplayer world engine
              </div>
              <h1 className="max-w-4xl text-5xl font-black leading-[0.96] tracking-[-0.045em] text-slate-50 sm:text-6xl lg:text-7xl xl:text-8xl">
                Build worlds that <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-fuchsia-400 bg-clip-text text-transparent">remember.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
                Arkyv is a complete MUD engine maker: design the map, author AI characters, define RPG systems, then enter the same persistent world your players use.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => router.push(user ? '/play' : '/auth')} className="min-h-14 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-7 text-sm font-bold uppercase tracking-[0.14em] text-slate-950 shadow-xl shadow-cyan-950/70 transition hover:from-cyan-300 hover:to-blue-400">
                  {user ? 'Enter your world' : 'Create a saved world'}
                </button>
                <button type="button" onClick={() => router.push(user ? '/admin' : '/setup')} className="min-h-14 rounded-xl border border-slate-700 bg-slate-950/60 px-7 text-sm font-bold uppercase tracking-[0.14em] text-slate-200 transition hover:border-cyan-300/40 hover:bg-slate-900">
                  {user ? 'Open world editor' : 'Explore the setup guide'}
                </button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
                <span>✓ Local saved worlds</span><span>✓ Real-time state</span><span>✓ Mobile-first play</span><span>✓ Extensible RPG rules</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
              <div className="absolute -inset-10 rounded-full bg-cyan-500/10 blur-3xl" aria-hidden="true" />
              <div className="arkyv-panel relative overflow-hidden p-3 sm:p-4">
                <div className="mb-3 flex items-center gap-2 px-1 text-[0.58rem] uppercase tracking-[0.18em] text-slate-500"><span className="h-2 w-2 rounded-full bg-rose-400" /><span className="h-2 w-2 rounded-full bg-amber-300" /><span className="h-2 w-2 rounded-full bg-emerald-300" /><span className="ml-2">live world preview</span></div>
                <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-slate-800 bg-slate-950 sm:aspect-square">
                  <img src="/starter-images/town-square.png" alt="Pixel-art town square in an Arkyv world" className="h-full w-full object-cover [image-rendering:pixelated]" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-5 pt-20">
                    <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-cyan-300">Starting Zone</p>
                    <h2 className="mt-1 text-2xl font-bold text-white">Town Square</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Market voices carry across the cobbles. Archie is waiting beside a campfire.</p>
                    <div className="mt-4 flex flex-wrap gap-2"><span className="arkyv-chip arkyv-chip--accent">North</span><span className="arkyv-chip">Talk Archie</span><span className="arkyv-chip">Take sword</span></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-20 border-t border-slate-800/80 pt-10 lg:mt-28 lg:pt-14">
            <div className="mb-8 max-w-2xl"><p className="text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-fuchsia-300">One engine, full loop</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">Author, simulate, and play without changing tools.</h2></div>
            <div className="grid gap-3 md:grid-cols-3">
              {FEATURES.map((feature) => (
                <article key={feature.mark} className="arkyv-panel p-5 sm:p-6">
                  <span className="text-xs font-bold text-cyan-300/60">{feature.mark}</span>
                  <h3 className="mt-8 text-lg font-bold text-slate-100">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{feature.body}</p>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
      <Footer color="#050711" />
    </>
  );
}
