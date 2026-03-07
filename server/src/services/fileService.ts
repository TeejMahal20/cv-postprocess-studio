import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { SessionState } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKSPACE_DIR = path.resolve(
  process.env.WORKSPACE_DIR || path.join(__dirname, '../../../workspace'),
);

export const sessions = new Map<string, SessionState>();

export function createSession(): string {
  const id = uuidv4();
  return id;
}

export function getSessionDir(sessionId: string): string {
  return path.join(WORKSPACE_DIR, sessionId);
}

export function getInputsDir(sessionId: string): string {
  return path.join(WORKSPACE_DIR, sessionId, 'inputs');
}

export function getImagesDir(sessionId: string): string {
  return path.join(WORKSPACE_DIR, sessionId, 'images');
}

export async function ensureImagesDir(sessionId: string): Promise<string> {
  const dir = getImagesDir(sessionId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export async function ensureInputsDir(sessionId: string): Promise<string> {
  const dir = getInputsDir(sessionId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanupOldSessions(maxAgeMs: number): Promise<void> {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt.getTime() > maxAgeMs) {
      const dir = getSessionDir(id);
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
      sessions.delete(id);
    }
  }
}

// Start cleanup interval: every 10 minutes, remove sessions > 1 hour old
setInterval(
  () => {
    cleanupOldSessions(60 * 60 * 1000).catch(console.error);
  },
  10 * 60 * 1000,
);
