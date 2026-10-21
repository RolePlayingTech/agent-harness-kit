import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderReadme } from '../scripts/examples.mjs';
import { deriveModules } from '../src/engine.mjs';
import { buildSpec } from '../src/spec.mjs';
import { scanRepository } from '../src/scan.mjs';
import { KIT, project } from './helpers.mjs';

const readme = readFileSync(join(KIT, 'README.md'), 'utf8').replace(/\r\n/g, '\n');

test('README embeds are exactly what the code produces today', () => {
  assert.ok(readme.includes('<!-- embed: '), 'README has embedded examples');
  assert.equal(renderReadme(readme), readme, 'README is stale; run npm run examples');
});

test('README documents every module the engine can produce', () => {
  const ids = deriveModules(buildSpec(scanRepository(project({})), { agents: 'codex' })).map((m) => m.id);
  for (const id of ids) assert.ok(readme.includes(`\`${id}\``), `README is missing module ${id}`);
});

test('every command and option shown in README exists', () => {
  const help = readFileSync(join(KIT, 'bin', 'agent-harness.mjs'), 'utf8');
  const commands = new Set(['scan', 'design', 'explain', 'build', 'check', 'remove', 'help']);
  for (const m of readme.matchAll(/(?:agent-harness|agent-harness-kit) (\w+)((?: --?[\w-]+)*)/g)) {
    if (!commands.has(m[1])) continue;
    for (const flag of m[2].match(/--[\w-]+/g) || []) assert.ok(help.includes(`'${flag.slice(2)}'`), `README uses unknown option ${flag} with ${m[1]}`);
  }
});
