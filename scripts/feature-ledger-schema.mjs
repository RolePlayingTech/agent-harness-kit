import { readFileSync } from 'node:fs';

// Deliberately implements only the keywords used by the bundled ledger schema,
// not a general JSON Schema engine. Schema extensions must add implementation
// and regression coverage: an unsupported keyword fails closed at load time.
const supported = new Set(['$schema', '$id', 'title', 'description', 'type', 'required',
  'properties', 'items', 'enum', 'pattern', 'minLength', 'minItems', 'additionalProperties']);
const types = new Set(['string', 'object', 'array', 'null']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pointer = key => String(key).replaceAll('~', '~0').replaceAll('/', '~1');

export function compileLedgerSchema(schema) {
  function check(node, path = '#') {
    if (!object(node)) throw new Error(`Unsupported ledger schema at ${path}: expected an object`);
    for (const key of Object.keys(node)) {
      if (!supported.has(key)) throw new Error(`Unsupported ledger schema keyword ${path}/${key}`);
    }
    const invalid = message => { throw new Error(`Unsupported ledger schema at ${path}: ${message}`); };
    if (node.type !== undefined && !(Array.isArray(node.type) ? node.type : [node.type]).every(type => types.has(type))) invalid('type');
    if (node.required !== undefined && (!Array.isArray(node.required) || !node.required.every(key => typeof key === 'string'))) invalid('required');
    if (node.enum !== undefined && (!Array.isArray(node.enum) || !node.enum.length || !node.enum.every(value => value === null || ['string', 'number', 'boolean'].includes(typeof value)))) invalid('enum must contain primitives');
    for (const key of ['minLength', 'minItems']) {
      if (node[key] !== undefined && (!Number.isInteger(node[key]) || node[key] < 0)) invalid(key);
    }
    if (node.additionalProperties !== undefined && typeof node.additionalProperties !== 'boolean') invalid('additionalProperties must be boolean');
    if (node.pattern !== undefined) {
      if (typeof node.pattern !== 'string') invalid('pattern');
      new RegExp(node.pattern, 'u');
    }
    if (node.properties !== undefined) {
      if (!object(node.properties)) invalid('properties');
      for (const [key, child] of Object.entries(node.properties)) check(child, `${path}/properties/${pointer(key)}`);
    }
    if (node.items !== undefined) check(node.items, `${path}/items`);
  }
  check(schema);

  return value => {
    const errors = [];
    function visit(node, data, path = '#') {
      const add = (keyword, message) => errors.push({ path, keyword, message: `${path}: ${message}` });
      if (node.type !== undefined) {
        const allowed = Array.isArray(node.type) ? node.type : [node.type];
        const actual = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
        if (!allowed.includes(actual)) { add('type', `expected ${allowed.join(' or ')}, got ${actual}`); return; }
      }
      if (node.enum && !node.enum.includes(data)) add('enum', `must be one of ${node.enum.join(', ')}`);
      if (typeof data === 'string') {
        if (node.minLength !== undefined && [...data].length < node.minLength) add('minLength', `must contain at least ${node.minLength} characters`);
        if (node.pattern !== undefined && !new RegExp(node.pattern, 'u').test(data)) add('pattern', `must match ${node.pattern}`);
      }
      if (Array.isArray(data)) {
        if (node.minItems !== undefined && data.length < node.minItems) add('minItems', `must contain at least ${node.minItems} items`);
        if (node.items) data.forEach((item, index) => visit(node.items, item, `${path}/${index}`));
      }
      if (object(data)) {
        for (const key of node.required || []) {
          if (!Object.hasOwn(data, key)) add('required', `missing required property ${key}`);
        }
        for (const [key, item] of Object.entries(data)) {
          if (Object.hasOwn(node.properties || {}, key)) visit(node.properties[key], item, `${path}/${pointer(key)}`);
          else if (node.additionalProperties === false) add('additionalProperties', `unknown property ${key}`);
        }
      }
    }
    visit(schema, value);
    return errors;
  };
}

const canonicalSchema = JSON.parse(readFileSync(new URL('../docs/schemas/feature-list.schema.json', import.meta.url), 'utf8'));
export const validateFeatureLedger = compileLedgerSchema(canonicalSchema);
