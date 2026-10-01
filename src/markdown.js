import {marked} from 'marked';
import DOMPurify from 'dompurify';
export function markdown(text,purifier=DOMPurify){return purifier.sanitize(marked.parse(text),{ALLOWED_URI_REGEXP:/^(?:(?:https?|atlas):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,FORBID_TAGS:['img','style','iframe','form','input','button','svg','math','video','audio'],FORBID_ATTR:['id','name','style']});}
