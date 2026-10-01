import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {scanProject} from '../server/project.mjs';
import * as featureMap from '../server/feature-map.mjs';

async function fixture(t, extra = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-feature-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const files = {
    'package.json': JSON.stringify({scripts:{test:'node --test', build:'echo build'}}),
    'tsconfig.json': JSON.stringify({compilerOptions:{baseUrl:'.', paths:{'@/*':['src/*']}}}),
    'app/api/reverse-payout/route.ts': "import { reversePayout } from '@/payout';\nexport function POST() { return reversePayout(); }\n",
    'src/payout.ts': "import { recordReversal } from './ledger';\nexport function reversePayout() { return recordReversal(); }\nexport function unrelated() { return 1; }\n",
    'src/ledger.ts': "import { reversePayout } from './payout';\nexport function recordReversal() { fetch('/external'); return reversePayout(); }\n",
    'tests/direct.test.ts': "import { reversePayout } from '@/payout';\nexport function checksReversal() { return reversePayout(); }\n",
    'tests/import.test.ts': "import { unrelated } from '@/payout';\nexport const reference = unrelated;\n",
    'tests/payout.test.ts': 'export const possibleTest = true;\n',
    'tests/reverse-payout.test.ts': 'export function reversePayoutTest() { return true; }\n',
    'src/lonely.ts': 'export function lonely() { return 42; }\n',
    ...extra,
  };
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), {recursive:true});
    await writeFile(path.join(root, file), content);
  }
  return scanProject(root);
}

test('feature query ranks the real request entry over similarly named tests and follows resolved alias calls without cycles', async t => {
  assert.equal(typeof featureMap.discoverFeature, 'function');
  const project = await fixture(t);
  const result = await featureMap.discoverFeature(project, 'Where do we reverse a payout?');
  assert.equal(result.candidates[0].path, 'app/api/reverse-payout/route.ts');
  assert.equal(result.stops[0].symbol, project.symbols.find(s => s.name === 'POST').id);
  assert(result.stops.some(s => s.name === 'reversePayout' && s.via === 'calls'));
  assert(result.stops.some(s => s.name === 'recordReversal' && s.via === 'calls'));
  assert.equal(new Set(result.stops.map(s => s.symbol || s.path)).size, result.stops.length);
  assert(result.stops.every(s => s.reason));
  assert(result.boundaries.some(b => b.name === 'fetch' && b.path === 'src/ledger.ts'));
  assert(result.unknowns.some(s => /runtime|execution/i.test(s)));
  assert(!result.stops.some(s => s.path.includes('external')));
});

test('feature limits report truncation and import context never claims execution', async t => {
  assert.equal(typeof featureMap.discoverFeature, 'function');
  const project = await fixture(t, {'src/audit.ts': "import { lonely } from './lonely';\nexport const auditExport = lonely;\n"});
  const result = await featureMap.discoverFeature(project, 'reverse payout', {limit:1});
  assert.equal(result.stops.length, 1);
  assert.equal(result.limited, true);
  const imports = await featureMap.discoverFeature(project, 'audit');
  assert(imports.stops.some(s => s.path === 'src/lonely.ts' && s.via === 'import' && /context|not.*execution/i.test(s.reason)));
});

test('file-level import cycles do not repeat the feature start as another stop', async t => {
  const project = await fixture(t, {
    'src/audit.ts': "import { auditHelper } from './audit-helper';\nexport function auditTrail() { return auditHelper; }\n",
    'src/audit-helper.ts': "import { auditTrail } from './audit';\nexport const auditHelper = auditTrail;\n",
  });
  const result = await featureMap.discoverFeature(project, 'audit trail');
  assert.deepEqual(result.stops.map(s => s.path), ['src/audit.ts', 'src/audit-helper.ts']);
});

test('literal fallback stops before scanning every source file and reports the missing search space', async t => {
  const extra = Object.fromEntries(Array.from({length:65}, (_, i) => [`src/filler-${String(i).padStart(3, '0')}.ts`, 'export const value = 1;\n']));
  extra['src/zz-last.ts'] = "export const label = 'hidden feature phrase';\n";
  const project = await fixture(t, extra);
  const result = await featureMap.discoverFeature(project, 'hidden feature phrase');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.limited, true);
  assert(result.unknowns.some(s => /bounded|budget/i.test(s)));
});

test('weak feature names use literal source evidence and stale source is excluded', async t => {
  assert.equal(typeof featureMap.discoverFeature, 'function');
  const project = await fixture(t, {'src/action.ts': "export function act() { return 'cancel transfer'; }\n"});
  const result = await featureMap.discoverFeature(project, 'cancel transfer');
  assert.equal(result.candidates[0].path, 'src/action.ts');
  assert.match(result.candidates[0].reason, /literal|text/i);
  await writeFile(path.join(project.root, 'src/action.ts'), "export function act() { return 'erase balance'; }\n");
  const stale = await featureMap.discoverFeature(project, 'erase balance');
  assert.equal(stale.candidates.length, 0);
  assert(stale.unknowns.some(s => /changed|refresh/i.test(s)));
});

test('test evidence separates direct call, import-only, and filename-only relationships', async t => {
  assert.equal(typeof featureMap.discoverTestEvidence, 'function');
  const project = await fixture(t);
  const selected = project.symbols.find(s => s.name === 'reversePayout');
  const result = await featureMap.discoverTestEvidence(project, 'src/payout.ts', selected.id);
  assert.equal(result.tests.find(s => s.path === 'tests/direct.test.ts').relationship, 'direct-call');
  assert.equal(result.tests.find(s => s.path === 'tests/import.test.ts').relationship, 'import');
  assert.equal(result.tests.find(s => s.path === 'tests/payout.test.ts').relationship, 'name-match');
  assert(result.affected.some(s => s.path === 'app/api/reverse-payout/route.ts' && s.name === 'POST'));
  assert(!result.affected.some(s => s.path === 'tests/import.test.ts'));
  assert(result.scripts.some(s => s.packagePath === 'package.json' && s.name === 'test' && s.command === 'node --test'));
  assert(result.unknowns.some(s => /coverage/i.test(s)));
  assert(result.unknowns.some(s => /not.*run|not.*execut|not.*passed/i.test(s)));
});

test('validation scripts come only from the workspace root and nearest containing package', async t => {
  const project = await fixture(t, {
    'package.json': JSON.stringify({scripts:{test:'node --test', lint:'eslint .', build:'vite build', start:'node app.js', deploy:'vercel --prod', 'db:reset':'node db-reset.js'}}),
    'apps/package.json': JSON.stringify({scripts:{check:'echo intermediate'}}),
    'apps/web/package.json': JSON.stringify({scripts:{'test:unit':'vitest run', typecheck:'tsc --noEmit', qa:'jest', verify:'biome check .', dev:'vite', preview:'vite preview'}}),
    'apps/web/src/action.ts': 'export function act() { return 1; }\n',
    'apps/website/package.json': JSON.stringify({scripts:{test:'node --test'}}),
    'apps/mobile/package.json': JSON.stringify({scripts:{test:'node --test'}}),
  });
  const result = await featureMap.discoverTestEvidence(project, 'apps/web/src/action.ts');
  assert.deepEqual(result.scripts.map(s => `${s.packagePath}:${s.name}`).sort(), [
    'apps/web/package.json:qa', 'apps/web/package.json:test:unit', 'apps/web/package.json:typecheck', 'apps/web/package.json:verify', 'package.json:lint', 'package.json:test',
  ]);
  const rootFile = await featureMap.discoverTestEvidence(project, 'src/payout.ts');
  assert.deepEqual(rootFile.scripts.map(s => s.name).sort(), ['lint', 'test']);
});

test('test evidence does not invent tests or prove test absence, and only selected callers are affected', async t => {
  assert.equal(typeof featureMap.discoverTestEvidence, 'function');
  const project = await fixture(t);
  const result = await featureMap.discoverTestEvidence(project, 'src/lonely.ts');
  assert.deepEqual(result.tests, []);
  assert(result.unknowns.some(s => /no.*match|none.*found/i.test(s)));
  const unrelated = project.symbols.find(s => s.name === 'unrelated');
  const selected = await featureMap.discoverTestEvidence(project, 'src/payout.ts', unrelated.id);
  assert(!selected.tests.some(s => s.relationship === 'direct-call'));
  assert.deepEqual(selected.affected, []);
});

test('evidence rejects paths outside the index and selections belonging to another file', async t => {
  assert.equal(typeof featureMap.discoverTestEvidence, 'function');
  const project = await fixture(t);
  const other = project.symbols.find(s => s.name === 'lonely');
  await assert.rejects(featureMap.discoverTestEvidence(project, '../outside.ts'), /project|index/i);
  await assert.rejects(featureMap.discoverTestEvidence(project, 'src/payout.ts', other.id), /selection|symbol/i);
  await assert.rejects(featureMap.discoverTestEvidence(project, 'src/payout.ts', 'invented'), /selection|symbol/i);
  await assert.rejects(featureMap.discoverFeature(project, 'x'.repeat(121)), /120/);
});
