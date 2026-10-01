import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, stat, symlink, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAnswerStore } from '../server/answer-store.mjs';

const key = '0123456789abcdefabcd';
const answer = (overrides = {}) => ({ projectId: 'project-a', revision: 'revision-one', file: 'app.js', mode: 'explain', selection: '', range: null, createdAt: '2026-09-30T01:00:00.000Z', text: 'This function saves a task.', evidence: [{ file: 'app.js', line: 1 }], ...overrides });
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-answers-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return path.join(root, 'answers');
}

test('saved explanations are available after opening a fresh store', async t => {
  const directory = await fixture(t);
  await createAnswerStore({ directory }).set(key, answer());
  assert.deepEqual(await createAnswerStore({ directory }).get(key), answer());
  assert.equal(await createAnswerStore({ directory }).get('aaaaaaaaaaaaaaaaaaaa'), null);
});

test('history and clearing are scoped to a project and history is newest first', async t => {
  const store = createAnswerStore({ directory: await fixture(t) });
  const otherKey = 'aaaaaaaaaaaaaaaaaaaa';
  const newestKey = 'bbbbbbbbbbbbbbbbbbbb';
  await store.set(key, answer());
  await store.set(otherKey, answer({ projectId: 'project-b' }));
  const newest = answer({ createdAt: '2026-09-30T02:00:00.000Z' });
  await store.set(newestKey, newest);
  assert.deepEqual(await store.list('project-a'), [{ ...newest, key: newestKey }, { ...answer(), key }]);
  assert.equal(await store.clear('project-a'), 2);
  assert.deepEqual(await store.list('project-a'), []);
  assert.deepEqual(await store.get(otherKey), answer({ projectId: 'project-b' }));
});

test('invalid cache keys, damaged entries and oversized entries cannot be read', async t => {
  const directory = await fixture(t);
  await mkdir(directory);
  const store = createAnswerStore({ directory });
  for (const invalid of ['../outside', 'a'.repeat(21), '', null, 'A'.repeat(20)]) {
    await assert.rejects(store.get(invalid), /key/i);
    await assert.rejects(store.set(invalid, answer()), /key/i);
  }
  for (const contents of ['{broken', 'null', '{"text":"missing project"}', JSON.stringify(answer({ text: 'x'.repeat(2 * 1024 * 1024) }))]) {
    await writeFile(path.join(directory, `${key}.json`), contents);
    assert.equal(await store.get(key), null);
    assert.deepEqual(await store.list('project-a'), []);
  }
  await assert.rejects(store.set(key, answer({ text: 'x'.repeat(2 * 1024 * 1024) })), /large|size/i);
  await assert.rejects(store.set(key, null), /answer|record/i);
});

test('disk and memory stores keep only the newest answers without sharing mutable values', async t => {
  for (const directory of [await fixture(t), null]) {
    const store = createAnswerStore({ directory, maxEntries: 2 });
    const value = answer();
    await store.set(key, value);
    value.text = 'changed outside the store';
    const firstRead = await store.get(key);
    assert.equal(firstRead.text, 'This function saves a task.');
    firstRead.evidence[0].line = 99;
    assert.equal((await store.get(key)).evidence[0].line, 1);
    await store.set('bbbbbbbbbbbbbbbbbbbb', answer({ createdAt: '2026-09-30T03:00:00.000Z' }));
    await store.set('aaaaaaaaaaaaaaaaaaaa', answer({ createdAt: '2026-09-30T02:00:00.000Z' }));
    assert.equal(await store.get(key), null);
    assert.deepEqual((await store.list('project-a')).map(record => record.key), ['bbbbbbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaaaaaaaa']);
    assert.equal(await store.clear('project-a'), 2);
  }
  for (const maxEntries of [0, -1, 1.5, Infinity]) assert.throws(() => createAnswerStore({ directory: null, maxEntries }), /maxEntries/);
});

test('cache uses private permissions and never reads or overwrites symlink targets', async t => {
  const directory = await fixture(t);
  const outside = path.join(path.dirname(directory), 'outside.json');
  await writeFile(outside, JSON.stringify(answer({ text: 'Private external answer' })));
  await mkdir(directory, { mode: 0o755 });
  await symlink(outside, path.join(directory, `${key}.json`));
  const store = createAnswerStore({ directory });
  assert.equal(await store.get(key), null);
  await store.set(key, answer());
  assert.equal(JSON.parse(await readFile(outside, 'utf8')).text, 'Private external answer');
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(path.join(directory, `${key}.json`))).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(directory), [`${key}.json`]);
  const linkedDirectory = path.join(path.dirname(directory), 'linked-answers');
  await symlink(directory, linkedDirectory);
  const linkedStore = createAnswerStore({ directory: linkedDirectory });
  assert.equal(await linkedStore.get(key), null);
  await assert.rejects(linkedStore.set(key, answer()), /directory/i);
});

test('clearing history finishes before later saves and removes every matching record', async t => {
  for (const directory of [await fixture(t), null]) {
    const store = createAnswerStore({ directory, maxEntries: 2 });
    const first = store.set(key, answer());
    const cleared = store.clear('project-a');
    const later = store.set('aaaaaaaaaaaaaaaaaaaa', answer({ text: 'Saved after clearing' }));
    await Promise.all([first, cleared, later]);
    assert.equal(await store.get(key), null);
    assert.equal((await store.get('aaaaaaaaaaaaaaaaaaaa')).text, 'Saved after clearing');
  }
  const directory = await fixture(t);
  const largerStore = createAnswerStore({ directory, maxEntries: 10 });
  await largerStore.set(key, answer());
  await largerStore.set('aaaaaaaaaaaaaaaaaaaa', answer());
  await largerStore.set('bbbbbbbbbbbbbbbbbbbb', answer());
  assert.equal(await createAnswerStore({ directory, maxEntries: 1 }).clear('project-a'), 3);
});

test('retention also bounds damaged cache files while preserving unrelated files', async t => {
  const directory = await fixture(t);
  await mkdir(directory);
  await writeFile(path.join(directory, 'aaaaaaaaaaaaaaaaaaaa.json'), '{damaged');
  await writeFile(path.join(directory, 'notes.txt'), 'Leave this alone');
  const store = createAnswerStore({ directory, maxEntries: 1 });
  await store.set(key, answer());
  assert.deepEqual((await readdir(directory)).sort(), [`${key}.json`, 'notes.txt']);
  assert.deepEqual(await store.get(key), answer());
});
