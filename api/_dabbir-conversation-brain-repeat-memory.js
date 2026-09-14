const REPEAT_PROMPT_AR='نفس السيارة والموقع ولا بتغير؟';
const REPEAT_PROMPT_EN='Same vehicle and location, or would you like to change them?';

// Customer-facing repeat-memory prose belongs to the canonical Conversation Brain.
// The semantic compatibility facade may decide that a verified-memory confirmation
// is needed, but it must not own the wording shown to the customer.
export function renderRepeatMemoryConfirmation(language){
  return language==='en'?REPEAT_PROMPT_EN:REPEAT_PROMPT_AR;
}
