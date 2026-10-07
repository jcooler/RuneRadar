// Keep local workspace material out of the tracked product tree.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
const privateFolder = /(^|\/)(?:\.local|\.claude|\.codex|\.agents|\.superpowers|\.playwright-mcp|artifacts|prompts|02-research|docs|relay-server)(?:\/|$)/i;
const privateFile = /(?:^|\/)(?:AGENTS|CLAUDE|OVERHAUL_PROMPT)\.md$/i;
const textExtensions = new Set(['.md','.txt','.js','.cjs','.json','.map','.html','.css','.svg','.java','.py','.gradle','.yml','.yaml','.properties','']);
const punctuation = new RegExp(String.fromCodePoint(0x2014) + '|&m' + 'dash;|&#' + '8212;|&#x' + '2014;|\\\\u' + '2014', 'i');
const failures = [];
let scanned = 0;
for (const file of files) {
  if (privateFolder.test(file) || privateFile.test(file)) failures.push('Local-only path is tracked: ' + file);
  if (!textExtensions.has(path.extname(file))) continue;
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  scanned++;
  if (punctuation.test(text)) failures.push('Disallowed punctuation: ' + file);
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Source checks passed: ${scanned} text files; local workspace material excluded.`);
