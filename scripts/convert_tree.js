#!/usr/bin/env node
// Converts PathOfBuilding's tree.lua to tree.json for use in the PoE2 Build Planner app.
// Usage: node convert_tree.js tree.lua tree.json

const fs = require('fs');

const inputPath = process.argv[2] || 'tree.lua';
const outputPath = process.argv[3] || 'tree.json';

console.log(`Reading ${inputPath}...`);
const lua = fs.readFileSync(inputPath, 'utf8');

// Parse a Lua table string into a JS value recursively.
// The tree.lua is a pure data table (no function calls), so we can handle it
// with a hand-rolled parser rather than a full Lua interpreter.
function parseLua(src, pos = 0) {
  function skipWhitespaceAndComments() {
    while (pos < src.length) {
      // whitespace
      if (/\s/.test(src[pos])) { pos++; continue; }
      // line comment
      if (src[pos] === '-' && src[pos + 1] === '-') {
        while (pos < src.length && src[pos] !== '\n') pos++;
        continue;
      }
      break;
    }
  }

  function parseValue() {
    skipWhitespaceAndComments();
    if (pos >= src.length) return undefined;

    const ch = src[pos];

    // Table
    if (ch === '{') return parseTable();

    // String (double-quoted)
    if (ch === '"') return parseString('"');

    // String (single-quoted)
    if (ch === "'") return parseString("'");

    // Long string [[...]]
    if (ch === '[' && src[pos + 1] === '[') return parseLongString();

    // Number or negative number
    if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber();

    // Boolean / nil
    if (src.startsWith('true', pos))  { pos += 4; return true; }
    if (src.startsWith('false', pos)) { pos += 5; return false; }
    if (src.startsWith('nil', pos))   { pos += 3; return null; }

    // Identifier (unquoted string value used as keys in some places — skip unknown)
    if (/[a-zA-Z_]/.test(ch)) return parseIdentifier();

    throw new Error(`Unexpected character '${ch}' at position ${pos}: ...${src.slice(pos, pos + 40)}...`);
  }

  function parseTable() {
    pos++; // skip '{'
    const isArray = [];
    const obj = {};
    let arrayIndex = 1;

    while (true) {
      skipWhitespaceAndComments();
      if (pos >= src.length) break;
      if (src[pos] === '}') { pos++; break; }

      // Key=value or array element
      let key;
      let isExplicitKey = false;

      // [expr]=
      if (src[pos] === '[') {
        const savedPos = pos;
        pos++; // skip '['
        skipWhitespaceAndComments();
        // Check for long string [[
        if (src[pos] === '[') {
          pos = savedPos;
          // treat as array element (long string value)
        } else {
          key = parseValue();
          skipWhitespaceAndComments();
          if (src[pos] === ']') {
            pos++; // skip ']'
            skipWhitespaceAndComments();
            if (src[pos] === '=') {
              pos++; // skip '='
              isExplicitKey = true;
            } else {
              // Not a key=value, backtrack — shouldn't happen in tree.lua
              key = undefined;
              pos = savedPos;
            }
          } else {
            pos = savedPos;
          }
        }
      }

      // identifier=
      if (!isExplicitKey && /[a-zA-Z_]/.test(src[pos])) {
        const savedPos = pos;
        const ident = parseIdentifier();
        skipWhitespaceAndComments();
        if (src[pos] === '=') {
          pos++; // skip '='
          key = ident;
          isExplicitKey = true;
        } else {
          // It was a value, not a key
          pos = savedPos;
        }
      }

      const value = parseValue();

      if (isExplicitKey) {
        obj[key] = value;
      } else {
        obj[arrayIndex] = value;
        isArray.push(arrayIndex);
        arrayIndex++;
      }

      skipWhitespaceAndComments();
      // Optional comma or semicolon
      if (pos < src.length && (src[pos] === ',' || src[pos] === ';')) pos++;
    }

    // If all keys are consecutive integers starting at 1, return as array
    const keys = Object.keys(obj);
    if (
      isArray.length === keys.length &&
      keys.every((k, i) => Number(k) === i + 1)
    ) {
      return Object.values(obj);
    }

    return obj;
  }

  function parseString(quote) {
    pos++; // skip opening quote
    let str = '';
    while (pos < src.length) {
      const ch = src[pos];
      if (ch === quote) { pos++; return str; }
      if (ch === '\\') {
        pos++;
        const esc = src[pos++];
        switch (esc) {
          case 'n':  str += '\n'; break;
          case 't':  str += '\t'; break;
          case 'r':  str += '\r'; break;
          case '\\': str += '\\'; break;
          case '"':  str += '"';  break;
          case "'":  str += "'";  break;
          default:   str += esc;  break;
        }
      } else {
        str += ch;
        pos++;
      }
    }
    throw new Error('Unterminated string');
  }

  function parseLongString() {
    pos += 2; // skip '[['
    let str = '';
    while (pos < src.length) {
      if (src[pos] === ']' && src[pos + 1] === ']') { pos += 2; return str; }
      str += src[pos++];
    }
    throw new Error('Unterminated long string');
  }

  function parseNumber() {
    let numStr = '';
    if (src[pos] === '-') { numStr += '-'; pos++; }
    while (pos < src.length && /[0-9.eE+\-x]/.test(src[pos])) {
      // Stop at 'e'/'E' only if followed by sign/digit (not identifier char)
      numStr += src[pos++];
    }
    return parseFloat(numStr);
  }

  function parseIdentifier() {
    let ident = '';
    while (pos < src.length && /[a-zA-Z0-9_]/.test(src[pos])) {
      ident += src[pos++];
    }
    return ident;
  }

  // Strip leading "return " if present
  let src2 = src.trimStart();
  if (src2.startsWith('return')) {
    pos = lua.indexOf('return') + 6;
    skipWhitespaceAndComments();
  }

  return parseValue();
}

console.log('Parsing Lua...');
let raw;
try {
  raw = parseLua(lua);
} catch (e) {
  console.error('Parse error:', e.message);
  process.exit(1);
}

// Extract only what the app needs: nodes and groups.
// We drop assets (image filenames) and raw constants since the app
// will compute node x/y positions from group + orbit data.
console.log('Extracting tree data...');

const { nodes: rawNodes, groups: rawGroups, classes, constants } = raw;

// Convert Lua-style numeric-keyed objects to clean arrays/objects
function normalizeNodes(rawNodes) {
  const nodes = {};
  for (const [id, node] of Object.entries(rawNodes)) {
    const normalized = {
      id: Number(id),
      skill: node.skill ?? Number(id),
      name: node.name ?? '',
      icon: node.icon ?? '',
      stats: Array.isArray(node.stats) ? node.stats : Object.values(node.stats ?? {}),
      connections: [],
      group: node.group ?? null,
      orbit: node.orbit ?? 0,
      orbitIndex: node.orbitIndex ?? 0,
    };

    // Node type flags
    if (node.isKeystone)         normalized.isKeystone = true;
    if (node.isNotable)          normalized.isNotable = true;
    if (node.isJewelSocket)      normalized.isJewelSocket = true;
    if (node.isAscendancyStart)  normalized.isAscendancyStart = true;
    if (node.isSwitchable)       normalized.isSwitchable = true;
    if (node.isAttribute)        normalized.isAttribute = true;
    if (node.ascendancyName)     normalized.ascendancyName = node.ascendancyName;
    if (node.classesStart)       normalized.classesStart = Array.isArray(node.classesStart)
                                   ? node.classesStart
                                   : Object.values(node.classesStart);

    // Connections: [{id, orbit}, ...]
    const conns = node.connections;
    if (conns) {
      const connArr = Array.isArray(conns) ? conns : Object.values(conns);
      normalized.connections = connArr.map(c => ({ id: c.id, orbit: c.orbit ?? 0 }));
    }

    // Options (switchable nodes)
    if (node.options) {
      normalized.options = Array.isArray(node.options)
        ? node.options
        : Object.values(node.options);
    }

    nodes[id] = normalized;
  }
  return nodes;
}

function normalizeGroups(rawGroups) {
  const groups = {};
  for (const [id, group] of Object.entries(rawGroups)) {
    groups[id] = {
      id: Number(id),
      x: group.x ?? 0,
      y: group.y ?? 0,
      nodes: Array.isArray(group.nodes) ? group.nodes : Object.values(group.nodes ?? {}),
      orbits: Array.isArray(group.orbits) ? group.orbits : Object.values(group.orbits ?? {}),
      isAscendancy: group.isAscendancy ?? false,
    };
    if (group.ascendancyName) groups[id].ascendancyName = group.ascendancyName;
  }
  return groups;
}

function normalizeClasses(rawClasses) {
  return (Array.isArray(rawClasses) ? rawClasses : Object.values(rawClasses ?? {}))
    .map(cls => ({
      name: cls.name,
      baseStr: cls.baseStr ?? 0,
      baseDex: cls.baseDex ?? 0,
      baseInt: cls.baseInt ?? 0,
      ascendancies: (Array.isArray(cls.ascendancies)
        ? cls.ascendancies
        : Object.values(cls.ascendancies ?? {}))
        .map(asc => ({
          name: asc.name,
          displayName: asc.displayName ?? asc.name,
        })),
    }));
}

const output = {
  version: '0_4',
  classes: normalizeClasses(classes),
  constants: {
    orbitRadii: Array.isArray(constants?.orbitRadii)
      ? constants.orbitRadii
      : Object.values(constants?.orbitRadii ?? {}),
    skillsPerOrbit: Array.isArray(constants?.skillsPerOrbit)
      ? constants.skillsPerOrbit
      : Object.values(constants?.skillsPerOrbit ?? {}),
  },
  groups: normalizeGroups(rawGroups),
  nodes: normalizeNodes(rawNodes),
};

const nodeCount = Object.keys(output.nodes).length;
const groupCount = Object.keys(output.groups).length;
console.log(`Nodes: ${nodeCount}, Groups: ${groupCount}, Classes: ${output.classes.length}`);

console.log(`Writing ${outputPath}...`);
fs.writeFileSync(outputPath, JSON.stringify(output));
console.log('Done.');
