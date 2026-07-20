import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));

export const projectRoot = resolve(scriptsDirectory, '..');
export const envExamplePath = join(projectRoot, '.env.example');
export const envLocalPath = join(projectRoot, '.env.local');
export const spacetimeModulePath = join(projectRoot, 'spacetimedb');
export const generatedPath = join(projectRoot, 'generated');

const unquote = (value) => {
    const trimmed = value.trim();
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
};

export function parseEnvFile(path) {
    if (!existsSync(path)) return {};

    const values = {};
    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separator = line.indexOf('=');
        if (separator < 1) continue;
        const key = line.slice(0, separator).trim();
        if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
        values[key] = unquote(line.slice(separator + 1));
    }
    return values;
}

export function ensureLocalEnv() {
    if (existsSync(envLocalPath)) return false;
    copyFileSync(envExamplePath, envLocalPath);
    return true;
}

export function updateEnvFile(path, updates) {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    const pending = new Map(Object.entries(updates));
    const written = new Set();
    const output = lines.map((line) => {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=/i);
        if (!match || !Object.hasOwn(updates, match[1])) return line;
        if (written.has(match[1])) return null;
        written.add(match[1]);
        pending.delete(match[1]);
        return `${match[1]}=${updates[match[1]]}`;
    }).filter((line) => line !== null);

    if (pending.size > 0) {
        if (output.at(-1) !== '') output.push('');
        output.push('# Added by npm run setup:local');
        for (const [key, value] of pending) output.push(`${key}=${value}`);
    }

    writeFileSync(path, `${output.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}

export function updateLocalEnv(updates) {
    ensureLocalEnv();
    updateEnvFile(envLocalPath, updates);
}

export function resolveSpacetimeExecutable() {
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
        const pinnedExecutable = join(
            localAppData,
            'SpacetimeDB',
            'bin',
            '2.0.1',
            'spacetimedb-cli.exe',
        );
        if (existsSync(pinnedExecutable)) return pinnedExecutable;
    }
    return 'spacetime';
}

export function resolveOllamaExecutable() {
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
        const installedExecutable = join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
        if (existsSync(installedExecutable)) return installedExecutable;
    }
    return 'ollama';
}

export function runForOutput(command, args) {
    const result = spawnSync(command, args, {
        cwd: projectRoot,
        encoding: 'utf8',
        windowsHide: true,
    });
    return {
        ok: !result.error && result.status === 0,
        output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
        error: result.error,
        status: result.status,
    };
}

export async function probeUrl(url, timeoutMs = 1500, { headers = {}, acceptAnyStatus = false } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { headers, signal: controller.signal });
        return acceptAnyStatus || response.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

export function localRuntimeEnvironment() {
    return {
        ...parseEnvFile(envExamplePath),
        ...parseEnvFile(envLocalPath),
        ...process.env,
    };
}

export function displayPath(path) {
    return path.startsWith(projectRoot) ? `.${path.slice(projectRoot.length)}` : path;
}
