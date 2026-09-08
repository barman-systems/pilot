-- Activity Intelligence V1. Append-only operational configuration, database truth.
create table dabbir_private.activity_registry_v1 (
  version integer primary key check(version>0), schema jsonb not null,
  created_at timestamptz not null default now()
);
alter table dabbir_private.activity_registry_v1 enable row level security;
revoke all on dabbir_private.activity_registry_v1 from public,anon,authenticated;

create table public.dabbir_activity_service_versions (
  business_id uuid not null, branch_id uuid not null, service_id uuid not null,
  version bigint not null check(version>0), config jsonb not null check(jsonb_typeof(config)='object' and octet_length(config::text)<=8192),
  action text not null check(action in ('SAVE','REVOKE','ROLLBACK')),
  restored_version bigint, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(business_id,branch_id,service_id,version),
  foreign key(business_id,branch_id,service_id) references public.dabbir_branch_services(business_id,branch_id,service_id) on delete cascade
);
alter table public.dabbir_activity_service_versions enable row level security;
revoke all on public.dabbir_activity_service_versions from public,anon,authenticated;
grant select on public.dabbir_activity_service_versions to authenticated;
create policy activity_service_owner_read on public.dabbir_activity_service_versions for select to authenticated using (
  exists(select 1 from public.dabbir_memberships m where m.business_id=dabbir_activity_service_versions.business_id and m.user_id=(select auth.uid()) and m.role='owner' and m.status='active')
);
create index dabbir_activity_service_versions_author on public.dabbir_activity_service_versions(created_by);

create table public.dabbir_whatsapp_location_receipts (
  message_id uuid primary key references public.dabbir_messages(id) on delete cascade,
  business_id uuid not null, conversation_id uuid not null,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  label text not null default '' check(length(label)<=180),
  created_at timestamptz not null default now(),
  foreign key(business_id,conversation_id) references public.dabbir_conversations(business_id,id) on delete cascade
);
alter table public.dabbir_whatsapp_location_receipts enable row level security;
revoke all on public.dabbir_whatsapp_location_receipts from public,anon,authenticated;
create index dabbir_whatsapp_location_receipts_scope on public.dabbir_whatsapp_location_receipts(business_id,conversation_id);

create or replace function dabbir_private.activity_validate_config_v1(p_config jsonb) returns boolean
language plpgsql immutable set search_path='pg_catalog' as $$
declare k text; v jsonb; mode text; f text;
begin
 if jsonb_typeof(p_config) is distinct from 'object' or octet_length(p_config::text)>8192 then raise exception 'ACTIVITY_CONFIG_INVALID'; end if;
 for k,v in select * from jsonb_each(p_config) loop
  if k not in ('activity_type','activity_instance_id','delivery_modes','required_entities','optional_entities','collection_priority','owner_approval','automatic_booking','service_area') then raise exception 'ACTIVITY_CONFIG_KEY_NOT_ALLOWED'; end if;
  if k in ('activity_type','activity_instance_id') and (jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[a-z][a-z0-9_]{0,63}$') then raise exception 'ACTIVITY_CONFIG_INVALID'; end if;
  if k in ('owner_approval','automatic_booking') and jsonb_typeof(v)<>'boolean' then raise exception 'ACTIVITY_CONFIG_INVALID'; end if;
  if k='delivery_modes' then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v) not between 1 and 6 then raise exception 'ACTIVITY_DELIVERY_MODE_INVALID'; end if;
   for mode in select jsonb_array_elements_text(v) loop
    if mode not in ('AT_BUSINESS','AT_CUSTOMER','MOBILE','REMOTE','PICKUP','DELIVERY') then raise exception 'ACTIVITY_DELIVERY_MODE_INVALID'; end if;
   end loop;
  end if;
  if k in ('required_entities','optional_entities','collection_priority') then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>12 then raise exception 'ACTIVITY_ENTITY_INVALID'; end if;
   for f in select jsonb_array_elements_text(v) loop
    if f not in ('service','branch','delivery_mode','vehicle','location','property_details','date','time','worker','slot') then raise exception 'ACTIVITY_ENTITY_INVALID'; end if;
    if k='optional_entities' and f in ('service','branch','delivery_mode','date','time','slot','location') then raise exception 'ACTIVITY_SAFETY_RULE_IMMUTABLE'; end if;
   end loop;
  end if;
  if k='service_area' and v<>'null'::jsonb then
   if v->>'type' is distinct from 'CIRCLE' or jsonb_typeof(v#>'{center,lat}') is distinct from 'number' or jsonb_typeof(v#>'{center,lng}') is distinct from 'number'
    or (v#>>'{center,lat}')::numeric not between -90 and 90 or (v#>>'{center,lng}')::numeric not between -180 and 180
    or jsonb_typeof(v->'radius_km') is distinct from 'number' or (v->>'radius_km')::numeric<=0 or (v->>'radius_km')::numeric>500 then raise exception 'ACTIVITY_SERVICE_AREA_INVALID'; end if;
  end if;
 end loop;
 return true;
end $$;
revoke all on function dabbir_private.activity_validate_config_v1(jsonb) from public,anon,authenticated;

create or replace function dabbir_private.activity_contract_v1(p_business_id uuid,p_branch_id uuid,p_service_id uuid) returns jsonb
language plpgsql stable security definer set search_path='pg_catalog','public' as $$
declare r jsonb; a jsonb; b public.dabbir_businesses%rowtype; s public.dabbir_services%rowtype;
 o public.dabbir_activity_service_versions%rowtype; c jsonb; modes jsonb; requirements jsonb:='{}'; mode text; required jsonb; optional jsonb; typ text; legacy jsonb;
begin
 select * into b from public.dabbir_businesses where id=p_business_id;
 select se.* into s from public.dabbir_services se join public.dabbir_branch_services bs on bs.business_id=se.business_id and bs.service_id=se.id
 join public.dabbir_business_branches br on br.business_id=bs.business_id and br.id=bs.branch_id and br.status='active'
 where se.business_id=p_business_id and bs.branch_id=p_branch_id and se.id=p_service_id and se.active and bs.active;
 if not found then raise exception 'ACTIVITY_SERVICE_SCOPE_INVALID'; end if;
 select schema into r from dabbir_private.activity_registry_v1 order by version desc limit 1;
 if r is null then raise exception 'ACTIVITY_REGISTRY_UNAVAILABLE'; end if;
 select * into o from public.dabbir_activity_service_versions where business_id=p_business_id and branch_id=p_branch_id and service_id=p_service_id order by version desc limit 1;
 c:=coalesce(o.config,'{}'); perform dabbir_private.activity_validate_config_v1(c);
 typ:=coalesce(c->>'activity_type',b.business_type,'other');
 if not (r->'activities' ? typ) then typ:='other'; end if;
 a:=r->'activities'->typ;
 modes:=coalesce(c->'delivery_modes',a->'default_delivery_modes');
 select coalesce(k.value->'required_fields','[]') into legacy from public.dabbir_business_knowledge k where k.business_id=p_business_id and k.knowledge_key='semantic_required_fields' and k.status='approved' and k.source='owner_approved';
 for mode in select jsonb_array_elements_text(modes) loop
  select coalesce(jsonb_agg(distinct v),'[]') into required from (
    select value v from jsonb_array_elements_text(a#>array['mode_requirements',mode,'required'])
    union select value from jsonb_array_elements_text(coalesce(c->'required_entities','[]'))
    union select value from jsonb_array_elements_text(coalesce(legacy,'[]')) where value in ('vehicle','location','worker')
  ) x where not coalesce(c->'optional_entities','[]') ? v;
  optional:=coalesce(c->'optional_entities',a#>array['mode_requirements',mode,'optional'],'[]');
  requirements:=requirements||jsonb_build_object(mode,jsonb_build_object('required',required,'optional',optional));
 end loop;
 return jsonb_build_object('business_id',p_business_id,'branch_id',p_branch_id,'service_id',p_service_id,'service_name',coalesce(s.name_ar,s.name,s.name_en),
  'activity_type',typ,'activity_instance_id',coalesce(c->>'activity_instance_id',typ),'schema_version',(a->>'version')::int,'registry_version',(r->>'version')::int,
  'owner_version',coalesce(o.version,0),'contract_version',md5(jsonb_build_object('registry',r,'config',c,'owner_version',coalesce(o.version,0),'service_id',s.id,'branch_id',p_branch_id,'duration',s.duration_minutes,'price',s.price_aed,'legacy',legacy)::text),
  'delivery_modes',modes,'mode_requirements',requirements,'collection_priority',coalesce(c->'collection_priority',r#>'{platform,collection_priority}'),
  'entity_definitions',r#>'{platform,entity_definitions}','operating_model',a->'operating_model','supported_actions',a->'supported_actions',
  'verification_rules',a->'verification_requirements','risk_rules',a->'default_risk_rules','ontology',a->'ontology',
  'owner_approval',coalesce((c->>'owner_approval')::boolean,false),'automatic_booking',coalesce((c->>'automatic_booking')::boolean,true),
  'service_area',nullif(c->'service_area','null'::jsonb),'duration',s.duration_minutes,'price_source','DATABASE_FACT','price',s.price_aed,
  'service_category',to_jsonb(s)->'category','booking_model','APPOINTMENT','capacity_model','EXISTING_BOOKING_ENGINE','availability_model','BRANCH_WORKER_SCHEDULE');
end $$;
revoke all on function dabbir_private.activity_contract_v1(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.dabbir_activity_profile_v1(p_business_id uuid,p_branch_id uuid) returns jsonb
language plpgsql stable security definer set search_path='pg_catalog','public','auth' as $$
declare result jsonb; contracts jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' and not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=auth.uid() and m.role='owner' and m.status='active') then raise exception 'OWNER_REQUIRED'; end if;
 if not exists(select 1 from public.dabbir_business_branches where business_id=p_business_id and id=p_branch_id and status='active') then raise exception 'ACTIVITY_BRANCH_SCOPE_INVALID'; end if;
 select jsonb_build_object('version',1,'source','DATABASE_FACT','business_id',b.id,'business_type',b.business_type,'branch_id',p_branch_id,
  'services',coalesce((select jsonb_agg(dabbir_private.activity_contract_v1(b.id,p_branch_id,s.id)) from public.dabbir_services s join public.dabbir_branch_services bs on bs.business_id=s.business_id and bs.service_id=s.id where s.business_id=b.id and bs.branch_id=p_branch_id and s.active and bs.active),'[]'),
  'workers',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'service_ids',coalesce((select jsonb_agg(ws.service_id) from public.dabbir_worker_services ws join public.dabbir_branch_services bs on bs.business_id=ws.business_id and bs.service_id=ws.service_id and bs.branch_id=p_branch_id and bs.active where ws.business_id=b.id and ws.worker_id=w.id and ws.active),'[]')))
    from public.dabbir_workers w join public.dabbir_worker_branches wb on wb.business_id=w.business_id and wb.worker_id=w.id where w.business_id=b.id and wb.branch_id=p_branch_id and wb.active and w.status='active'),'[]'),
  'branches',jsonb_build_array(jsonb_build_object('id',p_branch_id)),
  'owner_policies','VERSIONED_SERVICE_OVERRIDES','booking_model','APPOINTMENT','capacity_model','EXISTING_BOOKING_ENGINE',
  'pricing_model','DATABASE_SERVICE_PRICE','handoff_rules',jsonb_build_array('OWNER_APPROVAL','UNSAFE_OR_UNSUPPORTED','REPEATED_EXTRACTION_FAILURE'),
  'cancellation_rules','EXISTING_BOOKING_ENGINE','reschedule_rules','EXISTING_BOOKING_ENGINE','confirmation_rules','VERIFIED_SLOT_CUSTOMER_CONFIRMATION',
  'availability_rules','BRANCH_WORKER_SCHEDULE','verification_rules',jsonb_build_array('CURRENT_SEMANTIC_VERSION','DATABASE_READBACK')) into result
 from public.dabbir_businesses b where b.id=p_business_id;
 contracts:=result->'services';
 -- Only branch-scoped catalog data is exposed. Empty resources mean unconfigured,
 -- never an inferred team, asset, capacity or cross-branch fallback.
 result:=result||jsonb_build_object(
  'business_category',result->'business_type',
  'operating_model',coalesce((select jsonb_agg(distinct c->'operating_model') from jsonb_array_elements(contracts) c),'[]'),
  'delivery_modes',coalesce((select jsonb_agg(distinct mode) from jsonb_array_elements(contracts) c cross join lateral jsonb_array_elements(c->'delivery_modes') mode),'[]'),
  'service_categories',coalesce((select jsonb_agg(distinct c->'service_category') from jsonb_array_elements(contracts) c where c->'service_category' is not null and c->'service_category'<>'null'::jsonb),'[]'),
  'branches',(select jsonb_build_array(jsonb_build_object('id',br.id,'name',to_jsonb(br)->'name','timezone',to_jsonb(br)->'timezone','status',br.status)) from public.dabbir_business_branches br where br.business_id=p_business_id and br.id=p_branch_id),
  'service_areas',coalesce((select jsonb_agg(jsonb_build_object('service_id',c->'service_id','branch_id',p_branch_id,'area',c->'service_area','provider','registry_v1')) from jsonb_array_elements(contracts) c where c->'service_area'<>'null'::jsonb),'[]'),
  'teams','[]'::jsonb,'assets','[]'::jsonb,
  'resources',coalesce((select jsonb_agg(w||jsonb_build_object('type','WORKER','branch_id',p_branch_id)) from jsonb_array_elements(result->'workers') w),'[]'),
  'resource_configuration',jsonb_build_object('teams','NOT_CONFIGURED','assets','NOT_CONFIGURED','workers','BRANCH_WORKER_SCHEDULE'),
  'activity_instances',coalesce((select jsonb_agg(x) from (select c->'activity_instance_id' id,c->'activity_type' activity_type,c->'operating_model' operating_model,jsonb_agg(c->'service_id') service_ids from jsonb_array_elements(contracts) c group by c->'activity_instance_id',c->'activity_type',c->'operating_model') x),'[]'),
  'required_customer_facts',coalesce((select jsonb_agg(jsonb_build_object('service_id',c->'service_id','delivery_mode',m.key,'fields',(select jsonb_agg(distinct f) from (select jsonb_array_elements_text(m.value->'required') f union select unnest(array['service','date','time']) union select 'location' where m.key in ('MOBILE','AT_CUSTOMER','PICKUP','DELIVERY')) q))) from jsonb_array_elements(contracts) c cross join lateral jsonb_each(c->'mode_requirements') m),'[]'),
  'optional_customer_facts',coalesce((select jsonb_agg(jsonb_build_object('service_id',c->'service_id','delivery_mode',m.key,'fields',m.value->'optional')) from jsonb_array_elements(contracts) c cross join lateral jsonb_each(c->'mode_requirements') m),'[]'),
  'operational_constraints',jsonb_build_object('tenant_scope','EXACT','branch_scope','EXACT','required_facts','CURRENT_CONTRACT','inference_mutation_allowed',false,'diagnosis_allowed',false,'service_area_provider','registry_v1'),
  'owner_policies',coalesce((select jsonb_agg(jsonb_build_object('service_id',c->'service_id','version',c->'owner_version','contract_version',c->'contract_version','owner_approval',c->'owner_approval','automatic_booking',c->'automatic_booking')) from jsonb_array_elements(contracts) c),'[]')
 );
 return result;
end $$;
revoke all on function public.dabbir_activity_profile_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dabbir_activity_profile_v1(uuid,uuid) to authenticated,service_role;

create or replace function public.dabbir_activity_service_configure_v1(p_business_id uuid,p_branch_id uuid,p_service_id uuid,p_expected_version bigint,p_config jsonb default '{}',p_action text default 'SAVE',p_restore_version bigint default null) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare v bigint; c jsonb; typ text; r jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.dabbir_memberships m where m.business_id=p_business_id and m.user_id=auth.uid() and m.role='owner' and m.status='active') then raise exception 'OWNER_REQUIRED'; end if;
 perform 1 from public.dabbir_branch_services where business_id=p_business_id and branch_id=p_branch_id and service_id=p_service_id and active for update;
 if not found then raise exception 'ACTIVITY_SERVICE_SCOPE_INVALID'; end if;
 select coalesce(max(version),0) into v from public.dabbir_activity_service_versions where business_id=p_business_id and branch_id=p_branch_id and service_id=p_service_id;
 if p_expected_version is distinct from v then raise exception 'ACTIVITY_CONFIG_VERSION_CONFLICT'; end if;
 if p_action='SAVE' then c:=p_config;
 elsif p_action='REVOKE' then c:='{}';
 elsif p_action='ROLLBACK' then
  select config into c from public.dabbir_activity_service_versions where business_id=p_business_id and branch_id=p_branch_id and service_id=p_service_id and version=p_restore_version;
  if not found then raise exception 'ACTIVITY_ROLLBACK_VERSION_INVALID'; end if;
 else raise exception 'ACTIVITY_CONFIG_ACTION_INVALID'; end if;
 perform dabbir_private.activity_validate_config_v1(c);
 select schema into r from dabbir_private.activity_registry_v1 order by version desc limit 1;
 if c ? 'activity_type' and not (r->'activities' ? (c->>'activity_type')) then raise exception 'ACTIVITY_TYPE_INVALID'; end if;
 insert into public.dabbir_activity_service_versions(business_id,branch_id,service_id,version,config,action,restored_version,created_by)
 values(p_business_id,p_branch_id,p_service_id,v+1,c,p_action,p_restore_version,auth.uid());
 return jsonb_build_object('version',v+1,'action',p_action,'contract',dabbir_private.activity_contract_v1(p_business_id,p_branch_id,p_service_id));
end $$;
revoke all on function public.dabbir_activity_service_configure_v1(uuid,uuid,uuid,bigint,jsonb,text,bigint) from public,anon,authenticated;
grant execute on function public.dabbir_activity_service_configure_v1(uuid,uuid,uuid,bigint,jsonb,text,bigint) to authenticated;

insert into dabbir_private.activity_registry_v1(version,schema) values(1,$registry${"version":1,"platform":{"required":["service","branch","delivery_mode"],"location_modes":["MOBILE","AT_CUSTOMER","PICKUP","DELIVERY"],"collection_priority":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"entity_definitions":{"service":{"type":"CATALOG_REFERENCE","priority":10},"delivery_mode":{"type":"ENUM","priority":20},"vehicle":{"type":"ENUM","values":["saloon","station"],"priority":30,"question_ar":"السيارة صالون ولا ستيشن/SUV؟","question_en":"Is the vehicle a saloon/sedan or a station/SUV?"},"location":{"type":"VERIFIED_GPS","priority":40,"question_ar":"أرسل موقع الخدمة من خيار «الموقع» في واتساب.","question_en":"Please send the service location using WhatsApp Location."},"property_details":{"type":"TEXT","priority":45,"question_ar":"ما نوع العقار وحجمه؟","question_en":"What is the property type and size?"},"branch":{"type":"SCOPED_REFERENCE","priority":50},"date":{"type":"DATE","priority":60},"time":{"type":"TIME","priority":70},"worker":{"type":"SCOPED_REFERENCE","priority":80},"slot":{"type":"VERIFIED_SLOT","priority":90}},"automatic_booking":true,"owner_approval":false,"booking_model":"APPOINTMENT","capacity_model":"EXISTING_BOOKING_ENGINE","pricing_model":"DATABASE_SERVICE_PRICE","verification_rules":["SCOPED_CATALOG","FRESH_SLOT","CUSTOMER_CONFIRMATION","DATABASE_READBACK"]},"activities":{"services":{"version":1,"default_delivery_modes":["AT_BUSINESS"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","worker":"worker","branch":"branch"}},"car_wash":{"version":1,"default_delivery_modes":["MOBILE"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":["vehicle"],"optional":["worker"]},"MOBILE":{"required":["vehicle"],"optional":["worker"]},"REMOTE":{"required":["vehicle"],"optional":["worker"]},"PICKUP":{"required":["vehicle"],"optional":["worker"]},"DELIVERY":{"required":["vehicle"],"optional":["worker"]},"HYBRID":{"required":["vehicle"],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","vehicle":"vehicle","package":"service","team":"worker"}},"salon":{"version":1,"default_delivery_modes":["AT_BUSINESS"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","staff":"worker","branch":"branch"}},"home_cleaning":{"version":1,"default_delivery_modes":["AT_CUSTOMER"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":["property_details"],"optional":["worker"]},"AT_CUSTOMER":{"required":["property_details"],"optional":["worker"]},"MOBILE":{"required":["property_details"],"optional":["worker"]},"REMOTE":{"required":["property_details"],"optional":["worker"]},"PICKUP":{"required":["property_details"],"optional":["worker"]},"DELIVERY":{"required":["property_details"],"optional":["worker"]},"HYBRID":{"required":["property_details"],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","property":"property_details","team":"worker"}},"clinic":{"version":1,"default_delivery_modes":["AT_BUSINESS"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"ADMINISTRATIVE_ONLY","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","patient":"customer","appointment_type":"service","doctor":"worker","branch":"branch"}},"maintenance":{"version":1,"default_delivery_modes":["AT_CUSTOMER"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","property":"property_details","team":"worker"}},"delivery":{"version":1,"default_delivery_modes":["DELIVERY"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","worker":"worker","branch":"branch"}},"consulting":{"version":1,"default_delivery_modes":["REMOTE"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","worker":"worker","branch":"branch"}},"repair_shop":{"version":1,"default_delivery_modes":["AT_BUSINESS"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","worker":"worker","branch":"branch"}},"pet_grooming":{"version":1,"default_delivery_modes":["AT_BUSINESS"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","worker":"worker","branch":"branch"}},"barber":{"version":1,"default_delivery_modes":["AT_BUSINESS"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","staff":"worker","branch":"branch"}},"spa":{"version":1,"default_delivery_modes":["AT_BUSINESS"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","staff":"worker","branch":"branch"}},"laundry":{"version":1,"default_delivery_modes":["PICKUP"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","worker":"worker","branch":"branch"}},"tutoring":{"version":1,"default_delivery_modes":["REMOTE"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","worker":"worker","branch":"branch"}},"photography":{"version":1,"default_delivery_modes":["AT_CUSTOMER"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","worker":"worker","branch":"branch"}},"mobile_services":{"version":1,"default_delivery_modes":["MOBILE"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","property":"property_details","team":"worker"}},"other":{"version":1,"default_delivery_modes":["AT_BUSINESS"],"supported_delivery_modes":["AT_BUSINESS","AT_CUSTOMER","MOBILE","REMOTE","PICKUP","DELIVERY","HYBRID"],"mode_requirements":{"AT_BUSINESS":{"required":[],"optional":["worker"]},"AT_CUSTOMER":{"required":[],"optional":["worker"]},"MOBILE":{"required":[],"optional":["worker"]},"REMOTE":{"required":[],"optional":["worker"]},"PICKUP":{"required":[],"optional":["worker"]},"DELIVERY":{"required":[],"optional":["worker"]},"HYBRID":{"required":[],"optional":["worker"]}},"supported_actions":["SERVICE_MENU","PRICING","CHECK_AVAILABILITY","CREATE_BOOKING","CANCEL_BOOKING","RESCHEDULE_BOOKING","HANDOFF"],"operating_model":"APPOINTMENT","supported_entities":["service","delivery_mode","vehicle","location","property_details","branch","date","time","worker","slot"],"default_risk_rules":{"diagnosis_allowed":false,"inference_mutation_allowed":false},"verification_requirements":["branch_scope","current_semantic_version","provider_presented_slot","customer_confirmation","appointment_readback"],"ontology":{"customer":"customer","service":"service","slot":"slot","booking":"appointment","price":"price","duration":"duration","location":"location","service_area":"service_area","worker":"worker","branch":"branch"}}}}$registry$::jsonb);

create or replace function public.dabbir_whatsapp_persist_location_inbound_v1(
 p_phone_number_id text,p_provider_message_id text,p_sender_handle text,p_display_name text,p_body text,p_intent text,p_occurred_at timestamptz,p_location jsonb
) returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare r record; lat double precision; lng double precision;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 if jsonb_typeof(p_location->'lat') is distinct from 'number' or jsonb_typeof(p_location->'lng') is distinct from 'number' then raise exception 'WHATSAPP_LOCATION_INVALID'; end if;
 lat:=(p_location->>'lat')::double precision;lng:=(p_location->>'lng')::double precision;
 if lat not between -90 and 90 or lng not between -180 and 180 then raise exception 'WHATSAPP_LOCATION_INVALID'; end if;
 select * into r from public.dabbir_whatsapp_persist_inbound(p_phone_number_id,p_provider_message_id,p_sender_handle,p_display_name,p_body,p_intent,p_occurred_at);
 if r.message_id is null or r.conversation_id is null or r.business_id is null then raise exception 'WHATSAPP_LOCATION_PERSISTENCE_UNVERIFIED'; end if;
 if not exists(select 1 from public.dabbir_messages m where m.id=r.message_id and m.business_id=r.business_id and m.conversation_id=r.conversation_id and m.sender_type='customer' and not m.simulated) then raise exception 'WHATSAPP_LOCATION_SCOPE_INVALID'; end if;
 insert into public.dabbir_whatsapp_location_receipts(message_id,business_id,conversation_id,latitude,longitude,label)
 values(r.message_id,r.business_id,r.conversation_id,lat,lng,left(coalesce(p_location->>'label',''),180)) on conflict(message_id) do nothing;
 if not exists(select 1 from public.dabbir_whatsapp_location_receipts where message_id=r.message_id and business_id=r.business_id and conversation_id=r.conversation_id and latitude=lat and longitude=lng) then raise exception 'WHATSAPP_LOCATION_REPLAY_MISMATCH'; end if;
 return to_jsonb(r);
end $$;
revoke all on function public.dabbir_whatsapp_persist_location_inbound_v1(text,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_persist_location_inbound_v1(text,text,text,text,text,text,timestamptz,jsonb) to service_role;

create or replace function dabbir_private.activity_assert_state_v1(p_business_id uuid,p_branch_id uuid,p_customer_id uuid,p_conversation_id uuid,p_state jsonb,p_service_id uuid) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public' as $$
declare contract jsonb; mode text; req text[]; k text; f jsonb; e jsonb:=p_state->'entities'; location jsonb; lat double precision; lng double precision; area jsonb; d double precision; memory public.dabbir_customer_memory%rowtype;
begin
 contract:=dabbir_private.activity_contract_v1(p_business_id,p_branch_id,p_service_id);
 if p_state->>'activity_contract_version' is distinct from contract->>'contract_version' then raise exception 'ACTIVITY_CONTRACT_STALE'; end if;
 if p_state#>>'{scope,business_id}' is distinct from p_business_id::text or p_state#>>'{scope,branch_id}' is distinct from p_branch_id::text or p_state#>>'{scope,customer_id}' is distinct from p_customer_id::text or p_state#>>'{scope,conversation_id}' is distinct from p_conversation_id::text then raise exception 'ACTIVITY_STATE_SCOPE_INVALID'; end if;
 if (contract->>'automatic_booking')::boolean is not true or (contract->>'owner_approval')::boolean is true then raise exception 'ACTIVITY_OWNER_APPROVAL_REQUIRED'; end if;
 mode:=e#>>'{delivery_mode,value}';
 if mode is null or mode='HYBRID' or not (contract->'delivery_modes' ? mode) or p_state->>'delivery_mode' is distinct from mode then raise exception 'ACTIVITY_DELIVERY_MODE_UNRESOLVED'; end if;
 select array_agg(distinct v) into req from (
  select unnest(array['service','branch','delivery_mode','slot']) v
  union select jsonb_array_elements_text(contract#>array['mode_requirements',mode,'required'])
  union select 'location' where mode in ('MOBILE','AT_CUSTOMER','PICKUP','DELIVERY')
 ) x;
 foreach k in array req loop
  f:=e->k;
  if f is null or f->'value' is null or f->'value'='null'::jsonb or f->>'value'='' or f->>'status' is distinct from 'active' or coalesce((f->>'confidence')::numeric,0)<.9
   or coalesce(f->>'source','') not in ('DATABASE_FACT','CUSTOMER_STATED','CUSTOMER_CONFIRMED','CUSTOMER_CORRECTION','CUSTOMER_MEMORY','OWNER_POLICY','VERIFIED_BUSINESS_KNOWLEDGE','PROVIDER_VERIFIED') then raise exception 'ACTIVITY_REQUIRED_FACT_UNVERIFIED:%',k; end if;
  if k='service' and f->>'value' is distinct from p_service_id::text then raise exception 'ACTIVITY_SERVICE_MISMATCH'; end if;
  if k='branch' and f->>'value' is distinct from p_branch_id::text then raise exception 'ACTIVITY_BRANCH_MISMATCH'; end if;
  if k='vehicle' and not (contract#>'{entity_definitions,vehicle,values}' ? (f->>'value')) then raise exception 'ACTIVITY_VEHICLE_INVALID'; end if;
  if k='property_details' and (jsonb_typeof(f->'value')<>'string' or length(trim(f->>'value')) not between 2 and 300) then raise exception 'ACTIVITY_PROPERTY_INVALID'; end if;
  if k='worker' and not exists(select 1 from public.dabbir_workers w join public.dabbir_worker_branches wb on wb.business_id=w.business_id and wb.worker_id=w.id and wb.branch_id=p_branch_id and wb.active
    join public.dabbir_worker_services ws on ws.business_id=w.business_id and ws.worker_id=w.id and ws.service_id=p_service_id and ws.active where w.business_id=p_business_id and w.id::text=f->>'value' and w.status='active') then raise exception 'ACTIVITY_WORKER_SCOPE_INVALID'; end if;
  if f->>'source'='CUSTOMER_MEMORY' then
   select * into memory from public.dabbir_customer_memory m where m.id::text=f->>'memory_id' and m.version=(f->>'memory_version')::bigint and m.business_id=p_business_id and m.customer_id=p_customer_id
     and m.status='verified' and m.confidence>=.9 and m.expires_at>now() and m.last_confirmed_at is not null and m.value->>'branch_id'=p_branch_id::text and (m.value->>'service_id' is null or m.value->>'service_id'=p_service_id::text)
     and m.source in ('DATABASE_FACT','CUSTOMER_CONFIRMED','OWNER_POLICY','PROVIDER_VERIFIED');
   if not found or coalesce(memory.value->'value',memory.value->'id') is distinct from f->'value' then raise exception 'ACTIVITY_MEMORY_STALE'; end if;
  end if;
  if k='location' then
   location:=f->'value';
   if jsonb_typeof(location->'lat') is distinct from 'number' or jsonb_typeof(location->'lng') is distinct from 'number' then raise exception 'ACTIVITY_LOCATION_INVALID'; end if;
   lat:=(location->>'lat')::double precision;lng:=(location->>'lng')::double precision;
   if lat not between -90 and 90 or lng not between -180 and 180 then raise exception 'ACTIVITY_LOCATION_INVALID'; end if;
   if f->>'source'<>'CUSTOMER_MEMORY' and not exists(select 1 from public.dabbir_whatsapp_location_receipts r where r.message_id::text=f->>'receipt_id' and r.business_id=p_business_id and r.conversation_id=p_conversation_id and r.latitude=lat and r.longitude=lng and r.created_at>now()-interval '24 hours') then raise exception 'ACTIVITY_LOCATION_RECEIPT_UNVERIFIED'; end if;
  end if;
 end loop;
 area:=contract->'service_area';
 if 'location'=any(req) and area is not null and area<>'null'::jsonb then
  if area->>'type' is distinct from 'CIRCLE' then raise exception 'ACTIVITY_SERVICE_AREA_UNVERIFIED'; end if;
  d:=power(sin(radians(lat-(area#>>'{center,lat}')::double precision)/2),2)+cos(radians(lat))*cos(radians((area#>>'{center,lat}')::double precision))*power(sin(radians(lng-(area#>>'{center,lng}')::double precision)/2),2);
  d:=6371*2*atan2(sqrt(d),sqrt(greatest(0,1-d)));
  if d>(area->>'radius_km')::double precision then raise exception 'ACTIVITY_OUTSIDE_SERVICE_AREA'; end if;
 end if;
 return contract;
end $$;
revoke all on function dabbir_private.activity_assert_state_v1(uuid,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;

create or replace function dabbir_private.activity_booking_invariant_v1() returns trigger
language plpgsql security definer set search_path='pg_catalog','public' as $$
declare s public.dabbir_ai_conversation_state%rowtype; b public.dabbir_message_batches%rowtype; matches int; contract jsonb;
begin
 if coalesce(new.booking_source,'')<>'whatsapp' then return new; end if;
 select count(*) into matches from public.dabbir_ai_conversation_state st join public.dabbir_conversations c on c.business_id=st.business_id and c.id=st.conversation_id
  where st.business_id=new.business_id and c.customer_id=new.customer_id and c.branch_id=new.branch_id and c.channel_type='whatsapp' and not c.demo_mode
  and st.semantic_message_revision=c.understanding_revision and st.semantic_state->>'pending_action'='CREATE_BOOKING'
  and st.semantic_state#>>'{entities,service,value}'=new.service_id::text and (st.semantic_state#>>'{entities,slot,starts_at}')::timestamptz=new.starts_at;
 if matches<>1 then raise exception 'ACTIVITY_GROUNDED_CONTEXT_REQUIRED'; end if;
 select st.* into s from public.dabbir_ai_conversation_state st join public.dabbir_conversations c on c.business_id=st.business_id and c.id=st.conversation_id
  where st.business_id=new.business_id and c.customer_id=new.customer_id and c.branch_id=new.branch_id and c.channel_type='whatsapp' and not c.demo_mode
  and st.semantic_message_revision=c.understanding_revision and st.semantic_state->>'pending_action'='CREATE_BOOKING'
  and st.semantic_state#>>'{entities,service,value}'=new.service_id::text and (st.semantic_state#>>'{entities,slot,starts_at}')::timestamptz=new.starts_at;
 select * into b from public.dabbir_message_batches where id=s.semantic_batch_id;
 perform dabbir_private.understanding_assert_batch_v2(b.id,b.lock_token,s.semantic_message_revision);
 if s.updated_at<now()-interval '30 minutes' or coalesce((s.semantic_state->>'operational_confidence')::numeric,0)<.9 or s.semantic_state->'missing_fields'<>'[]'::jsonb or s.semantic_state->'unresolved_references'<>'[]'::jsonb then raise exception 'ACTIVITY_STATE_UNVERIFIED'; end if;
 if s.payload->>'activity_contract_version' is distinct from s.semantic_state->>'activity_contract_version' then raise exception 'ACTIVITY_SLOT_CONTRACT_STALE'; end if;
 if s.pending_action<>'choose_slot' or s.expires_at<=now() or s.expires_at is null or s.payload->>'presented' is distinct from 'true' or s.semantic_state#>>'{entities,slot,source}' is distinct from 'CUSTOMER_CONFIRMED'
   or not exists(select 1 from public.dabbir_whatsapp_outbound_reservations r where r.business_id=new.business_id and r.conversation_id=s.conversation_id and r.provider_message_id=s.payload->>'provider_message_id' and r.state in ('PROVIDER_ACCEPTED','SENT','DELIVERED','READ')) then raise exception 'ACTIVITY_SLOT_UNVERIFIED'; end if;
 if (s.payload->'slots'->((s.semantic_state#>>'{entities,slot,value}')::int)->>'starts_at')::timestamptz is distinct from new.starts_at or s.payload->'slots'->((s.semantic_state#>>'{entities,slot,value}')::int)->>'service_id' is distinct from new.service_id::text then raise exception 'ACTIVITY_SLOT_MISMATCH'; end if;
 if s.payload->'slots'->((s.semantic_state#>>'{entities,slot,value}')::int)->>'worker_id' is distinct from new.worker_id::text then raise exception 'ACTIVITY_SLOT_WORKER_MISMATCH'; end if;
 contract:=dabbir_private.activity_assert_state_v1(new.business_id,new.branch_id,new.customer_id,s.conversation_id,s.semantic_state,new.service_id);
 if s.semantic_state->>'delivery_mode' in ('MOBILE','AT_CUSTOMER','PICKUP','DELIVERY') or contract#>array['mode_requirements',s.semantic_state->>'delivery_mode','required'] ? 'location' then
  new.location_type:='customer';
  new.service_latitude:=(s.semantic_state#>>'{entities,location,value,lat}')::double precision;
  new.service_longitude:=(s.semantic_state#>>'{entities,location,value,lng}')::double precision;
  new.service_address:=left(coalesce(s.semantic_state#>>'{entities,location,value,label}',''),500);
 end if;
 new.activity_intelligence:=jsonb_build_object('contract_version',contract->>'contract_version','activity_type',contract->>'activity_type','delivery_mode',s.semantic_state->>'delivery_mode','semantic_version',s.semantic_version,
   'vehicle',s.semantic_state#>'{entities,vehicle,value}','property_details',s.semantic_state#>'{entities,property_details,value}');
 return new;
end $$;
revoke all on function dabbir_private.activity_booking_invariant_v1() from public,anon,authenticated;
alter table public.dabbir_appointments add column activity_intelligence jsonb;
-- Replace the vertical trigger with one service-aware invariant; old migration is untouched.
drop trigger if exists dabbir_car_wash_whatsapp_booking_grounding_v1 on public.dabbir_appointments;
create trigger dabbir_activity_booking_invariant_v1 before insert on public.dabbir_appointments for each row execute function dabbir_private.activity_booking_invariant_v1();

CREATE OR REPLACE FUNCTION public.dabbir_semantic_load_v2(p_batch_id uuid, p_lock_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare b public.dabbir_message_batches%rowtype; c public.dabbir_conversations%rowtype; s public.dabbir_ai_conversation_state%rowtype; memory record;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
  select * into c from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id;
  -- Only completed, scoped operational history can hydrate structured memory.
  for memory in
    select distinct on (key) key,ref,confirmed_at from (
      select 'last_verified_service'::text key,a.service_id ref,a.starts_at confirmed_at from public.dabbir_appointments a where a.business_id=b.business_id and a.customer_id=b.customer_id and a.branch_id=c.branch_id and a.status='completed' and not a.simulated and a.service_id is not null and a.starts_at>now()-interval '180 days'
      union all
      select 'last_verified_worker',a.worker_id,a.starts_at from public.dabbir_appointments a where a.business_id=b.business_id and a.customer_id=b.customer_id and a.branch_id=c.branch_id and a.status='completed' and not a.simulated and a.worker_id is not null and a.starts_at>now()-interval '180 days'
    ) facts order by key,confirmed_at desc
  loop
    insert into public.dabbir_customer_memory(business_id,customer_id,memory_key,value,source,confidence,status,version,last_confirmed_at,expires_at)
      values(b.business_id,b.customer_id,memory.key,jsonb_build_object('id',memory.ref,'branch_id',c.branch_id),'DATABASE_FACT',1,'verified',1,memory.confirmed_at,memory.confirmed_at+interval '180 days')
      on conflict(business_id,customer_id,memory_key) do update set value=excluded.value,source=excluded.source,confidence=1,status='verified',version=public.dabbir_customer_memory.version+1,last_confirmed_at=excluded.last_confirmed_at,expires_at=excluded.expires_at
      where public.dabbir_customer_memory.status<>'revoked' and (public.dabbir_customer_memory.last_confirmed_at is null or public.dabbir_customer_memory.last_confirmed_at<excluded.last_confirmed_at);
  end loop;
  select * into s from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id;
  return jsonb_build_object('activity_profile',public.dabbir_activity_profile_v1(b.business_id,c.branch_id),'location_receipts',coalesce((select jsonb_agg(jsonb_build_object('message_id',r.message_id,'business_id',r.business_id,'conversation_id',r.conversation_id,'value',jsonb_build_object('lat',r.latitude,'lng',r.longitude,'label',r.label))) from public.dabbir_whatsapp_location_receipts r join public.dabbir_message_batch_items i on i.message_id=r.message_id and i.business_id=r.business_id where i.batch_id=b.id and r.conversation_id=c.id),'[]'), 'branches',coalesce((select jsonb_agg(jsonb_build_object('id',br.id,'name',br.name)) from public.dabbir_business_branches br where br.business_id=b.business_id and br.status='active'),'[]'),
    'understanding_policy',coalesce((select k.value from public.dabbir_business_knowledge k where k.business_id=b.business_id and k.knowledge_key='semantic_required_fields' and k.source='owner_approved' and k.status='approved' and k.confidence=1),'{}'),
    'version',coalesce(s.semantic_version,0),'message_revision',c.understanding_revision,'semantic_state',coalesce(s.semantic_state,'{}'),
    'verified_memory',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'branch_id',x.value->>'branch_id','service_id',x.value->>'service_id','business_id',x.business_id,'customer_id',x.customer_id,'memory_key',x.memory_key,'value',x.value,'source',x.source,'status',x.status,'confidence',x.confidence,'version',x.version,'expires_at',x.expires_at,'last_confirmed_at',x.last_confirmed_at)) from (select * from public.dabbir_customer_memory m where m.business_id=b.business_id and m.customer_id=b.customer_id and m.status='verified' and m.last_confirmed_at is not null and m.expires_at>now() and m.value->>'branch_id'=c.branch_id::text order by m.last_confirmed_at desc limit 12)x),'[]'::jsonb),
    'approved_aliases',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'business_id',x.business_id,'entity_type',x.entity_type,'alias',x.alias,'target_id',x.target_id,'status',x.status,'version',x.version)) from (select * from public.dabbir_ai_knowledge_proposals k where k.business_id=b.business_id and k.status='OWNER_APPROVED' order by k.reviewed_at desc limit 30)x),'[]'::jsonb),
    'voice',(select jsonb_build_object('audio_confidence',null,'transcription_confidence',min(v.transcription_confidence),'clarification_required',bool_or(v.clarification_required)) from public.dabbir_whatsapp_voice_ingest v join public.dabbir_message_batch_items i on i.message_id=v.message_id and i.business_id=v.business_id where i.batch_id=b.id having count(*)>0));
end $function$
;

create or replace function public.dabbir_semantic_commit_v2(p_batch_id uuid,p_lock_token uuid,p_expected_version bigint,p_message_revision bigint,p_state jsonb,p_metrics jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare b public.dabbir_message_batches%rowtype; c public.dabbir_conversations%rowtype; s public.dabbir_ai_conversation_state%rowtype; f record; v bigint;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token,p_message_revision);
  select * into c from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id;
  if jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>32768 or p_state->>'version' is distinct from '2' or
    p_state#>>'{scope,business_id}' is distinct from b.business_id::text or p_state#>>'{scope,conversation_id}' is distinct from b.conversation_id::text or
    p_state#>>'{scope,customer_id}' is distinct from b.customer_id::text or p_state#>>'{scope,branch_id}' is distinct from c.branch_id::text then raise exception 'SEMANTIC_STATE_SCOPE_INVALID'; end if;
  if jsonb_typeof(p_state->'entities') is distinct from 'object' or jsonb_typeof(p_state->'missing_fields') is distinct from 'array' or jsonb_typeof(p_state->'unresolved_references') is distinct from 'array' then raise exception 'SEMANTIC_STATE_CONTRACT_INVALID'; end if;
  for f in select key,value from jsonb_each(p_state->'entities') loop
    if f.key not in ('service','date','time','location','vehicle','worker','branch','appointment','slot','price','customer_reference','delivery_mode','property_details') or
      coalesce(f.value->>'source','') not in ('DATABASE_FACT','CUSTOMER_STATED','CUSTOMER_CONFIRMED','CUSTOMER_CORRECTION','CUSTOMER_MEMORY','OWNER_POLICY','VERIFIED_BUSINESS_KNOWLEDGE','PROVIDER_VERIFIED','AI_INFERENCE') or
      coalesce((f.value->>'confidence')::numeric,-1) not between 0 and 1 then raise exception 'SEMANTIC_ENTITY_INVALID'; end if;
  end loop;
  if octet_length(p_metrics::text)>2048 or jsonb_typeof(p_metrics)<>'object' then raise exception 'SEMANTIC_METRICS_INVALID'; end if;
  insert into public.dabbir_ai_conversation_state(business_id,conversation_id) values(b.business_id,b.conversation_id) on conflict do nothing;
  select * into s from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id for update;
  if s.semantic_batch_id=b.id then return jsonb_build_object('version',s.semantic_version,'replay',true,'state',s.semantic_state); end if;
  if s.semantic_version<>p_expected_version then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
  v:=s.semantic_version+1;
  update public.dabbir_ai_conversation_state set semantic_state=p_state,semantic_version=v,semantic_batch_id=b.id,semantic_message_revision=p_message_revision,updated_at=now() where business_id=b.business_id and conversation_id=b.conversation_id;
  insert into public.dabbir_ai_understanding_events(business_id,conversation_id,batch_id,event_type,version,metrics)
    values(b.business_id,b.conversation_id,b.id,'UNDERSTOOD',v,p_metrics);
  return jsonb_build_object('version',v,'replay',false,'state',p_state);
end $$;
revoke all on function public.dabbir_semantic_commit_v2(uuid,uuid,bigint,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_commit_v2(uuid,uuid,bigint,bigint,jsonb,jsonb) to service_role;


CREATE OR REPLACE FUNCTION public.dabbir_semantic_execute_v2(p_batch_id uuid, p_lock_token uuid, p_version bigint, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare b public.dabbir_message_batches%rowtype; s public.dabbir_ai_conversation_state%rowtype; e jsonb; slot jsonb; result jsonb;
  k text; a uuid; w uuid; sid uuid; c public.dabbir_conversations%rowtype; entry public.dabbir_ai_action_ledger%rowtype;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
  select * into c from public.dabbir_conversations where business_id=b.business_id and id=b.conversation_id;
  select * into s from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id for update;
  if not found or s.semantic_batch_id is distinct from b.id or s.semantic_version<>p_version or s.semantic_message_revision<>c.understanding_revision then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
  if p_action not in ('CREATE_BOOKING','CANCEL_BOOKING','RESCHEDULE_BOOKING') or s.semantic_state->>'pending_action' is distinct from p_action then raise exception 'SEMANTIC_OPERATION_NOT_AUTHORIZED'; end if;
  if coalesce((s.semantic_state->>'operational_confidence')::numeric,0)<0.9 or jsonb_array_length(s.semantic_state->'missing_fields')<>0 or jsonb_array_length(s.semantic_state->'unresolved_references')<>0 then raise exception 'SEMANTIC_MUTATION_BLOCKED'; end if;
  e:=s.semantic_state->'entities';
  if exists(select 1 from jsonb_array_elements(coalesce(s.semantic_state->'policy_dependencies','[]')) dep where not exists(select 1 from public.dabbir_ai_knowledge_proposals p where p.business_id=b.business_id and p.id=(dep->>'id')::uuid and p.version=(dep->>'version')::bigint and p.status='OWNER_APPROVED')) then raise exception 'SEMANTIC_POLICY_REVOKED'; end if;
  k:='understanding-v2:'||b.id::text||':'||lower(p_action);
  -- A verified retry reuses the existing ledger and never repeats a mutation.
  select * into entry from public.dabbir_ai_action_ledger where business_id=b.business_id and conversation_id=b.conversation_id and operation_key=k;
  if found then return entry.result||jsonb_build_object('idempotent_replay',true,'timezone',(select timezone from public.dabbir_businesses where id=b.business_id),'provider_confirmation','PENDING_DELIVERY'); end if;
  if p_action in ('CANCEL_BOOKING','RESCHEDULE_BOOKING') then
    if coalesce(e#>>'{appointment,source}','') not in ('CUSTOMER_CONFIRMED','CUSTOMER_CORRECTION') or coalesce((e#>>'{appointment,confidence}')::numeric,0)<.95 then raise exception 'SEMANTIC_APPOINTMENT_UNCONFIRMED'; end if;
    a:=(e#>>'{appointment,value}')::uuid;
    if not exists(select 1 from public.dabbir_appointments ap where ap.id=a and ap.business_id=b.business_id and ap.branch_id=c.branch_id and ap.customer_id=c.customer_id and not ap.simulated) then raise exception 'SEMANTIC_APPOINTMENT_SCOPE_INVALID'; end if;
  end if;
  if p_action in ('CREATE_BOOKING','RESCHEDULE_BOOKING') then
    if not exists(select 1 from public.dabbir_whatsapp_outbound_reservations r where r.business_id=b.business_id and r.conversation_id=b.conversation_id and r.provider_message_id=s.payload->>'provider_message_id' and r.state in ('PROVIDER_ACCEPTED','SENT','DELIVERED','READ')) then raise exception 'ACTIVITY_SLOT_UNVERIFIED'; end if;
    if s.payload->>'activity_contract_version' is distinct from s.semantic_state->>'activity_contract_version' then raise exception 'ACTIVITY_SLOT_CONTRACT_STALE'; end if;
 if s.pending_action<>'choose_slot' or s.expires_at is null or s.expires_at<=now() or s.payload->>'presented' is distinct from 'true' or coalesce(e#>>'{slot,source}','')<>'CUSTOMER_CONFIRMED' or coalesce((e#>>'{slot,confidence}')::numeric,0)<.95 then raise exception 'SEMANTIC_SLOT_UNCONFIRMED'; end if;
    slot:=s.payload->'slots'->((e#>>'{slot,value}')::int);
    if slot is null or slot->>'starts_at' is distinct from e#>>'{slot,starts_at}' then raise exception 'SEMANTIC_SLOT_MISMATCH'; end if;
    sid:=(slot->>'service_id')::uuid;w:=nullif(slot->>'worker_id','')::uuid;
    if p_action='RESCHEDULE_BOOKING' and (s.payload->>'mode'<>'reschedule' or s.payload->>'appointment_id' is distinct from a::text) then raise exception 'SEMANTIC_APPOINTMENT_MISMATCH'; end if;
    if p_action='CREATE_BOOKING' and s.payload->>'mode' is distinct from 'booking' then raise exception 'SEMANTIC_SLOT_MODE_MISMATCH'; end if;
    if s.payload->>'activity_contract_version' is distinct from s.semantic_state->>'activity_contract_version' then raise exception 'ACTIVITY_SLOT_CONTRACT_STALE'; end if;
    perform 1 from public.dabbir_branch_services where business_id=b.business_id and branch_id=c.branch_id and service_id=sid for share;
    perform 1 from public.dabbir_services where business_id=b.business_id and id=sid for share;
    perform dabbir_private.activity_assert_state_v1(b.business_id,c.branch_id,c.customer_id,c.id,s.semantic_state,sid);
    if p_action='CREATE_BOOKING' then
      result:=public.dabbir_whatsapp_ai_create_booking(b.business_id,b.conversation_id,sid,w,(slot->>'starts_at')::timestamptz,k,'Booked through grounded DABBIR Understanding V2.');
    else result:=public.dabbir_whatsapp_ai_reschedule_booking(b.business_id,b.conversation_id,a,(slot->>'starts_at')::timestamptz,k); end if;
  else result:=public.dabbir_whatsapp_ai_cancel_booking(b.business_id,b.conversation_id,a,k); end if;
  if coalesce((result->>'verified')::boolean,false) is not true or not exists(select 1 from public.dabbir_appointments ap where ap.id=(result->>'appointment_id')::uuid and ap.business_id=b.business_id and ap.branch_id=c.branch_id and ap.customer_id=c.customer_id and ap.status=result->>'status') then raise exception 'SEMANTIC_OUTCOME_NOT_VERIFIED'; end if;
  result:=result||jsonb_build_object('timezone',(select timezone from public.dabbir_businesses where id=b.business_id),'provider_confirmation','PENDING_DELIVERY');
  update public.dabbir_ai_conversation_state set semantic_state=semantic_state||jsonb_build_object('last_verified_action',jsonb_build_object('action',p_action,'appointment_id',result->>'appointment_id','source','DATABASE_FACT','at',now()),'last_verified_outcome',jsonb_build_object('status',result->>'status','source','DATABASE_FACT','provider_confirmation','PENDING_DELIVERY','at',now())),updated_at=now() where business_id=b.business_id and conversation_id=b.conversation_id;
  if p_action='CREATE_BOOKING' then
    select * into entry from public.dabbir_ai_action_ledger where business_id=b.business_id and operation_key=k;
    insert into public.dabbir_customer_memory(business_id,customer_id,memory_key,value,source,confidence,status,version,last_confirmed_at,expires_at,verified_action_id)
      values(b.business_id,b.customer_id,'last_verified_service',jsonb_build_object('id',sid,'branch_id',c.branch_id,'service_id',sid),'DATABASE_FACT',1,'verified',1,now(),now()+interval '180 days',entry.id)
      on conflict(business_id,customer_id,memory_key) do update set value=excluded.value,source=excluded.source,confidence=1,status='verified',version=public.dabbir_customer_memory.version+1,last_confirmed_at=now(),expires_at=excluded.expires_at,verified_action_id=excluded.verified_action_id
      where public.dabbir_customer_memory.status<>'revoked';
  end if;
  if p_action='CREATE_BOOKING' then
    insert into public.dabbir_customer_memory(business_id,customer_id,memory_key,value,source,confidence,status,version,last_confirmed_at,expires_at,verified_action_id)
    select b.business_id,b.customer_id,'last_verified_'||f.key,jsonb_build_object('value',f.value->'value','branch_id',c.branch_id,'service_id',sid),'DATABASE_FACT',1,'verified',1,now(),now()+interval '30 days',entry.id
    from jsonb_each(e) f where f.key in ('location','vehicle') and f.value->>'status'='active' and f.value->>'source'<>'AI_INFERENCE'
    on conflict(business_id,customer_id,memory_key) do update set value=excluded.value,source=excluded.source,confidence=1,status='verified',version=public.dabbir_customer_memory.version+1,last_confirmed_at=now(),expires_at=excluded.expires_at,verified_action_id=excluded.verified_action_id
    where public.dabbir_customer_memory.status<>'revoked';
  end if;
  insert into public.dabbir_ai_understanding_events(business_id,conversation_id,batch_id,event_type,version,metrics) values(b.business_id,b.conversation_id,b.id,'VERIFIED_ACTION',p_version,jsonb_build_object('action',p_action,'verified',true,'provider_verified',false)) on conflict do nothing;
  return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.dabbir_whatsapp_ai_handoff(p_business_id uuid, p_conversation_id uuid, p_route_class text DEFAULT 'SUPPORT'::text, p_reason text DEFAULT 'Customer requested human assistance'::text, p_summary text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare v_conversation public.dabbir_conversations%rowtype;v_handoff public.dabbir_handoffs%rowtype;v_route text:=upper(trim(coalesce(p_route_class,'SUPPORT')));
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;if v_route not in ('SALES','SUPPORT','BOOKING','RETURNS','COMPLAINT','OWNER_DECISION') then v_route:='SUPPORT'; end if;
  select * into v_conversation from public.dabbir_conversations c where c.business_id=p_business_id and c.id=p_conversation_id and c.channel_type='whatsapp' and c.demo_mode=false and c.state<>'closed' for update;if not found then raise exception 'AI_CONVERSATION_NOT_FOUND'; end if;
  select * into v_handoff from public.dabbir_handoffs h where h.business_id=p_business_id and h.conversation_id=p_conversation_id and h.state in ('QUEUED','ASSIGNED','HUMAN_ACTIVE') order by h.created_at desc limit 1 for update;
  if not found then insert into public.dabbir_handoffs(business_id,conversation_id,customer_id,route_class,reason,state,priority,routing_strategy,summary,attempted_actions,unresolved_items,metadata) values(p_business_id,p_conversation_id,v_conversation.customer_id,v_route,left(coalesce(p_reason,'Customer requested human assistance'),500),'QUEUED',70,'least_open',left(coalesce(p_summary,''),1200),'[]'::jsonb,'[]'::jsonb,jsonb_build_object('source','dabbir_whatsapp_ai','customer_requested_human',p_reason='CUSTOMER_REQUESTED_HUMAN')) returning * into v_handoff;end if;
  update public.dabbir_conversations set state='action_required',updated_at=now() where business_id=p_business_id and id=p_conversation_id;perform public.dabbir_whatsapp_ai_set_state(p_business_id,p_conversation_id,'handoff',jsonb_build_object('handoff_id',v_handoff.id,'route_class',v_handoff.route_class),3600);return jsonb_build_object('ok',true,'verified',true,'handoff_id',v_handoff.id,'state',v_handoff.state,'route_class',v_handoff.route_class);
end;$function$
;

revoke all on function public.dabbir_semantic_load_v2(uuid,uuid), public.dabbir_semantic_execute_v2(uuid,uuid,bigint,text), public.dabbir_whatsapp_ai_handoff(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_load_v2(uuid,uuid), public.dabbir_semantic_execute_v2(uuid,uuid,bigint,text), public.dabbir_whatsapp_ai_handoff(uuid,uuid,text,text,text) to service_role;

create or replace function public.dabbir_semantic_set_pending_v2(p_batch_id uuid,p_lock_token uuid,p_version bigint,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare b public.dabbir_message_batches%rowtype;
begin
  b:=dabbir_private.understanding_assert_batch_v2(p_batch_id,p_lock_token);
  if octet_length(p_payload::text)>8192 then raise exception 'SEMANTIC_PENDING_TOO_LARGE'; end if;
  if not exists(select 1 from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id and semantic_batch_id=b.id and semantic_version=p_version) then raise exception 'SEMANTIC_VERSION_CONFLICT'; end if;
  if p_payload->>'presented'='true' and not exists(select 1 from public.dabbir_whatsapp_outbound_reservations r where r.business_id=b.business_id and r.conversation_id=b.conversation_id and r.provider_message_id=p_payload->>'provider_message_id' and r.state in ('PROVIDER_ACCEPTED','SENT','DELIVERED','READ')) then raise exception 'SEMANTIC_PRESENTATION_UNVERIFIED'; end if;
  if p_action='choose_slot' then p_payload:=p_payload||jsonb_build_object('activity_contract_version',(select semantic_state->>'activity_contract_version' from public.dabbir_ai_conversation_state where business_id=b.business_id and conversation_id=b.conversation_id)); end if;
  return public.dabbir_whatsapp_ai_set_state(b.business_id,b.conversation_id,p_action,p_payload,900);
end $$;
revoke all on function public.dabbir_semantic_set_pending_v2(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.dabbir_semantic_set_pending_v2(uuid,uuid,bigint,text,jsonb) to service_role;


-- Flows collect common booking facts; location is collected only by Activity Intelligence.
CREATE OR REPLACE FUNCTION public.dabbir_whatsapp_consume_booking_flow_reply(p_phone_number_id text, p_provider_message_id text, p_sender_handle text, p_token_hash text, p_service_id uuid, p_location text, p_preferred_date text, p_preferred_time text, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(message_id uuid, conversation_id uuid, duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'dabbir_private', 'auth'
AS $function$
declare
  s public.dabbir_whatsapp_flow_sessions%rowtype;
  w public.dabbir_whatsapp_connections%rowtype;
  c public.dabbir_conversations%rowtype;
  customer public.dabbir_customers%rowtype;
  service public.dabbir_services%rowtype;
  existing public.dabbir_whatsapp_event_ledger%rowtype;
  persisted record;
  v_sender text:=regexp_replace(coalesce(p_sender_handle,''),'[^0-9]','','g');
  v_provider text:=trim(coalesce(p_provider_message_id,''));
  v_location text:=left(trim(regexp_replace(coalesce(p_location,''),'[\u0000-\u001f\u007f]','','g')),500);
  v_date text:=left(trim(regexp_replace(coalesce(p_preferred_date,''),'[\u0000-\u001f\u007f]','','g')),80);
  v_time text:=left(trim(regexp_replace(coalesce(p_preferred_time,''),'[\u0000-\u001f\u007f]','','g')),80);
  v_body text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'WHATSAPP_FLOW_TOKEN_HASH_INVALID'; end if;
  if length(v_provider) not between 3 and 320 then raise exception 'WHATSAPP_FLOW_PROVIDER_MESSAGE_REQUIRED'; end if;
  if length(v_sender) not between 7 and 20 then raise exception 'WHATSAPP_FLOW_SENDER_INVALID'; end if;
  if p_service_id is null or v_date='' or v_time='' then raise exception 'WHATSAPP_FLOW_REQUIRED_FIELD_MISSING'; end if;

  select * into s from public.dabbir_whatsapp_flow_sessions where token_hash=lower(p_token_hash) limit 1 for update;
  if not found then raise exception 'WHATSAPP_FLOW_SESSION_NOT_FOUND'; end if;
  if s.state='completed' then
    if s.completion_provider_message_id is distinct from v_provider then raise exception 'WHATSAPP_FLOW_TOKEN_ALREADY_USED'; end if;
    select * into existing from public.dabbir_whatsapp_event_ledger e where e.business_id=s.business_id and e.provider_message_id=v_provider and e.message_id is not null order by e.created_at asc limit 1;
    if not found then raise exception 'WHATSAPP_FLOW_COMPLETION_EVIDENCE_MISSING'; end if;
    return query select existing.message_id,existing.conversation_id,true;
    return;
  end if;
  if s.state not in ('created','sent') then raise exception 'WHATSAPP_FLOW_SESSION_NOT_ACTIVE'; end if;
  if s.expires_at<=now() then update public.dabbir_whatsapp_flow_sessions set state='expired',updated_at=now() where id=s.id; raise exception 'WHATSAPP_FLOW_SESSION_EXPIRED'; end if;

  select * into w from public.dabbir_whatsapp_connections where id=s.connection_id and business_id=s.business_id and phone_number_id=trim(p_phone_number_id) and status='connected' limit 1;
  if not found or w.branch_id is distinct from s.branch_id then raise exception 'WHATSAPP_FLOW_CONNECTION_SCOPE_INVALID'; end if;
  select * into c from public.dabbir_conversations where id=s.conversation_id and business_id=s.business_id and branch_id=s.branch_id and channel_type='whatsapp' and demo_mode=false and state<>'closed' limit 1;
  if not found or c.customer_id is null then raise exception 'WHATSAPP_FLOW_CONVERSATION_SCOPE_INVALID'; end if;
  select * into customer from public.dabbir_customers where id=c.customer_id and business_id=s.business_id limit 1;
  if not found or regexp_replace(coalesce(customer.channel_handle,''),'[^0-9]','','g')<>v_sender then raise exception 'WHATSAPP_FLOW_SENDER_SCOPE_INVALID'; end if;
  select sv.* into service from public.dabbir_services sv
   join public.dabbir_branch_services bs on bs.business_id=sv.business_id and bs.service_id=sv.id and bs.branch_id=s.branch_id and bs.active=true
   where sv.id=p_service_id and sv.business_id=s.business_id and sv.active=true limit 1;
  if not found then raise exception 'WHATSAPP_FLOW_SERVICE_SCOPE_INVALID'; end if;

  v_body := 'طلب حجز عبر نموذج WhatsApp' || E'\nالخدمة: ' || left(coalesce(nullif(service.name_ar,''),nullif(service.name,''),service.name_en),180)
    || case when v_location<>'' then E'\nالموقع الموصوف: '||v_location else '' end || E'\nالتاريخ المطلوب: ' || v_date || E'\nالوقت المطلوب: ' || v_time
    || E'\n[DABBIR_BOOKING_FLOW service_id=' || service.id::text || ']';

  select * into persisted from public.dabbir_whatsapp_persist_inbound(
    trim(p_phone_number_id),v_provider,v_sender,customer.display_name,left(v_body,4000),'APPOINTMENT_REQUEST',coalesce(p_occurred_at,now())
  ) limit 1;
  if persisted.message_id is null or persisted.conversation_id<>s.conversation_id then raise exception 'WHATSAPP_FLOW_PERSISTENCE_UNVERIFIED'; end if;

  update public.dabbir_whatsapp_flow_sessions set
    state='completed',completion_provider_message_id=v_provider,service_id=service.id,location_text=v_location,
    preferred_date=v_date,preferred_time=v_time,completed_at=now(),last_error=null,updated_at=now()
   where id=s.id;
  return query select persisted.message_id,persisted.conversation_id,coalesce(persisted.duplicate,false);
end;
$function$
;
revoke all on function public.dabbir_whatsapp_consume_booking_flow_reply(text,text,text,text,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.dabbir_whatsapp_consume_booking_flow_reply(text,text,text,text,uuid,text,text,text,timestamptz) to service_role;
