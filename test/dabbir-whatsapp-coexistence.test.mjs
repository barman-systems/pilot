import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { extractCoexistenceEvents } from '../api/_whatsapp-coexistence.js';

test('extracts real nested Coexistence history without turning it into live AI input',()=>{
  const events=extractCoexistenceEvents({field:'history',value:{
    metadata:{phone_number_id:'123456789',display_phone_number:'+971500000000'},
    history:[{metadata:{phase:'PHASE_1',chunk_order:2,progress:50},threads:[{
      id:'971501234567',name:'عميل واتساب',messages:[
        {id:'wamid.history.in.1',from:'971501234567',to:'971500000000',timestamp:'1788800000',type:'text',text:{body:'أريد موعد غداً'}},
        {id:'wamid.history.out.1',from:'971500000000',to:'971501234567',timestamp:'1788800060',type:'text',text:{body:'تم'}}
      ]
    }]}]
  }});
  const messages=events.filter(e=>e.type==='history_message');
  assert.equal(messages.length,2);
  assert.equal(messages[0].direction,'inbound');
  assert.equal(messages[0].customerHandle,'971501234567');
  assert.equal(messages[0].text,'أريد موعد غداً');
  assert.equal(messages[1].direction,'outbound');
  assert.equal(messages[1].customerHandle,'971501234567');
  assert.equal(events.at(-1).type,'coexistence_sync');
  assert.equal(events.at(-1).progress,50);
});

test('captures declined history sync as an auditable error event',()=>{
  const events=extractCoexistenceEvents({field:'history',value:{
    metadata:{phone_number_id:'123456789'},
    history:[{metadata:{phase:'PHASE_0',chunk_order:0,progress:0},errors:[{code:2593109}]}]
  }});
  assert.ok(events.some(e=>e.type==='coexistence_sync'&&e.state==='error'&&e.errorCode==='2593109'));
});

test('extracts Coexistence contact add and remove state sync',()=>{
  const events=extractCoexistenceEvents({field:'smb_app_state_sync',value:{
    metadata:{phone_number_id:'123456789'},
    state_sync:[
      {type:'contact',action:'add',contact:{full_name:'محمد',phone_number:'+971501234567'},metadata:{timestamp:'1788800100'}},
      {type:'contact',action:'remove',contact:{full_name:'محمد',phone_number:'+971501234568'},metadata:{timestamp:'1788800200'}}
    ]
  }});
  const contacts=events.filter(e=>e.type==='coexistence_contact');
  assert.equal(contacts.length,2);
  assert.deepEqual(contacts.map(e=>e.action),['add','remove']);
  assert.equal(contacts[0].customerHandle,'971501234567');
  assert.ok(events.some(e=>e.type==='coexistence_sync'&&e.syncKind==='contacts_event'));
});

test('extracts WhatsApp Business App echoes as outbound human messages',()=>{
  const events=extractCoexistenceEvents({field:'smb_message_echoes',value:{
    metadata:{phone_number_id:'123456789',display_phone_number:'+971500000000'},
    message_echoes:[{id:'wamid.echo.1',from:'971500000000',to:'971501234567',timestamp:'1788800300',type:'text',text:{body:'تم تثبيت الموعد'}}]
  }});
  assert.equal(events.length,1);
  assert.equal(events[0].type,'app_message_echo');
  assert.equal(events[0].direction,'outbound');
  assert.equal(events[0].customerHandle,'971501234567');
});

test('extracts edits and revokes without guessing original message',()=>{
  const edit=extractCoexistenceEvents({field:'smb_message_echoes',value:{metadata:{phone_number_id:'123456789'},message_echoes:[{
    id:'wamid.edit.1',timestamp:'1788800400',edit:{original_message_id:'wamid.original.1',message:{type:'text',text:{body:'الموعد الساعة 5'}}}
  }]}});
  assert.equal(edit[0].type,'coexistence_mutation');
  assert.equal(edit[0].mutationType,'edit');
  assert.equal(edit[0].originalMessageId,'wamid.original.1');
  assert.equal(edit[0].text,'الموعد الساعة 5');

  const revoke=extractCoexistenceEvents({field:'smb_message_echoes',value:{metadata:{phone_number_id:'123456789'},message_echoes:[{
    id:'wamid.revoke.1',timestamp:'1788800500',revoke:{original_message_id:'wamid.original.1'}
  }]}});
  assert.equal(revoke[0].mutationType,'revoke');
});

test('Coexistence implementation requests official SMB app sync types and stays service-role only',()=>{
  const source=fs.readFileSync(new URL('../api/_whatsapp-coexistence.js',import.meta.url),'utf8');
  const migration=fs.readFileSync(new URL('../supabase/migrations/20260908080500_dabbir_whatsapp_coexistence_sync_v1.sql',import.meta.url),'utf8');
  assert.match(source,/\/smb_app_data/);
  assert.match(source,/sync_type:'smb_app_state_sync'/);
  assert.match(source,/sync_type:'history'/);
  assert.match(source,/is_on_biz_app,platform_type/);
  assert.match(migration,/WHATSAPP_HISTORY_SYNC/);
  assert.match(migration,/SUPERSEDED_BY_WHATSAPP_BUSINESS_APP_REPLY/);
  assert.match(migration,/revoke all on function public\.dabbir_whatsapp_persist_coexistence_message/);
  assert.match(migration,/grant execute on function public\.dabbir_whatsapp_persist_coexistence_message[^;]+to service_role/s);
});

test('Vercel routes the canonical Meta webhook through the Coexistence gate',()=>{
  const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.ok(config.routes.some(r=>r.src==='^/api/dabbir-whatsapp-webhook/?$'&&r.dest==='/api/dabbir-whatsapp-webhook-coexistence'));
});
