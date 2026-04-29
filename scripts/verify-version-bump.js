const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function hasRef(ref) {
  try {
    git(['rev-parse', '--verify', ref]);
    return true;
  } catch {
    return false;
  }
}

function changedFiles(base) {
  const committed = git(['diff', '--name-only', `${base}...HEAD`]);
  const working = git(['diff', '--name-only', base, '--']);
  return Array.from(new Set(
    `${committed}\n${working}`
      .split('\n')
      .map((file) => file.trim())
      .filter(Boolean)
  ));
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  assert(match, `Version must be semver x.y.z, got ${version}`);
  return match.slice(1).map(Number);
}

function compareVersions(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  for (let i = 0; i < av.length; i += 1) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
}

function readJsonAt(ref, file) {
  return JSON.parse(git(['show', `${ref}:${file}`]));
}

function readTextAt(ref, file) {
  return git(['show', `${ref}:${file}`]);
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(pkg.version, manifest.version, 'package.json and manifest.json versions must match');
parseVersion(pkg.version);

const base =
  process.env.VERSION_BUMP_BASE ||
  (hasRef('origin/main') ? 'origin/main' :
    (hasRef('origin/stable') ? 'origin/stable' : null));

if (!base) {
  console.log('PASS version files are consistent');
  process.exit(0);
}

let files = [];
try {
  files = changedFiles(base);
} catch {
  console.log('PASS version files are consistent');
  process.exit(0);
}

if (files.length === 0) {
  console.log('PASS no version bump needed for an unchanged branch');
  process.exit(0);
}

const oldManifest = readJsonAt(base, 'manifest.json');
const oldPkg = readJsonAt(base, 'package.json');
assert.equal(oldPkg.version, oldManifest.version, `Base ${base} has mismatched versions`);

const repoOnlyPatterns = [
  /^README\.md$/,
  /^LICENSE$/,
  /^privacy\.html$/,
  /^\.env\.example$/,
  /^docs\//,
  /^\.github\/(ISSUE_TEMPLATE\/|PULL_REQUEST_TEMPLATE\.md$)/,
  /^tests\/static-contracts\.test\.js$/,
  /^scripts\/verify-version-bump\.js$/,
  /^\.gitignore$/,
];
function isRepoOnlyChange(file) {
  if (repoOnlyPatterns.some((pattern) => pattern.test(file))) return true;
  if (file === 'popup.js') {
    const normalizeGuideUrl = (text) => text.replace(
      /const INSTALL_GUIDE_URL='[^']+';/,
      "const INSTALL_GUIDE_URL='INSTALL_GUIDE_URL';"
    );
    return normalizeGuideUrl(readTextAt(base, file)).trim() === normalizeGuideUrl(fs.readFileSync(file, 'utf8')).trim();
  }
  return false;
}

const requiresExtensionVersion = files.some((file) => !isRepoOnlyChange(file));
if (!requiresExtensionVersion) {
  console.log('PASS no extension version bump needed for docs/repository-only changes');
  process.exit(0);
}

assert(
  compareVersions(pkg.version, oldPkg.version) > 0,
  `Version must increase for every update. Current ${pkg.version}, base ${oldPkg.version}. Run npm run bump:version -- patch|minor|major.`
);

assert(files.includes('manifest.json'), 'manifest.json must be part of every version bump');
assert(files.includes('package.json'), 'package.json must be part of every version bump');

console.log(`PASS version bumped ${oldPkg.version} -> ${pkg.version}`);
