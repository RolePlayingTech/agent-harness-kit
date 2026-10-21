import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { exampleNames, generateExample } from '../scripts/examples.mjs';
import { KIT } from './helpers.mjs';

function listFiles(dir) {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? listFiles(join(dir, n)) : [join(dir, n)]));
}

for (const name of exampleNames()) {
  test(`example "${name}" matches what the CLI generates today`, () => {
    const { files, explain } = generateExample(name);
    const expectedDir = join(KIT, 'examples', name, 'expected');
    const expected = Object.fromEntries(listFiles(expectedDir).map((f) => [relative(expectedDir, f).replaceAll('\\', '/'), readFileSync(f, 'utf8').replace(/\r\n/g, '\n')]));
    assert.deepEqual(Object.keys(files).sort(), Object.keys(expected).sort());
    for (const rel of Object.keys(files)) assert.equal(files[rel], expected[rel], `${name}/${rel} is stale; run npm run examples`);
    const explainFile = join(KIT, 'examples', name, 'explain.txt');
    assert.ok(existsSync(explainFile));
    assert.equal(explain, readFileSync(explainFile, 'utf8').replace(/\r\n/g, '\n'));
  });
}
