import React from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import HamburgerIcon from '@/components/HamburgerIcon';
import Footer from '@/components/Footer';

// Animated room network data with positions and connections
const BACKGROUND_ROOMS = [
  { id: 0, name: 'Neon Alleyway', region: 'Cyber District', color: '#FF1493', x: 10, y: 15 },
  { id: 1, name: 'Data Vault', region: 'Cyber District', color: '#FF1493', x: 25, y: 25 },
  { id: 2, name: 'Chrome Bazaar', region: 'Cyber District', color: '#FF1493', x: 15, y: 45 },
  
  { id: 3, name: 'Moonlit Grove', region: 'Elven Woods', color: '#34d399', x: 45, y: 10 },
  { id: 4, name: 'Ancient Library', region: 'Elven Woods', color: '#34d399', x: 60, y: 20 },
  { id: 5, name: 'Crystal Cavern', region: 'Elven Woods', color: '#34d399', x: 50, y: 40 },
  { id: 6, name: 'Enchanted Pool', region: 'Elven Woods', color: '#34d399', x: 70, y: 50 },
  
  { id: 7, name: 'Bridge Deck', region: 'Star Vessel', color: '#38bdf8', x: 30, y: 65 },
  { id: 8, name: 'Engine Room', region: 'Star Vessel', color: '#38bdf8', x: 45, y: 70 },
  { id: 9, name: 'Cryo Chamber', region: 'Star Vessel', color: '#38bdf8', x: 25, y: 85 },
  
  { id: 10, name: 'Crypt Entrance', region: 'Shadowlands', color: '#a855f7', x: 75, y: 15 },
  { id: 11, name: 'Bone Chapel', region: 'Shadowlands', color: '#a855f7', x: 85, y: 30 },
  { id: 12, name: 'Necromancer Tower', region: 'Shadowlands', color: '#a855f7', x: 90, y: 55 },
  
  { id: 13, name: 'Gear Workshop', region: 'Brass City', color: '#f59e0b', x: 60, y: 75 },
  { id: 14, name: 'Clock Tower', region: 'Brass City', color: '#f59e0b', x: 75, y: 85 },
];

// Connections between rooms (creates the network)
const ROOM_CONNECTIONS = [
  [0, 1], [1, 2], [0, 3], [3, 4], [4, 5], [5, 6],
  [2, 7], [7, 8], [8, 9], [4, 10], [10, 11], [11, 12],
  [8, 13], [13, 14], [6, 13], [5, 8], [1, 4]
];

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black flex items-center justify-center p-4 relative overflow-hidden">
        {/* Black overlay to reduce visibility */}
        <div className="absolute inset-0 bg-black/50 z-0"></div>
        
        {/* Animated Room Network Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: 0.4 }}>
          <svg className="room-network-svg" width="100%" height="100%" style={{ position: 'absolute' }}>
            {ROOM_CONNECTIONS.map(([from, to], idx) => {
              const fromRoom = BACKGROUND_ROOMS.find(r => r.id === from);
              const toRoom = BACKGROUND_ROOMS.find(r => r.id === to);
              if (!fromRoom || !toRoom) return null;
              
              return (
                <line
                  key={idx}
                  className="connection-line"
                  x1={`${fromRoom.x}%`}
                  y1={`${fromRoom.y}%`}
                  x2={`${toRoom.x}%`}
                  y2={`${toRoom.y}%`}
                  stroke={fromRoom.color}
                  strokeWidth="2"
                  strokeDasharray="6 3"
                  style={{
                    animationDelay: `${idx * 0.5}s`
                  }}
                />
              );
            })}
          </svg>
          
          {BACKGROUND_ROOMS.map((room) => (
            <div
              key={room.id}
              className="room-node-floating"
              style={{
                left: `${room.x}%`,
                top: `${room.y}%`,
                borderColor: room.color,
                animationDelay: `${room.id * 0.3}s`,
              }}
            >
              <div className="room-name" style={{ color: room.color }}>
                {room.name}
              </div>
              <div className="room-region">{room.region}</div>
            </div>
          ))}
        </div>
        
        {/* Background Grid Effect */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20"></div>
        
        {/* Cyan Glow Effect */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        
        <div className="w-full max-w-4xl text-center relative z-10">
          {/* Logo */}
          <div className="mb-8">
            <img
              src="/arkyv_logo.jpg"
              alt="Arkyv Logo"
              className="w-48 h-48 mx-auto mb-6 drop-shadow-2xl rounded-xl border-4 border-cyan-500/30 shadow-lg shadow-cyan-500/50"
            />
          </div>
          
          {/* Title */}
          <h1 className="text-5xl sm:text-7xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-lg uppercase tracking-[0.15em]">
            ARKYV ENGINE
          </h1>
          
          {/* Subtitle */}
          <p className="text-cyan-400 font-terminal text-lg sm:text-2xl mb-2 uppercase tracking-[0.25em]">
            Open-Source Multi-User Dungeon
          </p>
          
          {/* Description */}
          <p className="text-slate-400 font-terminal text-base mb-12 max-w-2xl mx-auto leading-relaxed">
            A text-based virtual world where players explore interconnected regions, 
            interact with AI-powered NPCs, and shape emergent narratives through collaborative gameplay.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <a
              href="https://www.babushkabook.com/arkyv"
              target="_blank"
              rel="noopener noreferrer"
              className="px-10 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-400 transition-all text-lg shadow-lg shadow-cyan-500/50 hover:shadow-cyan-400/60 hover:scale-105 transform uppercase tracking-[0.15em]"
            >
              Try Demo
            </a>
            
            <button
              onClick={() => router.push('/setup')}
              className="px-8 py-3 bg-slate-800/80 backdrop-blur-sm border-2 border-cyan-500/50 text-cyan-400 font-semibold rounded-lg hover:bg-slate-700 hover:border-cyan-400 transition-all hover:shadow-lg hover:shadow-cyan-500/30 uppercase tracking-[0.1em]"
            >
              Setup Guide & Documentation
            </button>
          </div>
          
          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center gap-3 text-slate-400 text-xs">
            <span className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full backdrop-blur-sm uppercase tracking-[0.15em]">
              Next.js 15
            </span>
            <span className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full backdrop-blur-sm uppercase tracking-[0.15em]">
              AI-Powered NPCs
            </span>
            <span className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full backdrop-blur-sm uppercase tracking-[0.15em]">
              Real-time Multiplayer
            </span>
            <span className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full backdrop-blur-sm uppercase tracking-[0.15em]">
              Open Source
            </span>
          </div>
        </div>
        
        <HamburgerIcon />
      </div>
      
      <Footer color="#000000" />

      <style jsx>{`
        .room-network-svg {
          filter: blur(1px);
        }

        .connection-line {
          animation: pulse-line 4s ease-in-out infinite;
          opacity: 1;
        }

        @keyframes pulse-line {
          0%, 100% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
        }

        .room-node-floating {
          position: absolute;
          padding: 10px 16px;
          border: 1px solid;
          border-radius: 6px;
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(2px);
          min-width: 160px;
          text-align: center;
          transform: translate(-50%, -50%);
          animation: float-node 8s ease-in-out infinite;
        }

        @keyframes float-node {
          0%, 100% {
            transform: translate(-50%, -50%) translateY(0px);
          }
          50% {
            transform: translate(-50%, -50%) translateY(-15px);
          }
        }

        .room-name {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 2px;
          opacity: 0.7;
        }

        .room-region {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.5rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(203, 213, 225, 0.4);
        }
      `}</style>
    </>
  );
}

