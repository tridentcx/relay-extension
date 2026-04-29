#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const skipDirs = new Set(['.git', 'node_modules', '.wrangler']);
const textExts = new Set(['.js', '.json', '.html', '.md', '.sh', '.yml', '.yaml']);

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) out.push(...walk(file));
    else if (textExts.has(path.extname(file))) out.push(file);
  }
  return out;
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

test('package has no install-time dependencies', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(pkg.dependencies || {}, {});
  assert.deepEqual(pkg.devDependencies || {}, {});
  assert.equal(fs.existsSync(path.join(root, 'package-lock.json')), false);
});

test('manifest keeps CSP and permissions tight', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.deepEqual(manifest.permissions.sort(), ['bookmarks', 'storage']);
  assert.equal(manifest.host_permissions, undefined);
  const csp = manifest.content_security_policy.extension_pages;
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.match(csp, /https:\/\/mgeiplftbehngfsqtbiq\.supabase\.co/);
  assert.doesNotMatch(csp, /https:\/\/\*\.supabase\.co/);
});

test('packaged extension excludes public website and repo-only files', () => {
  const script = read('scripts/package-extension.sh');
  for (const file of ['manifest.json', 'background.js', 'config.js', 'crypto.js', 'sync.js', 'popup.html', 'popup-loader.js', 'popup.js', 'config.json', 'icons']) {
    assert.match(script, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const excluded of ['README.md', 'docs', 'pricing', 'privacy.html', '.github', 'tests', 'scripts/security-scan.js', 'icons/icon_source.svg']) {
    assert.doesNotMatch(script, new RegExp(`(^|\\s)${excluded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|\\\\|$)`));
  }
});

test('javascript avoids dynamic evaluation and broad external opens', () => {
  const code = read('popup.js') + read('sync.js') + read('popup-loader.js') + read('background.js') + read('crypto.js');
  assert.doesNotMatch(code, /\beval\s*\(/);
  assert.doesNotMatch(code, /\bFunction\s*\(/);
  assert.doesNotMatch(code, /setTimeout\s*\(\s*['"`]/);
  assert.match(read('popup.js'), /function openTrustedUrl\(/);
  assert.doesNotMatch(read('popup.js'), /chrome\.tabs\.create\(\{url:data\.url\}\)/);
});

test('html does not use inline event handlers or remote scripts', () => {
  for (const rel of ['popup.html', 'privacy.html', 'pricing/index.html', 'pricing/success.html']) {
    const html = read(rel);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${rel} has inline event handler`);
    assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i, `${rel} loads a remote script`);
  }
});

test('repository text avoids obvious private key material', () => {
  const secretPatterns = [
    /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/,
    /sk_live_[A-Za-z0-9]+/,
    /sk_test_[A-Za-z0-9]+/,
    /supabase_service_role/i,
    /ghp_[A-Za-z0-9_]{30,}/,
  ];
  const self = path.resolve(__filename);
  for (const file of walk(root)) {
    if (path.resolve(file) === self) continue;
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of secretPatterns) {
      assert.doesNotMatch(text, pattern, `${rel} matches ${pattern}`);
    }
  }
});
