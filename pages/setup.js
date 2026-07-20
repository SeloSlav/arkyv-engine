import React from 'react';
import Head from 'next/head';
import HamburgerIcon from '@/components/HamburgerIcon';
import Footer from '@/components/Footer';

const Code = ({ children }) => <pre className="overflow-x-auto rounded-lg border border-cyan-400/20 bg-black p-4 text-sm text-cyan-200"><code>{children}</code></pre>;

export default function SetupPage({ cameFromHostedRuntime }) {
  return (
    <>
      <Head><title>Setup | Arkyv Engine</title></Head>
      <div className="arkyv-app-shell min-h-screen px-3 py-20 text-slate-200 sm:px-6">
        <HamburgerIcon />
        <main className="mx-auto max-w-4xl space-y-10">
          <header>
            <h1 className="font-terminal text-4xl tracking-[0.15em] text-cyan-200 uppercase">Arkyv Setup</h1>
            <p className="mt-4 text-slate-400">Arkyv uses a self-hosted SpacetimeDB 2.0.1 module for persistence, realtime updates, identities, and command processing.</p>
            {cameFromHostedRuntime && (
              <div className="mt-6 rounded-xl border border-cyan-300/25 bg-cyan-300/[0.07] p-4 text-sm leading-6 text-cyan-100">
                arkyv.org is the project site and does not host game worlds. Run Arkyv with your own SpacetimeDB instance, then create and enter worlds from that deployment.
              </div>
            )}
          </header>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-cyan-300">1. Install prerequisites</h2>
            <p>Install Node.js 18+, Rust, and the SpacetimeDB CLI. Pin the installed CLI to the same release as the project:</p>
            <Code>{`spacetime version install 2.0.1\nspacetime version use 2.0.1\nrustup target add wasm32-unknown-unknown`}</Code>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-cyan-300">2. Pick your AI setup</h2>
            <p>Install <a className="text-cyan-300 underline" href="https://ollama.com/download" target="_blank" rel="noreferrer">Ollama</a>, install project dependencies, create <code className="text-cyan-300">.env.local</code>, and preset local text generation:</p>
            <Code>{`npm install\nnpm run setup:local -- --text=local\nollama pull qwen2.5:7b`}</Code>
            <p>Ollama normally serves its OpenAI-compatible endpoint automatically. If it is not already running, use <code className="text-cyan-300">ollama serve</code>.</p>
            <div className="rounded-xl border border-purple-400/20 bg-purple-400/[0.05] p-4 text-sm leading-6 text-slate-300">
              <p className="font-semibold text-purple-200">Optional local images</p>
              <p className="mt-1">Install <a className="text-purple-200 underline" href="https://github.com/AUTOMATIC1111/stable-diffusion-webui" target="_blank" rel="noreferrer">Stable Diffusion WebUI</a> or <a className="text-purple-200 underline" href="https://github.com/lllyasviel/stable-diffusion-webui-forge" target="_blank" rel="noreferrer">Forge</a>, add a checkpoint, launch it with <code>--api</code>, then run:</p>
              <Code>npm run setup:local -- --image=local</Code>
              <p className="mt-2 text-slate-400">You can skip image generation setup entirely and upload your own PNG, JPEG, or WebP room images from the admin room editor. Uploading requires no model or API key.</p>
            </div>
            <p>To preset both local providers at once, run <code className="text-cyan-300">npm run setup:local -- --text=local --image=local</code>. For hosted text, use <code className="text-cyan-300">--text=openai</code> or <code className="text-cyan-300">--text=grok</code>, then add the corresponding key to <code className="text-cyan-300">.env.local</code>.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-cyan-300">3. Check the setup</h2>
            <Code>npm run setup:check</Code>
            <p>This checks Node, Rust, the WASM target, SpacetimeDB 2.0.1, provider selection, and whether configured local model servers are reachable. It does not display provider keys.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-cyan-300">4. Start everything</h2>
            <Code>npm run dev:all</Code>
            <p>This single command starts or reuses local SpacetimeDB, publishes the module without wiping world data, regenerates client bindings, starts an installed Ollama service when selected, checks optional local image generation, and starts Next.js. It never downloads a large model without you asking. Press <code className="text-cyan-300">Ctrl+C</code> once to stop what it started.</p>
            <p>Open <a className="text-cyan-300 underline" href="http://localhost:3005">http://localhost:3005</a>, create a named saved world, then enter it. The first identity created in a fresh database is the administrator.</p>
            <p className="text-sm text-slate-400">After the first successful publish, <code className="text-cyan-300">npm run dev:all:fast</code> is available for frontend-only work. pnpm users can run the same scripts as <code className="text-cyan-300">pnpm setup:local</code> and <code className="text-cyan-300">pnpm dev:all</code>.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-cyan-300">Manual three-terminal mode</h2>
            <p>Use this advanced path when connecting to a remote database or a local node on a custom port:</p>
            <Code>{`# Terminal 1\nspacetime start\n\n# Terminal 2\nnpm run spacetime:deploy\n\n# Terminal 3\nnpm run dev`}</Code>
            <p>Use <code className="text-cyan-300">npm run spacetime:deploy:clean</code> only when you intentionally want to wipe the local database.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-cyan-300">Saved worlds and identities</h2>
            <p>There are no email accounts. SpacetimeDB issues a signed token for every saved world; Arkyv stores it in this browser&apos;s localStorage. Logging out returns to the picker, switching selects another token, and deleting a save removes its profile, characters, private commands, and actor-owned messages before deleting the local token.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-cyan-300">Troubleshooting</h2>
            <ul className="list-disc space-y-2 pl-6 text-slate-400">
              <li>Connection refused: verify <code>NEXT_PUBLIC_SPACETIMEDB_URI</code> and keep <code>spacetime start</code> running.</li>
              <li>Schema mismatch: rerun <code>npm run spacetime:deploy</code> with CLI 2.0.1.</li>
              <li>Prerequisite uncertainty: run <code>npm run setup:check</code> for an actionable status list.</li>
              <li>Admin page redirects: only the first identity in a fresh database is admin.</li>
              <li>Local text errors: verify the model is installed and <code>LOCAL_AI_BASE_URL</code> ends in <code>/v1</code>.</li>
              <li>Local image errors: start Stable Diffusion WebUI/Forge with <code>--api</code> and verify <code>LOCAL_IMAGE_BASE_URL</code>.</li>
            </ul>
          </section>
        </main>
      </div>
      <Footer color="#020617" />
    </>
  );
}

export function getServerSideProps({ query }) {
  return {
    props: {
      cameFromHostedRuntime: query.from === 'hosted-site',
    },
  };
}
