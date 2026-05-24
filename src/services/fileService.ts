import * as FileSystem from 'expo-file-system';
import { Build } from '../types/build';

// All build files live in this directory inside the app's document storage.
const BUILDS_DIR = FileSystem.documentDirectory + 'builds/';

// Creates the builds/ directory if it doesn't already exist.
async function ensureBuildsDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(BUILDS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(BUILDS_DIR, { intermediates: true });
  }
}

// Returns all saved builds sorted by most recently modified first.
export async function listBuilds(): Promise<{ build: Build; path: string }[]> {
  await ensureBuildsDir();
  const files = await FileSystem.readDirectoryAsync(BUILDS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const results: { build: Build; path: string }[] = [];
  for (const file of jsonFiles) {
    const path = BUILDS_DIR + file;
    try {
      const json = await FileSystem.readAsStringAsync(path);
      const build: Build = JSON.parse(json);
      results.push({ build, path });
    } catch {
      // Skip corrupt files silently — they will be cleaned up manually.
    }
  }

  // Sort newest first using the updated_at ISO string (lexicographic sort works for ISO 8601).
  results.sort((a, b) => b.build.updated_at.localeCompare(a.build.updated_at));
  return results;
}

// Saves a build to disk and returns the file path.
// Pass an existing path to overwrite; omit to create a new file with a UUID filename.
export async function saveBuild(build: Build, path?: string): Promise<string> {
  await ensureBuildsDir();
  const filePath = path ?? BUILDS_DIR + build.id + '.json';
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(build, null, 2));
  return filePath;
}

// Permanently deletes a build file.
export async function deleteBuild(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true });
}

// Renames a build by updating its name and updated_at, then re-saving to the same path.
export async function renameBuild(path: string, newName: string): Promise<Build> {
  const json = await FileSystem.readAsStringAsync(path);
  const build: Build = JSON.parse(json);
  const updated: Build = { ...build, name: newName, updated_at: new Date().toISOString() };
  await FileSystem.writeAsStringAsync(path, JSON.stringify(updated, null, 2));
  return updated;
}

// Duplicates a build under a new UUID and name (appends " (Copy)").
export async function duplicateBuild(build: Build): Promise<{ build: Build; path: string }> {
  await ensureBuildsDir();
  const now = new Date().toISOString();
  // crypto.randomUUID() is available in Hermes (Expo SDK 50+).
  const newId = crypto.randomUUID();
  const copy: Build = {
    ...build,
    id: newId,
    name: build.name + ' (Copy)',
    created_at: now,
    updated_at: now,
  };
  const filePath = BUILDS_DIR + newId + '.json';
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(copy, null, 2));
  return { build: copy, path: filePath };
}
