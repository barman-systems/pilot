import test from 'node:test';import assert from 'node:assert/strict';import {renderOwnerCommandCenter} from '../api/owner-command-center.js';
const html=renderOwnerCommandCenter({authority_role:'ROOT_OWNER'},'en');
test('read and write feedback is accessible and supports native mobile dialogs',()=>{
 assert.match(html,/role="status" aria-live="polite"/);assert.match(html,/<dialog id="ownerActionDialog" aria-labelledby="actionDialogTitle"/);
 assert.match(html,/tabindex="-1"/);assert.match(html,/scope="col"/);assert.match(html,/type="datetime-local"/);
 assert.match(html,/readback_verified/);assert.match(html,/Audit receipt/);assert.match(html,/Measurement unavailable/);
});
test('responsive shell uses logical RTL sizing, touch controls and no competing styles',()=>{
 assert.match(html,/padding-inline/);assert.match(html,/min-height:46px/);assert.match(html,/@media\(max-width:560px\)/);
 assert.match(html,/overflow-x:auto/);assert.match(html,/prefers-reduced-motion/);assert.doesNotMatch(html,/linear-gradient|oc2[3-9]|ownerMainTab29/);
});
test('unknown measurements and sandbox revenue never acquire a fabricated zero fallback',()=>{
 assert.match(html,/Sandbox billing; excluded from real revenue/);assert.match(html,/Not measured by this source/);assert.match(html,/realRevenue\?number/);
 assert.doesNotMatch(html,/Math\.random|trialing\|\|0|mrr_aed\|\|0|runtime_5xx_24h\|\|0/);
});
