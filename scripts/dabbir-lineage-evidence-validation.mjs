const MD5_RE=/^[0-9a-f]{32}$/i;
const MIGRATION_VERSION_RE=/^\d{14}$/;
const MIGRATION_NAME_RE=/^[a-z0-9_]+$/;
const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const plainObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function invalid(reason,details={}){
  return {ok:false,reason,...details};
}

export function validateMigrationEvidence(rows,{requireStatementsMd5=false,label='MIGRATION_EVIDENCE'}={}){
  if(!Array.isArray(rows))return invalid(`${label}_NOT_ARRAY`);
  if(rows.length===0)return invalid(`${label}_EMPTY`);
  const identities=new Set();
  for(let index=0;index<rows.length;index+=1){
    const row=rows[index];
    if(!plainObject(row))return invalid(`${label}_ROW_TYPE_INVALID`,{index});
    if(!hasOwn(row,'version')||typeof row.version!=='string'||!MIGRATION_VERSION_RE.test(row.version))return invalid(`${label}_VERSION_INVALID`,{index});
    if(!hasOwn(row,'name')||typeof row.name!=='string'||!MIGRATION_NAME_RE.test(row.name))return invalid(`${label}_NAME_INVALID`,{index});
    if(requireStatementsMd5&&(!hasOwn(row,'statements_md5')||typeof row.statements_md5!=='string'||!MD5_RE.test(row.statements_md5))){
      return invalid(`${label}_STATEMENTS_MD5_INVALID`,{index});
    }
    const identity=`${row.version}:${row.name}`;
    if(identities.has(identity))return invalid(`${label}_DUPLICATE_IDENTITY`,{index,identity});
    identities.add(identity);
  }
  return {ok:true,count:rows.length};
}

export function validateFunctionEvidence(rows){
  if(!Array.isArray(rows))return invalid('FUNCTION_EVIDENCE_NOT_ARRAY');
  if(rows.length===0)return invalid('FUNCTION_EVIDENCE_EMPTY');
  const identities=new Set();
  for(let index=0;index<rows.length;index+=1){
    const row=rows[index];
    if(!plainObject(row))return invalid('FUNCTION_EVIDENCE_ROW_TYPE_INVALID',{index});
    if(!hasOwn(row,'schema_name')||typeof row.schema_name!=='string'||row.schema_name.trim()==='')return invalid('FUNCTION_EVIDENCE_SCHEMA_NAME_INVALID',{index});
    if(!hasOwn(row,'function_name')||typeof row.function_name!=='string'||row.function_name.trim()==='')return invalid('FUNCTION_EVIDENCE_FUNCTION_NAME_INVALID',{index});
    // Empty identity_arguments is valid for zero-argument functions; missing/non-string is not.
    if(!hasOwn(row,'identity_arguments')||typeof row.identity_arguments!=='string')return invalid('FUNCTION_EVIDENCE_IDENTITY_ARGUMENTS_INVALID',{index});
    if(!hasOwn(row,'definition_md5')||typeof row.definition_md5!=='string'||!MD5_RE.test(row.definition_md5))return invalid('FUNCTION_EVIDENCE_DEFINITION_MD5_INVALID',{index});
    if(!hasOwn(row,'acl_md5')||typeof row.acl_md5!=='string'||!MD5_RE.test(row.acl_md5))return invalid('FUNCTION_EVIDENCE_ACL_MD5_INVALID',{index});
    if(!hasOwn(row,'search_path_md5')||typeof row.search_path_md5!=='string'||!MD5_RE.test(row.search_path_md5))return invalid('FUNCTION_EVIDENCE_SEARCH_PATH_MD5_INVALID',{index});
    if(!hasOwn(row,'security_definer')||typeof row.security_definer!=='boolean')return invalid('FUNCTION_EVIDENCE_SECURITY_DEFINER_INVALID',{index});
    const identity=`${row.schema_name}.${row.function_name}(${row.identity_arguments})`;
    if(identities.has(identity))return invalid('FUNCTION_EVIDENCE_DUPLICATE_IDENTITY',{index,identity});
    identities.add(identity);
  }
  return {ok:true,count:rows.length};
}

export function validatePreflightEvidence({expectedMigrations,liveSnapshot}){
  const expected=validateMigrationEvidence(expectedMigrations,{label:'EXPECTED_MIGRATION_EVIDENCE'});
  if(!expected.ok)return expected;
  if(!plainObject(liveSnapshot))return invalid('LIVE_SNAPSHOT_INVALID');
  const migrations=validateMigrationEvidence(liveSnapshot.migration_history,{requireStatementsMd5:true,label:'LIVE_MIGRATION_EVIDENCE'});
  if(!migrations.ok)return migrations;
  const functions=validateFunctionEvidence(liveSnapshot.functions);
  if(!functions.ok)return functions;
  return {
    ok:true,
    migration_count:migrations.count,
    function_count:functions.count,
    phase:'STRUCTURAL_EVIDENCE_VALID',
  };
}
