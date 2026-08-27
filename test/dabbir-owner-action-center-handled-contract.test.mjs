import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'../api/owner-action-center.js'),'utf8');

function must(pattern,message){assert.match(source,pattern,message)}
function mustNot(pattern,message){assert.doesNotMatch(source,pattern,message)}

test('handled work counts verified autonomous outcomes only',()=>{
  must(/dabbir_operation_outcomes\?select=/,'owner action center must read the outcome ledger');
  must(/outcome=eq\.VERIFIED_SUCCESS/,'handled query must require VERIFIED_SUCCESS');
  must(/autonomous=eq\.true/,'handled query must require autonomous=true');
  must(/completed_at=gte\.\$\{dayStart\}/,'handled query must be scoped to the current Dubai day');
  must(/handled_counts_only_verified_success_autonomous_outcomes:true/,'response truth contract must state the handled filter');
});

test('handled lookup degrades without lying',()=>{
  must(/catch\(error=>\(\{available:false,rows:\[\],status:/,'supplementary handled lookup must not break the owner priority view');
  must(/handled_verified_today:handledResult\.available\?handledCount:null/,'unavailable verification must be null, not zero');
  must(/handled_unavailable_is_not_zero:true/,'truth contract must preserve unavailable versus zero');
});

test('owner time saved is not inferred in the Today view',()=>{
  must(/estimated_manual_seconds/,'ledger read may carry the measured field for future use');
  mustNot(/hours_saved|owner_hours_saved|manual_seconds_saved/i,'Today view must not invent or display time savings before calibrated evidence exists');
});

test('handled response exposes only operation label and completion time',()=>{
  must(/return \{operation_type:row\.operation_type,title_ar:label\.ar,title_en:label\.en,completed_at:row\.completed_at\}/,'handled items must be privacy-minimized');
  mustNot(/select=[^`]*metadata/,'handled query must not fetch outcome metadata into the owner summary');
});
