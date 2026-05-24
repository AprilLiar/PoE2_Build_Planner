import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Build } from '../types/build';

// ─── Native (expo-file-system) ────────────────────────────────────────────────

const BUILDS_DIR = (FileSystem.documentDirectory ?? '') + 'builds/';

async function ensureBuildsDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(BUILDS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(BUILDS_DIR, { intermediates: true });
  }
}

async function nativeListBuilds(): Promise<{ build: Build; path: string }[]> {
  await ensureBuildsDir();
  const files = await FileSystem.readDirectoryAsync(BUILDS_DIR);
  const results: { build: Build; path: string }[] = [];
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const path = BUILDS_DIR + file;
    try {
      const build: Build = JSON.parse(await FileSystem.readAsStringAsync(path));
      results.push({ build, path });
    } catch { /* skip corrupt files */ }
  }
  results.sort((a, b) => b.build.updated_at.localeCompare(a.build.updated_at));
  return results;
}

async function nativeSaveBuild(build: Build, path?: string): Promise<string> {
  await ensureBuildsDir();
  const filePath = path ?? BUILDS_DIR + build.id + '.json';
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(build, null, 2));
  return filePath;
}

async function nativeDeleteBuild(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true });
}

async function nativeRenameBuild(path: string, newName: string): Promise<Build> {
  const build: Build = JSON.parse(await FileSystem.readAsStringAsync(path));
  const updated: Build = { ...build, name: newName, updated_at: new Date().toISOString() };
  await FileSystem.writeAsStringAsync(path, JSON.stringify(updated, null, 2));
  return updated;
}

async function nativeDuplicateBuild(build: Build): Promise<{ build: Build; path: string }> {
  await ensureBuildsDir();
  const now = new Date().toISOString();
  const newId = webGenId();
  const copy: Build = { ...build, id: newId, name: build.name + ' (Copy)', created_at: now, updated_at: now };
  const filePath = BUILDS_DIR + newId + '.json';
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(copy, null, 2));
  return { build: copy, path: filePath };
}

// ─── Web (localStorage) ───────────────────────────────────────────────────────

const LS_PREFIX = 'poe2_build_';
const LS_INDEX  = 'poe2_builds_index';

function webGenId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function lsGetIndex(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_INDEX) ?? '[]'); } catch { return []; }
}
function lsSetIndex(ids: string[]): void {
  localStorage.setItem(LS_INDEX, JSON.stringify(ids));
}
function lsRead(id: string): Build | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function lsWrite(build: Build): void {
  localStorage.setItem(LS_PREFIX + build.id, JSON.stringify(build));
  const idx = lsGetIndex();
  if (!idx.includes(build.id)) { idx.unshift(build.id); lsSetIndex(idx); }
}
function lsErase(id: string): void {
  localStorage.removeItem(LS_PREFIX + id);
  lsSetIndex(lsGetIndex().filter((i) => i !== id));
}

// On web the "path" is just the build ID — no real filesystem involved.
function webListBuilds(): Promise<{ build: Build; path: string }[]> {
  const results = lsGetIndex()
    .map((id) => { const b = lsRead(id); return b ? { build: b, path: id } : null; })
    .filter((x): x is { build: Build; path: string } => x !== null);
  results.sort((a, b) => b.build.updated_at.localeCompare(a.build.updated_at));
  return Promise.resolve(results);
}

function webSaveBuild(build: Build, path?: string): Promise<string> {
  // path is the build ID on web; use it if provided (overwrite), else generate from build.id
  const id = path ?? build.id;
  const saved = { ...build, id };
  lsWrite(saved);
  return Promise.resolve(id);
}

function webDeleteBuild(path: string): Promise<void> {
  lsErase(path);
  return Promise.resolve();
}

function webRenameBuild(path: string, newName: string): Promise<Build> {
  const build = lsRead(path);
  if (!build) return Promise.reject(new Error('Build not found'));
  const updated = { ...build, name: newName, updated_at: new Date().toISOString() };
  lsWrite(updated);
  return Promise.resolve(updated);
}

function webDuplicateBuild(build: Build): Promise<{ build: Build; path: string }> {
  const now = new Date().toISOString();
  const newId = webGenId();
  const copy: Build = { ...build, id: newId, name: build.name + ' (Copy)', created_at: now, updated_at: now };
  lsWrite(copy);
  return Promise.resolve({ build: copy, path: newId });
}

// ─── Public API — platform-transparent ────────────────────────────────────────

const isWeb = Platform.OS === 'web';

export function listBuilds(): Promise<{ build: Build; path: string }[]> {
  return isWeb ? webListBuilds() : nativeListBuilds();
}
export function saveBuild(build: Build, path?: string): Promise<string> {
  return isWeb ? webSaveBuild(build, path) : nativeSaveBuild(build, path);
}
export function deleteBuild(path: string): Promise<void> {
  return isWeb ? webDeleteBuild(path) : nativeDeleteBuild(path);
}
export function renameBuild(path: string, newName: string): Promise<Build> {
  return isWeb ? webRenameBuild(path, newName) : nativeRenameBuild(path, newName);
}
export function duplicateBuild(build: Build): Promise<{ build: Build; path: string }> {
  return isWeb ? webDuplicateBuild(build) : nativeDuplicateBuild(build);
}
