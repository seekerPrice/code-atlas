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

// Windows PowerShell is included with Windows; no additional package is required.
// Fixed UTF-16LE encoded script avoids shell quoting or interpolating folder names.
// https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_powershell_exe
const windowsScript=`$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
try {
  $dialog.Description = 'Choose a project folder for Code Atlas'
  $dialog.ShowNewFolderButton = $false
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::WriteLine($dialog.SelectedPath)
  }
} finally {
  $dialog.Dispose()
}`;

export async function chooseNativeFolder({platform=process.platform,run=runFile,inspect=stat,signal}={}) {
  if(!['darwin','win32'].includes(platform))throw new Error('The native folder picker is available on macOS and Windows. Use the folder list or enter a folder path.');
  try {
    const windows=platform==='win32';
    const command=windows?path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'):'/usr/bin/osascript';
    const args=windows?['-NoProfile','-STA','-EncodedCommand',Buffer.from(windowsScript,'utf16le').toString('base64')]:['-e',script];
    const {stdout}=await run(command,args,{encoding:'utf8',timeout:PICKER_TIMEOUT_MS,maxBuffer:64*1024,windowsHide:true,signal});
    const selected=stdout.replace(/\r?\n$/,'');
    if(!selected)return null;
    if(!(windows?path.win32:path.posix).isAbsolute(selected)||!(await inspect(selected)).isDirectory())throw new Error('Not a folder.');
    return selected;
  } catch(error) {
    if(signal?.aborted)throw error;
    throw new Error('Could not open the system folder picker or read that folder. Try again, use the folder list, or enter a folder path.');
  }
}

export const nativeFolderPicker={available:['darwin','win32'].includes(process.platform),choose:chooseNativeFolder};
