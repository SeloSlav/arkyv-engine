import { existsSync } from 'node:fs';
import {
    ensureLocalEnv,
    envLocalPath,
    localRuntimeEnvironment,
    probeUrl,
    resolveOllamaExecutable,
    resolveSpacetimeExecutable,
    runForOutput,
    updateLocalEnv,
} from './local-tools.mjs';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const valueFor = (name) => args.find((argument) => argument.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const textProvider = valueFor('text');
const imageProvider = valueFor('image');

const validTextProviders = new Set(['openai', 'grok', 'local']);
const validImageProviders = new Set(['retrodiffusion', 'local']);

if (textProvider && !validTextProviders.has(textProvider)) {
    console.error('Invalid --text value. Use openai, grok, or local.');
    process.exit(1);
}
if (imageProvider && !validImageProviders.has(imageProvider)) {
    console.error('Invalid --image value. Use retrodiffusion or local.');
    process.exit(1);
}

let createdEnv = false;
if (!checkOnly) {
    createdEnv = ensureLocalEnv();
    const updates = {
        NEXT_PUBLIC_ARKYV_SITE_MODE: 'runtime',
        NEXT_PUBLIC_SPACETIMEDB_URI: 'http://127.0.0.1:3000',
        NEXT_PUBLIC_SPACETIMEDB_DB_NAME: 'arkyv-engine',
    };
    if (textProvider) updates.AI_PROVIDER = textProvider;
    if (textProvider === 'local') {
        updates.LOCAL_AI_BASE_URL = 'http://127.0.0.1:11434/v1';
        updates.LOCAL_AI_MODEL = 'qwen2.5:7b';
    }
    if (imageProvider) updates.IMAGE_PROVIDER = imageProvider;
    if (imageProvider === 'local') {
        updates.LOCAL_IMAGE_BASE_URL = 'http://127.0.0.1:7860';
    }
    updateLocalEnv(updates);
}

const env = localRuntimeEnvironment();
const checks = [];
const addCheck = (label, state, detail, required = false) => {
    checks.push({ label, state, detail, required });
};

const nodeMajor = Number(process.versions.node.split('.')[0]);
addCheck('Node.js', nodeMajor >= 18, `v${process.versions.node}`, true);

const rust = runForOutput('rustc', ['--version']);
addCheck('Rust', rust.ok, rust.ok ? rust.output : 'not found', true);

const rustTargets = runForOutput('rustup', ['target', 'list', '--installed']);
const hasWasmTarget = rustTargets.ok && rustTargets.output.split(/\r?\n/).includes('wasm32-unknown-unknown');
addCheck(
    'Rust WASM target',
    hasWasmTarget,
    hasWasmTarget ? 'wasm32-unknown-unknown installed' : 'run: rustup target add wasm32-unknown-unknown',
    true,
);

const spacetimeExecutable = resolveSpacetimeExecutable();
const spacetime = runForOutput(spacetimeExecutable, ['--version']);
const pinnedSpacetime = spacetime.ok && /\b2\.0\.1\b/.test(spacetime.output);
addCheck(
    'SpacetimeDB CLI',
    pinnedSpacetime,
    spacetime.ok ? spacetime.output : 'not found; install and select version 2.0.1',
    true,
);

const hasLocalEnv = existsSync(envLocalPath);
addCheck(
    '.env.local',
    hasLocalEnv,
    createdEnv ? 'created from .env.example' : hasLocalEnv ? 'ready' : 'run: npm run setup:local',
    true,
);

if ((env.AI_PROVIDER || 'openai').toLowerCase() === 'local') {
    const baseUrl = String(env.LOCAL_AI_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
    const headers = env.LOCAL_AI_API_KEY
        ? { Authorization: `Bearer ${env.LOCAL_AI_API_KEY}` }
        : {};
    const reachable = await probeUrl(`${baseUrl}/models`, 1500, { headers });
    const ollama = runForOutput(resolveOllamaExecutable(), ['--version']);
    addCheck(
        'Local text model',
        reachable,
        reachable
            ? `${env.LOCAL_AI_MODEL || 'qwen2.5:7b'} at ${baseUrl}`
            : ollama.ok
                ? `Ollama installed but not running; dev:all will start it. Pull ${env.LOCAL_AI_MODEL || 'qwen2.5:7b'} first`
                : `not running at ${baseUrl}; install Ollama and pull ${env.LOCAL_AI_MODEL || 'qwen2.5:7b'}`,
    );
} else {
    const provider = (env.AI_PROVIDER || 'openai').toLowerCase();
    const keyName = provider === 'grok' ? 'GROK_API_KEY' : 'OPENAI_API_KEY';
    addCheck('Text provider', Boolean(env[keyName]), env[keyName] ? `${provider} key configured` : `${keyName} is blank`);
}

if ((env.IMAGE_PROVIDER || 'retrodiffusion').toLowerCase() === 'local') {
    const baseUrl = String(env.LOCAL_IMAGE_BASE_URL || 'http://127.0.0.1:7860').replace(/\/+$/, '');
    const headers = env.LOCAL_IMAGE_API_AUTH
        ? { Authorization: `Basic ${Buffer.from(env.LOCAL_IMAGE_API_AUTH).toString('base64')}` }
        : {};
    const reachable = await probeUrl(`${baseUrl}/sdapi/v1/samplers`, 1500, { headers });
    addCheck(
        'Local image model',
        reachable,
        reachable ? `WebUI/Forge API at ${baseUrl}` : `optional; start WebUI/Forge with --api at ${baseUrl}`,
    );
} else {
    addCheck(
        'Image provider',
        Boolean(env.RETRO_DIFFUSION_API_KEY),
        env.RETRO_DIFFUSION_API_KEY ? 'RetroDiffusion key configured' : 'optional; RETRO_DIFFUSION_API_KEY is blank',
    );
}

console.log(checkOnly ? '\nArkyv local setup check\n' : '\nArkyv local setup\n');
for (const check of checks) {
    console.log(`${check.state ? '[ok]' : check.required ? '[missing]' : '[optional]'} ${check.label}: ${check.detail}`);
}

const missingRequired = checks.filter((check) => check.required && !check.state);
if (missingRequired.length > 0) {
    console.error('\nComplete the missing prerequisite(s), then rerun npm run setup:check.');
    process.exit(1);
}

console.log('\nConfiguration is ready.');
if (!checkOnly) {
    console.log('Start the database, publish the module, and run Arkyv with: npm run dev:all');
}
