import test from 'node:test';import assert from 'node:assert/strict';
import {exactCount} from '../api/_exact-count.js';
test('exact totals do not use the loaded page length',()=>{
 assert.equal(exactCount({headers:new Headers({'content-range':'0-19/412'})}),412);
 assert.equal(exactCount({headers:new Headers({'content-range':'*/0'})}),0);
});
test('unavailable counts are distinct from zero',()=>{
 for(const value of ['', '0-19/*','invalid','0-19/9007199254740992'])assert.equal(exactCount({headers:new Headers({'content-range':value})}),null);
 assert.equal(exactCount({}),null);
});
