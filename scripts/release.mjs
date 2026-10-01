import {execFileSync} from 'node:child_process';
import {readFile, mkdir, copyFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pack = process.argv.includes('--pack');
const source = process.argv.includes('--source');
const allowed = [
  /^CONTRIBUTING\.md$/, /^LICENSE$/, /^README\.md$/, /^SECURITY\.md$/,
  /^THIRD_PARTY_NOTICES\.md$/, /^package\.json$/,
  /^docs\/demo\/(?:README\.md|code-atlas-demo\.mp4|poster\.jpg)$/,
  /^examples\/tiny-tasks\/(?:README\.md|package\.json|app\/.*\.(?:ts|tsx)|components\/.*\.tsx|lib\/.*\.ts)$/,
  /^licenses\/[^/]+$/, /^public\/(?:app\.js|index\.html|style\.css|favicon\.svg)$/,
  /^scripts\/(?:build|check|release)\.mjs$/, /^server\/[^/]+\.mjs$/,
  /^src\/[^/]+\.js$/, /^tests\/[^/]+\.test\.mjs$/
];
const required = ['LICENSE','README.md','SECURITY.md','THIRD_PARTY_NOTICES.md','public/app.js','public/index.html','server/index.mjs','src/app.js','docs/demo/README.md','docs/demo/code-atlas-demo.mp4','docs/demo/poster.jpg'];
const sourceOnly = ['.github/workflows/ci.yml','.gitignore','Start Code Atlas.command','package-lock.json','docs/testing/open-source-release-audit.md','docs/testing/backend-release-audit.md','docs/testing/workflow-release-checklist.md'];
const forbiddenText = /(?:\/Users\/(?!you\/)[^\s'"<>]+|[A-Z]:\\Users\\[^\s'"<>]+|\x73parkol|\x72ikol|\x73citools)/i;
const forbiddenName = /(?:^|\/)(?:\.env(?:\.|$)|auth\.json$|credentials\.json$|\.DS_Store$|node_modules\/|\.atlas\/|screenshots\/)/i;

async function checkFile(file) {
  if (forbiddenName.test(file)) throw new Error(`Release contains an unapproved file: ${file}`);
  if (/\.(?:js|mjs|ts|tsx|json|md|html|css|svg|yml)$/.test(file) || file === '.gitignore' || file.endsWith('.command')) {
    const contents = await readFile(path.join(root,file),'utf8');
    if (forbiddenText.test(contents)) throw new Error(`Release contains private or machine-specific text: ${file}`);
  }
}

function npmPack(extra = []) {
  const output = execFileSync(npm, ['pack','--json','--ignore-scripts',...extra], {cwd:root,encoding:'utf8',stdio:['ignore','pipe','inherit'],shell:process.platform === 'win32'});
  const result = JSON.parse(output)[0];
  if (!result?.files?.length) throw new Error('npm pack returned no files.');
  return result;
}
const preview = npmPack(['--dry-run']);
const paths = preview.files.map(file => file.path);
for (const file of paths) {
  if (!allowed.some(pattern => pattern.test(file))) throw new Error(`Release contains an unapproved file: ${file}`);
  await checkFile(file);
}
for (const file of required) if (!paths.includes(file)) throw new Error(`Release is missing ${file}`);
for (const file of sourceOnly) await checkFile(file);
if (pack) {
  await mkdir(path.join(root,'dist'), {recursive:true});
  const result = npmPack(['--pack-destination','dist']);
  const packagedPaths = result.files.map(file => file.path);
  if (JSON.stringify(packagedPaths) !== JSON.stringify(paths)) throw new Error('Archive differs from the checked preview.');
  console.log(`Created dist/${result.filename} with ${paths.length} approved files.`);
} else console.log(`Release manifest passed: ${paths.length} approved files.`);
if (source) {
  const version = JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
  const name = `code-atlas-${version}-source`;
  const output = path.join(root,'dist');
  const directory = path.join(output,name);
  await mkdir(output,{recursive:true});
  await rm(directory,{recursive:true,force:true});
  for (const file of [...paths.filter(file => file !== 'public/app.js'),...sourceOnly]) {
    const destination = path.join(directory,file);
    await mkdir(path.dirname(destination),{recursive:true});
    await copyFile(path.join(root,file),destination);
  }
  const owner = process.platform === 'linux' ? ['--owner=0','--group=0','--numeric-owner'] : ['--uid','0','--gid','0','--uname','root','--gname','root'];
  execFileSync('tar',['-czf',path.join(output,`${name}.tar.gz`),...owner,'-C',output,name],{cwd:root,stdio:'inherit'});
  console.log(`Created dist/${name}/ and dist/${name}.tar.gz with ${paths.length - 1 + sourceOnly.length} approved source files.`);
}
