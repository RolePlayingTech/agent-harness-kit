/**
 * Real YAML Frontmatter & Agent Skills Schema Validator (Fixes Issue #9)
 * Zero-dependency, deterministic parser supporting multiline scalars (>- | >),
 * quoted strings, lists, reordered keys, duplicate key detection, and directory name matching.
 */

import { basename, dirname } from 'node:path';

const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KNOWN_OPTIONAL_KEYS = new Set([
  'version',
  'author',
  'license',
  'tags',
  'triggers',
  'allowed-tools',
  'model',
  'compatibility',
]);

/**
 * Parses YAML frontmatter from a Markdown string and validates against the Agent Skills schema.
 * @param {string} markdown
 * @param {{ filePath?: string, checkDirName?: boolean }} [options]
 */
export function validateSkillMarkdown(markdown, options = {}) {
  const errors = [];
  const warnings = [];
  const filePath = options.filePath || 'SKILL.md';

  if (typeof markdown !== 'string' || !markdown.trim()) {
    return {
      valid: false,
      data: null,
      body: '',
      errors: [{ filePath, field: 'root', line: 1, message: 'File is empty.' }],
      warnings,
    };
  }

  const lines = markdown.split(/\r?\n/);
  if (lines[0].trim() !== '---') {
    return {
      valid: false,
      data: null,
      body: markdown,
      errors: [
        {
          filePath,
          field: 'frontmatter',
          line: 1,
          message: 'Missing opening YAML frontmatter delimiter (`---`) on line 1.',
        },
      ],
      warnings,
    };
  }

  let closingLineIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closingLineIdx = i;
      break;
    }
  }

  if (closingLineIdx === -1) {
    return {
      valid: false,
      data: null,
      body: '',
      errors: [
        {
          filePath,
          field: 'frontmatter',
          line: lines.length,
          message: 'Missing closing YAML frontmatter delimiter (`---`).',
        },
      ],
      warnings,
    };
  }

  const yamlLines = lines.slice(1, closingLineIdx);
  const body = lines.slice(closingLineIdx + 1).join('\n');
  const parsed = parseYamlSubset(yamlLines, filePath);

  errors.push(...parsed.errors);
  warnings.push(...parsed.warnings);

  const data = parsed.data;

  // Validate required Agent Skills fields: `name` and `description`
  if (!Object.prototype.hasOwnProperty.call(data, 'name')) {
    errors.push({
      filePath,
      field: 'name',
      line: 1,
      message: 'Missing required frontmatter field `name`.',
    });
  } else if (typeof data.name !== 'string' || !data.name.trim()) {
    errors.push({
      filePath,
      field: 'name',
      line: parsed.keyLines.name || 1,
      message: 'Field `name` must be a non-empty string.',
    });
  } else {
    const cleanName = data.name.trim();
    if (!SKILL_NAME_REGEX.test(cleanName)) {
      errors.push({
        filePath,
        field: 'name',
        line: parsed.keyLines.name || 1,
        message: `Skill name "${cleanName}" must be kebab-case alphanumeric ([a-z0-9-]+).`,
      });
    }
    if (options.checkDirName && options.filePath) {
      const parentDir = basename(dirname(options.filePath));
      if (parentDir && parentDir !== '.' && parentDir !== 'skills' && parentDir !== cleanName) {
        warnings.push({
          filePath,
          field: 'name',
          line: parsed.keyLines.name || 1,
          message: `Skill name "${cleanName}" does not match parent directory "${parentDir}".`,
        });
      }
    }
  }

  if (!Object.prototype.hasOwnProperty.call(data, 'description')) {
    errors.push({
      filePath,
      field: 'description',
      line: 1,
      message: 'Missing required frontmatter field `description`.',
    });
  } else if (typeof data.description !== 'string' || !data.description.trim()) {
    errors.push({
      filePath,
      field: 'description',
      line: parsed.keyLines.description || 1,
      message: 'Field `description` must be a non-empty string.',
    });
  } else if (data.description.trim().length < 12) {
    warnings.push({
      filePath,
      field: 'description',
      line: parsed.keyLines.description || 1,
      message: 'Skill `description` is very short (<12 chars); provide clear activation guidance for progressive disclosure.',
    });
  }

  for (const key of Object.keys(data)) {
    if (key !== 'name' && key !== 'description' && !KNOWN_OPTIONAL_KEYS.has(key)) {
      warnings.push({
        filePath,
        field: key,
        line: parsed.keyLines[key] || 1,
        message: `Unrecognized optional frontmatter field "${key}" (allowed for forward compatibility).`,
      });
    }
  }

  if (!body.trim()) {
    errors.push({
      filePath,
      field: 'body',
      line: closingLineIdx + 1,
      message: 'Skill markdown body after frontmatter cannot be empty.',
    });
  }

  return {
    valid: errors.length === 0,
    data,
    body,
    errors,
    warnings,
  };
}

function parseYamlSubset(yamlLines, filePath) {
  const data = {};
  const keyLines = {};
  const errors = [];
  const warnings = [];

  let i = 0;
  while (i < yamlLines.length) {
    const rawLine = yamlLines[i];
    const lineNum = i + 2; // +1 for 0-index, +1 for opening `---`

    if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
      i++;
      continue;
    }

    if (rawLine.includes('\t')) {
      errors.push({
        filePath,
        field: 'syntax',
        line: lineNum,
        message: 'YAML frontmatter must use spaces for indentation, not tabs.',
      });
      i++;
      continue;
    }

    const topMatch = rawLine.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!topMatch) {
      errors.push({
        filePath,
        field: 'syntax',
        line: lineNum,
        message: `Invalid YAML key-value syntax on line ${lineNum}: "${rawLine.trim()}"`,
      });
      i++;
      continue;
    }

    const key = topMatch[1];
    const rest = topMatch[2].trim();

    if (Object.prototype.hasOwnProperty.call(data, key)) {
      errors.push({
        filePath,
        field: key,
        line: lineNum,
        message: `Duplicate YAML key "${key}" on line ${lineNum} (first defined on line ${keyLines[key]}).`,
      });
      i++;
      continue;
    }
    keyLines[key] = lineNum;

    // Case 1: Block scalar (`>-`, `>`, `|-`, `|`)
    if (rest === '>-' || rest === '>' || rest === '|-' || rest === '|') {
      const fold = rest.startsWith('>');
      const blockLines = [];
      i++;
      while (i < yamlLines.length) {
        const nextRaw = yamlLines[i];
        if (!nextRaw.trim()) {
          blockLines.push('');
          i++;
          continue;
        }
        const indentMatch = nextRaw.match(/^(\s+)(.*)$/);
        if (!indentMatch) break;
        blockLines.push(indentMatch[2]);
        i++;
      }
      data[key] = fold
        ? blockLines.join(' ').replace(/\s+/g, ' ').trim()
        : blockLines.join('\n').trim();
      continue;
    }

    // Case 2: Empty rest -> either multiline indented string or list (`- item`)
    if (rest === '') {
      const items = [];
      const scalarChunks = [];
      i++;
      while (i < yamlLines.length) {
        const nextRaw = yamlLines[i];
        if (!nextRaw.trim() || nextRaw.trim().startsWith('#')) {
          i++;
          continue;
        }
        const listMatch = nextRaw.match(/^\s*-\s+(.*)$/);
        if (listMatch) {
          items.push(unquoteScalar(listMatch[1].trim(), filePath, key, i + 2, errors));
          i++;
          continue;
        }
        const indentMatch = nextRaw.match(/^(\s+)(.*)$/);
        if (indentMatch && items.length === 0) {
          scalarChunks.push(indentMatch[2].trim());
          i++;
          continue;
        }
        break;
      }
      if (items.length > 0) {
        data[key] = items;
      } else if (scalarChunks.length > 0) {
        data[key] = scalarChunks.join(' ');
      } else {
        data[key] = '';
      }
      continue;
    }

    // Case 3: Inline array `[a, b]`
    if (rest.startsWith('[') || rest.endsWith(']')) {
      if (!rest.startsWith('[') || !rest.endsWith(']')) {
        errors.push({
          filePath,
          field: key,
          line: lineNum,
          message: `Unclosed inline array for key "${key}".`,
        });
        data[key] = [];
      } else {
        const inner = rest.slice(1, -1).trim();
        data[key] = inner
          ? inner.split(',').map((s) => unquoteScalar(s.trim(), filePath, key, lineNum, errors))
          : [];
      }
      i++;
      continue;
    }

    // Case 4: Inline scalar (possibly followed by indented continuation lines)
    const scalarParts = [unquoteScalar(rest, filePath, key, lineNum, errors)];
    i++;
    while (i < yamlLines.length) {
      const nextRaw = yamlLines[i];
      if (!nextRaw.trim()) break;
      const indentMatch = nextRaw.match(/^(\s+)(?!-\s)(.*)$/);
      if (!indentMatch) break;
      scalarParts.push(indentMatch[2].trim());
      i++;
    }
    const joined = scalarParts.join(' ');
    if (joined === 'true' || joined === 'false') {
      data[key] = joined === 'true';
    } else if (/^-?\d+(\.\d+)?$/.test(joined) && !rest.startsWith('"') && !rest.startsWith("'")) {
      data[key] = Number(joined);
    } else {
      data[key] = joined;
    }
  }

  return { data, keyLines, errors, warnings };
}

function unquoteScalar(val, filePath, key, lineNum, errors) {
  if (
    (val.startsWith('"') && !val.endsWith('"')) ||
    (val.startsWith("'") && !val.endsWith("'")) ||
    ((val.startsWith('"') || val.startsWith("'")) && val.length === 1)
  ) {
    errors.push({
      filePath,
      field: key,
      line: lineNum,
      message: `Unclosed quote in value for key "${key}".`,
    });
    return val;
  }
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  // Strip inline comment if unquoted
  const commentIdx = val.indexOf(' #');
  return commentIdx !== -1 ? val.slice(0, commentIdx).trim() : val;
}
