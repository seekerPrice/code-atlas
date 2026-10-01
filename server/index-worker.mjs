import {parentPort,workerData} from 'node:worker_threads';
import {scanProject,collectProject} from './project.mjs';
try{const result=workerData.snapshot?await collectProject(workerData.root):await scanProject(workerData.root);parentPort.postMessage({result:workerData.snapshot?{revision:result.revision,files:result.files,limited:result.limited}:result});}catch(error){parentPort.postMessage({error:error.message});}
