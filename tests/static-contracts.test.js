const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

test('manifest keeps the permission surface narrow', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.deepEqual(manifest.permissions.sort(), ['bookmarks', 'storage']);
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.doesNotMatch(manifest.description, /fully anonymous/i);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
  assert.match(manifest.content_security_policy.extension_pages, /https:\/\/relayextension\.com/);
  assert.match(manifest.content_security_policy.extension_pages, /https:\/\/api\.github\.com/);
  assert.match(manifest.content_security_policy.extension_pages, /https:\/\/mgeiplftbehngfsqtbiq\.supabase\.co/);
  assert.doesNotMatch(manifest.content_security_policy.extension_pages, /https:\/\/\*\.supabase\.co/);
  assert.doesNotMatch(manifest.content_security_policy.extension_pages, /github\.io/);
  assert.doesNotMatch(manifest.content_security_policy.extension_pages, /unsafe-inline|unsafe-eval/);
});

test('package version matches manifest version', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, manifest.version);
});

test('new account creation does not create device-local vault salts', () => {
  const popup = read('popup.js');
  assert.match(popup, /async function clearAccountSecrets\(\)/);
  assert.match(popup, /await clearAccountSecrets\(\);/);
  assert.doesNotMatch(popup, /function createAccountSalt/);
  assert.doesNotMatch(popup, /await createAccountSalt\(\)/);
});

test('browser registration fails closed on RPC or network failure', () => {
  const sync = read('sync.js');
  assert.match(sync, /verification_unavailable/);
  assert.doesNotMatch(sync, /allowed:\s*true,\s*reason:\s*['"]rpc_error['"]/);
  assert.doesNotMatch(sync, /allowed:\s*true,\s*reason:\s*['"]network['"]/);
});

test('history RPC calls include write-token ownership proof', () => {
  const sync = read('sync.js');
  assert.match(sync, /p_write_token:\s*writeToken/);
  assert.match(sync, /rpc\('save_sync_snapshot'/);
  assert.match(sync, /rpc\('list_sync_history'/);
  assert.match(sync, /rpc\('get_sync_snapshot'/);
});

test('package script excludes non-extension pages', () => {
  const script = read('scripts/package-extension.sh');
  assert.match(script, /RELAY_OUTPUT_DIR/);
  assert.match(script, /relay-extension-builds/);
  assert.match(script, /relay-extension-\$CHANNEL-v\$VERSION\.zip/);
  assert.match(script, /background\.js/);
  assert.match(script, /popup\.html/);
  assert.match(script, /popup-loader\.js/);
  assert.doesNotMatch(script, /popup-app\.html/);
  assert.doesNotMatch(script, /popup-bootstrap\.js/);
  assert.doesNotMatch(script, /relay-extension-latest\.zip/);
  assert.doesNotMatch(script, new RegExp(`stable\\|${String.fromCharCode(98, 101, 116, 97)}`));
  assert.doesNotMatch(script, /\bpricing\b/);
  assert.doesNotMatch(script, new RegExp(`pricing/${String.fromCharCode(97, 100, 109, 105, 110)}\\.html`));
  assert.doesNotMatch(script, new RegExp(`scripts/${String.fromCharCode(97, 100, 109, 105, 110)}-dashboard\\.html`));
  assert.doesNotMatch(script, /privacy\.html/);
});

test('release tooling supports checksums and live sync contract tests', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.checksums, 'bash scripts/create-checksums.sh');
  assert.equal(pkg.scripts['test:rpc'], 'node tests/sync-rpc-contract.test.js');
  assert.equal(fs.existsSync(path.join(root, 'scripts/create-checksums.sh')), true);
  assert.equal(fs.existsSync(path.join(root, 'tests/sync-rpc-contract.test.js')), true);
});

test('public docs expose direct download and install instructions', () => {
  const readme = read('README.md');
  const install = read('docs/INSTALL.md');
  assert.match(readme, /relay-extension-stable-v<version>\.zip/);
  assert.match(readme, /\[docs\/INSTALL\.md\]\(docs\/INSTALL\.md\)/);
  assert.match(readme, /github\/v\/release\/trident-cx\/relay-extension/);
  assert.doesNotMatch(readme + install, /relay-extension-latest\.zip/);
  assert.match(install, /chrome:\/\/extensions/);
  assert.match(install, /edge:\/\/extensions/);
  assert.match(install, /Load unpacked/);
  assert.match(install, /Settings.*Updates/s);
});

test('popup exposes a safe GitHub release update checker', () => {
  const popup = read('popup.js');
  const loader = read('popup-loader.js');
  const html = read('popup.html');
  assert.match(html, /id="vSignIn" class="view active"/);
  assert.match(html, /<script src="popup-loader\.js" defer><\/script>/);
  assert.match(loader, /requestAnimationFrame/);
  assert.match(loader, /popup\.js/);
  assert.doesNotMatch(html, /popup-bootstrap\.js/);
  assert.doesNotMatch(html, /popup-app\.html/);
  assert.doesNotMatch(html, /window\.location\.replace/);
  assert.doesNotMatch(html, /<script src="config\.js"/);
  assert.doesNotMatch(html, /<script src="crypto\.js"/);
  assert.doesNotMatch(html, /<script src="sync\.js"/);
  assert.doesNotMatch(html, /<script src="popup\.js"/);
  assert.match(popup, /function ensureRelayModules\(\)/);
  assert.match(popup, /function warmRelayModules\(\)/);
  assert.match(popup, /function openTrustedUrl\(/);
  assert.match(popup, /RELEASE_API_URL='https:\/\/api\.github\.com\/repos\/trident-cx\/relay-extension\/releases\/latest'/);
  assert.match(popup, /relay-extension-stable-v\$\{version\}\.zip/);
  assert.doesNotMatch(popup, /relay-extension-latest\.zip/);
  assert.match(popup, /function compareVersions/);
  assert.match(popup, /setTimeout\(\(\)=>checkForUpdates\(\{silent:true\}\)/);
  assert.match(popup, /openTrustedUrl\(updateDownloadUrl, RELEASES_URL\)/);
  assert.match(html, /id="btnCheckUpdate"/);
  assert.match(html, /id="btnDownloadUpdate"/);
});

test('popup keeps fixed startup size while allowing tall views to scroll', () => {
  const html = read('popup.html');
  const popup = read('popup.js');
  assert.match(html, /html,\s*body\s*\{[\s\S]*width:\s*360px[\s\S]*height:\s*600px/);
  assert.match(html, /html\s*\{\s*overflow:\s*hidden;\s*\}/);
  assert.match(html, /body\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.doesNotMatch(html, /(^|\n)body\s*\{[^}]*overflow:\s*hidden/m);
  assert.match(popup, /document\.body\.scrollTop\s*=\s*0/);
  assert.match(popup, /document\.documentElement\.scrollTop\s*=\s*0/);
});

test('repository has GitHub navigation and intake templates', () => {
  assert.match(read('.github/ISSUE_TEMPLATE/bug_report.yml'), /do not include passwords/i);
  assert.match(read('.github/ISSUE_TEMPLATE/config.yml'), /Versioned downloads/);
  assert.match(read('.github/PULL_REQUEST_TEMPLATE.md'), /Version bumped/);
});

test('store submission assets avoid synthetic screenshots', () => {
  const pkg = JSON.parse(read('package.json'));
  const listing = read('docs/GOOGLE_STORE_SUBMISSION.md');
  const assets = [
    'icons/icon16.png',
    'icons/icon48.png',
    'icons/icon128.png',
    'store-assets/relay-logo.svg',
    'store-assets/promotional/small-promo-440x280.png',
    'store-assets/promotional/marquee-promo-1400x560.png',
    'store-assets/google-submission/store-icon-128.png',
    'store-assets/google-submission/promo-small-440x280.png',
    'store-assets/google-submission/promo-marquee-1400x560.png',
  ];
  assert.equal(pkg.scripts['assets:store'], 'node scripts/generate-store-assets.js');
  for (const asset of assets) {
    assert.equal(fs.existsSync(path.join(root, asset)), true, `${asset} is missing`);
    assert.match(listing, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(listing, /store-assets\/google-submission\/screenshot-/);
  assert.match(listing, /Capture real installed-extension screenshots manually/);
  assert.equal(fs.existsSync(path.join(root, 'store-assets/screenshots')), false);
  assert.doesNotMatch(read('scripts/generate-store-assets.js'), /function screenshot[A-Z]/);
});

test('branch workflow is documented and checked in CI', () => {
  const checks = read('.github/workflows/checks.yml');
  assert.doesNotMatch(checks, /- stable/);
  assert.doesNotMatch(checks, new RegExp(`- ${String.fromCharCode(98, 101, 116, 97)}`));
  assert.match(checks, /- main/);
});

test('public repo excludes private operations materials', () => {
  const pkg = JSON.parse(read('package.json'));
  const trackedFiles = new Set(walk(root).map((file) => path.relative(root, file)));
  assert.equal(read('CNAME').trim(), 'relayextension.com');
  assert.equal(pkg.scripts[`${String.fromCharCode(97, 100, 109, 105, 110)}:deploy`], undefined);
  assert.equal(pkg.scripts[`${String.fromCharCode(97, 100, 109, 105, 110)}:worker`], undefined);
  assert.equal(pkg.scripts['backup:release'], undefined);
  for (const file of trackedFiles) {
    const privatePattern = `(^|/)(supabase|wrangler\\.${String.fromCharCode(97, 100, 109, 105, 110)}\\.toml|deploy-${String.fromCharCode(97, 100, 109, 105, 110)}\\.sh|${String.fromCharCode(97, 100, 109, 105, 110)}-worker|${String.fromCharCode(97, 100, 109, 105, 110)}-dashboard|rollback-release|create-release-backup)`;
    assert.doesNotMatch(file, new RegExp(privatePattern));
  }
  const publicDocs = read('README.md') + read('docs/CONTRIBUTING.md') + read('docs/CHANGELOG.md');
  const privateHost = `${String.fromCharCode(97, 100, 109, 105, 110)}\\.relayextension\\.com`;
  assert.doesNotMatch(publicDocs, new RegExp(`${privateHost}|wrangler|operator dashboard|private operator|backend audit|supabase/migrations`, 'i'));
});

test('public urls use relayextension domain', () => {
  const publicFiles = read('README.md') + read('popup.js') + read('popup-loader.js') + read('popup.html') + read('sync.js') + read('privacy.html') + read('pricing/index.html') + read('pricing/success.html') + read('manifest.json');
  const restrictedMenuLabel = new RegExp(`>${String.fromCharCode(79, 112, 101, 110)} ${String.fromCharCode(83, 111, 117, 114, 99, 101)}<`);
  const previousOwner = String.fromCharCode(116, 114, 105, 100, 101, 110, 116, 99, 120);
  assert.match(publicFiles, /https:\/\/relayextension\.com/);
  assert.doesNotMatch(publicFiles, new RegExp(`${previousOwner}\\.github\\.io\\/relay-extension|${previousOwner}\\/relay-extension`));
  assert.doesNotMatch(publicFiles, /trident-cx\.github\.io/);
  assert.doesNotMatch(publicFiles, restrictedMenuLabel);
});

test('chrome-loadable root has no reserved underscore files', () => {
  const rootFiles = fs.readdirSync(root);
  assert.deepEqual(rootFiles.filter((name) => name.startsWith('_')), []);
});

test('public repo avoids unwanted platform and licensing language', () => {
  const restrictedLicensePhrase = new RegExp(`open[\\s-]?${String.fromCharCode(115, 111, 117, 114, 99, 101)}`, 'i');
  const restrictedPlatform = new RegExp(String.fromCharCode(115, 97, 102, 97, 114, 105), 'i');
  const removedPlatformHelper = `convert-to-${String.fromCharCode(115, 97, 102, 97, 114, 105)}.sh`;
  const trackedFiles = walk(root).filter((file) => {
    const rel = path.relative(root, file);
    return !rel.startsWith('.git/') && !rel.startsWith('node_modules/') && !/\.(png|jpg|jpeg|zip)$/i.test(rel);
  });
  for (const file of trackedFiles) {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, restrictedLicensePhrase, `${rel} references restricted license wording`);
    assert.doesNotMatch(text, restrictedPlatform, `${rel} references a removed platform`);
  }
  assert.equal(fs.existsSync(path.join(root, removedPlatformHelper)), false);
});

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === '.wrangler') continue;
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) out.push(...walk(file));
    else out.push(file);
  }
  return out;
}
