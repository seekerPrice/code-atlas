import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from '../server/index.mjs';

const exec = promisify(execFile);

async function fixture(t, { files = {}, explain } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-dependencies-'));
  const projectDirectory = path.join(root, 'project');
  const cacheDirectory = path.join(root, 'answers');
  let server, base, headers, project, calls = 0;
  const write = async (name, content) => {
    await fs.mkdir(path.dirname(path.join(projectDirectory, name)), { recursive: true });
    await fs.writeFile(path.join(projectDirectory, name), content);
  };
  for (const [name, content] of Object.entries({
    'app.js': "import { value } from './value.js';\nexport function app() { return value(); }\n",
    'value.js': 'export function value() { return 1; }\n',
    'README.md': '# Project\n',
    ...files,
  })) await write(name, content);
  const request = async (route, body) => {
    const response = await fetch(base + route, { headers, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    return { response, data: await response.json() };
  };
  const close = async () => {
    server?.closeAllConnections();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
  };
  const start = async () => {
    server = createServer({ cacheDirectory, explain: async (...args) => { calls++; return explain ? explain(...args) : 'The function returns a value.'; } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const { token } = await (await fetch(base + '/api/session')).json();
    headers = { 'X-Atlas-Token': token, 'Content-Type': 'application/json' };
    project = (await request('/api/project', { path: projectDirectory })).data;
  };
  t.after(async () => { await close(); await fs.rm(root, { recursive: true, force: true }); });
  await start();
  return {
    write, request, cacheDirectory, projectDirectory,
    remove: name => fs.unlink(path.join(projectDirectory, name)),
    get project() { return project; },
    get calls() { return calls; },
    async refresh() { project = (await request('/api/refresh', {})).data; },
    async restart() { await close(); await start(); },
    async explain(extra = {}) {
      const response = await fetch(base + '/api/explain', { method: 'POST', headers, body: JSON.stringify({ revision: project.revision, file: 'app.js', mode: 'explain', question: '', history: [], ...extra }) });
      const events = (await response.text()).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      return { status: response.status, events, answer: events.find(event => event.type === 'answer') };
    },
  };
}

test('an unrelated README edit before a request does not block a source explanation', async t => {
  const app = await fixture(t);
  await app.write('README.md', '# Updated project instructions\n');
  const result = await app.explain();
  assert.equal(result.status, 200);
  assert.equal(result.answer?.freshness, 'current');
  assert.deepEqual(result.answer.dependencies.files.filter(file => file.path.endsWith('.js')).map(file => file.path).sort(), ['app.js', 'value.js']);
  assert.equal(result.answer.dependencies.files.some(file => file.path === 'README.md'), false);
});

test('an unrelated README edit during generation preserves the finished answer', async t => {
  let app;
  app = await fixture(t, { explain: async () => { await app.write('README.md', '# Changed while reading\n'); return 'A useful explanation.'; } });
  const result = await app.explain();
  assert.equal(result.answer?.text, 'A useful explanation.');
  assert.equal(result.answer?.freshness, 'current');
});

test('saved source answers survive unrelated content edits, refresh, and server restart', async t => {
  const app = await fixture(t, { files: { 'unrelated.js': 'export const other = 1;\n' } });
  const first = await app.explain();
  assert.equal(first.answer?.cached, false);
  await app.write('README.md', '# New title\n');
  await app.write('unrelated.js', 'export const other = 2;\n');
  assert.equal((await app.explain()).answer?.cached, true);
  await app.refresh();
  assert.equal((await app.explain()).answer?.cached, true);
  await app.restart();
  assert.equal((await app.explain()).answer?.cached, true);
  assert.equal(app.calls, 1);
  const { data } = await app.request('/api/answers');
  assert.equal(data.answers.length, 1);
  assert.equal(data.answers[0].freshness, 'current');
});

test('the entire supporting file is a dependency even outside its supplied excerpt', async t => {
  const original = 'export function value() { return 1; }\n' + '// filler\n'.repeat(230) + 'export const distant = 1;\n';
  const app = await fixture(t, { files: { 'value.js': original } });
  const first = await app.explain();
  assert(first.answer);
  await app.write('value.js', original.replace('distant = 1', 'distant = 2'));
  const changed = await app.explain();
  assert.equal(changed.answer, undefined);
  assert.match(JSON.stringify(changed.events), /chang|refresh/i);
  const { data } = await app.request('/api/answers');
  assert.equal(data.answers[0].freshness, 'historical');
  assert(data.answers[0].staleDependencies.includes('value.js'));
  await app.refresh();
  assert.equal((await app.explain()).answer?.cached, false);
});

test('supporting edits during generation never emit a current answer', async t => {
  let app;
  app = await fixture(t, { explain: async () => { await app.write('value.js', 'export function value() { return 2; }\n'); return 'An obsolete explanation.'; } });
  const result = await app.explain();
  assert.equal(result.answer, undefined);
  assert(result.events.some(event => event.type === 'error' && /chang|refresh/i.test(event.text)));
  assert.equal((await app.request('/api/answers')).data.answers.length, 0);
});

test('comparison excerpts and discovered tests are full-file dependencies', async t => {
  const app = await fixture(t, { files: {
    'other.js': 'export function other() { return 1; }\n',
    'checks.test.js': "import { app } from './app.js';\nexport function check() { return app(); }\n",
  } });
  const options = { mode: 'recommend', comparison: { path: 'other.js', line: 1 } };
  const first = (await app.explain(options)).answer;
  assert(first);
  for (const name of ['other.js', 'checks.test.js']) assert(first.dependencies?.files.some(file => file.path === name));
  await app.write('other.js', 'export function other() { return 2; }\n');
  assert.equal((await app.request('/api/answers')).data.answers[0].freshness, 'historical');
  await app.refresh();
  const second = (await app.explain(options)).answer;
  assert.equal(second?.cached, false);
  await app.write('checks.test.js', "import { app } from './app.js';\nexport function check() { return app() === 2; }\n");
  assert.equal((await app.request('/api/answers')).data.answers.find(answer => answer.createdAt === second.createdAt).freshness, 'historical');
});

test('newly discovered tests invalidate the earlier no-tests context', async t => {
  const app = await fixture(t);
  assert((await app.explain({ mode: 'verify' })).answer);
  await app.write('new.test.js', "import { app } from './app.js';\nexport function check() { return app(); }\n");
  assert.equal((await app.explain({ mode: 'verify' })).answer, undefined);
  assert.equal((await app.request('/api/answers')).data.answers[0].freshness, 'historical');
  await app.refresh();
  assert.equal((await app.explain({ mode: 'verify' })).answer?.cached, false);
});

test('added import targets and config changes cannot reuse a stale source graph', async t => {
  const app = await fixture(t, { files: {
    'app.js': "import { helper } from './missing.js';\nexport function app() { return helper(); }\n",
    'package.json': '{"name":"example","scripts":{"test":"node --test"}}',
  } });
  assert((await app.explain()).answer);
  await app.write('missing.js', 'export function helper() { return 1; }\n');
  assert.equal((await app.explain()).answer, undefined);
  assert.equal((await app.request('/api/answers')).data.answers[0].freshness, 'historical');
  await app.refresh();
  assert.equal((await app.explain()).answer?.cached, false);
  await app.write('package.json', '{"name":"example","scripts":{"test":"node --test tests"}}');
  const { data } = await app.request('/api/answers');
  assert(data.answers.every(answer => answer.freshness === 'historical'));
});

test('deleted supporting files are historical and overview remains project scoped', async t => {
  const app = await fixture(t);
  assert((await app.explain()).answer);
  await app.remove('value.js');
  assert.equal((await app.request('/api/answers')).data.answers[0].freshness, 'historical');
  await app.refresh();
  const overview = (await app.explain({ file: '', mode: 'overview' })).answer;
  assert.equal(overview?.dependencies.scope, 'project');
  await app.write('README.md', '# Changed overview evidence\n');
  const record = (await app.request('/api/answers')).data.answers.find(answer => answer.mode === 'overview');
  assert.equal(record.freshness, 'historical');
});

test('freshness names changed paths and legacy answers use revision fallback', async t => {
  const app = await fixture(t);
  const answer = (await app.explain()).answer;
  const saved = (await fs.readdir(app.cacheDirectory)).find(name => name.endsWith('.json'));
  const record = JSON.parse(await fs.readFile(path.join(app.cacheDirectory, saved), 'utf8'));
  delete record.dependencies;
  await fs.writeFile(path.join(app.cacheDirectory, saved), JSON.stringify(record));
  assert.equal((await app.request('/api/answers')).data.answers[0].freshness, 'current');
  await app.write('README.md', '# Legacy cache is conservative\n');
  const freshness = (await app.request('/api/freshness')).data;
  assert.equal(freshness.stale, true);
  assert.deepEqual(freshness.changedFiles, ['README.md']);
  assert.equal((await app.request('/api/answers')).data.answers[0].freshness, 'historical');
  assert(answer);
});

test('Git staging changes invalidate a saved diff answer even when working files are unchanged', async t => {
  const app = await fixture(t);
  const git = args => exec('git', args, { cwd: app.projectDirectory });
  await git(['init', '-q']);
  await git(['add', '.']);
  await git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture']);
  await app.write('app.js', 'export function app() { return 2; }\n');
  await git(['add', 'app.js']);
  await app.write('app.js', 'export function app() { return 3; }\n');
  await app.refresh();
  const diff = (await app.request('/api/diff?file=app.js&scope=staged')).data;
  const options = { mode: 'review', diff: { path: diff.path, scope: diff.scope, hash: diff.hash } };
  assert((await app.explain(options)).answer);
  await git(['add', 'app.js']);
  assert.equal((await app.request('/api/freshness')).data.stale, false, 'Staging does not change the source snapshot.');
  assert.equal((await app.request('/api/answers')).data.answers[0].freshness, 'historical');
  assert.equal((await app.explain(options)).answer, undefined);
});

test('new callers and changed TypeScript aliases refresh selected-symbol context', async t => {
  const app = await fixture(t, { files: {
    'app.js': "import { value } from '@lib/value';\nexport function app() { return value(); }\n",
    'tsconfig.json': '{"compilerOptions":{"paths":{"@lib/*":["./*"]}}}',
    'alternate/value.js': 'export function value() { return 2; }\n',
  } });
  const selection = app.project.symbols.find(symbol => symbol.path === 'app.js').id;
  const options = { selection };
  const first = (await app.explain(options)).answer;
  assert(first?.dependencies.files.some(file => file.path === 'value.js'));
  await app.write('caller.js', "import { app } from './app.js';\nexport function caller() { return app(); }\n");
  assert.equal((await app.request('/api/answers')).data.answers[0].freshness, 'historical');
  await app.refresh();
  const second = (await app.explain(options)).answer;
  assert(second?.dependencies.files.some(file => file.path === 'caller.js'));
  await app.write('tsconfig.json', '{"compilerOptions":{"paths":{"@lib/*":["./alternate/*"]}}}');
  assert.equal((await app.explain(options)).answer, undefined);
  await app.refresh();
  const third = (await app.explain(options)).answer;
  assert.equal(third?.cached, false);
  assert(third.dependencies.files.some(file => file.path === 'alternate/value.js'));
});

test('damaged dependency metadata remains readable with unknown freshness', async t => {
  const app = await fixture(t);
  assert((await app.explain()).answer);
  const saved = path.join(app.cacheDirectory, (await fs.readdir(app.cacheDirectory)).find(name => name.endsWith('.json')));
  const record = JSON.parse(await fs.readFile(saved, 'utf8'));
  record.dependencies.files = [null];
  await fs.writeFile(saved, JSON.stringify(record));
  const { response, data } = await app.request('/api/answers');
  assert.equal(response.status, 200);
  assert.equal(data.answers[0].freshness, 'unknown');
});
