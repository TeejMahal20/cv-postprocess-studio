import fs from 'fs/promises';

const cache = new Map<string, string>();

export async function renderTemplate(
  filename: string,
  vars: Record<string, string>,
): Promise<string> {
  let raw = cache.get(filename);
  if (!raw) {
    const filePath = new URL(`./${filename}`, import.meta.url);
    raw = await fs.readFile(filePath, 'utf-8');
    cache.set(filename, raw);
  }
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}
