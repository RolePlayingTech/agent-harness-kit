import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { runInterview } from '../src/interview.mjs';
import { scanRepository } from '../src/scan.mjs';
import { NEXT_APP, project } from './helpers.mjs';

function scripted(answers) {
  const input = new PassThrough();
  let transcript = '';
  const output = new Writable({
    write(chunk, _enc, done) {
      transcript += chunk;
      if (/> $/.test(String(chunk))) setImmediate(() => input.write(`${answers.shift() ?? ''}\n`));
      done();
    },
  });
  return { input, output, transcript: () => transcript };
}

test('terminal interview accepts numbers, ids, defaults and multi-line rules, and re-asks on invalid input', async () => {
  const scan = scanRepository(project(NEXT_APP));
  const io = scripted([
    '9', '1,3',           // agents: invalid, then codex + cursor
    '',                   // summary: keep default
    'light',              // rigor by id
    '', '', 'none',       // fast keep, full keep, e2e cleared
    '3',                  // memory: handoff
    '1,2',                // approvals: push, deploy
    'Use integer cents.', '', // rules
  ]);
  const answers = await runInterview(scan, {}, io);
  assert.deepEqual(answers.agents, ['codex', 'cursor']);
  assert.equal(answers.summary, 'A shop.');
  assert.equal(answers.rigor, 'light');
  assert.equal(answers.fast, 'npm run typecheck && npm run lint');
  assert.equal(answers.e2e, 'none');
  assert.equal(answers.memory, 'handoff');
  assert.deepEqual(answers.approvals, ['push', 'deploy']);
  assert.deepEqual(answers.rules, ['Use integer cents.']);
  assert.match(io.transcript(), /Not one of the options/);
  assert.match(io.transcript(), /found: npm run typecheck \(detected, package\.json#scripts\.typecheck\)/);
});
