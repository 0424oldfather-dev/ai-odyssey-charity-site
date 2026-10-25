const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const expectedFiles = [
  '.gitignore', '.nojekyll', 'README.md', 'index.html', 'package.json', 'styles.css',
  'assets/ai-odyssey-logo.png', 'assets/hero-landscape.svg',
  'data/public-snapshot.json',
  'src/app.js', 'src/data-source.js', 'src/i18n.js', 'src/motion.js',
  'tests/site.test.js'
];

function filesUnder(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '.git') return [];
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute, base) : [path.relative(base, absolute).replaceAll('\\', '/')];
  });
}

test('repository contains only the reviewed public allowlist', () => {
  assert.deepEqual(filesUnder(root).sort(), expectedFiles.slice().sort());
});

test('all HTML and CSS assets exist and use project-relative paths', () => {
  const html = read('index.html');
  const css = read('styles.css');
  const references = [
    ...[...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]),
    ...[...css.matchAll(/url\(['"]?([^)'"]+)/g)].map(match => match[1])
  ].filter(reference => !reference.startsWith('data:'));
  for (const reference of references) {
    assert.doesNotMatch(reference, /^(?:\/|https?:)/, 'Asset must be project-relative: ' + reference);
    assert.ok(fs.existsSync(path.join(root, reference)), 'Missing asset: ' + reference);
  }
});

test('data source reads only the same-site approved JSON snapshot', async () => {
  const source = read('src/data-source.js');
  const forbiddenBridge = [
    ['google', 'script', 'run'].join('\\.'),
    ['script', 'google'].join('\\.'),
    ['docs', 'google'].join('\\.'),
    'Form' + 'App',
    'Spreadsheet' + 'App'
  ].join('|');
  assert.doesNotMatch(source, new RegExp(forbiddenBridge));
  let requested;
  const expected = JSON.parse(read('data/public-snapshot.json'));
  const context = {
    window: {},
    document: { baseURI: 'https://example.test/ai-odyssey-charity-site/' },
    URL,
    fetch: async (url, options) => {
      requested = { url: String(url), options };
      return { ok: true, json: async () => expected };
    }
  };
  vm.runInNewContext(source, context);
  const result = await context.window.CharityDataSource.load();
  assert.equal(requested.url, 'https://example.test/ai-odyssey-charity-site/data/public-snapshot.json');
  assert.equal(requested.options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), expected);
});

test('approved blank snapshot contains no financial records or fictional results', () => {
  const snapshot = JSON.parse(read('data/public-snapshot.json'));
  assert.equal(snapshot.prelaunch, true);
  assert.equal(snapshot.isDemo, false);
  assert.equal(snapshot.meta.effectiveStartDate, '2026-11-01');
  assert.equal(snapshot.meta.allocationPercent, 50);
  assert.equal(snapshot.totals.thresholdCents, 100000);
  assert.deepEqual(snapshot.monthly, []);
  assert.deepEqual(snapshot.donations, []);
  for (const field of ['commissionCents', 'allocationCents', 'donationCents', 'balanceCents', 'progress']) {
    assert.equal(snapshot.totals[field], 0);
  }
});

test('all six language resources load with the required public text', () => {
  const context = { window: {} };
  vm.runInNewContext(read('src/i18n.js'), context);
  const resources = context.window.CharityI18n;
  assert.deepEqual(Object.keys(resources), ['zh-TW', 'en', 'vi', 'id', 'th', 'ja']);
  for (const locale of Object.values(resources)) {
    for (const key of ['noMonthlyRecords', 'noDonationsYet', 'plan1', 'plan2', 'plan3', 'plan4', 'plan5']) {
      assert.equal(typeof locale[key], 'string');
      assert.ok(locale[key].trim().length > 0);
    }
  }
});

test('responsive and reduced-motion styles remain present', () => {
  const css = read('styles.css');
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test('public files contain no private backends, credentials, admin URLs, mock data, or private IDs', () => {
  const textExtensions = new Set(['.html', '.css', '.js', '.json', '.md', '.gitignore', '.nojekyll']);
  const combined = filesUnder(root)
    .filter(file => textExtensions.has(path.extname(file)) || file === '.gitignore' || file === '.nojekyll')
    .map(file => read(file))
    .join('\n');
  const privateApiNames = [
    ['google', 'script', 'run'].join('\\.'),
    'Form' + 'App', 'Spreadsheet' + 'App', 'Drive' + 'App', 'Gmail' + 'App',
    'PRIVATE' + '_BOOK_ID', 'PUBLIC' + '_BOOK_ID'
  ].join('|');
  const adminUrlParts = [
    ['docs', 'google', 'com/forms/d/'].join('\\.'),
    ['docs', 'google', 'com/spreadsheets/d/'].join('\\.'),
    ['script', 'google', 'com/home/projects/'].join('\\.')
  ].join('|');
  const secretPatterns = ['AKf' + 'ycb[a-zA-Z0-9_-]+', 'ya' + '29\\.[a-zA-Z0-9_-]+', 'refresh' + '_token', 'client' + '_secret'].join('|');
  // The public plan names the permanently excluded historical test categories,
  // but no test transaction rows or fictional result fixture may be published.
  const fixturePatterns = ['mock' + '-public-data', 'DEMO' + ' merchant'].join('|');
  assert.doesNotMatch(combined, new RegExp(privateApiNames));
  assert.doesNotMatch(combined, new RegExp(adminUrlParts));
  assert.doesNotMatch(combined, new RegExp(secretPatterns, 'i'));
  assert.doesNotMatch(combined, new RegExp(fixturePatterns));
});
