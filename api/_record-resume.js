// Restore only an explicit record reference captured before the UI booted.
// The existing record handlers remain responsible for authenticated reads.
export function createRecordResume(reference){
  let consumed=false;
  return function resume(context,openers){
    if(consumed||!reference)return 'idle';
    const {type,id,businessId,branch}=reference;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||''))||!['appointment','order','inventory','task'].includes(type)){consumed=true;return 'invalid'}
    if(!context?.businessId)return 'waiting';
    if(context.businessId!==businessId||context.branch!==branch){consumed=true;return 'scope-mismatch'}
    if(typeof openers[type]!=='function')return 'waiting';
    consumed=true;
    void openers[type](id);
    return 'restored';
  };
}
