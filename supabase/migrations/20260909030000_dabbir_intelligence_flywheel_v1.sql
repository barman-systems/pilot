-- DABBIR Intelligence Flywheel V1
-- Additive only. No existing booking/WhatsApp mutation authority is changed.
-- Knowledge embeddings contain owner-approved business knowledge only; never customer-message bodies.

create extension if not exists vector with schema extensions;

create table if not exists public.dabbir_business_knowledge_embeddings (
  knowledge_id uuid primary key references public.dabbir_business_knowledge(id) on delete cascade,
  business_id uuid not null,
  content text not null check (char_length(content) between 1 and 16000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{32}$'),
  model text not null,
  dimensions integer not null default 768 check (dimensions = 768),
  embedding extensions.vector(768) not null,
  search_tsv tsvector generated always as (to_tsvector('simple'::regconfig, content)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dabbir_business_knowledge_embeddings_business_idx
  on public.dabbir_business_knowledge_embeddings (business_id, updated_at desc);
create index if not exists dabbir_business_knowledge_embeddings_fts_idx
  on public.dabbir_business_knowledge_embeddings using gin (search_tsv);
create index if not exists dabbir_business_knowledge_embeddings_hnsw_idx
  on public.dabbir_business_knowledge_embeddings using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create table if not exists public.dabbir_ai_eval_cases (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null unique references public.dabbir_ai_understanding_events(id) on delete cascade,
  business_id uuid not null,
  conversation_id uuid,
  batch_id uuid,
  event_type text not null,
  failure_class text not null,
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','covered','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dabbir_ai_eval_cases_failure_idx
  on public.dabbir_ai_eval_cases (failure_class, created_at desc);
create index if not exists dabbir_ai_eval_cases_business_idx
  on public.dabbir_ai_eval_cases (business_id, created_at desc);

create table if not exists public.dabbir_capability_registry (
  capability_key text primary key,
  action_class text not null check (action_class in ('READ','RECOMMEND','DRAFT','EXECUTE')),
  risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  intents text[] not null default '{}'::text[],
  activity_types text[] not null default '{}'::text[],
  required_fields text[] not null default '{}'::text[],
  tool_name text not null,
  verification_mode text not null,
  mutates boolean not null default false,
  human_approval boolean not null default false,
  enabled boolean not null default true,
  shadow_only boolean not null default true,
  contract jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dabbir_ai_failure_clusters (
  id uuid primary key default gen_random_uuid(),
  cluster_key text not null unique,
  failure_class text not null,
  intent text,
  action text,
  reason_code text,
  planner_failure_code text,
  occurrences bigint not null default 0 check (occurrences >= 0),
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists dabbir_ai_failure_clusters_last_seen_idx
  on public.dabbir_ai_failure_clusters (last_seen desc, occurrences desc);

create table if not exists public.dabbir_ai_improvement_proposals (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.dabbir_ai_failure_clusters(id) on delete cascade,
  proposal_type text not null,
  recommended_action jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','applied','superseded')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  applied_at timestamptz,
  unique (cluster_id, proposal_type)
);

alter table public.dabbir_business_knowledge_embeddings enable row level security;
alter table public.dabbir_business_knowledge_embeddings force row level security;
alter table public.dabbir_ai_eval_cases enable row level security;
alter table public.dabbir_ai_eval_cases force row level security;
alter table public.dabbir_capability_registry enable row level security;
alter table public.dabbir_capability_registry force row level security;
alter table public.dabbir_ai_failure_clusters enable row level security;
alter table public.dabbir_ai_failure_clusters force row level security;
alter table public.dabbir_ai_improvement_proposals enable row level security;
alter table public.dabbir_ai_improvement_proposals force row level security;

revoke all on table public.dabbir_business_knowledge_embeddings from public, anon, authenticated;
revoke all on table public.dabbir_ai_eval_cases from public, anon, authenticated;
revoke all on table public.dabbir_capability_registry from public, anon, authenticated;
revoke all on table public.dabbir_ai_failure_clusters from public, anon, authenticated;
revoke all on table public.dabbir_ai_improvement_proposals from public, anon, authenticated;
grant select, insert, update, delete on table public.dabbir_business_knowledge_embeddings to service_role;
grant select, insert, update on table public.dabbir_ai_eval_cases to service_role;
grant select on table public.dabbir_capability_registry to service_role;
grant select, insert, update on table public.dabbir_ai_failure_clusters to service_role;
grant select, insert, update on table public.dabbir_ai_improvement_proposals to service_role;

insert into public.dabbir_capability_registry
  (capability_key,action_class,risk_level,intents,activity_types,required_fields,tool_name,verification_mode,mutates,human_approval,enabled,shadow_only,contract)
values
  ('business.read_context','READ','LOW',array['SUPPORT','SERVICE_DISCOVERY','PRICING'],array[]::text[],array[]::text[],'READ_BUSINESS_CONTEXT','DATABASE_READBACK',false,false,true,true,'{"authority":"advisory","scope":"business"}'::jsonb),
  ('booking.check_availability','READ','LOW',array['BOOKING','RESCHEDULE_BOOKING'],array[]::text[],array['service_id','date'],'CHECK_AVAILABILITY','DATABASE_READBACK',false,false,true,true,'{"authority":"advisory"}'::jsonb),
  ('booking.create','EXECUTE','MEDIUM',array['BOOKING'],array[]::text[],array['service_id','date','time'],'CREATE_BOOKING','DATABASE_READBACK',true,false,true,true,'{"authority":"shadow","idempotency_required":true}'::jsonb),
  ('booking.reschedule','EXECUTE','MEDIUM',array['RESCHEDULE_BOOKING'],array[]::text[],array['appointment_id','date','time'],'RESCHEDULE_BOOKING','DATABASE_READBACK',true,false,true,true,'{"authority":"shadow","idempotency_required":true}'::jsonb),
  ('booking.cancel','EXECUTE','MEDIUM',array['CANCEL_BOOKING'],array[]::text[],array['appointment_id'],'CANCEL_BOOKING','DATABASE_READBACK',true,false,true,true,'{"authority":"shadow","idempotency_required":true}'::jsonb),
  ('conversation.handoff','DRAFT','LOW',array['HUMAN_ASSISTANCE'],array[]::text[],array[]::text[],'HANDOFF','HANDOFF_RECEIPT',true,false,true,true,'{"authority":"shadow"}'::jsonb)
on conflict (capability_key) do update set
  action_class=excluded.action_class,risk_level=excluded.risk_level,intents=excluded.intents,
  activity_types=excluded.activity_types,required_fields=excluded.required_fields,tool_name=excluded.tool_name,
  verification_mode=excluded.verification_mode,mutates=excluded.mutates,human_approval=excluded.human_approval,
  enabled=excluded.enabled,shadow_only=true,contract=excluded.contract,updated_at=now();

create or replace function public.dabbir_knowledge_embedding_queue_v1(p_limit integer default 20)
returns table(knowledge_id uuid,business_id uuid,title text,content text,content_hash text)
language sql security definer
set search_path = pg_catalog, public, extensions
as $fn$
  with approved as (
    select k.id,k.business_id,
      left(coalesce(nullif(k.knowledge_key,''),k.knowledge_type,'knowledge'),220) as title,
      left(concat_ws(E'\n',k.knowledge_type,k.knowledge_key,
        coalesce(nullif(k.value->>'text',''),k.value::text)),16000) as content
    from public.dabbir_business_knowledge k
    where k.status='approved' and k.source='owner_approved'
  ), hashed as (
    select a.*,md5(a.content) as content_hash from approved a where length(trim(a.content))>0
  )
  select h.id,h.business_id,h.title,h.content,h.content_hash
  from hashed h
  left join public.dabbir_business_knowledge_embeddings e on e.knowledge_id=h.id
  where e.knowledge_id is null or e.content_hash<>h.content_hash or e.model<>'gemini-embedding-2' or e.dimensions<>768
  order by h.id
  limit least(greatest(coalesce(p_limit,20),1),50)
$fn$;

create or replace function public.dabbir_knowledge_embedding_upsert_v1(
  p_knowledge_id uuid,p_content text,p_content_hash text,p_embedding_text text,p_model text default 'gemini-embedding-2')
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $fn$
declare k public.dabbir_business_knowledge%rowtype; v extensions.vector(768); expected text;
begin
  select * into k from public.dabbir_business_knowledge where id=p_knowledge_id and status='approved' and source='owner_approved';
  if not found then raise exception 'DABBIR_KNOWLEDGE_NOT_APPROVED'; end if;
  if p_content is null or length(trim(p_content))=0 or length(p_content)>16000 then raise exception 'DABBIR_KNOWLEDGE_CONTENT_INVALID'; end if;
  expected:=md5(p_content);
  if p_content_hash is null or expected<>lower(p_content_hash) then raise exception 'DABBIR_KNOWLEDGE_HASH_MISMATCH'; end if;
  if coalesce(p_model,'')<>'gemini-embedding-2' then raise exception 'DABBIR_EMBEDDING_MODEL_UNAPPROVED'; end if;
  begin v:=p_embedding_text::extensions.vector(768); exception when others then raise exception 'DABBIR_EMBEDDING_INVALID'; end;
  if extensions.vector_dims(v)<>768 then raise exception 'DABBIR_EMBEDDING_DIMENSIONS_INVALID'; end if;
  insert into public.dabbir_business_knowledge_embeddings
    (knowledge_id,business_id,content,content_hash,model,dimensions,embedding,updated_at)
  values (k.id,k.business_id,p_content,expected,'gemini-embedding-2',768,v,now())
  on conflict (knowledge_id) do update set
    business_id=excluded.business_id,content=excluded.content,content_hash=excluded.content_hash,
    model=excluded.model,dimensions=768,embedding=excluded.embedding,updated_at=now();
  return jsonb_build_object('ok',true,'knowledge_id',k.id,'business_id',k.business_id,'content_hash',expected);
end $fn$;

create or replace function public.dabbir_knowledge_hybrid_search_v1(
  p_business_id uuid,p_query text,p_embedding_text text,p_limit integer default 5)
returns table(knowledge_id uuid,knowledge_key text,knowledge_type text,content text,score double precision,semantic_score double precision,lexical_score double precision)
language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $fn$
declare q extensions.vector(768); n integer:=least(greatest(coalesce(p_limit,5),1),8); query_text text:=left(coalesce(p_query,''),1200);
begin
  if p_business_id is null or length(trim(query_text))=0 then return; end if;
  begin q:=p_embedding_text::extensions.vector(768); exception when others then raise exception 'DABBIR_QUERY_EMBEDDING_INVALID'; end;
  if extensions.vector_dims(q)<>768 then raise exception 'DABBIR_QUERY_EMBEDDING_DIMENSIONS_INVALID'; end if;
  return query
  with ranked as (
    select e.knowledge_id,k.knowledge_key,k.knowledge_type,e.content,
      greatest(0::double precision,least(1::double precision,1-(e.embedding <=> q))) as sem,
      greatest(0::double precision,least(1::double precision,ts_rank_cd(e.search_tsv,plainto_tsquery('simple'::regconfig,query_text))*8)) as lex
    from public.dabbir_business_knowledge_embeddings e
    join public.dabbir_business_knowledge k on k.id=e.knowledge_id and k.business_id=e.business_id
    where e.business_id=p_business_id and k.status='approved' and k.source='owner_approved'
  )
  select r.knowledge_id,r.knowledge_key,r.knowledge_type,r.content,
    (r.sem*0.78+r.lex*0.22)::double precision as score,r.sem::double precision,r.lex::double precision
  from ranked r
  where r.sem>=0.15 or r.lex>0
  order by score desc,r.knowledge_id
  limit n;
end $fn$;

create or replace function public.dabbir_capability_resolve_v1(p_intent text,p_action text,p_activity_type text default null)
returns jsonb
language sql security definer
set search_path = pg_catalog, public
as $fn$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.risk_level,c.capability_key),'[]'::jsonb)
  from public.dabbir_capability_registry c
  where c.enabled
    and (cardinality(c.intents)=0 or upper(coalesce(p_intent,''))=any(c.intents))
    and (upper(coalesce(p_action,''))=c.tool_name or upper(coalesce(p_action,''))=c.capability_key)
    and (cardinality(c.activity_types)=0 or lower(coalesce(p_activity_type,''))=any(c.activity_types))
$fn$;

create or replace function public.dabbir_ai_eval_ingest_recent_v1(p_since interval default interval '24 hours',p_limit integer default 500)
returns integer
language plpgsql security definer
set search_path = pg_catalog, public
as $fn$
declare n integer:=0;
begin
  insert into public.dabbir_ai_eval_cases(source_event_id,business_id,conversation_id,batch_id,event_type,failure_class,metrics,created_at,updated_at)
  select e.id,e.business_id,e.conversation_id,e.batch_id,e.event_type,
    case
      when coalesce(e.metrics->>'planner_failure_code','')<>'' then 'PLANNER_FAILURE'
      when upper(coalesce(e.metrics->>'action',''))='HANDOFF' then 'HANDOFF'
      when upper(coalesce(e.metrics->>'action',''))='CLARIFY' then 'CLARIFICATION'
      when (
        case
          when char_length(coalesce(e.metrics->>'operational_confidence',''))<=32
            and coalesce(e.metrics->>'operational_confidence','') ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
          then least(1::numeric,greatest(0::numeric,(e.metrics->>'operational_confidence')::numeric))
          else 1::numeric
        end
      )<0.65 then 'LOW_OPERATIONAL_CONFIDENCE'
      else 'OTHER_FAILURE'
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'intent',e.metrics->>'intent','action',e.metrics->>'action','tool_selection',e.metrics->>'tool_selection',
      'planner_failure_code',e.metrics->>'planner_failure_code','semantic_interpreter',e.metrics->>'semantic_interpreter',
      'semantic_override',e.metrics->>'semantic_override','semantic_confidence',e.metrics->'semantic_confidence',
      'operational_confidence',e.metrics->'operational_confidence','missing_count',e.metrics->'missing_count',
      'unresolved_count',e.metrics->'unresolved_count','clarification_count',e.metrics->'clarification_count',
      'voice',e.metrics->'voice','session_reset',e.metrics->'session_reset')),
    e.created_at,now()
  from public.dabbir_ai_understanding_events e
  where e.created_at>=now()-least(greatest(coalesce(p_since,interval '24 hours'),interval '1 hour'),interval '30 days')
    and (coalesce(e.metrics->>'planner_failure_code','')<>''
      or upper(coalesce(e.metrics->>'action','')) in ('CLARIFY','HANDOFF')
      or (
        case
          when char_length(coalesce(e.metrics->>'operational_confidence',''))<=32
            and coalesce(e.metrics->>'operational_confidence','') ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
          then least(1::numeric,greatest(0::numeric,(e.metrics->>'operational_confidence')::numeric))
          else 1::numeric
        end
      )<0.65)
  order by e.created_at asc
  limit least(greatest(coalesce(p_limit,500),1),2000)
  on conflict (source_event_id) do nothing;
  get diagnostics n=row_count;
  return n;
end $fn$;

create or replace function public.dabbir_ai_failure_mine_v1(p_since interval default interval '7 days')
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $fn$
declare ingested integer:=0; clusters integer:=0; proposals integer:=0;
begin
  ingested:=public.dabbir_ai_eval_ingest_recent_v1(least(greatest(coalesce(p_since,interval '7 days'),interval '1 hour'),interval '30 days'),2000);
  with grouped as (
    select md5(concat_ws('|',failure_class,coalesce(metrics->>'intent',''),coalesce(metrics->>'action',''),coalesce(metrics->>'tool_selection',''),coalesce(metrics->>'planner_failure_code',''))) as cluster_key,
      failure_class,metrics->>'intent' as intent,metrics->>'action' as action,metrics->>'tool_selection' as reason_code,
      nullif(metrics->>'planner_failure_code','') as planner_failure_code,count(*)::bigint as occurrences,
      min(created_at) as first_seen,max(created_at) as last_seen,
      jsonb_build_object(
        'avg_semantic_confidence',round(avg(
          case
            when char_length(coalesce(metrics->>'semantic_confidence',''))<=32
              and coalesce(metrics->>'semantic_confidence','') ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
            then least(1::numeric,greatest(0::numeric,(metrics->>'semantic_confidence')::numeric))
            else 0::numeric
          end
        ),3),
        'avg_operational_confidence',round(avg(
          case
            when char_length(coalesce(metrics->>'operational_confidence',''))<=32
              and coalesce(metrics->>'operational_confidence','') ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
            then least(1::numeric,greatest(0::numeric,(metrics->>'operational_confidence')::numeric))
            else 0::numeric
          end
        ),3),
        'voice_cases',count(*) filter (where lower(coalesce(metrics->>'voice',''))='true')) as evidence
    from public.dabbir_ai_eval_cases
    where created_at>=now()-least(greatest(coalesce(p_since,interval '7 days'),interval '1 hour'),interval '30 days')
    group by failure_class,metrics->>'intent',metrics->>'action',metrics->>'tool_selection',metrics->>'planner_failure_code'
  )
  insert into public.dabbir_ai_failure_clusters(cluster_key,failure_class,intent,action,reason_code,planner_failure_code,occurrences,first_seen,last_seen,evidence,updated_at)
  select cluster_key,failure_class,intent,action,reason_code,planner_failure_code,occurrences,first_seen,last_seen,evidence,now() from grouped
  on conflict (cluster_key) do update set occurrences=excluded.occurrences,first_seen=least(public.dabbir_ai_failure_clusters.first_seen,excluded.first_seen),
    last_seen=greatest(public.dabbir_ai_failure_clusters.last_seen,excluded.last_seen),evidence=excluded.evidence,updated_at=now();
  get diagnostics clusters=row_count;

  insert into public.dabbir_ai_improvement_proposals(cluster_id,proposal_type,recommended_action,evidence,status)
  select c.id,'EVAL_DRIVEN_REVIEW',
    jsonb_build_object('mode','proposal_only','auto_apply',false,'review_target',
      case when c.failure_class='CLARIFICATION' then 'grounding_or_retrieval'
           when c.failure_class='PLANNER_FAILURE' then 'provider_contract_or_fallback'
           when c.failure_class='LOW_OPERATIONAL_CONFIDENCE' then 'entity_requirements_or_evidence'
           else 'journey_or_handoff' end),
    jsonb_build_object('failure_class',c.failure_class,'intent',c.intent,'action',c.action,'reason_code',c.reason_code,'occurrences',c.occurrences,'window',p_since::text),
    'proposed'
  from public.dabbir_ai_failure_clusters c
  where c.last_seen>=now()-least(greatest(coalesce(p_since,interval '7 days'),interval '1 hour'),interval '30 days') and c.occurrences>=2
  on conflict (cluster_id,proposal_type) do update set evidence=excluded.evidence,recommended_action=excluded.recommended_action
    where public.dabbir_ai_improvement_proposals.status='proposed';
  get diagnostics proposals=row_count;
  return jsonb_build_object('ok',true,'cases_ingested',ingested,'clusters_updated',clusters,'proposals_touched',proposals,'auto_apply',false);
end $fn$;

revoke all on function public.dabbir_knowledge_embedding_queue_v1(integer) from public, anon, authenticated;
revoke all on function public.dabbir_knowledge_embedding_upsert_v1(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.dabbir_knowledge_hybrid_search_v1(uuid,text,text,integer) from public, anon, authenticated;
revoke all on function public.dabbir_capability_resolve_v1(text,text,text) from public, anon, authenticated;
revoke all on function public.dabbir_ai_eval_ingest_recent_v1(interval,integer) from public, anon, authenticated;
revoke all on function public.dabbir_ai_failure_mine_v1(interval) from public, anon, authenticated;
grant execute on function public.dabbir_knowledge_embedding_queue_v1(integer) to service_role;
grant execute on function public.dabbir_knowledge_embedding_upsert_v1(uuid,text,text,text,text) to service_role;
grant execute on function public.dabbir_knowledge_hybrid_search_v1(uuid,text,text,integer) to service_role;
grant execute on function public.dabbir_capability_resolve_v1(text,text,text) to service_role;
grant execute on function public.dabbir_ai_eval_ingest_recent_v1(interval,integer) to service_role;
grant execute on function public.dabbir_ai_failure_mine_v1(interval) to service_role;
