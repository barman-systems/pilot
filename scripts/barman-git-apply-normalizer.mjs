import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { inspectGitPatch } from './barman-patch-format.mjs';

const marker=Symbol.for('barman.gitApplyNormalizerInstalled');

if(!childProcess[marker]){
  const originalSpawnSync=childProcess.spawnSync;
  childProcess.spawnSync=function barmanSpawnSync(file,args=[],options={}){
    const isGitApply=file==='git'&&Array.isArray(args)&&args[0]==='apply'&&args.at(-1)==='-'&&options?.input!==undefined;
    if(!isGitApply)return originalSpawnSync.call(childProcess,file,args,options);

    const inspected=inspectGitPatch(options.input);
    if(!inspected.ok){
      const stderr=`${inspected.error}\n`;
      return {pid:0,output:[null,'',stderr],stdout:'',stderr,status:2,signal:null,error:undefined};
    }
    return originalSpawnSync.call(childProcess,file,args,{...options,input:inspected.patch});
  };
  Object.defineProperty(childProcess,marker,{value:true,enumerable:false,configurable:false});
  syncBuiltinESMExports();
}
