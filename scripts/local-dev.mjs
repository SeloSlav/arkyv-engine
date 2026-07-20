import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
    displayPath,
    ensureLocalEnv,
    generatedPath,
    localRuntimeEnvironment,
    probeUrl,
    projectRoot,
    resolveOllamaExecutable,
    resolveSpacetimeExecutable,
    runForOutput,
    spacetimeModulePath,
} from './local-tools.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipDeploy = args.has('--skip-deploy');
const nextExecutable = join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const spacetimeExecutable = resolveSpacetimeExecutable();

if (!dryRun) ensureLocalEnv();
const env = localRuntimeEnvironment();
const databaseUri = String(env.NEXT_PUBLIC_SPACETIMEDB_URI || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const databaseName = env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME || 'arkyv-engine';
let databaseUrl;
try {
    databaseUrl = new URL(databaseUri);
} catch {
    console.error(`Invalid NEXT_PUBLIC_SPACETIMEDB_URI: ${databaseUri}`);
    process.exit(1);
}
const databasePort = databaseUrl.port || (databaseUrl.protocol === 'https:' ? '443' : '80');
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(databaseUrl.hostname) || databasePort !== '3000') {
    console.error('dev:all is intentionally limited to the default local SpacetimeDB node at port 3000.');
    console.error('Use the documented separate-process workflow for a remote or custom-port database.');
    process.exit(1);
}

const spacetimeVersion = runForOutput(spacetimeExecutable, ['--version']);
if (!spacetimeVersion.ok || !/\b2\.0\.1\b/.test(spacetimeVersion.output)) {
    console.error('SpacetimeDB CLI 2.0.1 is required. Run npm run setup:check for details.');
    process.exit(1);
}
if (!existsSync(nextExecutable)) {
    console.error('Next.js is not installed. Run npm install first.');
    process.exit(1);
}

console.log('\nArkyv all-in-one local development\n');
console.log(`Database: ${databaseUri} / ${databaseName}`);
console.log(`SpacetimeDB: ${spacetimeVersion.output}`);
console.log(`Module: ${displayPath(spacetimeModulePath)}`);
console.log(`Web app: http://localhost:3005`);
if (skipDeploy) console.log('Module publish: skipped by --skip-deploy');

if (dryRun) {
    console.log('\nDry run complete; no processes were started and no module was published.');
    process.exit(0);
}

const children = new Set();
let databaseChild = null;
let shuttingDown = false;

const stopChild = (child) => {
    if (!child || child.exitCode !== null || child.killed) return;
    try {
        child.kill('SIGTERM');
    } catch {
        // The process may already have exited between the checks above.
    }
};

const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) stopChild(child);
    setTimeout(() => process.exit(exitCode), 100);
};

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

let databaseReady = await probeUrl(databaseUri, 1500, { acceptAnyStatus: true });
if (databaseReady) {
    console.log('\n[database] Reusing the SpacetimeDB node already running.');
} else {
    console.log('\n[database] Starting SpacetimeDB...');
    databaseChild = spawn(spacetimeExecutable, ['start'], {
        cwd: projectRoot,
        env,
        stdio: 'inherit',
        windowsHide: true,
    });
    children.add(databaseChild);
    databaseChild.once('exit', (code) => {
        children.delete(databaseChild);
        if (!shuttingDown) {
            console.error(`\n[database] SpacetimeDB exited unexpectedly (${code ?? 'unknown'}).`);
            shutdown(code || 1);
        }
    });

    const deadline = Date.now() + 30_000;
    while (!databaseReady && Date.now() < deadline && databaseChild.exitCode === null) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        databaseReady = await probeUrl(databaseUri, 1000, { acceptAnyStatus: true });
    }
    if (!databaseReady) {
        console.error('\n[database] SpacetimeDB did not become ready within 30 seconds.');
        shutdown(1);
        await new Promise(() => {});
    }
    console.log('[database] Ready.');
}

const runSpacetime = (label, commandArgs) => {
    console.log(`\n[database] ${label}...`);
    const result = spawnSync(spacetimeExecutable, commandArgs, {
        cwd: projectRoot,
        env,
        stdio: 'inherit',
        windowsHide: true,
    });
    if (result.error || result.status !== 0) {
        console.error(`[database] ${label} failed.`);
        shutdown(result.status || 1);
        return false;
    }
    return true;
};

if (!skipDeploy) {
    const published = runSpacetime('Publishing the Arkyv module', [
        'publish',
        '--no-config',
        '-p',
        spacetimeModulePath,
        databaseName,
        '-y',
    ]);
    if (!published) await new Promise(() => {});

    const generated = runSpacetime('Regenerating TypeScript bindings', [
        'generate',
        '--no-config',
        '--include-private',
        '-p',
        spacetimeModulePath,
        '-l',
        'typescript',
        '-o',
        generatedPath,
        '-y',
    ]);
    if (!generated) await new Promise(() => {});
}

const textProvider = String(env.AI_PROVIDER || 'openai').toLowerCase();
if (textProvider === 'local') {
    const baseUrl = String(env.LOCAL_AI_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
    const headers = env.LOCAL_AI_API_KEY
        ? { Authorization: `Bearer ${env.LOCAL_AI_API_KEY}` }
        : {};
    let textReady = await probeUrl(`${baseUrl}/models`, 1500, { headers });
    const defaultOllamaUrl = /^https?:\/\/(127\.0\.0\.1|localhost):11434\/v1$/i.test(baseUrl);
    const ollamaExecutable = resolveOllamaExecutable();
    const ollamaVersion = runForOutput(ollamaExecutable, ['--version']);

    if (!textReady && defaultOllamaUrl && ollamaVersion.ok) {
        console.log(`\n[ai] Starting Ollama for ${env.LOCAL_AI_MODEL || 'qwen2.5:7b'}...`);
        const ollamaChild = spawn(ollamaExecutable, ['serve'], {
            cwd: projectRoot,
            env,
            stdio: 'inherit',
            windowsHide: true,
        });
        children.add(ollamaChild);
        ollamaChild.once('exit', () => children.delete(ollamaChild));

        const deadline = Date.now() + 15_000;
        while (!textReady && Date.now() < deadline && ollamaChild.exitCode === null) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            textReady = await probeUrl(`${baseUrl}/models`, 1000, { headers });
        }
        if (!textReady) textReady = await probeUrl(`${baseUrl}/models`, 1000, { headers });
    }

    if (!textReady) {
        console.warn(`\n[ai] Ollama/OpenAI-compatible server is not reachable at ${baseUrl}. Arkyv will still start.`);
    } else {
        console.log(`\n[ai] Local text model ready: ${env.LOCAL_AI_MODEL || 'qwen2.5:7b'}.`);
        if (defaultOllamaUrl && ollamaVersion.ok) {
            const models = runForOutput(ollamaExecutable, ['list']);
            const model = env.LOCAL_AI_MODEL || 'qwen2.5:7b';
            if (models.ok && !models.output.toLowerCase().includes(model.toLowerCase())) {
                console.warn(`[ai] Model "${model}" is not listed by Ollama. Run: ollama pull ${model}`);
            }
        }
    }
}

const imageProvider = String(env.IMAGE_PROVIDER || 'retrodiffusion').toLowerCase();
if (imageProvider === 'local') {
    const baseUrl = String(env.LOCAL_IMAGE_BASE_URL || 'http://127.0.0.1:7860').replace(/\/+$/, '');
    const headers = env.LOCAL_IMAGE_API_AUTH
        ? { Authorization: `Basic ${Buffer.from(env.LOCAL_IMAGE_API_AUTH).toString('base64')}` }
        : {};
    if (!(await probeUrl(`${baseUrl}/sdapi/v1/samplers`, 1500, { headers }))) {
        console.warn(`[images] Stable Diffusion WebUI/Forge is not reachable at ${baseUrl}. Image generation will be unavailable.`);
    } else {
        console.log(`[images] Local Stable Diffusion API ready.`);
    }
}

console.log('\n[web] Starting Next.js. Press Ctrl+C once to stop everything started by this command.\n');
const webChild = spawn(process.execPath, [nextExecutable, 'dev', '--turbopack', '-p', '3005'], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    windowsHide: true,
});
children.add(webChild);
webChild.once('exit', (code) => {
    children.delete(webChild);
    if (!shuttingDown) shutdown(code || 0);
});
