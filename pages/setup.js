import { useState } from 'react';
import Link from 'next/link';
import HamburgerIcon from '@/components/HamburgerIcon';

export default function SetupDocs() {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', title: 'Overview' },
    { id: 'prerequisites', title: 'Prerequisites' },
    { id: 'clone', title: '1. Clone & Install' },
    { id: 'supabase', title: '2. Supabase Setup' },
    { id: 'ai-provider', title: '3. AI Provider' },
    { id: 'env-vars', title: '4. Environment Variables' },
    { id: 'edge-functions', title: '5. Edge Functions' },
    { id: 'admin-access', title: '6. Admin Access' },
    { id: 'run-locally', title: '7. Run Locally' },
    { id: 'world-setup', title: '8. World Setup' },
    { id: 'music-setup', title: '9. Add Music' },
    { id: 'deployment', title: 'Deployment' },
    { id: 'troubleshooting', title: 'Troubleshooting' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-cyan-500/20 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 backdrop-blur-sm sticky top-0 z-40 shadow-lg shadow-cyan-500/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-2">
                <span className="text-xl">←</span>
                <span>Home</span>
              </Link>
              <div className="h-8 w-px bg-cyan-500/30"></div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent uppercase tracking-[0.2em]">
                  Setup Guide
                </h1>
                <p className="text-slate-400 text-xs sm:text-sm mt-1 uppercase tracking-[0.15em]">Complete installation walkthrough</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <HamburgerIcon />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-1">
            <nav className="sticky top-24 space-y-1">
               {sections.map((section) => (
                 <button
                   key={section.id}
                   onClick={() => setActiveSection(section.id)}
                   className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                     activeSection === section.id
                       ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-md shadow-cyan-500/20'
                       : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800/50 border border-transparent'
                   }`}
                 >
                   {section.title}
                 </button>
               ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-3">
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-8">
              
              {/* Overview */}
              {activeSection === 'overview' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">Welcome to Arkyv Engine</h2>
                  <p className="text-slate-300 text-lg">
                    An open-source text-based multi-user dungeon (MUD) built with Next.js, Supabase, and AI. 
                    Create immersive worlds where players explore interconnected regions, interact with intelligent NPCs, 
                    and shape emergent narratives through collaborative gameplay.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                      <h3 className="text-cyan-400 font-semibold mb-2">🎮 Real-time Multiplayer</h3>
                      <p className="text-slate-400 text-sm">Explore worlds with other players in real-time</p>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                      <h3 className="text-cyan-400 font-semibold mb-2">🤖 AI-Powered NPCs</h3>
                      <p className="text-slate-400 text-sm">Dynamic conversations with intelligent characters</p>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                      <h3 className="text-cyan-400 font-semibold mb-2">🗺️ Visual World Builder</h3>
                      <p className="text-slate-400 text-sm">Admin panel for creating and managing rooms</p>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                      <h3 className="text-cyan-400 font-semibold mb-2">💬 Region Chat</h3>
                      <p className="text-slate-400 text-sm">Communicate with players in the same area</p>
                    </div>
                  </div>

                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 mt-8">
                    <p className="text-cyan-300">
                      <strong>⏱️ Setup Time:</strong> ~30 minutes
                      <br />
                      <strong>💰 Cost:</strong> Free tier available on all services
                      <br />
                      <strong>💻 Skill Level:</strong> Intermediate (basic command line & API key management)
                    </p>
                  </div>
                </div>
              )}

              {/* Prerequisites */}
              {activeSection === 'prerequisites' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">Prerequisites</h2>
                  <p className="text-slate-300">Before you begin, you'll need accounts with the following services:</p>
                  
                  <div className="space-y-4">
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                      <h3 className="text-cyan-400 font-semibold mb-2">Required</h3>
                      <ul className="space-y-2 text-slate-300">
                        <li>✅ <a href="https://nodejs.org/" target="_blank" className="text-cyan-400 hover:underline">Node.js</a> (v18 or higher)</li>
                        <li>✅ <a href="https://supabase.com/" target="_blank" className="text-cyan-400 hover:underline">Supabase</a> account (free tier available)</li>
                        <li>✅ <strong>ONE</strong> AI provider:
                          <ul className="ml-6 mt-2 space-y-1">
                            <li>• <a href="https://openai.com/api/" target="_blank" className="text-cyan-400 hover:underline">OpenAI API</a> (recommended)</li>
                            <li>• <a href="https://x.ai/api" target="_blank" className="text-cyan-400 hover:underline">Grok API</a> (alternative)</li>
                          </ul>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                      <h3 className="text-cyan-400 font-semibold mb-2">Optional</h3>
                      <ul className="space-y-2 text-slate-300">
                        <li>📸 <a href="https://retrodiffusion.ai" target="_blank" className="text-cyan-400 hover:underline">RetroDiffusion</a> (for AI image generation)</li>
                        <li>🚀 <a href="https://vercel.com/" target="_blank" className="text-cyan-400 hover:underline">Vercel</a> account (for deployment)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Clone & Install */}
              {activeSection === 'clone' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">1. Clone & Install</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-2">Clone the Repository</h3>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                        <code className="text-cyan-400">git clone https://github.com/SeloSlav/arkyv-engine.git{'\n'}cd arkyv-engine</code>
                      </pre>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-2">Install Dependencies</h3>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                        <code className="text-cyan-400">npm install</code>
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Supabase Setup */}
              {activeSection === 'supabase' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">2. Supabase Setup</h2>
                  
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">2.1 Create a Supabase Project</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Go to <a href="https://supabase.com" target="_blank" className="text-cyan-400 hover:underline">supabase.com</a> and sign up/login</li>
                        <li>Click <strong>"New Project"</strong></li>
                        <li>Fill in project details:
                          <ul className="ml-6 mt-2 space-y-1">
                            <li>• <strong>Name:</strong> arkyv-engine (or your preferred name)</li>
                            <li>• <strong>Database Password:</strong> Choose a strong password (save this!)</li>
                            <li>• <strong>Region:</strong> Select closest to you</li>
                          </ul>
                        </li>
                        <li>Click <strong>"Create new project"</strong> and wait (~2 minutes)</li>
                      </ol>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                      <p className="text-amber-300">
                        <strong>⚠️ Important:</strong> Keep your Supabase project URL handy - you'll need it for environment variables!
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">2.2 Run Database Migration</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>In your Supabase project, go to <strong>SQL Editor</strong> (left sidebar)</li>
                        <li>Click <strong>"New query"</strong></li>
                        <li>Open <code className="text-cyan-400">supabase/sql/migrate.sql</code> from your cloned repository</li>
                        <li>Copy the entire contents and paste into the SQL Editor</li>
                        <li>Click <strong>"Run"</strong> to execute the migration</li>
                        <li>You should see: <span className="text-green-400">"Success. No rows returned"</span></li>
                      </ol>
                      <p className="text-slate-400 text-sm mt-2">
                        This creates all necessary tables, RLS policies, and default regions/rooms.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">2.3 Verify Realtime is Enabled</h3>
                      <p className="text-slate-300 mb-3">The migration automatically enables realtime for the 5 critical tables. You can verify this in Supabase:</p>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Go to <strong>Table Editor</strong> (left sidebar)</li>
                        <li>Check that these tables have realtime enabled (paper plane icon ✈️ should be highlighted):
                          <ul className="ml-6 mt-2 space-y-1 text-sm">
                            <li>• <code className="text-cyan-400">room_messages</code> - For terminal messages</li>
                            <li>• <code className="text-cyan-400">region_chats</code> - For region chat</li>
                            <li>• <code className="text-cyan-400">characters</code> - For player movements</li>
                            <li>• <code className="text-cyan-400">npcs</code> - For NPC interactions</li>
                            <li>• <code className="text-cyan-400">profiles</code> - For profile mode</li>
                          </ul>
                        </li>
                      </ol>
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mt-3">
                        <p className="text-green-300 text-sm">
                          <strong>✅ Auto-Configured:</strong> Realtime is now automatically enabled by the migration! If for some reason it didn't work, you can manually enable it by clicking the "Enable Realtime" button on each table.
                        </p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">2.4 Get Your API Keys</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Go to <strong>Project Settings</strong> → <strong>API</strong></li>
                        <li>Copy these values (you'll need them for <code className="text-cyan-400">.env.local</code>):
                          <ul className="ml-6 mt-2 space-y-1">
                            <li>• <strong>Project URL</strong> (e.g., https://xxxxx.supabase.co)</li>
                            <li>• <strong>anon public</strong> key</li>
                            <li>• <strong>service_role</strong> key (keep this secret!)</li>
                          </ul>
                        </li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Provider */}
              {activeSection === 'ai-provider' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">3. Choose Your AI Provider</h2>
                  <p className="text-slate-300">You only need <strong>ONE</strong> of these:</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                      <h3 className="text-xl font-semibold text-cyan-400 mb-3">Option A: OpenAI</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Go to <a href="https://openai.com/api/" target="_blank" className="text-cyan-400 hover:underline">openai.com/api</a></li>
                        <li>Sign up or login</li>
                        <li>Navigate to <strong>API Keys</strong></li>
                        <li>Click <strong>"Create new secret key"</strong></li>
                        <li>Copy the key (starts with <code className="text-cyan-400">sk-...</code>)</li>
                      </ol>
                    </div>

                    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                      <h3 className="text-xl font-semibold text-cyan-400 mb-3">Option B: Grok <span className="ml-1" title="NSFW Friendly">🔥😈</span> (Supports NSFW)</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Go to <a href="https://x.ai/api" target="_blank" className="text-cyan-400 hover:underline">x.ai/api</a></li>
                        <li>Sign up or login</li>
                        <li>Get your API key from the dashboard</li>
                        <li>Copy the key</li>
                      </ol>
                    </div>
                  </div>

                  <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                    <h3 className="text-xl font-semibold text-cyan-400 mb-3">Optional: RetroDiffusion (AI Images)</h3>
                    <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                      <li>Go to <a href="https://retrodiffusion.ai" target="_blank" className="text-cyan-400 hover:underline">retrodiffusion.ai</a></li>
                      <li>Sign up for an account</li>
                      <li>Get your API key from the dashboard</li>
                      <li>Copy the key for later use</li>
                    </ol>
                    <p className="text-slate-400 text-sm mt-2">
                      This enables AI-generated pixel art for rooms and NPCs in the admin panel.
                    </p>
                  </div>
                </div>
              )}

              {/* Environment Variables */}
              {activeSection === 'env-vars' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">4. Configure Environment Variables</h2>
                  
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">4.1 Create .env.local</h3>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                        <code className="text-cyan-400">cp .env.example .env.local</code>
                      </pre>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">4.2 Fill in Your Keys</h3>
                      <p className="text-slate-300 mb-3">Open <code className="text-cyan-400">.env.local</code> and add your keys:</p>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto text-sm">
                        <code className="text-slate-300">{`# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# AI Provider Configuration
# Set to "openai" or "grok" depending on which you're using
AI_PROVIDER=openai

# OpenAI API Key (if using OpenAI)
OPENAI_API_KEY=sk-your_key_here

# Grok API Key (if using Grok)
GROK_API_KEY=your_grok_key_here

# RetroDiffusion (optional - for AI image generation)
RETRO_DIFFUSION_API_KEY=your_retro_key_here`}</code>
                      </pre>
                    </div>

                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                      <p className="text-cyan-300">
                        <strong>💡 Tip:</strong> You only need to fill in the API key for the AI provider you're using! Leave the other one blank.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Edge Functions */}
              {activeSection === 'edge-functions' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">5. Deploy Edge Functions</h2>
                  <p className="text-slate-300">
                    The command processor runs as a Supabase Edge Function to handle game commands in real-time.
                  </p>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">5.1 Install Supabase CLI</h3>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                        <code className="text-cyan-400">npm install -g supabase</code>
                      </pre>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">5.2 Login to Supabase</h3>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                        <code className="text-cyan-400">supabase login</code>
                      </pre>
                      <p className="text-slate-400 text-sm mt-2">This will open your browser for authentication.</p>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">5.3 Link Your Project</h3>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                        <code className="text-cyan-400">supabase link --project-ref your-project-ref</code>
                      </pre>
                      <p className="text-slate-400 text-sm mt-2">
                        Find your project ref in your Supabase project URL: <br />
                        <code className="text-cyan-400">https://supabase.com/dashboard/project/YOUR-PROJECT-REF</code>
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">5.4 Set Edge Function Secrets</h3>
                      <p className="text-slate-300 mb-3">Edge Functions need their own environment variables, separate from your local .env.local file.</p>
                      
                      <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mb-4">
                        <p className="text-cyan-300 text-sm">
                          <strong>📍 Find Your Supabase URL:</strong> Click the <strong>"Connect"</strong> button in the top header of your Supabase Dashboard to copy your project URL.
                        </p>
                      </div>

                      <h4 className="text-cyan-400 font-semibold mb-3">Method 1: Using Supabase Dashboard (Recommended)</h4>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside mb-4">
                        <li>Go to <strong>Project Settings</strong> → <strong>Edge Functions</strong> (in left sidebar)</li>
                        <li>Scroll down to <strong>"Secrets"</strong> section</li>
                        <li>Click <strong>"Add new secret"</strong> for each variable below</li>
                      </ol>

                      <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-4">
                        <p className="text-slate-300 font-semibold mb-2">All 10 Required Secrets:</p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-cyan-400 border-b border-slate-700">
                              <th className="text-left py-2">Secret Name</th>
                              <th className="text-left py-2">Value</th>
                              <th className="text-left py-2">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-300">
                            <tr className="border-b border-slate-800">
                              <td className="py-2"><code className="text-cyan-400">SUPABASE_URL</code></td>
                              <td className="py-2 text-slate-400 text-xs">Auto-provided ✓</td>
                              <td className="py-2 text-slate-400 text-xs">Your project URL</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                              <td className="py-2"><code className="text-cyan-400">EDGE_SUPABASE_URL</code></td>
                              <td className="py-2 text-xs">https://xxxxx.supabase.co</td>
                              <td className="py-2 text-red-400 text-xs font-semibold">MUST ADD!</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                              <td className="py-2"><code className="text-cyan-400">SUPABASE_ANON_KEY</code></td>
                              <td className="py-2 text-slate-400 text-xs">Auto-provided ✓</td>
                              <td className="py-2 text-slate-400 text-xs">Public anon key</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                              <td className="py-2"><code className="text-cyan-400">SUPABASE_SERVICE_ROLE_KEY</code></td>
                              <td className="py-2 text-slate-400 text-xs">Auto-provided ✓</td>
                              <td className="py-2 text-slate-400 text-xs">Service role key</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                              <td className="py-2"><code className="text-cyan-400">EDGE_SERVICE_ROLE_KEY</code></td>
                              <td className="py-2 text-xs">your_service_role_key</td>
                              <td className="py-2 text-red-400 text-xs font-semibold">MUST ADD!</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                              <td className="py-2"><code className="text-cyan-400">SUPABASE_DB_URL</code></td>
                              <td className="py-2 text-slate-400 text-xs">Auto-provided ✓</td>
                              <td className="py-2 text-slate-400 text-xs">Database URL</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                              <td className="py-2"><code className="text-cyan-400">AI_PROVIDER</code></td>
                              <td className="py-2 text-xs">openai</td>
                              <td className="py-2 text-red-400 text-xs font-semibold">MUST ADD!</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                              <td className="py-2"><code className="text-cyan-400">OPENAI_API_KEY</code></td>
                              <td className="py-2 text-xs">sk-your_key</td>
                              <td className="py-2 text-red-400 text-xs font-semibold">MUST ADD (if using OpenAI)</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                              <td className="py-2"><code className="text-cyan-400">GROK_API_KEY</code></td>
                              <td className="py-2 text-xs">your_grok_key</td>
                              <td className="py-2 text-red-400 text-xs font-semibold">MUST ADD (if using Grok)</td>
                            </tr>
                            <tr>
                              <td className="py-2"><code className="text-cyan-400">RETRO_DIFFUSION_API_KEY</code></td>
                              <td className="py-2 text-xs">your_retro_key</td>
                              <td className="py-2 text-slate-400 text-xs">Optional - for AI images</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                        <p className="text-red-300">
                          <strong>🚨 CRITICAL:</strong> You MUST manually add all secrets marked "MUST ADD!" above. 
                          The auto-provided ones are not enough - the Edge Function needs the EDGE_ prefixed versions!
                          <br /><br />
                          <strong>You also MUST add at least ONE AI provider key (OPENAI_API_KEY or GROK_API_KEY) - NPCs will not work without it!</strong>
                        </p>
                      </div>

                      <h4 className="text-cyan-400 font-semibold mb-3 mt-6">Method 2: Using CLI (Alternative)</h4>
                      <p className="text-slate-400 text-sm mb-2">If you prefer command line, run these commands:</p>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto text-sm">
                        <code className="text-cyan-400">{`# Set the EDGE_ prefixed versions (REQUIRED!)
supabase secrets set EDGE_SUPABASE_URL=https://xxxxx.supabase.co
supabase secrets set EDGE_SERVICE_ROLE_KEY=your_service_role_key

# Set your AI provider and key
supabase secrets set AI_PROVIDER=openai
supabase secrets set OPENAI_API_KEY=sk-your_key_here
# OR for Grok:
# supabase secrets set GROK_API_KEY=your_grok_key_here

# Optional: For AI image generation
supabase secrets set RETRO_DIFFUSION_API_KEY=your_key_here`}</code>
                      </pre>
                    </div>

                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                      <p className="text-red-300">
                        <strong>🚨 CRITICAL:</strong> The <code className="text-red-400">SUPABASE_URL</code> must exactly match your project URL! 
                        This is the #1 cause of "commands not processing" issues.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">5.5 Deploy the Function</h3>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                        <code className="text-cyan-400">supabase functions deploy command-processor</code>
                      </pre>
                      <p className="text-slate-400 text-sm mt-2">
                        You should see: <span className="text-green-400">"Deployed Function command-processor"</span>
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">5.6 Verify Deployment</h3>
                      <p className="text-slate-300 mb-2">Check your Edge Function logs:</p>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Go to <strong>Supabase Dashboard</strong> → <strong>Edge Functions</strong></li>
                        <li>Click on <strong>command-processor</strong></li>
                        <li>Click the <strong>Logs</strong> tab</li>
                        <li>You should see "Command processor starting..." messages</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Access */}
              {activeSection === 'admin-access' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">6. Set Up Admin Access</h2>
                  <p className="text-slate-300">
                    The admin panel uses a database column to control who has admin access.
                  </p>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">6.1 Create Your Admin Account</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Start the dev server: <code className="text-cyan-400">npm run dev</code></li>
                        <li>Go to <code className="text-cyan-400">http://localhost:3000</code></li>
                        <li>Click <strong>"Sign In to Play"</strong> → <strong>"Need an account? Sign Up"</strong></li>
                        <li>Create your admin account</li>
                      </ol>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">6.2 Get Your User ID</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Go to your Supabase project</li>
                        <li>Navigate to <strong>Authentication</strong> → <strong>Users</strong> (left sidebar)</li>
                        <li>Find your newly created user</li>
                        <li>Copy the <strong>UUID</strong> (looks like: <code className="text-cyan-400">e00d825e-cf13-45ad-a886-c7ff9721da0b</code>)</li>
                      </ol>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">6.3 Grant Yourself Admin Access</h3>
                      <p className="text-slate-300 mb-3">Choose one of these methods:</p>
                      
                      <div className="bg-slate-800/30 p-4 rounded-lg mb-3">
                        <h4 className="text-cyan-400 font-semibold mb-2">Option A: Using SQL (Recommended)</h4>
                        <ol className="space-y-2 text-slate-300 list-decimal list-inside text-sm">
                          <li>In Supabase, go to <strong>SQL Editor</strong></li>
                          <li>Click <strong>"New query"</strong></li>
                          <li>Run this query (replace with your copied UUID):</li>
                        </ol>
                        <pre className="bg-slate-950 border border-slate-700 rounded-lg p-3 overflow-x-auto mt-2">
                          <code className="text-cyan-400 text-sm">{`UPDATE public.profiles 
SET is_admin = true 
WHERE user_id = 'your-uuid-here';`}</code>
                        </pre>
                      </div>
                      
                      <div className="bg-slate-800/30 p-4 rounded-lg">
                        <h4 className="text-cyan-400 font-semibold mb-2">Option B: Using Table Editor</h4>
                        <ol className="space-y-2 text-slate-300 list-decimal list-inside text-sm">
                          <li>Go to <strong>Table Editor</strong> → <strong>profiles</strong></li>
                          <li>Find your user row</li>
                          <li>Click the <strong>is_admin</strong> checkbox to set it to <code className="text-green-400">true</code></li>
                          <li>Changes save automatically</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Run Locally */}
              {activeSection === 'run-locally' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">7. Run Locally</h2>
                  
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">Start the Development Server</h3>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                        <code className="text-cyan-400">npm run dev</code>
                      </pre>
                      <p className="text-slate-300 mt-3">
                        Open <a href="http://localhost:3000" target="_blank" className="text-cyan-400 hover:underline">http://localhost:3000</a> in your browser.
                      </p>
                    </div>

                    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                      <h3 className="text-xl font-semibold text-cyan-400 mb-3">Test Your Setup</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Click <strong>"Sign In to Play"</strong> and login with your admin account</li>
                        <li>Create a character and enter the game</li>
                        <li>Try these commands:
                          <ul className="ml-6 mt-2 space-y-1">
                            <li>• <code className="text-cyan-400">help</code> - View all commands</li>
                            <li>• <code className="text-cyan-400">look</code> - View current room</li>
                            <li>• <code className="text-cyan-400">say hello</code> - Test chat</li>
                          </ul>
                        </li>
                        <li>If commands work, you're all set! 🎉</li>
                      </ol>
                    </div>

                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                      <p className="text-green-300">
                        <strong>✅ Success!</strong> Your Arkyv Engine is now running. 
                        Continue to "World Setup" to create your first custom region and rooms.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* World Setup */}
              {activeSection === 'world-setup' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">8. Initial World Setup</h2>
                  <p className="text-slate-300">
                    Now that you have admin access, you can create your first custom rooms!
                  </p>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">8.1 Access the Admin Panel</h3>
                      <p className="text-slate-300">
                        Navigate to <a href="/admin" className="text-cyan-400 hover:underline">http://localhost:3000/admin</a>
                      </p>
                      <p className="text-slate-400 text-sm mt-2">
                        You should now see the visual world builder with a node graph!
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">8.2 Create Your First Region</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Scroll down to <strong>"Regions Management"</strong></li>
                        <li>Click <strong>"Create New Region"</strong></li>
                        <li>Fill in:
                          <ul className="ml-6 mt-2 space-y-1">
                            <li>• <strong>Name:</strong> <code className="text-cyan-400">Mystical Forest</code> (this will be normalized automatically)</li>
                            <li>• <strong>Description:</strong> A brief description of the region's theme</li>
                          </ul>
                        </li>
                        <li>Click <strong>"Create Region"</strong></li>
                      </ol>
                      <p className="text-slate-400 text-sm mt-2">
                        The system automatically converts region names to the correct format (lowercase with hyphens).
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">8.3 Create Your First Room</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>In the map area at the top, <strong>right-click on empty space</strong></li>
                        <li>Select <strong>"Create new room here"</strong></li>
                        <li>Fill in:
                          <ul className="ml-6 mt-2 space-y-1">
                            <li>• <strong>Name:</strong> <code className="text-cyan-400">Forest Clearing</code></li>
                            <li>• <strong>Description:</strong> A vibrant description of the location</li>
                            <li>• <strong>Region:</strong> Select <code className="text-cyan-400">Mystical Forest</code></li>
                          </ul>
                        </li>
                        <li>Click <strong>"Create Room"</strong></li>
                      </ol>
                      <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mt-3">
                        <p className="text-cyan-300 text-sm">
                          <strong>💡 Tip:</strong> Use the AI assistance buttons to generate names and descriptions!
                        </p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">8.4 Create Connected Rooms</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li><strong>Click on your room node</strong> to open the room editor</li>
                        <li>In the <strong>"Exits"</strong> section, click a direction (e.g., <strong>North</strong>)</li>
                        <li>Choose <strong>"Generate New Room (AI)"</strong> or <strong>"Create Blank Room"</strong></li>
                        <li>Fill in details and click <strong>"Create Room"</strong></li>
                        <li>Repeat to create a network of connected rooms</li>
                      </ol>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">8.5 Add NPCs (Optional)</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Scroll to <strong>"NPCs Management"</strong></li>
                        <li>Click <strong>"Create New NPC"</strong></li>
                        <li>Fill in NPC details:
                          <ul className="ml-6 mt-2 space-y-1">
                            <li>• <strong>Name:</strong> <code className="text-cyan-400">Mysterious Traveler</code></li>
                            <li>• <strong>Alias:</strong> <code className="text-cyan-400">traveler</code> (what players type to talk)</li>
                            <li>• <strong>Personality:</strong> Describe their character traits</li>
                            <li>• <strong>Current Room:</strong> Assign to a room</li>
                          </ul>
                        </li>
                        <li>Players can now use <code className="text-cyan-400">talk traveler hello</code> to interact!</li>
                      </ol>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">8.6 Test Your World</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Navigate to <code className="text-cyan-400">http://localhost:3000/play</code></li>
                        <li>Create a new character or select existing one</li>
                        <li>Use commands to explore:
                          <ul className="ml-6 mt-2 space-y-1 text-sm">
                            <li>• <code className="text-cyan-400">look</code> - View current room</li>
                            <li>• <code className="text-cyan-400">north</code> - Move north (or any direction)</li>
                            <li>• <code className="text-cyan-400">who</code> - See who's in the room</li>
                            <li>• <code className="text-cyan-400">talk [npc] [message]</code> - Talk to an NPC</li>
                            <li>• <code className="text-cyan-400">say [message]</code> - Speak to everyone</li>
                            <li>• <code className="text-cyan-400">help</code> - See all commands</li>
                          </ul>
                        </li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

              {/* Music Setup */}
              {activeSection === 'music-setup' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">9. Add Music to Regions</h2>
                  <p className="text-slate-300">
                    Arkyv Engine supports background music that plays automatically when players enter different regions. 
                    Setting it up is simple!
                  </p>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">9.1 Create Region Folder</h3>
                      <p className="text-slate-300 mb-3">
                        Create a folder in <code className="text-cyan-400">public/audio/</code> matching your region name (lowercase with hyphens):
                      </p>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                        <code className="text-cyan-400">mkdir public/audio/my-region-name</code>
                      </pre>
                      <p className="text-slate-400 text-sm mt-2">
                        For the default regions from the migration, you'd create:
                      </p>
                      <ul className="text-slate-300 list-disc list-inside ml-4 mt-2 text-sm">
                        <li><code className="text-cyan-400">public/audio/character-creation/</code></li>
                        <li><code className="text-cyan-400">public/audio/starting-zone/</code></li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">9.2 Add Music Files</h3>
                      <p className="text-slate-300 mb-3">Place your <code className="text-cyan-400">.mp3</code> files in the folder:</p>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto text-sm">
                        <code className="text-slate-300">{`public/audio/my-region-name/
  ├── track1.mp3
  ├── track2.mp3
  └── track3.mp3`}</code>
                      </pre>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">9.3 Update Playlist</h3>
                      <p className="text-slate-300 mb-3">
                        Open <code className="text-cyan-400">components/ArkyvAudioManager.js</code> and add your region to the <code className="text-cyan-400">STATIC_PLAYLISTS</code> object:
                      </p>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto text-sm">
                        <code className="text-slate-300">{`const STATIC_PLAYLISTS = {
    'my-region-name': [
        '/audio/my-region-name/track1.mp3',
        '/audio/my-region-name/track2.mp3',
        '/audio/my-region-name/track3.mp3',
    ],
};`}</code>
                      </pre>
                      <p className="text-slate-400 text-sm mt-3">
                        The region name must match exactly what's in your database (<code className="text-cyan-400">regions.region_name</code> column).
                      </p>
                    </div>

                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                      <p className="text-green-300">
                        <strong>✅ Done!</strong> Music will automatically play when players enter rooms in that region. 
                        The playlist will loop and shuffle for variety.
                      </p>
                    </div>

                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                      <p className="text-cyan-300 text-sm">
                        <strong>💡 Tip:</strong> Music files are included in the starter audio folder. You can use royalty-free music from sites like:
                        <ul className="list-disc list-inside ml-4 mt-2">
                          <li><a href="https://freemusicarchive.org" target="_blank" className="text-cyan-400 hover:underline">Free Music Archive</a></li>
                          <li><a href="https://incompetech.com" target="_blank" className="text-cyan-400 hover:underline">Incompetech</a></li>
                          <li><a href="https://pixabay.com/music/" target="_blank" className="text-cyan-400 hover:underline">Pixabay Music</a></li>
                        </ul>
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3 mt-6">9.4 Room-Specific Music Overrides (Optional)</h3>
                      <p className="text-slate-300 mb-3">
                        Want specific rooms to have different music than their region? Use room overrides!
                      </p>

                      <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 mb-4">
                        <p className="text-cyan-300 text-sm">
                          <strong>💡 Example:</strong> You have a "Forest Region" with ambient nature sounds. Most forest rooms use that regional playlist, 
                          but when players enter "The Tavern" room, you want lively medieval music instead. That's where room overrides shine! 
                          (Think <em>Elwynn Forest</em> ambient music vs <em>Goldshire Inn</em> tavern music if you're a WoW fan.)
                        </p>
                      </div>
                      
                      <ol className="space-y-3 text-slate-300 list-decimal list-inside">
                        <li><strong>Create override folder:</strong>
                          <pre className="bg-slate-950 border border-slate-700 rounded-lg p-3 overflow-x-auto mt-2 text-sm">
                            <code className="text-cyan-400">mkdir public/audio/override</code>
                          </pre>
                        </li>
                        <li><strong>Get the room UUID:</strong>
                          <ul className="ml-6 mt-2 space-y-1 text-sm">
                            <li>• Open the Admin Panel (<code className="text-cyan-400">/admin</code>)</li>
                            <li>• Click on the room you want to customize</li>
                            <li>• Copy the UUID from the room editor</li>
                          </ul>
                        </li>
                        <li><strong>Add to <code className="text-cyan-400">data/roomAudioOverrides.js</code>:</strong>
                          <pre className="bg-slate-950 border border-slate-700 rounded-lg p-3 overflow-x-auto mt-2 text-sm">
                            <code className="text-slate-300">{`const ROOM_AUDIO_OVERRIDES = {
    'room-uuid-here': [
        '/audio/override/special-track.mp3',
        '/audio/override/another-track.mp3',
    ],
};`}</code>
                          </pre>
                        </li>
                      </ol>

                      <p className="text-slate-400 text-sm mt-3">
                        <strong>Priority:</strong> Room overrides take precedence over region playlists.
                      </p>
                    </div>

                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 mt-4">
                      <p className="text-purple-300 text-sm">
                        <strong>📝 Why Static Files?</strong> We use static audio files for simplicity and performance. 
                        Audio files are large, and serving them statically from your CDN/server is much faster than database storage. 
                        In the future, we may add a UI in the admin panel to manage these mappings, but the actual audio files 
                        will remain static for optimal delivery and bandwidth efficiency.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Deployment */}
              {activeSection === 'deployment' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">Deployment Options</h2>
                  
                  <div className="space-y-6">
                    {/* Docker Option */}
                    <div className="bg-slate-800/50 p-6 rounded-lg border border-cyan-500/30">
                      <h3 className="text-2xl font-semibold text-cyan-400 mb-4">Option 1: Docker (Self-Hosting)</h3>
                      <p className="text-slate-300 mb-4">
                        <strong className="text-amber-300">⚠️ Prerequisites:</strong> Complete Supabase setup and Edge Functions deployment first. Docker only runs the Next.js app.
                      </p>
                      
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-lg font-semibold text-slate-200 mb-2">Quick Start</h4>
                          <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto text-sm">
                            <code className="text-cyan-400">{`# Clone and setup
git clone https://github.com/SeloSlav/arkyv-engine.git
cd arkyv-engine

# Create .env.local (edit with your keys)
cp .env.example .env.local

# Run with Docker Compose
docker-compose up -d

# Access at http://localhost:3000`}</code>
                          </pre>
                        </div>

                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                          <p className="text-green-300 text-sm">
                            <strong>✅ Benefits:</strong> One command deployment, consistent environment, works on Windows/Mac/Linux
                          </p>
                        </div>

                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                          <p className="text-amber-300 text-sm">
                            <strong>⚠️ Note:</strong> You still need external services (Supabase for database, OpenAI/Grok for AI). 
                            These can&apos;t be containerized but offer free tiers. Docker only runs the Arkyv Engine app itself.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Vercel Option */}
                    <div className="bg-slate-800/50 p-6 rounded-lg border border-blue-500/30">
                      <h3 className="text-2xl font-semibold text-blue-400 mb-4">Option 2: Vercel (Production)</h3>
                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">1. Push to GitHub</h3>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto text-sm">
                        <code className="text-cyan-400">{`git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/your-repo.git
git push -u origin main`}</code>
                      </pre>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">2. Deploy to Vercel</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Go to <a href="https://vercel.com" target="_blank" className="text-cyan-400 hover:underline">vercel.com</a></li>
                        <li>Click <strong>"Add New"</strong> → <strong>"Project"</strong></li>
                        <li>Import your GitHub repository</li>
                        <li>In <strong>"Environment Variables"</strong>, add all your variables from <code className="text-cyan-400">.env.local</code></li>
                        <li>Click <strong>"Deploy"</strong></li>
                      </ol>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-200 mb-3">3. Update Supabase Settings</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>In Supabase, go to <strong>Authentication</strong> → <strong>URL Configuration</strong></li>
                        <li>Add your Vercel URL to <strong>"Site URL"</strong></li>
                        <li>Add <code className="text-cyan-400">https://your-app.vercel.app/**</code> to <strong>"Redirect URLs"</strong></li>
                      </ol>
                    </div>

                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                      <p className="text-green-300">
                        <strong>🎉 Congratulations!</strong> Your MUD is now live on the internet!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Troubleshooting */}
              {activeSection === 'troubleshooting' && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-cyan-400">Troubleshooting</h2>
                  
                  <div className="space-y-6">
                    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                      <h3 className="text-xl font-semibold text-red-400 mb-3">🔥 Messages Not Appearing in Terminal</h3>
                      <p className="text-slate-300 mb-3">If commands process but you don't see NPC responses or messages:</p>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside text-sm">
                        <li>Go to <strong>Table Editor</strong> in Supabase Dashboard</li>
                        <li>For each table, click the <strong>"Enable Realtime"</strong> button (paper plane icon ✈️) at top right</li>
                        <li>Enable for these 5 tables: <code className="text-cyan-400">room_messages</code>, <code className="text-cyan-400">region_chats</code>, <code className="text-cyan-400">characters</code>, <code className="text-cyan-400">npcs</code>, <code className="text-cyan-400">profiles</code></li>
                        <li>Refresh your browser</li>
                      </ol>
                    </div>

                    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                      <h3 className="text-xl font-semibold text-red-400 mb-3">🔥 Commands Not Processing</h3>
                      <p className="text-slate-300 mb-3">If commands aren't being processed at all:</p>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li><strong>Check Edge Function URL</strong>
                          <ul className="ml-6 mt-1 text-sm text-slate-400">
                            <li>• In Supabase Dashboard → Edge Functions → Logs</li>
                            <li>• Look for "URL: https://..." in the logs</li>
                            <li>• It MUST match your project URL exactly</li>
                          </ul>
                        </li>
                        <li><strong>Update the secrets (set BOTH):</strong>
                          <pre className="bg-slate-950 border border-slate-700 rounded-lg p-2 overflow-x-auto mt-2 text-sm">
                            <code className="text-cyan-400">{`supabase secrets set SUPABASE_URL=https://your-correct-url.supabase.co
supabase secrets set EDGE_SUPABASE_URL=https://your-correct-url.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set EDGE_SERVICE_ROLE_KEY=your_service_role_key`}</code>
                          </pre>
                        </li>
                        <li><strong>Redeploy:</strong>
                          <pre className="bg-slate-950 border border-slate-700 rounded-lg p-2 overflow-x-auto mt-2 text-sm">
                            <code className="text-cyan-400">supabase functions deploy command-processor</code>
                          </pre>
                        </li>
                      </ol>
                    </div>

                    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                      <h3 className="text-xl font-semibold text-amber-400 mb-3">⚠️ "AI API Error"</h3>
                      <ul className="space-y-2 text-slate-300 list-disc list-inside">
                        <li>Check your <code className="text-cyan-400">AI_PROVIDER</code> is set to <code className="text-cyan-400">"openai"</code> or <code className="text-cyan-400">"grok"</code></li>
                        <li>Verify your API key is correct</li>
                        <li>Ensure you have API credits/quota available</li>
                        <li>Check Edge Function secrets: <code className="text-cyan-400">supabase secrets list</code></li>
                      </ul>
                    </div>

                    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                      <h3 className="text-xl font-semibold text-amber-400 mb-3">⚠️ "Cannot find module 'tailwindcss'"</h3>
                      <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                        <code className="text-cyan-400">npm install -D tailwindcss postcss autoprefixer @tailwindcss/postcss</code>
                      </pre>
                    </div>

                    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                      <h3 className="text-xl font-semibold text-amber-400 mb-3">⚠️ "Supabase environment variables are missing"</h3>
                      <p className="text-slate-300 mb-2">Make sure <code className="text-cyan-400">.env.local</code> has all required keys:</p>
                      <ul className="space-y-1 text-slate-300 list-disc list-inside text-sm">
                        <li><code className="text-cyan-400">NEXT_PUBLIC_SUPABASE_URL</code></li>
                        <li><code className="text-cyan-400">NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
                        <li><code className="text-cyan-400">SUPABASE_SERVICE_ROLE_KEY</code></li>
                      </ul>
                    </div>

                    <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700">
                      <h3 className="text-xl font-semibold text-amber-400 mb-3">⚠️ Check Edge Function Logs</h3>
                      <ol className="space-y-2 text-slate-300 list-decimal list-inside">
                        <li>Go to <strong>Supabase Dashboard</strong> → <strong>Edge Functions</strong> → <strong>command-processor</strong></li>
                        <li>Click the <strong>Logs</strong> tab</li>
                        <li>Try a command (like <code className="text-cyan-400">say hello</code>)</li>
                        <li>Check for errors in the logs</li>
                      </ol>
                    </div>

                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                      <p className="text-cyan-300">
                        <strong>💬 Need More Help?</strong> Check the <a href="https://github.com/SeloSlav/arkyv-engine/issues" target="_blank" className="text-cyan-400 hover:underline">GitHub Issues</a> or create a new one!
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

