import registry from '../../../api/_dabbir-activity-registry.json' with {type:'json'};
// Test input adapter. Production contracts are always loaded from PostgreSQL.
export function activityContext(c,options={}) {
 if(c.activity_profile && Object.keys(options).length===0)return c;
 const type=options.activity_type||c.business?.business_type||'services',schema=registry.activities[type]||registry.activities.other;
 const modes=options.delivery_modes||schema.default_delivery_modes;
 c.activity_profile={version:1,source:'DATABASE_FACT',business_id:c.business.id,branch_id:c.conversation.branch_id,
  verified_memory:c.verified_memory||[],workers:(c.workers||[]).map(w=>({...w,service_ids:c.services.map(s=>s.id)})),
  services:c.services.map(s=>({business_id:c.business.id,branch_id:c.conversation.branch_id,service_id:s.id,activity_type:type,activity_instance_id:type,schema_version:1,contract_version:'test-v1',delivery_modes:modes,
   mode_requirements:structuredClone(schema.mode_requirements),collection_priority:registry.platform.collection_priority,entity_definitions:registry.platform.entity_definitions,
   automatic_booking:true,owner_approval:false,...options}))};
 return c;
}
