import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const MAX_MIGRATION_BYTES=900_000;
export const MIGRATION_PATH_RE=/^supabase\/migrations\/([0-9]{14})_([a-z0-9][a-z0-9_]*)\.sql$/;

function stripQuotedAndComments(sql){
  let out='',i=0,state='normal',dollarTag=null,blockDepth=0,lineStart=true;
  const failMeta=()=>{throw new Error('PSQL_META_COMMAND_DENIED')};
  while(i<sql.length){
    const ch=sql[i],next=sql[i+1]||'';
    if(state==='line_comment'){
      if(ch==='\n'){state='normal';out+='\n';lineStart=true;} else out+=' ';
      i++;continue;
    }
    if(state==='block_comment'){
      if(ch==='/'&&next==='*'){blockDepth++;out+='  ';i+=2;continue;}
      if(ch==='*'&&next==='/'){blockDepth--;out+='  ';i+=2;if(blockDepth===0)state='normal';continue;}
      if(ch==='\n'){out+='\n';lineStart=true;} else out+=' ';
      i++;continue;
    }
    if(state==='single'){
      if(ch==="'"&&next==="'"){out+='  ';i+=2;continue;}
      if(ch==="'"){state='normal';out+=' ';i++;continue;}
      if(ch==='\n'){out+='\n';lineStart=true;} else out+=' ';
      i++;continue;
    }
    if(state==='double'){
      if(ch==='"'&&next==='"'){out+='  ';i+=2;continue;}
      if(ch==='"'){state='normal';out+=' ';i++;continue;}
      if(ch==='\n'){out+='\n';lineStart=true;} else out+=' ';
      i++;continue;
    }
    if(state==='dollar'){
      if(sql.startsWith(dollarTag,i)){out+=' '.repeat(dollarTag.length);i+=dollarTag.length;state='normal';dollarTag=null;continue;}
      if(ch==='\n'){out+='\n';lineStart=true;} else out+=' ';
      i++;continue;
    }

    // normal state
    if(lineStart){
      if(ch===' '||ch==='\t'||ch==='\r'){out+=ch;i++;continue;}
      if(ch==='\\')failMeta();
      lineStart=false;
    }
    if(ch==='-'&&next==='-'){state='line_comment';out+='  ';i+=2;continue;}
    if(ch==='/'&&next==='*'){state='block_comment';blockDepth=1;out+='  ';i+=2;continue;}
    if(ch==="'"){state='single';out+=' ';i++;continue;}
    if(ch==='"'){state='double';out+=' ';i++;continue;}
    if(ch==='$'){
      const m=sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if(m){dollarTag=m[0];state='dollar';out+=' '.repeat(dollarTag.length);i+=dollarTag.length;continue;}
    }
    out+=ch;
    if(ch==='\n')lineStart=true;
    i++;
  }
  if(state==='block_comment')throw new Error('UNTERMINATED_BLOCK_COMMENT');
  if(state==='single')throw new Error('UNTERMINATED_SINGLE_QUOTE');
  if(state==='double')throw new Error('UNTERMINATED_DOUBLE_QUOTE');
  if(state==='dollar')throw new Error('UNTERMINATED_DOLLAR_QUOTE');
  return out;
}

export function validateMigrationSql(sql){
  if(typeof sql!=='string'||sql.length===0)throw new Error('MIGRATION_EMPTY');
  const bytes=Buffer.byteLength(sql,'utf8');
  if(bytes>MAX_MIGRATION_BYTES)throw new Error('MIGRATION_TOO_LARGE');
  const clean=stripQuotedAndComments(sql);
  if(/\bsupabase_migrations\s*\.\s*schema_migrations\b/i.test(clean))throw new Error('MIGRATION_HISTORY_MUTATION_DENIED');
  const statements=clean.split(';').map(x=>x.trim().replace(/\s+/g,' ')).filter(Boolean);
  for(const statement of statements){
    const s=statement.toLowerCase();
    if(/^(begin(?:\s+(?:work|transaction))?|start\s+transaction|commit(?:\s+(?:work|transaction))?|rollback(?:\s+(?:work|transaction))?|savepoint\b|release\s+savepoint\b)/.test(s))throw new Error('TRANSACTION_CONTROL_DENIED');
    if(/^(create|drop)\s+database\b/.test(s))throw new Error('DATABASE_LIFECYCLE_DENIED');
    if(/^vacuum\b/.test(s))throw new Error('VACUUM_DENIED');
    if(/^copy\b/.test(s))throw new Error('COPY_DENIED');
    if(/^alter\s+system\b/.test(s))throw new Error('ALTER_SYSTEM_DENIED');
    if(/^create\s+(?:unique\s+)?index\s+concurrently\b/.test(s))throw new Error('CONCURRENT_INDEX_DENIED');
    if(/^reindex\b[\s\S]*\bconcurrently\b/.test(s))throw new Error('CONCURRENT_REINDEX_DENIED');
    if(/^refresh\s+materialized\s+view\s+concurrently\b/.test(s))throw new Error('CONCURRENT_REFRESH_DENIED');
  }
  return {bytes,statementCount:statements.length};
}

export function validateMigrationPath(file,cutoverVersion){
  const normalized=String(file||'').replace(/\\/g,'/');
  const m=MIGRATION_PATH_RE.exec(normalized);
  if(!m)throw new Error('MIGRATION_PATH_INVALID');
  const [,version,name]=m;
  if(cutoverVersion&&version<=String(cutoverVersion))throw new Error('MIGRATION_PREDATES_CANONICAL_CUTOVER');
  return {path:normalized,version,name};
}

export function validateMigrationFile(file,{cutoverVersion,repositoryRoot=process.cwd()}={}){
  const diskPath=path.resolve(String(file));
  const contractPath=path.relative(path.resolve(repositoryRoot),diskPath).replace(/\\/g,'/');
  if(contractPath.startsWith('../')||path.isAbsolute(contractPath))throw new Error('MIGRATION_OUTSIDE_REPOSITORY');
  const info=validateMigrationPath(contractPath,cutoverVersion);
  const sql=fs.readFileSync(diskPath,'utf8');
  return {...info,...validateMigrationSql(sql)};
}

const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  try{
    const file=process.argv[2],cutoverVersion=process.argv[3]||'';
    if(!file)throw new Error('MIGRATION_FILE_REQUIRED');
    process.stdout.write(JSON.stringify({ok:true,...validateMigrationFile(file,{cutoverVersion})})+'\n');
  }catch(error){
    process.stderr.write(JSON.stringify({ok:false,error:String(error?.message||error)})+'\n');
    process.exit(1);
  }
}
