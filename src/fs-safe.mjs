import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/** Text as the kit sees it: UTF-8, LF line endings, no BOM. */
export function normalizeText(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

export function readText(path) {
  return normalizeText(readFileSync(path, 'utf8'));
}

export function readTextIfExists(path) {
  return existsSync(path) ? readText(path) : null;
}

/**
 * Accepts only plain relative paths made of portable segments.
 * Rejects traversal, absolute and drive paths, NUL bytes and Windows device names.
 */
export function normalizeRelPath(relPath) {
  if (typeof relPath !== 'string' || !relPath.trim() || relPath.includes('\0')) {
    throw new Error(`Unsafe path ${JSON.stringify(relPath)}: empty or contains NUL.`);
  }
  const normalized = relPath.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || isAbsolute(relPath)) {
    throw new Error(`Unsafe path "${relPath}": absolute paths are not allowed.`);
  }
  for (const part of normalized.split('/')) {
    if (!part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part)) {
      throw new Error(`Unsafe path "${relPath}": segment "${part}" is not allowed.`);
    }
  }
  return normalized;
}

function realOrResolved(path) {
  try { return realpathSync.native(path); } catch { return resolve(path); }
}

/**
 * Throws unless `fullPath` is strictly inside `root` and no existing component
 * between the root and the target is a symlink or junction. Links above the root
 * (macOS /var -> /private/var, a symlinked projects folder) are the user's choice of
 * directory and are resolved, not rejected. Existing targets must be regular files
 * with a single hard link.
 */
export function assertSafeTarget(root, fullPath) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(fullPath);
  const rel = relative(resolvedRoot, resolvedPath);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Unsafe path: ${resolvedPath} is outside ${resolvedRoot}.`);
  }
  const segments = rel.split(/[\\/]/);
  let current = resolvedRoot;
  let deepestExisting = resolvedRoot;
  for (let i = 0; i < segments.length; i++) {
    current = join(current, segments[i]);
    const isTarget = i === segments.length - 1;
    let stat = null;
    try { stat = lstatSync(current); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!stat) break;
    deepestExisting = current;
    if (stat.isSymbolicLink()) throw new Error(`Unsafe path: ${current} is a symbolic link or junction.`);
    if (isTarget && (!stat.isFile() || stat.nlink > 1)) {
      throw new Error(`Unsafe path: ${current} is not a regular single-link file.`);
    }
    if (!isTarget && !stat.isDirectory()) {
      throw new Error(`Unsafe path: ${current} is not a directory.`);
    }
  }
  const realRoot = realOrResolved(resolvedRoot);
  const realRel = relative(realRoot, realOrResolved(deepestExisting));
  if (realRel.startsWith('..') || isAbsolute(realRel)) {
    throw new Error(`Unsafe path: ${resolvedPath} resolves outside ${realRoot}.`);
  }
}

export function safeJoin(root, relPath) {
  const full = join(resolve(root), normalizeRelPath(relPath));
  assertSafeTarget(root, full);
  return full;
}
