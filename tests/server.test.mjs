import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/index.mjs';
import http from 'node:http';

test('local API rejects cross-origin access and requires the private session token', async () => {
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base+'/api/project')).status,403);
    assert.equal((await fetch(base+'/api/project',{headers:{'X-Atlas-Token':'é'.repeat(64)}})).status,403);
    assert.equal((await fetch(base+'/api/session',{headers:{Origin:'https://attacker.example'}})).status,403);
    const session=await (await fetch(base+'/api/session')).json();
    assert(session.token.length>20);
    const headers={'X-Atlas-Token':session.token,'Content-Type':'application/json'};
    const opened=await fetch(base+'/api/project',{method:'POST',headers,body:JSON.stringify({demo:true})});
    assert.equal(opened.status,200);
    const project=await opened.json();
    assert.equal(project.name,'Tiny Tasks');
    const file=await fetch(base+'/api/file?path='+encodeURIComponent('../package.json'),{headers});
    assert.equal(file.status,400);
    assert.equal((await fetch(base+'/api/project',{method:'POST',headers:{...headers,Origin:'https://attacker.example'},body:'{}'})).status,403);
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('a request paused while sending its body cannot start a second explanation', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const server = createServer({ explain: async () => { calls++; await pending; return 'done'; } });
  let entered;
  const firstEntered = new Promise(resolve => { entered = resolve; });
  server.prependListener('request', req => { if(req.url === '/api/explain') entered(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let slow;
  try {
    const { token } = await (await fetch(base + '/api/session')).json();
    const headers = { 'X-Atlas-Token': token, 'Content-Type': 'application/json' };
    const project = await (await fetch(base + '/api/project', { method:'POST', headers, body:JSON.stringify({demo:true}) })).json();
    const input = JSON.stringify({ revision:project.revision, mode:'explain', file:project.files[0].path, question:'', history:[] });
    const first = new Promise((resolve, reject) => {
      slow = http.request(base + '/api/explain', { method:'POST', headers:{...headers, 'Content-Length':Buffer.byteLength(input)} }, response => {
        let text = ''; response.on('data', chunk => { text += chunk; }); response.on('end', () => resolve({status:response.statusCode,text}));
      });
      slow.on('error', reject);
      slow.write(input.slice(0, 1));
    });
    await firstEntered;
    const second = fetch(base + '/api/explain', { method:'POST', headers, body:input });
    const secondResponse = await second;
    assert.equal(secondResponse.status, 200);
    slow.end(input.slice(1));
    await new Promise(resolve => setTimeout(resolve, 250));
    release();
    const firstResponse = await first;
    assert.equal(firstResponse.status, 409);
    assert.equal(calls, 1);
    await secondResponse.text();
  } finally {
    release(); slow?.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
