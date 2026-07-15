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
            <h2 className="text-2xl font-semibold text-cyan-300">2. Install and configure</h2>
            <Code>{`npm install\ncp .env.example .env.local`}</Code>
            <p>The local defaults connect to <code className="text-cyan-300">http://127.0.0.1:3000</code> and database <code className="text-cyan-300">arkyv-engine</code>. Add one AI provider key for NPC dialogue.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-cyan-300">3. Start and publish SpacetimeDB</h2>
            <p>Keep the standalone node running in one terminal:</p>
            <Code>spacetime start</Code>
            <p>In a second terminal, publish the Rust module and regenerate the checked-in TypeScript bindings:</p>
            <Code>npm run spacetime:deploy</Code>
            <p>Use <code className="text-cyan-300">npm run spacetime:deploy:clean</code> only when you intentionally want to wipe the local database.</p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-cyan-300">4. Run Arkyv</h2>
            <Code>npm run dev</Code>
            <p>Open <a className="text-cyan-300 underline" href="http://localhost:3005">http://localhost:3005</a>, create a named saved world, then enter it. The first identity created in a fresh database is the administrator.</p>
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
              <li>Admin page redirects: only the first identity in a fresh database is admin.</li>
              <li>NPCs use fallback dialogue without an OpenAI or Grok key.</li>
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
