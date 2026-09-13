// Preparation collector; its caller supplies the independently owned authorization and signer.
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const ident=s=>{if(!/^[a-z_][a-z0-9_]*$/.test(s))throw Error('INVALID_IDENTIFIER');return '"'+s+'"';};
export function relationalCaptureSQL(scope){
  if(scope?.version!=='S07_DECLARED_RELATIONAL_SCOPE_1'||scope.rowSelection!=='ALL_ROWS_IN_ISOLATED_FIXTURE')throw Error('SCOPE_REQUIRED');
  const tables=Object.entries(scope.tables||{}).sort(([a],[b])=>a.localeCompare(b));
  if(!tables.length)throw Error('EMPTY_SCOPE');
  const selects=tables.map(([table,columns])=>{
    const parts=table.split('.');if(parts.length!==2||!scope.schemas.includes(parts[0]))throw Error('INVALID_SCOPE');
    const qualified=parts.map(ident).join('.');
    if(!Array.isArray(columns)||!columns.length)throw Error('EMPTY_COLUMNS');
    columns.forEach(c=>ident(c.column_name));
    if(new Set(columns.map(c=>c.column_name)).size!==columns.length)throw Error('DUPLICATE_COLUMN');
    return `SELECT '${table}' AS table_name, COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C"),'[]'::jsonb)::text AS rows_text FROM ${qualified} t`;
  });
  // Schema metadata and row data are read inside the same repeatable-read snapshot.
  const catalog=`SELECT jsonb_agg(to_jsonb(c) ORDER BY table_schema,table_name,ordinal_position) FROM (SELECT table_schema,table_name,column_name,data_type,ordinal_position FROM information_schema.columns WHERE table_schema IN (${scope.schemas.map(s=>{ident(s);return "'"+s+"'";}).join(',')})) c`;
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT jsonb_build_object('catalog',(${catalog}),'tables',(SELECT jsonb_agg(to_jsonb(r) ORDER BY table_name) FROM (${selects.join(' UNION ALL ')}) r))::text;\nCOMMIT;`;
}
export function validateRelationalCapture(scope,output){
  const result=JSON.parse(output);const actual={};
  for(const c of result.catalog||[]){const name=c.table_schema+'.'+c.table_name;if(scope.excludedTables?.[name])continue;(actual[name]??=[]).push({column_name:c.column_name,data_type:c.data_type,ordinal_position:c.ordinal_position});}
  const normalize=obj=>JSON.stringify(Object.entries(obj).sort(([a],[b])=>a.localeCompare(b)).map(([name,cols])=>[name,cols.slice().sort((a,b)=>a.ordinal_position-b.ordinal_position).map(c=>[c.column_name,c.data_type,c.ordinal_position])]));
  if(normalize(actual)!==normalize(scope.tables))throw Error('SCHEMA_SCOPE_MISMATCH');
  const rows=result.tables;
  if(!Array.isArray(rows)||rows.length!==Object.keys(scope.tables).length||new Set(rows.map(r=>r.table_name)).size!==rows.length||rows.some(r=>!scope.tables[r.table_name]||typeof r.rows_text!=='string'))throw Error('ROW_SCOPE_MISMATCH');
  const canonical=JSON.stringify(rows.slice().sort((a,b)=>a.table_name.localeCompare(b.table_name)).map(r=>[r.table_name,r.rows_text]));
  return {scopeHash:hash(JSON.stringify(scope)),snapshotHash:hash(canonical),canonical};
}
