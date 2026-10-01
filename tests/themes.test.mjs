import test from 'node:test';
import assert from 'node:assert/strict';
import { themePalette, chooseTheme } from '../server/themes.mjs';

test('uses VS Code colors and finds inherited syntax-token colors',()=>{
  const t=themePalette('Custom', 'vs-dark', {colors:{'editor.background':'#112233','editor.foreground':'#eeeeee','sideBar.background':'#101010','button.background':'#0099ff'},tokenColors:[{scope:['string','string.quoted'],settings:{foreground:'#aabbcc'}}]});
  assert.equal(t.palette.editor,'#112233');assert.equal(t.palette.ink,'#eeeeee');assert.equal(t.palette.string,'#aabbcc');assert.equal(t.dark,true);
});
test('falls back without claiming an unavailable theme was imported',()=>{
  const result=chooseTheme('Unknown theme',[{id:'Dark Modern',dark:true},{id:'Light Modern',dark:false}]);
  assert.equal(result.id,'Dark Modern');assert.equal(result.matched,false);
  assert.equal(chooseTheme('Light Modern',[{id:'Light Modern',dark:false}]).matched,true);
});
