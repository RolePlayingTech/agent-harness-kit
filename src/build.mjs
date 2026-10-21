import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyFilePlan } from './file-transaction.mjs';
import { assertSafeTarget, normalizeText, readTextIfExists, safeJoin, sha256 } from './fs-safe.mjs';
import { BLOCK_BEGIN, BLOCK_END, possibleOutputPaths, renderOutputs } from './render.mjs';
import { KIT_VERSION, LOCK_PATH, loadSpec } from './spec.mjs';

export function findBlock(text) {
  const begins = text.split(BLOCK_BEGIN).length - 1;
  const ends = text.split(BLOCK_END).length - 1;
  if (begins === 0 && ends === 0) return null;
  const start = text.indexOf(BLOCK_BEGIN);
  const end = text.indexOf(BLOCK_END);
  if (begins !== 1 || ends !== 1 || end < start) return { malformed: true };
  const innerStart = start + BLOCK_BEGIN.length;
  return { start, end: end + BLOCK_END.length, inner: text.slice(innerStart, end).replace(/^\n/, '').replace(/\n$/, '') };
}

export function wrapBlock(content) {
  return `${BLOCK_BEGIN}\n${content}\n${BLOCK_END}`;
}

function withBlock(text, content, position) {
  const found = findBlock(text);
  if (found) return text.slice(0, found.start) + wrapBlock(content) + text.slice(found.end);
  const body = text.replace(/\s+$/, '');
  if (!body) return `${wrapBlock(content)}\n`;
  return position === 'top' ? `${wrapBlock(content)}\n\n${text}` : `${body}\n\n${wrapBlock(content)}\n`;
}

function withoutBlock(text) {
  const found = findBlock(text);
  if (!found || found.malformed) return text;
  const result = (text.slice(0, found.start).replace(/\s+$/, '') + '\n\n' + text.slice(found.end).replace(/^\s+/, '')).trim();
  return result ? `${result}\n` : '';
}

/** The lock records what the kit wrote. It is untrusted input: it can only permit replacing bytes it hashes exactly. */
export function loadLock(root) {
  const path = safeJoin(root, LOCK_PATH);
  if (!existsSync(path)) return { entries: {} };
  let lock;
  try { lock = JSON.parse(normalizeText(readFileSync(path, 'utf8'))); } catch (error) {
    throw new Error(`${LOCK_PATH} is not valid JSON (${error.message}). Restore it from git, or delete it and rebuild with --force after reviewing the files it covered.`);
  }
  if (!lock || lock.lockVersion !== 1 || !lock.entries || typeof lock.entries !== 'object' || Array.isArray(lock.entries)) {
    throw new Error(`${LOCK_PATH} has an unexpected shape. Restore it from git before building.`);
  }
  const allowed = possibleOutputPaths();
  for (const [rel, entry] of Object.entries(lock.entries)) {
    if (!allowed.has(rel)) throw new Error(`${LOCK_PATH} lists "${rel}", which agent-harness-kit never generates. Refusing to use it.`);
    if (!entry || !['block', 'file', 'seed'].includes(entry.kind) || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) {
      throw new Error(`${LOCK_PATH} has an invalid entry for "${rel}".`);
    }
  }
  return lock;
}

function op(root, rel, before, after, action, kind, reason) {
  const path = safeJoin(root, rel);
  const raw = existsSync(path) ? readFileSync(path) : null;
  return { rel, path, raw, before, after, action, kind, reason };
}

/** Takes the managed block out of a file, unless its content is no longer exactly what the kit wrote. */
function planBlockRemoval(root, rel, current, prev, reason) {
  const found = findBlock(current);
  if (!found || found.malformed) {
    return op(root, rel, current, current, 'orphaned', 'block', 'agent-harness markers are missing or malformed; left in place for you to review');
  }
  if (sha256(found.inner) !== prev.sha256) {
    return op(root, rel, current, current, 'orphaned', 'block', 'the managed block was edited by hand; left in place, remove it yourself once your edits are saved elsewhere');
  }
  const stripped = withoutBlock(current);
  const onlyHeader = stripped.trim() === '' || (prev.createdFile && /^#[^\n]*$/.test(stripped.trim()));
  const del = onlyHeader && prev.createdFile;
  return op(root, rel, current, del ? null : stripped, del ? 'delete' : 'update', 'block', reason);
}

function encodeLike(raw, text) {
  const crlf = raw !== null && raw.includes('\r\n');
  return Buffer.from(crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}

/** Computes every change a build would make, without touching the disk. */
export function planBuild(targetDir, { force = false } = {}) {
  const root = resolve(targetDir);
  const { spec, errors } = loadSpec(root);
  if (!spec || errors.length) {
    const detail = errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`Cannot build from an invalid spec. ${detail}`);
  }
  const lock = loadLock(root);
  const out = renderOutputs(spec);
  const ops = [];
  const entries = {};

  for (const [rel, content] of Object.entries(out.blocks)) {
    const current = readTextIfExists(safeJoin(root, rel));
    const prev = lock.entries[rel];
    entries[rel] = { kind: 'block', sha256: sha256(content), createdFile: prev?.createdFile ?? current === null };
    if (current === null) {
      ops.push(op(root, rel, null, `${out.newFileHeaders[rel] || ''}${wrapBlock(content)}\n`, 'create', 'block', 'new file'));
      continue;
    }
    const found = findBlock(current);
    if (found?.malformed) {
      ops.push(op(root, rel, current, null, 'conflict', 'block', 'agent-harness markers are duplicated or out of order; fix them by hand'));
      continue;
    }
    if (!found) {
      ops.push(op(root, rel, current, withBlock(current, content, rel === 'CLAUDE.md' ? 'top' : 'bottom'), 'update', 'block', 'existing file without a managed block: block will be added, your content is kept'));
      continue;
    }
    if (found.inner === content) { ops.push(op(root, rel, current, current, 'unchanged', 'block')); continue; }
    const untouched = prev && sha256(found.inner) === prev.sha256;
    if (untouched || force) {
      ops.push(op(root, rel, current, withBlock(current, content), 'update', 'block', untouched ? 'spec changed' : 'forced over hand edits inside the managed block'));
    } else {
      ops.push(op(root, rel, current, withBlock(current, content), 'conflict', 'block', prev
        ? 'the managed block was edited by hand since the last build'
        : 'the managed block has no lock entry, so the kit cannot tell whether its content is yours'));
    }
  }

  for (const [rel, content] of Object.entries(out.files)) {
    const current = readTextIfExists(safeJoin(root, rel));
    const prev = lock.entries[rel];
    entries[rel] = { kind: 'file', sha256: sha256(content) };
    if (current === null) { ops.push(op(root, rel, null, content, 'create', 'file', 'new file')); continue; }
    if (current === content) { ops.push(op(root, rel, current, current, 'unchanged', 'file')); continue; }
    const untouched = prev && sha256(current) === prev.sha256;
    if (untouched || force) ops.push(op(root, rel, current, content, 'update', 'file', untouched ? 'spec or kit version changed' : 'forced over a file the kit does not own or that was edited'));
    else ops.push(op(root, rel, current, content, 'conflict', 'file', prev ? 'edited since the last build' : 'a file with this name exists and was not created by the kit'));
  }

  for (const [rel, content] of Object.entries(out.seeds)) {
    const current = readTextIfExists(safeJoin(root, rel));
    const prev = lock.entries[rel];
    if (current === null) {
      entries[rel] = { kind: 'seed', sha256: sha256(content) };
      ops.push(op(root, rel, null, content, 'create', 'seed', 'created once; owned by the project afterwards'));
    } else {
      // A seed the kit did not create is never recorded, so remove can never delete it.
      if (prev) entries[rel] = prev;
      ops.push(op(root, rel, current, current, 'unchanged', 'seed'));
    }
  }

  for (const [rel, prev] of Object.entries(lock.entries)) {
    if (Object.hasOwn(entries, rel)) continue;
    const current = readTextIfExists(safeJoin(root, rel));
    if (current === null) continue;
    if (prev.kind === 'block') {
      ops.push(planBlockRemoval(root, rel, current, prev, 'module disabled: managed block removed, your content is kept'));
    } else if (sha256(current) === prev.sha256) {
      ops.push(op(root, rel, current, null, 'delete', prev.kind, 'module disabled and file unchanged since the kit wrote it'));
    } else {
      ops.push(op(root, rel, current, current, 'orphaned', prev.kind, 'module disabled, but the file was edited; left in place for you to review'));
    }
  }

  const lockContent = JSON.stringify({ lockVersion: 1, generator: `agent-harness-kit@${KIT_VERSION}`, entries }, null, 2) + '\n';
  const currentLock = readTextIfExists(safeJoin(root, LOCK_PATH));
  if (currentLock !== lockContent) ops.push(op(root, LOCK_PATH, currentLock, lockContent, currentLock === null ? 'create' : 'update', 'lock', 'records what the kit wrote'));

  return { root, spec, modules: out.modules, ops, conflicts: ops.filter((o) => o.action === 'conflict') };
}

export function applyOps(root, ops) {
  const writes = ops.filter((o) => ['create', 'update', 'delete'].includes(o.action));
  applyFilePlan(writes.map((o) => ({
    path: o.path,
    before: o.raw,
    after: o.after === null ? null : encodeLike(o.raw, o.after),
  })), (full) => assertSafeTarget(root, full));
  return writes.length;
}

/** Plans removal of everything the lock says the kit wrote and still matches. The spec is kept. */
export function planRemove(targetDir) {
  const root = resolve(targetDir);
  const lock = loadLock(root);
  const ops = [];
  for (const [rel, prev] of Object.entries(lock.entries)) {
    const current = readTextIfExists(safeJoin(root, rel));
    if (current === null) continue;
    if (prev.kind === 'block') {
      ops.push(planBlockRemoval(root, rel, current, prev, 'managed block removed; your content is kept'));
    } else if (sha256(current) === prev.sha256) {
      ops.push(op(root, rel, current, null, 'delete', prev.kind, 'unchanged since the kit wrote it'));
    } else {
      ops.push(op(root, rel, current, current, 'orphaned', prev.kind, 'edited after the kit wrote it; kept'));
    }
  }
  const lockText = readTextIfExists(safeJoin(root, LOCK_PATH));
  if (lockText !== null) ops.push(op(root, LOCK_PATH, lockText, null, 'delete', 'lock', 'no longer needed'));
  return { root, ops };
}
