import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stat} from 'node:fs/promises';
import path from 'node:path';

const runFile=promisify(execFile);
const PICKER_TIMEOUT_MS=5*60*1000;
// The script is fixed: project paths are returned as data, never inserted into code.
// https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/PromptforaFileorFolder.html
const script=`tell current application to activate
try
  set selectedFolder to choose folder with prompt "Choose a project folder for Code Atlas"
  return POSIX path of selectedFolder
on error number -128
  return ""
end try`;

export async function chooseNativeFolder({platform=process.platform,run=runFile,signal}={}) {
  if(platform!=='darwin')throw new Error('The native folder picker is available on macOS. Use the folder list or enter a folder path.');
  try {
    const {stdout}=await run('/usr/bin/osascript',['-e',script],{encoding:'utf8',timeout:PICKER_TIMEOUT_MS,maxBuffer:64*1024,signal});
    const selected=stdout.replace(/\r?\n$/,'');
    if(!selected)return null;
    if(!path.isAbsolute(selected)||!(await stat(selected)).isDirectory())throw new Error('Not a folder.');
    return selected;
  } catch(error) {
    if(signal?.aborted)throw error;
    throw new Error('Could not open the macOS folder picker or read that folder. Try again, use the folder list, or enter a folder path.');
  }
}

export const nativeFolderPicker={available:process.platform==='darwin',choose:chooseNativeFolder};
