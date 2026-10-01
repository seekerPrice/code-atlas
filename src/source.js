import hljs from 'highlight.js/lib/common';
const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function syntaxLines(content,language){
 let html=escape(content);try{if(hljs.getLanguage(language))html=hljs.highlight(content,{language,ignoreIllegals:true}).value;}catch{}
 const stack=[],lines=[];let current='';
 // Reopen the highlighter's spans on each numbered line so multiline tokens
 // retain their style without letting HTML elements cross source-line containers.
 for(const token of html.split(/(<span\b[^>]*>|<\/span>|\n)/g)){
  if(token==='\n'){lines.push(current+'</span>'.repeat(stack.length));current=stack.join('');}
  else{current+=token;if(token.startsWith('<span'))stack.push(token);else if(token==='</span>')stack.pop();}
 }
 lines.push(current+'</span>'.repeat(stack.length));return lines;
}

// Wrap only compiler-resolved tokens. Text-node offsets preserve highlighting,
// escaped characters, and exact source text without guessing from a name match.
export function linkSource(root,links,navigate,peek){
 const doc=root.ownerDocument;
 for(const {reference,target} of links){
  if(!reference)continue;
  const code=root.querySelector(`[data-line="${reference.line}"] code`);
  if(!code||reference.start<0||reference.end<=reference.start||reference.end>code.textContent.length)continue;
  const walker=doc.createTreeWalker(code,4),nodes=[];let offset=0,node;
  while((node=walker.nextNode())){nodes.push({node,start:offset,end:offset+node.textContent.length});offset+=node.textContent.length;}
  const first=nodes.find(n=>n.end>reference.start),last=nodes.find(n=>n.end>=reference.end);
  if(!first||!last)continue;
  const range=doc.createRange();range.setStart(first.node,reference.start-first.start);range.setEnd(last.node,reference.end-last.start);
  const button=doc.createElement('button');button.type='button';button.className='source-link';
  button.title=`Go to ${target.name} — ${target.path}:${target.line}`;
  button.setAttribute('aria-label',button.title);
  button.append(range.extractContents());range.insertNode(button);
  button.onclick=event=>{if(event.shiftKey)return;event.stopPropagation();if(event.altKey&&peek)peek(target);else navigate(target);};
 }
}
