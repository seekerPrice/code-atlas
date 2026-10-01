import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject, readProjectFile } from '../server/project.mjs';

test('indexes a real call path and framework entry without leaking ignored files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-test-'));
  try {
    await mkdir(path.join(root, 'app/api/tasks'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name:'test-project', dependencies:{next:'15.0.0'} }));
    await writeFile(path.join(root, '.gitignore'), 'private.ts\n');
    await writeFile(path.join(root, 'private.ts'), 'export const secret = 42');
    await writeFile(path.join(root, '.env'), 'SECRET=no');
    await writeFile(path.join(root, 'save.ts'), 'export function saveTask(title: string) { return title.trim(); }\n');
    await writeFile(path.join(root, 'app/api/tasks/route.ts'), "import { saveTask } from '../../../save';\nexport function POST() { return saveTask('hello'); }\n");
    const p = await scanProject(root);
    assert.equal(p.name, 'test-project');
    assert(!p.files.some(f => ['private.ts','.env'].includes(f.path)));
    assert(p.entries.some(e => e.path === 'app/api/tasks/route.ts'));
    const fn = p.symbols.find(s => s.name === 'saveTask');
    assert(fn);
    assert(p.calls.some(c => c.to === fn.id && p.symbols.find(s=>s.id===c.from)?.name === 'POST'));
    const file = await readProjectFile(p, 'save.ts');
    assert.match(file.content, /title.trim/);
    await assert.rejects(readProjectFile(p, '../outside.ts'));
    await assert.rejects(readProjectFile(p, '.env'));
  } finally { await rm(root, { recursive:true, force:true }); }
});

test('does not follow symlinks, including files replaced after indexing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-link-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'atlas-outside-'));
  try {
    await writeFile(path.join(outside, 'secret.ts'), 'private contents');
    await symlink(path.join(outside, 'secret.ts'), path.join(root, 'linked.ts'));
    await writeFile(path.join(root, 'safe.ts'), 'export const ok = true');
    const p = await scanProject(root);
    assert(!p.files.some(f => f.path === 'linked.ts'));
    await rm(path.join(root,'safe.ts'));
    await symlink(path.join(outside, 'secret.ts'), path.join(root,'safe.ts'));
    await assert.rejects(readProjectFile(p,'safe.ts'));
  } finally { await rm(root,{recursive:true,force:true}); await rm(outside,{recursive:true,force:true}); }
});
