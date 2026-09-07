function stripOuterFence(value){
  let text=String(value??'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  text=text.replace(/^```(?:diff|patch|text)?[ \t]*\n/i,'');
  text=text.replace(/\n```[ \t]*$/,'');
  return text.trim();
}

export function normalizeGitPatchInput(value){
  let text=stripOuterFence(value);
  const starts=[
    text.search(/^diff --git /m),
    text.search(/^--- (?:a\/|\/dev\/null)(?:\t|$)/m),
  ].filter(index=>index>=0);
  if(starts.length>0){
    text=text.slice(Math.min(...starts));
  }
  text=text.replace(/\n```[ \t]*[\s\S]*$/,'').trimEnd();
  return text?`${text}\n`:'';
}

export function inspectGitPatch(value){
  const patch=normalizeGitPatchInput(value);
  if(!patch){
    return {ok:false,patch:'',error:'PATCH_FORMAT_EMPTY: return a raw git unified diff.'};
  }
  if(/^\*\*\* (?:Begin Patch|Update File:|Add File:|Delete File:)/m.test(patch)){
    return {
      ok:false,
      patch,
      error:'PATCH_FORMAT_INVALID_APPLY_PATCH: return raw git unified diff only, with --- a/path, +++ b/path and numeric @@ -old,+new @@ hunks. Do not use *** Begin Patch, *** Update File, *** Add File, *** Delete File, prose, or markdown fences.',
    };
  }
  const hasOld=/^--- (?:a\/|\/dev\/null)(?:\t|$)/m.test(patch);
  const hasNew=/^\+\+\+ (?:b\/|\/dev\/null)(?:\t|$)/m.test(patch);
  const hasHunk=/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(patch);
  if(!hasOld||!hasNew||!hasHunk){
    return {
      ok:false,
      patch,
      error:'PATCH_FORMAT_INVALID_UNIFIED_DIFF: return raw git unified diff only, with --- a/path, +++ b/path and numeric @@ -old,+new @@ hunks. Do not use prose or markdown fences.',
    };
  }
  return {ok:true,patch,error:''};
}
