import test from 'node:test';
import assert from 'node:assert/strict';
import { codexEnvironment, executionArgs, extractAnswer, buildPrompt } from '../server/codex.mjs';

test('removes API billing credentials while retaining normal ChatGPT credential location', () => {
  const env = codexEnvironment({ PATH:'/bin', HOME:'/home/a', CODEX_HOME:'/home/a/.codex', OPENAI_API_KEY:'secret', CODEX_API_KEY:'secret2', OPENAI_BASE_URL:'https://other', CODEX_API_BASE_URL:'https://other' });
  assert.equal(env.HOME,'/home/a');
  assert.equal(env.CODEX_HOME,'/home/a/.codex');
  assert.equal(env.OPENAI_API_KEY,undefined);
  assert.equal(env.CODEX_API_KEY,undefined);
  assert.equal(env.OPENAI_BASE_URL,undefined);
  assert.equal(env.CODEX_API_BASE_URL,undefined);
  const args = executionArgs('/tmp/empty');
  assert(args.includes('forced_login_method="chatgpt"'));
  assert(args.includes('--ignore-user-config'));
  assert(args.includes('read-only'));
  assert(args.includes('features.shell_tool=false'));
  assert(!args.some(a => a.includes('bypass')));
});

test('extracts agent answers rather than tool output from CLI events', () => {
  const text = [
    {type:'item.completed',item:{type:'command_execution',aggregated_output:'not the answer'}},
    {type:'item.completed',item:{type:'agent_message',text:'This validates input.'}},
    {type:'turn.completed',usage:{input_tokens:10,output_tokens:5}}
  ].map(x=>JSON.stringify(x)).join('\n');
  assert.equal(extractAnswer(text),'This validates input.');
});

test('teaching prompt preserves the question and treats source as untrusted evidence', () => {
  const prompt = buildPrompt({mode:'review',question:'Can this fail?',context:'source',file:'a.ts',selection:'save',history:[]});
  assert.match(prompt,/Can this fail/);
  assert.match(prompt,/untrusted/i);
  assert.match(prompt,/uncertain|uncertainty/i);
});
