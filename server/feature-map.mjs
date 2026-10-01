import path from 'node:path';
import {readProjectFile} from './project.mjs';

const filler = new Set('a an and are can code do does feature for how i in is it me of on please show the this to we what where which with works'.split(' '));
const words = value => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').toLowerCase().match(/[a-z0-9]+/g) || [];
const group = (items, key) => {
  const map = new Map();
  for (const item of items) { const value = key(item); if (!map.has(value)) map.set(value, []); map.get(value).push(item); }
  return map;
};
const staticLimit = 'Static reading suggestion only: the order is not runtime execution. Dynamic calls, UI-to-API links, and external behavior are not established by these matches.';

function validationScripts(project, file) {
  const containing = (project.packages || []).map(pkg => ({...pkg, manifest:pkg.file || path.posix.join(pkg.path || '.', 'package.json')}))
    .filter(pkg => path.posix.dirname(pkg.manifest) === '.' || file.startsWith(path.posix.dirname(pkg.manifest) + '/'))
    .sort((a, b) => b.manifest.length - a.manifest.length);
  const applicable = containing.filter((pkg, index) => index === 0 || pkg.manifest === 'package.json');
  const validationName = /(?:^|[:_-])(?:tests?|lint|typecheck|type-check|checks?)(?:$|[:_-])/i;
  const validationCommand = /(?:^|[\s;&|])(?:vitest|jest|mocha|ava|tap|eslint)(?=\s|$)|\bnode\s+--test\b|\btsc\b[^;&|]*--noEmit\b|\b(?:biome|svelte-check)\s+check\b|\bplaywright\s+test\b|\bcypress\s+run\b|\b(?:npm|pnpm|yarn|bun|turbo)\s+(?:run\s+)?(?:test|lint|typecheck|check)(?=[:\s]|$)/i;
  return applicable.flatMap(pkg => Object.entries(pkg.scripts || {})
    .filter(([name, command]) => typeof command === 'string' && (validationName.test(name) || validationCommand.test(command)))
    .map(([name, command]) => ({packagePath:pkg.manifest, name, command})));
}

export async function discoverFeature(project, query, {limit = 12} = {}) {
  if (typeof query !== 'string' || query.length > 120) throw new Error('Use a feature query of at most 120 characters.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error('Choose a limit between 1 and 30.');
  query = query.trim();
  const terms = [...new Set(words(query).filter(word => !filler.has(word)))];
  const unknowns = [staticLimit];
  let limited = Boolean(project.limited);
  if (limited) unknowns.push('The project index is incomplete; additional matches may exist.');
  if (!terms.length) return {query, candidates:[], stops:[], boundaries:[], unknowns:[...unknowns, 'Enter a feature name to find indexed matches.'], limited};
  const files = new Map(project.files.map(file => [file.path, file]));
  const symbols = new Map(project.symbols.map(symbol => [symbol.id, symbol]));
  const byFile = group(project.symbols, symbol => symbol.path);
  const entries = new Map((project.entries || []).map(entry => [entry.path, entry]));
  const ranked = [];
  function add(file, symbol, textLine) {
    const tokens = new Set(words(file.path + ' ' + (symbol?.name || '')));
    const matched = terms.filter(term => tokens.has(term));
    if (!matched.length && !textLine) return;
    const full = matched.length === terms.length;
    const entry = entries.get(file.path);
    const score = (full ? 100 : matched.length / terms.length * 50) + (textLine ? 90 : 0)
      + (entry && ['api', 'page', 'startup'].includes(entry.kind) ? 25 : 0)
      + (symbol ? 5 : 0) - (file.role === 'test' ? 70 : file.role === 'generated' ? 60 : 0);
    ranked.push({path:file.path, line:textLine || symbol?.line || 1, ...(symbol && {symbol:symbol.id}),
      name:symbol?.name || path.basename(file.path),
      reason:textLine ? 'Literal source text matches the feature words; inspect this context to confirm relevance.'
        : `Indexed ${symbol ? 'symbol and path' : 'path'} matches: ${matched.join(', ')}.${entry ? ' ' + entry.reason : ''}${file.role === 'test' ? ' This is a test candidate.' : ''}`,
      score, full});
  }
  for (const file of project.files) {
    const found = byFile.get(file.path) || [];
    if (found.length) for (const symbol of found) add(file, symbol);
    else add(file);
  }
  // Only weak indexed matches trigger disk reads. Cap files and inspected text,
  // so a natural-language query never rescans a large repository in full.
  if (!ranked.some(item => item.full && files.get(item.path)?.role !== 'test')) {
    const partial = new Map(ranked.map(item => [item.path, item.score]));
    const sourceFiles = [...project.files].sort((a, b) => (partial.get(b.path) || 0) - (partial.get(a.path) || 0)
      || Number(b.role === 'source') - Number(a.role === 'source') || a.path.localeCompare(b.path));
    let searched = 0, inspected = 0, stale = false, unreadable = false;
    for (const file of sourceFiles.slice(0, 48)) {
      if (inspected >= 1_000_000) break;
      searched++;
      try {
        const data = await readProjectFile(project, file.path);
        if (data.hash !== file.hash) { stale = true; continue; }
        const allowance = Math.min(32_000, 1_000_000 - inspected);
        const content = data.content.slice(0, allowance);
        inspected += content.length;
        if (content.length < data.content.length) limited = true;
        const lines = content.split('\n');
        const line = lines.findIndex(text => terms.every(term => text.toLowerCase().includes(term)));
        if (line < 0) continue;
        const symbol = (byFile.get(file.path) || []).filter(s => s.line <= line + 1 && s.end >= line + 1).sort((a, b) => a.end - a.line - (b.end - b.line))[0];
        add(file, symbol, line + 1);
      } catch { unreadable = true; }
    }
    if (searched < sourceFiles.length || limited) {
      limited = true;
      unknowns.push('Literal source search was bounded; files or text outside the search budget may contain other matches.');
    }
    if (stale) { limited = true; unknowns.push('Some source changed since indexing and was excluded. Refresh the project index.'); }
    if (unreadable) { limited = true; unknowns.push('Some indexed files could not be read and were excluded from text search.'); }
  }
  ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line);
  const seenCandidates = new Set();
  const unique = ranked.filter(item => { const key = item.symbol || item.path; if (seenCandidates.has(key)) return false; seenCandidates.add(key); return true; });
  const candidates = unique.slice(0, limit).map(({score, full, ...item}) => item);
  if (unique.length > limit) limited = true;
  if (!candidates.length) return {query, candidates, stops:[], boundaries:[], unknowns:[...unknowns, 'No matching candidate was found in the indexed names and bounded source search. This does not prove the feature is absent.'], limited};

  const calls = group(project.calls, call => call.from);
  const imports = group(project.imports, item => item.from);
  const stops = [], queue = [{...candidates[0], via:'start', reason:'Start with this candidate and confirm the feature responsibility. ' + candidates[0].reason}];
  const queued = new Set([candidates[0].symbol || candidates[0].path]);
  const queuedPaths = new Set([candidates[0].path]);
  const unknownImports = new Set();
  function enqueue(item) {
    const key = item.symbol || item.path;
    if (queued.has(key) || (!item.symbol && queuedPaths.has(item.path))) return;
    if (queued.size >= 120) { limited = true; return; }
    queued.add(key); queuedPaths.add(item.path); queue.push(item);
  }
  while (queue.length && stops.length < limit) {
    const current = queue.shift(); stops.push(current);
    const edges = calls.get(current.symbol) || [];
    let resolvedCalls = 0;
    for (const edge of edges) {
      const target = symbols.get(edge.to);
      if (!target || !files.has(target.path)) continue;
      resolvedCalls++;
      enqueue({path:target.path, line:target.line, symbol:target.id, name:target.name, via:edge.kind || 'calls',
        reason:`${current.name} ${edge.kind || 'calls'} ${target.name} at ${current.path}:${edge.line}, according to the resolved static index.`});
    }
    for (const dependency of imports.get(current.path) || []) {
      if (!dependency.to || !files.has(dependency.to)) { unknownImports.add(dependency.specifier); continue; }
      if (resolvedCalls) continue;
      enqueue({path:dependency.to, line:1, name:path.basename(dependency.to), via:dependency.kind || 'import',
        reason:`${current.path}:${dependency.line} ${dependency.kind === 're-export' ? 're-exports' : 'imports'} ${dependency.specifier}. This supplies file context, not proof of an execution step.`});
    }
  }
  if (queue.length) limited = true;
  const stopSymbols = new Set(stops.map(s => s.symbol).filter(Boolean));
  const fileStops = new Set(stops.filter(s => !s.symbol).map(s => s.path));
  const allBoundaries = (project.boundaries || []).filter(b => stopSymbols.has(b.from) || fileStops.has(b.path));
  const boundaries = allBoundaries.slice(0, 30).map(({path, line, name, kind}) => ({path, line, name, kind:kind || 'unresolved effect candidate'}));
  if (allBoundaries.length > boundaries.length) limited = true;
  if (boundaries.length) unknowns.push('Unresolved effect candidates are stopping points. Their destinations, permissions, side effects, and results are unknown.');
  if (unknownImports.size) unknowns.push(`Imports outside the resolved index were not followed: ${[...unknownImports].slice(0, 8).join(', ')}.`);
  if (limited) unknowns.push('Results are limited; inspect additional candidates or narrow the feature query.');
  return {query, candidates, stops, boundaries, unknowns, limited};
}

export async function discoverTestEvidence(project, file, selection = '') {
  const meta = project.files.find(item => item.path === file);
  if (!meta) throw new Error('This file is not part of the readable project index.');
  const symbols = new Map(project.symbols.map(symbol => [symbol.id, symbol]));
  if (typeof selection !== 'string' || (selection && symbols.get(selection)?.path !== file)) throw new Error('Choose a valid symbol selection belonging to this file.');
  const data = await readProjectFile(project, file);
  if (data.hash !== meta.hash) throw new Error('Source changed since indexing. Refresh the project index.');
  const targets = new Set(selection ? [selection] : project.symbols.filter(s => s.path === file).map(s => s.id));
  const filePaths = new Set(project.files.map(item => item.path));
  const testsByPath = new Map(project.files.filter(f => f.role === 'test').map(f => [f.path, f]));
  const evidence = new Map(), affectedBySymbol = new Map();
  for (const edge of project.calls) {
    if (!targets.has(edge.to) || targets.has(edge.from)) continue;
    const caller = symbols.get(edge.from), target = symbols.get(edge.to);
    if (!caller || !filePaths.has(caller.path)) continue;
    if (testsByPath.has(caller.path)) evidence.set(caller.path, {path:caller.path, line:edge.line, relationship:'direct-call',
      reason:`Indexed test function ${caller.name} ${edge.kind || 'calls'} ${target.name}. This is a static relationship, not a coverage result.`});
    else if (!affectedBySymbol.has(caller.id)) affectedBySymbol.set(caller.id, {path:caller.path, line:edge.line, name:caller.name,
      reason:`Direct indexed caller: ${caller.name} ${edge.kind || 'calls'} ${target.name}; inspect whether a change to its contract affects this caller.`});
  }
  for (const dependency of project.imports) {
    if (dependency.to !== file || !testsByPath.has(dependency.from) || evidence.has(dependency.from)) continue;
    evidence.set(dependency.from, {path:dependency.from, line:dependency.line, relationship:'import',
      reason:`This test file ${dependency.kind === 're-export' ? 're-exports' : 'imports'} ${file}. A file-level dependency does not prove the selected behavior is called or asserted.`});
  }
  const base = path.basename(file).replace(/\.[^.]+$/, '').toLowerCase();
  if (!['index', 'main', 'app', 'route', 'page'].includes(base)) {
    for (const test of testsByPath.values()) {
      const testBase = path.basename(test.path).replace(/\.(?:test|spec)(?=\.)/g, '').replace(/\.[^.]+$/, '').toLowerCase();
      if (testBase !== base || evidence.has(test.path)) continue;
      evidence.set(test.path, {path:test.path, line:1, relationship:'name-match', reason:`The filename resembles ${file}; this is only a naming heuristic with no resolved call or import evidence.`});
    }
  }
  const order = {'direct-call':0, import:1, 'name-match':2};
  const allTests = [...evidence.values()].sort((a, b) => order[a.relationship] - order[b.relationship] || a.path.localeCompare(b.path));
  const allScripts = validationScripts(project, file);
  const unknowns = ['These matches do not prove coverage, assertions, or that the selected behavior is tested.', 'Commands are displayed only; tests have not been run and no passing result is claimed.', 'Only indexed direct callers are listed; dynamic and transitive effects may be missing.'];
  if (!allTests.length) unknowns.push('No matching tests were found in the index. Tests may exist under other names or outside the readable project.');
  if (project.limited) unknowns.push('The project index is incomplete; more tests or callers may exist.');
  if (allTests.length > 80 || allScripts.length > 80 || affectedBySymbol.size > 80) unknowns.push('Evidence is limited to 80 tests, scripts, and direct callers per list.');
  return {tests:allTests.slice(0, 80), scripts:allScripts.slice(0, 80), affected:[...affectedBySymbol.values()].slice(0, 80), unknowns};
}
