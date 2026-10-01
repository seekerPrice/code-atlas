import {readdir} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
for(const dir of ['server','src','scripts'])for(const file of await readdir(new URL('../'+dir+'/',import.meta.url)))if(/\.[cm]?js$/.test(file))execFileSync(process.execPath,['--check',dir+'/'+file],{stdio:'inherit'});
console.log('All application modules passed syntax checks.');
