import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const PREVIEWS_DIR = path.resolve('.previews');
const STATE_FILE = path.join(PREVIEWS_DIR, 'state.json');
const BASE_PORT = 4400;

interface PreviewEntry {
  pid: number;
  port: number;
  branch: string;
  startedAt: string;
}

function sanitizeBranch(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function getCurrentBranch(): string {
  return execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
}

function readState(): PreviewEntry[] {
  if (!fs.existsSync(STATE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeState(entries: PreviewEntry[]): void {
  fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(entries, null, 2));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pruneDeadEntries(entries: PreviewEntry[]): PreviewEntry[] {
  return entries.filter((e) => isProcessAlive(e.pid));
}

async function findFreePort(start: number, usedPorts: number[]): Promise<number> {
  let port = start;
  while (port < start + 100) {
    if (!usedPorts.includes(port)) {
      const available = await checkPort(port);
      if (available) return port;
    }
    port++;
  }
  throw new Error('No free port found in range');
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function killProcess(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process already dead
  }
}

async function start(): Promise<void> {
  const branch = getCurrentBranch();
  const name = sanitizeBranch(branch);
  const outDir = path.join(PREVIEWS_DIR, name);

  let entries = pruneDeadEntries(readState());

  // Check if this branch already has a running preview
  const existing = entries.find((e) => e.branch === name);
  if (existing) {
    console.log(`Preview already running for ${name} at http://localhost:${existing.port}`);
    return;
  }

  // Build
  console.log(`Building ${branch}...`);
  execSync(`npx astro build`, {
    stdio: 'inherit',
    env: { ...process.env, ASTRO_OUT_DIR: outDir },
  });

  // Find free port
  const usedPorts = entries.map((e) => e.port);
  const port = await findFreePort(BASE_PORT, usedPorts);

  // Spawn serve as a detached process
  const servePath = path.resolve('node_modules', '.bin', 'serve');
  const child = spawn(servePath, [outDir, '--listen', String(port), '--single', '--no-clipboard'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Save state
  entries.push({
    pid: child.pid!,
    port,
    branch: name,
    startedAt: new Date().toISOString(),
  });
  writeState(entries);

  console.log(`Preview running at http://localhost:${port}`);
}

function list(): void {
  let entries = pruneDeadEntries(readState());
  writeState(entries);

  if (entries.length === 0) {
    console.log('No previews running.');
    return;
  }

  console.log('');
  for (const e of entries) {
    const time = relativeTime(e.startedAt);
    console.log(`  ${e.branch.padEnd(30)} →  http://localhost:${e.port}  (started ${time})`);
  }
  console.log('');
}

function stop(target?: string): void {
  let entries = pruneDeadEntries(readState());

  const name = target || sanitizeBranch(getCurrentBranch());
  const entry = entries.find((e) => e.branch === name);

  if (!entry) {
    console.log(`No preview running for ${name}.`);
    return;
  }

  killProcess(entry.pid);
  entries = entries.filter((e) => e.branch !== name);
  writeState(entries);
  console.log(`Stopped preview for ${name}`);
}

function stopAll(): void {
  const entries = readState();
  for (const e of entries) {
    killProcess(e.pid);
  }
  writeState([]);
  console.log(`Stopped ${entries.length} preview(s).`);
}

function clean(): void {
  stopAll();
  if (fs.existsSync(PREVIEWS_DIR)) {
    fs.rmSync(PREVIEWS_DIR, { recursive: true, force: true });
  }
  console.log('Removed all previews.');
}

// CLI entry point
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'start':
    start();
    break;
  case 'list':
    list();
    break;
  case 'stop':
    stop(arg);
    break;
  case 'stop-all':
    stopAll();
    break;
  case 'clean':
    clean();
    break;
  default:
    console.log('Usage: preview.ts <start|list|stop|stop-all|clean>');
    process.exit(1);
}
