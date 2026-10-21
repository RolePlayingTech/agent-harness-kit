import * as fs from 'node:fs';
import { dirname } from 'node:path';

// Synchronous best-effort rollback, not a durable journal or a filesystem sandbox.
// The caller supplies fully validated paths and snapshots. Recheck before each write.
export function applyFilePlan(operations, assertSafe, io = fs) {
  const applied = [];
  const createdDirs = [];
  function ensureDirectory(dir) {
    if (io.existsSync(dir)) return;
    ensureDirectory(dirname(dir));
    io.mkdirSync(dir);
    createdDirs.push(dir);
  }
  try {
    for (const op of operations) {
      assertSafe(op.path);
      const current = io.existsSync(op.path) ? io.readFileSync(op.path) : null;
      if (current === null ? op.before !== null : op.before === null || !current.equals(op.before)) {
        throw new Error(`File changed after planning: ${op.path}`);
      }
      if (op.after !== null) ensureDirectory(dirname(op.path));
      if (op.after !== null && op.before === null) {
        const fd = io.openSync(op.path, 'wx');
        applied.push(op); // EEXIST must not authorize removing someone else's file.
        try { io.writeFileSync(fd, op.after); } finally { io.closeSync(fd); }
      } else {
        applied.push(op); // Include a write that fails after truncating the file.
        if (op.after === null) io.unlinkSync(op.path);
        else io.writeFileSync(op.path, op.after);
      }
    }
  } catch (cause) {
    const failures = [];
    for (const op of applied.reverse()) {
      try {
        assertSafe(op.path);
        if (op.before === null) {
          if (io.existsSync(op.path)) io.unlinkSync(op.path);
        } else io.writeFileSync(op.path, op.before);
      } catch (error) { failures.push(`${op.path}: ${error.message}`); }
    }
    for (const dir of createdDirs.reverse()) {
      try { io.rmdirSync(dir); } catch (error) { failures.push(`${dir}: ${error.message}`); }
    }
    throw new Error(failures.length
      ? `Operation failed; rollback incomplete. Restore these paths before retrying: ${failures.join('; ')}. Original error: ${cause.message}`
      : `Operation failed; prior file contents restored: ${cause.message}`, { cause });
  }
}
