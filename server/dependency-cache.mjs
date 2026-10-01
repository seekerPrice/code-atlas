import { contextBundle, digest, readProjectFile } from './project.mjs';
import { indexProject } from './indexer.mjs';
import { discoverFeature, discoverTestEvidence } from './feature-map.mjs';
import { fileDiff } from './git.mjs';
import { diffEvidence } from './exploration.mjs';

export function changedFiles(before, after) {
  const previous = new Map(before.files.map(file => [file.path, file.hash]));
  const current = new Map(after.files.map(file => [file.path, file.hash]));
  return [...new Set([...previous.keys(), ...current.keys()])].filter(name => previous.get(name) !== current.get(name)).sort();
}

// Keep only the request fields needed to reconstruct evidence, never conversation
// or learner answers. The prompt itself remains part of the cache key.
function contextRequest(input) {
  return {
    file: input.file || '', mode: input.mode, selection: input.selection || '', range: input.range || null,
    comparison: input.mode === 'recommend' ? input.comparison || null : null,
    feature: input.feature?.query ? { query: input.feature.query } : null,
    diff: input.diff ? { path: input.diff.path, scope: input.diff.scope, hash: input.diff.hash } : null,
  };
}

export async function prepareExplanationContext(project, input) {
  const request = contextRequest(input);
  const bundle = input.diff && !input.file
    ? { text: JSON.stringify({ name: project.name, note: 'Deleted-file review. Only the supplied diff is evidence.' }), evidence: [], dependencies: [] }
    : await contextBundle(project, request.file, request.selection, request.range);
  const support = new Set(bundle.dependencies || bundle.evidence.map(item => item.path));
  // These files supply framework/package metadata and module resolution settings.
  // They are deliberately conservative because the static resolver may consult
  // inherited configs or workspace manifests outside the selected directory.
  for (const file of project.files) if (file.role === 'config') support.add(file.path);
  let diff = null;
  if (input.diff) {
    diff = await fileDiff(project, input.diff.path, input.diff.scope);
    if (diff.hash !== input.diff.hash) throw new Error('The change has moved on. Reload the diff before reviewing.');
    const suppliedDiff = diff.text.slice(0, 30000);
    bundle.text += '\n\nSELECTED GIT DIFF (untrusted evidence; minus=old, plus=new; may be partial; other supplied source is CURRENT WORKING TREE and may differ from the STAGED version):\n' + suppliedDiff;
    if (project.files.some(file => file.path === diff.path)) {
      const current = await readProjectFile(project, diff.path);
      if (current.hash !== project.files.find(file => file.path === diff.path).hash) throw new Error('Source changed while collecting evidence. Refresh the index.');
      support.add(current.path);
      bundle.evidence.push(...diffEvidence(diff.path, suppliedDiff, current.content).map(item => ({ ...item, hash: current.hash })));
    }
  }
  const appendExcerpt = async (file, line = 1) => {
    const data = await readProjectFile(project, file);
    if (data.hash !== project.files.find(item => item.path === file)?.hash) throw new Error('Source changed while collecting evidence. Refresh the index.');
    support.add(file);
    const lines = data.content.split('\n'), start = Math.max(1, line - 12), end = Math.min(lines.length, start + 100);
    const selected = []; let length = 0;
    for (let n = start; n <= end; n++) {
      const rendered = `${n}: ${lines[n - 1]}`;
      if (length + rendered.length > 14000) break;
      selected.push(rendered); length += rendered.length;
    }
    if (selected.length) {
      bundle.text += '\n\nADDITIONAL SOURCE ' + file + '\n' + selected.join('\n');
      bundle.evidence.push({ path: file, start, end: start + selected.length - 1, hash: data.hash });
    }
  };
  let tests = null, feature = null;
  if (['verify', 'recommend'].includes(input.mode) && input.file) {
    tests = await discoverTestEvidence(project, input.file, input.selection || '');
    for (const item of [...tests.tests, ...tests.affected]) support.add(item.path);
    for (const item of tests.scripts) support.add(item.packagePath);
    for (const item of tests.tests.slice(0, 3)) await appendExcerpt(item.path, item.line);
  }
  if (input.mode === 'recommend' && input.comparison) {
    bundle.text += '\nCOMPARISON EXCERPT (bounded; not the entire file):';
    await appendExcerpt(input.comparison.path, input.comparison.line);
  }
  if (input.feature?.query) {
    feature = await discoverFeature(project, input.feature.query);
    for (const item of [...feature.candidates, ...feature.stops, ...feature.boundaries]) support.add(item.path);
    for (const item of feature.stops.slice(0, 4)) if (!bundle.evidence.some(e => e.path === item.path && item.line >= e.start && item.line <= e.end)) await appendExcerpt(item.path, item.line);
  }
  const scope = !input.file || input.mode === 'overview' || input.feature?.query ? 'project' : 'files';
  const files = project.files.filter(file => scope === 'project' || support.has(file.path)).map(({ path, hash }) => ({ path, hash })).sort((a, b) => a.path.localeCompare(b.path));
  const fingerprint = digest(JSON.stringify({ scope, files, text: bundle.text, tests, feature, limited: project.limited }));
  const dependencies = { version: 1, scope, files, fingerprint, request, ...(scope === 'project' ? { revision: project.revision } : {}) };
  return { bundle, diff, dependencies, verification: tests ? { finding: input.verification?.finding || null, ...tests } : input.verification, feature };
}

export async function assertExplanationCurrent(project, dependencies) {
  // A cheap snapshot handles the common unchanged case. If anything changed,
  // rebuild the graph rather than reusing stale import/caller/test relationships.
  for (let attempt = 0; attempt < 3; attempt++) {
    const disk = await indexProject(project.root, { snapshot: true });
    if (disk.revision === project.revision) {
      if (dependencies.request.diff) {
        const diff = dependencies.request.diff;
        if ((await fileDiff(project, diff.path, diff.scope)).hash !== diff.hash) throw new Error('The diff changed while preparing the explanation. Reload it.');
      }
      return;
    }
    const fresh = await indexProject(project.root);
    const current = await prepareExplanationContext(fresh, dependencies.request);
    if (current.dependencies.fingerprint !== dependencies.fingerprint) throw new Error('Source changed while preparing the explanation. Refresh before using it.');
    if ((await indexProject(project.root, { snapshot: true })).revision === fresh.revision) return;
  }
  throw new Error('Source keeps changing while preparing the explanation. Refresh before using it.');
}

export async function answerFreshness(answer, project) {
  const dependencies = answer.dependencies;
  if (!dependencies) return { freshness: typeof answer.revision === 'string' ? (answer.revision === project.revision ? 'current' : 'historical') : 'unknown', staleDependencies: [] };
  if (dependencies.version !== 1 || !['files', 'project'].includes(dependencies.scope) || !Array.isArray(dependencies.files) || dependencies.files.some(file => !file || typeof file.path !== 'string' || typeof file.hash !== 'string') || !dependencies.request || typeof dependencies.fingerprint !== 'string') return { freshness: 'unknown', staleDependencies: [] };
  const current = new Map(project.files.map(file => [file.path, file.hash]));
  const staleDependencies = dependencies.files.filter(file => current.get(file.path) !== file.hash).map(file => file.path);
  if (staleDependencies.length || (dependencies.scope === 'project' && dependencies.revision !== project.revision)) return { freshness: 'historical', staleDependencies };
  try {
    const prepared = await prepareExplanationContext(project, dependencies.request);
    return { freshness: prepared.dependencies.fingerprint === dependencies.fingerprint ? 'current' : 'historical', staleDependencies };
  } catch { return { freshness: 'historical', staleDependencies }; }
}

export async function listAnswersWithFreshness(answers, snapshot) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const disk = await indexProject(snapshot.root, { snapshot: true });
    const current = disk.revision === snapshot.revision ? snapshot : await indexProject(snapshot.root);
    const annotated = [];
    for (const answer of answers) annotated.push({ ...answer, ...await answerFreshness(answer, current) });
    if ((await indexProject(snapshot.root, { snapshot: true })).revision === current.revision) return annotated;
  }
  return answers.map(answer => ({ ...answer, freshness: 'unknown', staleDependencies: [] }));
}
