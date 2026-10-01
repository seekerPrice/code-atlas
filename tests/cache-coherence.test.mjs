import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/index.mjs';

test('a source edit during a cache read prevents a saved explanation being returned as current', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-cache-coherence-'));
  const projectDirectory = path.join(root, 'project');
  const cacheDirectory = path.join(root, 'answers');
  const source = path.join(projectDirectory, 'app.js');
  const originalOpen = fs.open;
  let explanationCalls = 0;
  let editedDuringCacheRead = false;
  const server = createServer({
    cacheDirectory,
    explain: async () => {
      explanationCalls++;
      return 'The function returns 1.';
    },
  });
  try {
    await fs.mkdir(projectDirectory);
    await fs.writeFile(source, 'export function value() { return 1; }\n');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const { token } = await (await fetch(base + '/api/session')).json();
    const headers = { 'X-Atlas-Token': token, 'Content-Type': 'application/json' };
    const opened = await fetch(base + '/api/project', {
      method: 'POST', headers, body: JSON.stringify({ path: projectDirectory }),
    });
    assert.equal(opened.status, 200);
    const project = await opened.json();
    const body = JSON.stringify({ revision: project.revision, file: 'app.js', mode: 'explain', question: '', history: [] });
    const requestExplanation = async () => {
      const response = await fetch(base + '/api/explain', { method: 'POST', headers, body });
      return (await response.text()).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    };
    const initialEvents = await requestExplanation();
    assert(initialEvents.some(event => event.type === 'answer' && event.cached === false));

    // Edit only when the already-generated answer is opened, after source context preparation.
    fs.open = async function (file, ...args) {
      if (!editedDuringCacheRead && typeof file === 'string' && file.startsWith(cacheDirectory + path.sep) && file.endsWith('.json')) {
        editedDuringCacheRead = true;
        await fs.writeFile(source, 'export function value() { return 2; }\n');
      }
      return originalOpen.call(this, file, ...args);
    };
    syncBuiltinESMExports();

    const events = await requestExplanation();
    assert.equal(editedDuringCacheRead, true, 'The source must change inside the saved-answer read.');
    assert.equal(events.some(event => event.type === 'answer'), false, 'An answer for the earlier source must not be emitted.');
    assert(events.some(event => event.type === 'error' && /source.*chang|refresh/i.test(event.text)));
    assert.equal(explanationCalls, 1, 'A stale cached request should not trigger another AI call.');
  } finally {
    fs.open = originalOpen;
    syncBuiltinESMExports();
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('an unrelated README edit during a cache read preserves the saved source explanation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-cache-readme-'));
  const projectDirectory = path.join(root, 'project');
  const cacheDirectory = path.join(root, 'answers');
  const originalOpen = fs.open;
  let edited = false, calls = 0;
  const server = createServer({ cacheDirectory, explain: async () => { calls++; return 'The function returns 1.'; } });
  try {
    await fs.mkdir(projectDirectory);
    await fs.writeFile(path.join(projectDirectory, 'app.js'), 'export function value() { return 1; }\n');
    await fs.writeFile(path.join(projectDirectory, 'README.md'), '# Project\n');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const { token } = await (await fetch(base + '/api/session')).json();
    const headers = { 'X-Atlas-Token': token, 'Content-Type': 'application/json' };
    const project = await (await fetch(base + '/api/project', { method: 'POST', headers, body: JSON.stringify({ path: projectDirectory }) })).json();
    const body = JSON.stringify({ revision: project.revision, file: 'app.js', mode: 'explain', question: '', history: [] });
    const explain = async () => (await (await fetch(base + '/api/explain', { method: 'POST', headers, body })).text()).trim().split('\n').map(JSON.parse);
    assert((await explain()).some(event => event.type === 'answer' && !event.cached));
    fs.open = async function (file, ...args) {
      if (!edited && typeof file === 'string' && file.startsWith(cacheDirectory + path.sep) && file.endsWith('.json')) {
        edited = true;
        await fs.writeFile(path.join(projectDirectory, 'README.md'), '# Changed during cache load\n');
      }
      return originalOpen.call(this, file, ...args);
    };
    syncBuiltinESMExports();
    const events = await explain();
    assert(edited);
    assert(events.some(event => event.type === 'answer' && event.cached && event.freshness === 'current'));
    assert.equal(calls, 1);
  } finally {
    fs.open = originalOpen;
    syncBuiltinESMExports();
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});
