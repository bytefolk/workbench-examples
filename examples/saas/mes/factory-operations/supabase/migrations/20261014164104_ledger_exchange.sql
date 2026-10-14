-- 台账交换：同一工作区的所有者恢复、完整候选校验及原子发布。
-- 文件正文仍由 Storage 管理；摘要登记由授权客户端读取字节后计算，SQL 校验登记一致性。
alter table public.fo_workspaces add column revision bigint not null default 0 check(revision>=0);
alter table public.fo_workspaces add column provenance jsonb not null default '{"contentOrigin":"user-imported"}';
alter table public.fo_reports add column provenance jsonb not null default '{"contentOrigin":"user-imported"}';
alter table public.fo_report_events add column provenance jsonb not null default '{"contentOrigin":"user-imported"}';
alter table public.fo_visits add column provenance jsonb not null default '{"contentOrigin":"user-imported"}';
alter table public.fo_assets add column sha256 text check(sha256 ~ '^[a-f0-9]{64}$');

create table fo_private.import_plans (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.fo_workspaces(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade, expected_revision bigint not null,
 package_hash text not null, candidate jsonb not null, replace_scope text[] not null, counts jsonb not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '1 hour')
);
create index fo_import_plans_workspace_idx on fo_private.import_plans(workspace_id);
create index fo_import_plans_actor_idx on fo_private.import_plans(actor_id);
create table fo_private.import_results (
 workspace_id uuid not null references public.fo_workspaces(id) on delete cascade, request_id uuid not null,
 actor_id uuid not null references auth.users(id) on delete cascade, plan_id uuid not null references fo_private.import_plans(id) on delete cascade,
 expected_revision bigint not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(workspace_id,request_id)
);
create index fo_import_results_actor_idx on fo_private.import_results(actor_id);
create index fo_import_results_plan_idx on fo_private.import_results(plan_id);
alter table fo_private.import_plans enable row level security;
alter table fo_private.import_results enable row level security;
revoke all on fo_private.import_plans,fo_private.import_results from public,anon,authenticated;

-- 固定锁顺序：workspace -> report/asset。工作区行同时是全数据集的版本锁。
create function fo_private.bump_dataset_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
 if tg_table_name='fo_report_events' then
  select workspace_id into w from public.fo_reports where id=case when tg_op='DELETE' then old.report_id else new.report_id end;
 else
  w:=case when tg_op='DELETE' then old.workspace_id else new.workspace_id end;
 end if;
 update public.fo_workspaces set revision=revision+1 where id=w;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create function fo_private.bump_factory_revision() returns trigger
language plpgsql set search_path='' as $$ begin new.revision:=old.revision+1; return new; end $$;
create trigger fo_factory_revision before update of name,provenance on public.fo_workspaces for each row execute function fo_private.bump_factory_revision();
create trigger fo_reports_revision before insert or update or delete on public.fo_reports for each row execute function fo_private.bump_dataset_revision();
create trigger fo_events_revision before insert or update or delete on public.fo_report_events for each row execute function fo_private.bump_dataset_revision();
create trigger fo_visits_revision before insert or update or delete on public.fo_visits for each row execute function fo_private.bump_dataset_revision();
create trigger fo_assets_revision before insert or update or delete on public.fo_assets for each row execute function fo_private.bump_dataset_revision();
create trigger fo_members_revision before insert or update or delete on public.fo_members for each row execute function fo_private.bump_dataset_revision();

create function fo_private.issue(t text,r integer,f text,c text,m text) returns jsonb
language sql immutable set search_path='' as $$ select jsonb_build_array(jsonb_build_object('table',t,'row',r,'field',f,'code',c,'message',m)) $$;
create function fo_private.object_keys_valid(v jsonb,allowed text[],required text[]) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(v)='object' and v ?& required and not exists(select 1 from jsonb_object_keys(case when jsonb_typeof(v)='object' then v else '{}' end) k where not(k=any(allowed)))
$$;
create function fo_private.text_valid(v jsonb,lo integer,hi integer) returns boolean
language sql immutable set search_path='' as $$ select coalesce(jsonb_typeof(v)='string' and length(btrim(v#>>'{}'))>=lo and length(v#>>'{}')<=hi,false) $$;
create function fo_private.uuid_valid(v jsonb) returns boolean
language sql immutable set search_path='' as $$ select coalesce(jsonb_typeof(v)='string' and (v#>>'{}') ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',false) $$;
create function fo_private.integer_valid(v jsonb,lo bigint,hi bigint) returns boolean
language plpgsql immutable set search_path='' as $$
begin return coalesce(jsonb_typeof(v)='number' and (v#>>'{}')::numeric=trunc((v#>>'{}')::numeric) and (v#>>'{}')::numeric between lo and hi,false);
exception when others then return false; end $$;
create function fo_private.date_valid(v jsonb,timestamp_value boolean) returns boolean
language plpgsql immutable set search_path='' as $$
declare s text;
begin
 if jsonb_typeof(v) is distinct from 'string' then return false; end if; s:=v#>>'{}';
 if timestamp_value then
  if s !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-](0\d|1[0-4]):[0-5]\d)$' then return false; end if;
  perform s::timestamptz;
 else
  if s !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' then return false; end if;
  perform s::date;
 end if;
 return true;
exception when others then return false; end $$;

-- json 类型保留对象重复键；必须先检查，之后才允许转 jsonb。
create function fo_private.duplicate_json_path(v json,p text default '',depth integer default 0) returns text
language plpgsql immutable set search_path='' as $$
declare k text; item record; result text;
begin
 if depth>40 then raise exception 'JSON嵌套深度超过40层'; end if;
 if json_typeof(v)='object' then
  select key into k from json_each(v) group by key having count(*)>1 limit 1;
  if k is not null then return p||'/'||replace(replace(k,'~','~0'),'/','~1'); end if;
  for item in select * from json_each(v) loop
   result:=fo_private.duplicate_json_path(item.value,p||'/'||replace(replace(item.key,'~','~0'),'/','~1'),depth+1);
   if result is not null then return result; end if;
  end loop;
 elsif json_typeof(v)='array' then
  for item in select value,ordinality from json_array_elements(v) with ordinality loop
   result:=fo_private.duplicate_json_path(item.value,p||'/'||(item.ordinality-1),depth+1);
   if result is not null then return result; end if;
  end loop;
 end if;
 return null;
end $$;
create function fo_private.origin_for_tables(t jsonb) returns text
language sql immutable set search_path='' as $$
 with origins as (
  select distinct row->'provenance'->>'contentOrigin' origin
  from jsonb_each(t) e cross join lateral jsonb_array_elements(e.value) row where e.key<>'factory'
 ) select case when count(*)>1 or max(origin)='mixed' then 'mixed' else coalesce(max(origin),'user-imported') end from origins
$$;
create function fo_private.provenance_signature(p jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('origin',p->>'contentOrigin','mode',p->'recognition'->>'mode','sources',
  coalesce((select jsonb_agg(x order by x) from (select distinct lower(value) x from jsonb_array_elements_text(case when jsonb_typeof(p->'recognition'->'sourceAssetIds')='array' then p->'recognition'->'sourceAssetIds' else '[]' end)) ids),'[]'))
$$;

create function fo_private.dataset_snapshot(w uuid) returns jsonb
language sql set search_path='' as $$
 with tabs as (select jsonb_build_object(
 'factory',jsonb_build_array(jsonb_build_object('id',f.id,'data',jsonb_build_object('name',f.name),'provenance',f.provenance)),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'data',jsonb_build_object(
  'kind',r.kind,'contractNumber',r.contract_number,'materialNumber',r.material_number,'station',r.station,'reason',r.reason,'quantity',r.quantity,
  'assetIds',r.asset_ids,'status',r.status,'version',r.version,'fragmentsRecovered',r.fragments_recovered,'createdBy',r.created_by,'createdAt',r.created_at,'updatedAt',r.updated_at
 ),'provenance',r.provenance) order by r.id) from public.fo_reports r where r.workspace_id=w),'[]'),
 'report-events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'data',jsonb_build_object(
  'reportId',e.report_id,'actorId',e.actor_id,'action',e.action,'note',e.note,'createdAt',e.created_at,'requestId',e.request_id,'payload',e.payload
 ),'provenance',e.provenance) order by e.id) from public.fo_report_events e join public.fo_reports r on r.id=e.report_id where r.workspace_id=w),'[]'),
 'visits',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'data',jsonb_build_object(
  'customer',v.customer,'visitedAt',v.visited_at,'summary',v.summary,'issues',v.issues,'nextStep',v.next_step,'followUpDate',v.follow_up_date,'createdBy',v.created_by,'createdAt',v.created_at
 ),'provenance',v.provenance) order by v.id) from public.fo_visits v where v.workspace_id=w),'[]')
 ) t,f.name,f.revision from public.fo_workspaces f where f.id=w)
 select jsonb_build_object('schemaVersion',1,'packageKind','snapshot','packageId',gen_random_uuid(),
  'datasetContract',jsonb_build_object('id','factory-operations','version',1),'dataRevision',revision::text,
  'metadata',jsonb_build_object('contentOrigin',fo_private.origin_for_tables(t),'storage','shared','label',name,'exportedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  'exportScope',jsonb_build_object('completeness','full','tables',jsonb_build_array('factory','reports','report-events','visits')),'tables',t,
  'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'mediaType',a.media_type,'size',a.size,'sha256',a.sha256,
    'reference',jsonb_build_object('storeId','factory-operations-assets','objectId',a.storage_path)) order by a.id) from public.fo_assets a where a.workspace_id=w),'[]')) from tabs
$$;
create function fo_private.dataset_state(w uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s jsonb; modes jsonb;
begin
 if auth.uid() is null or fo_private.workspace_role(w) is null then raise exception '无权读取工作区' using errcode='42501'; end if;
 perform 1 from public.fo_workspaces where id=w for share;
 s:=fo_private.dataset_snapshot(w);
 select coalesce(jsonb_agg(distinct row->'provenance'->'recognition'->>'mode'),'[]') into modes from jsonb_each(s->'tables') t cross join lateral jsonb_array_elements(t.value) row where t.key<>'factory' and row->'provenance'->'recognition'->>'mode' is not null;
 return jsonb_build_object('workspaceId',w,'label',s->'metadata'->>'label','revision',s->>'dataRevision','contentOrigin',s->'metadata'->>'contentOrigin','storage','shared','recognitionModes',modes);
end $$;

create function fo_private.preview_import(w uuid,package_text text,scope text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare raw json; p jsonb; base jsonb; candidate jsonb; issues jsonb:='[]'; counts jsonb:='[]'; duplicate_path text;
 rev bigint; label text; plan uuid; t text; before_rows jsonb; incoming_rows jsonb; removed integer; result jsonb;
begin
 if auth.uid() is null or fo_private.workspace_role(w) is distinct from 'owner' then raise exception '只有所有者可以预览替换' using errcode='42501'; end if;
 select revision,name into rev,label from public.fo_workspaces where id=w for update;
 result:=jsonb_build_object('planId',null,'expectedRevision',rev::text,'sourceWorkspaceId',null,'targetWorkspaceId',w,'sourceLabel','','targetLabel',label,'counts','[]'::jsonb,'issues','[]'::jsonb,'warnings','[]'::jsonb,'canCommit',false);
 if package_text is null or octet_length(package_text)>5242880 then return result||jsonb_build_object('issues',fo_private.issue(null,null,'','limit','交换包最多5MiB')); end if;
 begin
  raw:=package_text::json;
  duplicate_path:=fo_private.duplicate_json_path(raw);
  if duplicate_path is not null then return result||jsonb_build_object('issues',fo_private.issue(null,null,duplicate_path,'duplicate-key','JSON对象包含重复字段')); end if;
  p:=raw::jsonb;
 exception when others then return result||jsonb_build_object('issues',fo_private.issue(null,null,'','json','无法解析JSON，或嵌套深度超出限制'));
 end;
 issues:=fo_private.validate_package(w,p,scope);
 result:=result||jsonb_build_object('sourceWorkspaceId',p->'tables'->'factory'->0->>'id','sourceLabel',coalesce(p->'tables'->'factory'->0->'data'->>'name',''));
 if jsonb_array_length(issues)>0 then return result||jsonb_build_object('issues',issues); end if;
 base:=fo_private.dataset_snapshot(w);
 candidate:=jsonb_set(base,'{tables}',(base->'tables')||(p->'tables'));
 candidate:=jsonb_set(candidate,'{metadata,contentOrigin}',to_jsonb(fo_private.origin_for_tables(candidate->'tables')));
 -- 传入清单可以是当前资产子集；最终候选保留当前全部资产，不删除新增正文。
 issues:=fo_private.validate_package(w,candidate,array['factory','reports','report-events','visits']);
 if jsonb_array_length(issues)>0 then return result||jsonb_build_object('issues',issues); end if;
 foreach t in array scope loop
  before_rows:=base->'tables'->t; incoming_rows:=p->'tables'->t;
  select count(*) into removed from jsonb_array_elements(before_rows) b where not exists(select 1 from jsonb_array_elements(incoming_rows) i where lower(i->>'id')=lower(b->>'id'));
  counts:=counts||jsonb_build_array(jsonb_build_object('table',t,'before',jsonb_array_length(before_rows),'incoming',jsonb_array_length(incoming_rows),'after',jsonb_array_length(incoming_rows),'removed',removed));
 end loop;
 insert into fo_private.import_plans(workspace_id,actor_id,expected_revision,package_hash,candidate,replace_scope,counts)
 values(w,auth.uid(),rev,encode(sha256(convert_to(p::text||to_jsonb(scope)::text,'UTF8')),'hex'),candidate,scope,counts) returning id into plan;
 return result||jsonb_build_object('planId',plan,'counts',counts,'canCommit',true,'warnings',jsonb_build_array('此操作替换所选业务记录；账户、成员和资产正文保留。'));
end $$;

create function fo_private.commit_import(w uuid,plan uuid,expected_revision text,request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_revision bigint; p fo_private.import_plans; prior fo_private.import_results; issues jsonb; result jsonb;
begin
 if auth.uid() is null or fo_private.workspace_role(w) is distinct from 'owner' then raise exception '只有所有者可以提交替换' using errcode='42501'; end if;
 if request is null or plan is null or expected_revision is null or expected_revision!~'^\d+$' then raise exception '计划、版本或请求ID无效'; end if;
 select revision into current_revision from public.fo_workspaces where id=w for update;
 select * into prior from fo_private.import_results r where r.workspace_id=w and r.request_id=request;
 if prior.request_id is not null then
  if prior.actor_id<>auth.uid() or prior.plan_id<>plan or prior.expected_revision::text<>expected_revision then raise exception '请求ID已用于其他计划或版本' using errcode='PT409'; end if;
  return prior.result;
 end if;
 select * into p from fo_private.import_plans where id=plan and workspace_id=w and actor_id=auth.uid() for update;
 if p.id is null then raise exception '导入计划不存在或无权访问' using errcode='42501'; end if;
 if p.expires_at<now() then raise exception '导入计划已过期，请重新预览' using errcode='PT409'; end if;
 if current_revision::text<>expected_revision or p.expected_revision::text<>expected_revision then raise exception '预览后数据已变化，请重新预览' using errcode='PT409'; end if;
 issues:=fo_private.validate_package(w,p.candidate,array['factory','reports','report-events','visits']);
 if jsonb_array_length(issues)>0 then raise exception '计划中的引用或业务约束已失效，请重新预览' using errcode='PT409',detail=issues::text; end if;
 -- 候选是全库一致快照；先事件后单据，随后先单据后事件，满足外键且不禁用约束。
 delete from public.fo_report_events where report_id in(select id from public.fo_reports where workspace_id=w);
 delete from public.fo_reports where workspace_id=w;
 delete from public.fo_visits where workspace_id=w;
 update public.fo_workspaces set name=p.candidate->'tables'->'factory'->0->'data'->>'name',provenance=p.candidate->'tables'->'factory'->0->'provenance' where id=w;
 insert into public.fo_reports(id,workspace_id,kind,contract_number,material_number,station,reason,quantity,asset_ids,status,fragments_recovered,version,created_by,created_at,updated_at,provenance)
 select (r->>'id')::uuid,w,d->>'kind',d->>'contractNumber',d->>'materialNumber',d->>'station',d->>'reason',(d->>'quantity')::numeric::integer,
  array(select x::uuid from jsonb_array_elements_text(d->'assetIds') x),d->>'status',(d->>'fragmentsRecovered')::boolean,(d->>'version')::numeric::integer,(d->>'createdBy')::uuid,(d->>'createdAt')::timestamptz,(d->>'updatedAt')::timestamptz,r->'provenance'
 from jsonb_array_elements(p.candidate->'tables'->'reports') r cross join lateral (select r->'data' d) data;
 insert into public.fo_report_events(id,report_id,actor_id,action,note,created_at,request_id,payload,provenance)
 select (r->>'id')::uuid,(d->>'reportId')::uuid,(d->>'actorId')::uuid,d->>'action',d->>'note',(d->>'createdAt')::timestamptz,(d->>'requestId')::uuid,nullif(d->'payload','null'::jsonb),r->'provenance'
 from jsonb_array_elements(p.candidate->'tables'->'report-events') r cross join lateral (select r->'data' d) data;
 insert into public.fo_visits(id,workspace_id,customer,visited_at,summary,issues,next_step,follow_up_date,created_by,created_at,provenance)
 select (r->>'id')::uuid,w,d->>'customer',(d->>'visitedAt')::timestamptz,d->>'summary',d->>'issues',d->>'nextStep',(d->>'followUpDate')::date,(d->>'createdBy')::uuid,(d->>'createdAt')::timestamptz,r->'provenance'
 from jsonb_array_elements(p.candidate->'tables'->'visits') r cross join lateral (select r->'data' d) data;
 select revision into current_revision from public.fo_workspaces where id=w;
 result:=jsonb_build_object('revision',current_revision::text,'contentOrigin',p.candidate->'metadata'->>'contentOrigin','counts',p.counts);
 insert into fo_private.import_results(workspace_id,request_id,actor_id,plan_id,expected_revision,result) values(w,request,auth.uid(),plan,expected_revision::bigint,result);
 return result;
end $$;

create function fo_private.set_asset_hash(p_asset uuid,p_sha256 text) returns public.fo_assets
language plpgsql security definer set search_path='' as $$
declare a public.fo_assets; w uuid;
begin
 if auth.uid() is null then raise exception '请先登录' using errcode='42501'; end if;
 if p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' then raise exception 'SHA-256格式无效'; end if;
 select workspace_id into w from public.fo_assets where id=p_asset;
 if w is null or fo_private.workspace_role(w) is null then raise exception '无权登记资产摘要' using errcode='42501'; end if;
 perform 1 from public.fo_workspaces where id=w for update;
 select * into a from public.fo_assets where id=p_asset for update;
 if a.created_by<>auth.uid() and fo_private.workspace_role(w)<>'owner' then raise exception '仅上传者或所有者可以补充摘要' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='factory-operations-assets' and o.name=a.storage_path and o.metadata->>'mimetype'=a.media_type and o.metadata->>'size'=a.size::text) then raise exception '资产对象或存储元信息不完整'; end if;
 if a.sha256 is not null and a.sha256<>p_sha256 then raise exception '资产摘要已登记且不可改写' using errcode='PT409'; end if;
 if a.sha256 is null then update public.fo_assets set sha256=p_sha256 where id=p_asset returning * into a; end if;
 return a;
end $$;
create function fo_private.register_asset_with_hash(p_id uuid,p_workspace uuid,p_name text,p_media_type text,p_size bigint,p_path text,p_sha256 text) returns public.fo_assets
language plpgsql security definer set search_path='' as $$
declare prior public.fo_assets;
begin
 if auth.uid() is null or fo_private.workspace_role(p_workspace) is null then raise exception '无权上传文件' using errcode='42501'; end if;
 perform 1 from public.fo_workspaces where id=p_workspace for update;
 select * into prior from public.fo_assets where id=p_id;
 if prior.id is not null then
  if prior.workspace_id is distinct from p_workspace or prior.created_by is distinct from auth.uid() or prior.name is distinct from p_name or prior.media_type is distinct from p_media_type or prior.size is distinct from p_size or prior.storage_path is distinct from p_path then raise exception '资产ID已用于其他上传' using errcode='PT409'; end if;
  return fo_private.set_asset_hash(p_id,p_sha256);
 end if;
 perform fo_private.register_asset(p_id,p_workspace,p_name,p_media_type,p_size,p_path);
 return fo_private.set_asset_hash(p_id,p_sha256);
end $$;

create or replace function fo_private.change_report(p_report uuid,p_version integer,p_action text,p_note text,p_request uuid) returns public.fo_reports
language plpgsql security definer set search_path='' as $$
declare v public.fo_reports; prior public.fo_report_events; v_payload jsonb; w uuid; event_at timestamptz;
begin
 if auth.uid() is null then raise exception '请先登录' using errcode='42501'; end if;
 if p_request is null or p_version is null or p_action is null then raise exception '缺少请求标识或版本'; end if;
 if p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception '请填写处理说明（不超过2000字）'; end if;
 select workspace_id into w from public.fo_reports where id=p_report;
 if w is null or coalesce(fo_private.workspace_role(w),'') not in ('owner','manager') then raise exception '无权处理此上报' using errcode='42501'; end if;
 perform 1 from public.fo_workspaces where id=w for update;
 select * into v from public.fo_reports where id=p_report and workspace_id=w for update;
 if v.id is null then raise exception '上报已被替换，请刷新' using errcode='PT409'; end if;
 v_payload:=jsonb_build_object('version',p_version,'action',p_action,'note',p_note);
 select * into prior from public.fo_report_events where report_id=p_report and request_id=p_request;
 if prior.id is not null then
  if prior.actor_id<>auth.uid() or prior.payload<>v_payload then raise exception '请求标识已用于其他操作' using errcode='23505'; end if;
  return v;
 end if;
 if v.version<>p_version then raise exception '记录已更新，请刷新后重试' using errcode='PT409'; end if;
 event_at:=greatest(clock_timestamp(),v.updated_at);
 if p_action='recovery' then
  if v.kind<>'broken_needle' or v.fragments_recovered or v.status not in ('submitted','approved','delivering') then raise exception '当前状态无法确认碎片回收'; end if;
  update public.fo_reports set fragments_recovered=true,version=version+1,updated_at=event_at where id=p_report returning * into v;
 else
  if not ((v.status='submitted' and p_action in ('approved','rejected')) or (v.status='approved' and p_action='delivering') or (v.status='delivering' and p_action='completed')) then raise exception '当前状态不允许此操作'; end if;
  if p_action='completed' and v.kind='broken_needle' and not v.fragments_recovered then raise exception '请先确认断针碎片已全部回收'; end if;
  update public.fo_reports set status=p_action,version=version+1,updated_at=event_at where id=p_report returning * into v;
 end if;
 insert into public.fo_report_events(report_id,actor_id,action,note,request_id,payload,provenance,created_at) values(p_report,auth.uid(),p_action,btrim(p_note),p_request,v_payload,v.provenance,event_at);
 return v;
end $$;

create function fo_private.export_snapshot(w uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or fo_private.workspace_role(w) is distinct from 'owner' then raise exception '只有所有者可以导出完整快照' using errcode='42501'; end if;
 perform 1 from public.fo_workspaces where id=w for update;
 if exists(select 1 from public.fo_assets where workspace_id=w and sha256 is null) then raise exception '资产缺少摘要，请重新读取文件后导出'; end if;
 if exists(select 1 from public.fo_assets a where a.workspace_id=w and not exists(select 1 from storage.objects o where o.bucket_id='factory-operations-assets' and o.name=a.storage_path and o.metadata->>'mimetype'=a.media_type and (o.metadata->>'size')::bigint=a.size)) then raise exception '已登记资产的对象或元信息不完整'; end if;
 result:=fo_private.dataset_snapshot(w);
 if octet_length(result::text)>5242880 or jsonb_array_length(result->'assets')>10000 or exists(select 1 from jsonb_each(result->'tables') t where jsonb_array_length(t.value)>10000) then raise exception '完整快照超出5MiB或每表10000行的交换上限，请使用企业接口分批归档'; end if;
 return result;
end $$;

-- 所有验证在正式表写入前完成；遇到坏类型不依靠隐式类型转换补默认值。
create function fo_private.validate_package(w uuid,p jsonb,scope text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 issues jsonb:='[]'; t text; k text; rr record; row_value jsonb; d jsonb; prov jsonb; a jsonb;
 n integer; row_id uuid; uid uuid; asset public.fo_assets; keys text[]; required text[];
 refs text[]; seen text[]; manifest_ids text[]; report jsonb; event jsonb; events jsonb; prior_provenance jsonb;
 current_status text; recovered boolean; version_no integer; event_action text; event_time timestamptz; previous_time timestamptz;
 event_data jsonb; payload jsonb; initial_count integer; valid_events boolean;
begin
 if not fo_private.object_keys_valid(p,array['schemaVersion','packageKind','packageId','datasetContract','dataRevision','metadata','exportScope','tables','assets'],array['schemaVersion','packageKind','packageId','datasetContract','dataRevision','metadata','exportScope','tables','assets']) then
  return fo_private.issue(null,null,'','shape','交换包字段缺失或包含未知字段');
 end if;
 if p->'schemaVersion' is distinct from '1'::jsonb or p->>'packageKind' is distinct from 'snapshot' or not fo_private.text_valid(p->'packageId',1,256) or not fo_private.text_valid(p->'dataRevision',1,256) then issues:=issues||fo_private.issue(null,null,'','version','只接受有标识和版本的正式快照'); end if;
 if p->'datasetContract'<>jsonb_build_object('id','factory-operations','version',1) then issues:=issues||fo_private.issue(null,null,'/datasetContract','contract','不支持的业务交换契约'); end if;
 if not fo_private.object_keys_valid(p->'metadata',array['contentOrigin','storage','label','exportedAt'],array['contentOrigin','storage','exportedAt']) then issues:=issues||fo_private.issue(null,null,'/metadata','shape','元信息字段缺失或未知');
 elsif coalesce(p->'metadata'->>'contentOrigin','') not in ('synthetic','user-imported','mixed') or coalesce(p->'metadata'->>'storage','') not in ('local','shared') or not fo_private.date_valid(p->'metadata'->'exportedAt',true) or (p->'metadata' ? 'label' and not fo_private.text_valid(p->'metadata'->'label',1,240)) then issues:=issues||fo_private.issue(null,null,'/metadata','value','来源、存储范围或导出时间无效'); end if;
 if scope is null or cardinality(scope)=0 or cardinality(scope)<>(select count(distinct x) from unnest(scope) x) or not('factory'=any(scope)) or exists(select 1 from unnest(scope) x where x is null or x not in ('factory','reports','report-events','visits')) then return issues||fo_private.issue(null,null,'/replaceScope','scope','替换范围必须唯一且包含工厂档案'); end if;
 if jsonb_typeof(p->'tables')<>'object' then return issues||fo_private.issue(null,null,'/tables','shape','tables 必须是对象'); end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p->'tables') key;
 if keys is distinct from (select array_agg(x order by x) from unnest(scope) x) then return issues||fo_private.issue(null,null,'/tables','scope','包内表必须与替换范围完全一致，缺表不能视为空表'); end if;
 if not fo_private.object_keys_valid(p->'exportScope',array['completeness','tables'],array['completeness','tables']) or p->'exportScope'->>'completeness' is distinct from 'full' or jsonb_typeof(p->'exportScope'->'tables')<>'array' then return issues||fo_private.issue(null,null,'/exportScope','scope','只有完整声明范围的快照可以替换'); end if;
 if (select jsonb_agg(x order by x) from jsonb_array_elements(p->'exportScope'->'tables') x) is distinct from (select jsonb_agg(x order by x) from unnest(scope) x) then issues:=issues||fo_private.issue(null,null,'/exportScope/tables','scope','导出范围与包内表不一致'); end if;
 if jsonb_typeof(p->'assets')<>'array' then return issues||fo_private.issue(null,null,'/assets','shape','资产清单必须是数组'); end if;
 if jsonb_array_length(p->'assets')>10000 then return issues||fo_private.issue(null,null,'/assets','limit','资产清单最多10000项'); end if;
 seen:='{}';
 for rr in select value,ordinality::integer idx from jsonb_array_elements(p->'assets') with ordinality loop
  a:=rr.value; n:=rr.idx;
  if not fo_private.object_keys_valid(a,array['id','name','mediaType','size','sha256','reference'],array['id','name','mediaType','size','sha256','reference']) or not fo_private.uuid_valid(a->'id') then issues:=issues||fo_private.issue('assets',n,'/id','shape','资产字段或ID无效'); continue; end if;
  row_id:=(a->>'id')::uuid;
  if row_id::text=any(seen) then issues:=issues||fo_private.issue('assets',n,'/id','duplicate','资产ID重复'); end if; seen:=array_append(seen,row_id::text);
  select * into asset from public.fo_assets where fo_assets.id=row_id and workspace_id=w;
  if asset.id is null then issues:=issues||fo_private.issue('assets',n,'/id','reference','资产未登记在当前工作区'); continue; end if;
  if a is distinct from jsonb_build_object('id',asset.id,'name',asset.name,'mediaType',asset.media_type,'size',asset.size,'sha256',asset.sha256,'reference',jsonb_build_object('storeId','factory-operations-assets','objectId',asset.storage_path)) or asset.sha256 is null then issues:=issues||fo_private.issue('assets',n,'','integrity','资产名称、类型、大小、摘要或稳定引用与已登记数据不一致'); end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='factory-operations-assets' and o.name=asset.storage_path and o.metadata->>'mimetype'=asset.media_type and o.metadata->>'size'=asset.size::text) then issues:=issues||fo_private.issue('assets',n,'/reference','missing-object','资产正文对象不存在或元信息不符'); end if;
 end loop;
 manifest_ids:=seen;

 foreach t in array scope loop
  if jsonb_typeof(p->'tables'->t)<>'array' then issues:=issues||fo_private.issue(t,null,'','shape','数据集必须是数组'); continue; end if;
  if jsonb_array_length(p->'tables'->t)>10000 then issues:=issues||fo_private.issue(t,null,'','limit','每个数据集最多10000行'); continue; end if;
  if t='factory' and jsonb_array_length(p->'tables'->t)<>1 then issues:=issues||fo_private.issue(t,null,'','scope','工厂档案必须恰好一行'); end if;
  seen:='{}';
  for rr in select value,ordinality::integer idx from jsonb_array_elements(p->'tables'->t) with ordinality loop
   row_value:=rr.value; n:=rr.idx; d:=row_value->'data'; prov:=row_value->'provenance';
   if not fo_private.object_keys_valid(row_value,array['id','data','provenance'],array['id','data','provenance']) or not fo_private.uuid_valid(row_value->'id') then issues:=issues||fo_private.issue(t,n,'/id','shape','记录字段缺失、未知或ID无效'); continue; end if;
   row_id:=(row_value->>'id')::uuid;
   if row_id::text=any(seen) then issues:=issues||fo_private.issue(t,n,'/id','duplicate','记录ID重复'); end if; seen:=array_append(seen,row_id::text);
   if t='reports' and exists(select 1 from public.fo_reports r where r.id=row_id and r.workspace_id<>w) or t='visits' and exists(select 1 from public.fo_visits v where v.id=row_id and v.workspace_id<>w) or t='report-events' and exists(select 1 from public.fo_report_events e join public.fo_reports r on r.id=e.report_id where e.id=row_id and r.workspace_id<>w) then issues:=issues||fo_private.issue(t,n,'/id','conflict','记录ID已在其他工作区使用'); end if;
   if not fo_private.object_keys_valid(prov,array['contentOrigin','recognition'],array['contentOrigin']) or coalesce(prov->>'contentOrigin','') not in ('synthetic','user-imported','mixed') then issues:=issues||fo_private.issue(t,n,'/provenance','source','来源结构或性质无效');
   elsif prov ? 'recognition' then
    a:=prov->'recognition';
    if not fo_private.object_keys_valid(a,array['mode','reviewStatus','sourceAssetIds'],array['mode','reviewStatus','sourceAssetIds']) or coalesce(a->>'mode','') not in ('mock','connected') or a->>'reviewStatus' is distinct from 'reviewed' or jsonb_typeof(a->'sourceAssetIds')<>'array' then issues:=issues||fo_private.issue(t,n,'/provenance/recognition','review','识别记录须完整且经人工核对');
    else
     if a->>'mode'='mock' and prov->>'contentOrigin'<>'synthetic' then issues:=issues||fo_private.issue(t,n,'/provenance/contentOrigin','source','模拟识别必须保留合成来源'); end if;
     select array_agg(value) into refs from jsonb_array_elements_text(a->'sourceAssetIds');
     if coalesce(cardinality(refs),0)=0 or cardinality(refs)<>(select count(distinct lower(x)) from unnest(refs) x) or exists(select 1 from unnest(refs) x where not exists(select 1 from public.fo_assets z where z.workspace_id=w and z.id::text=lower(x) and z.id::text=any(manifest_ids))) then issues:=issues||fo_private.issue(t,n,'/provenance/recognition/sourceAssetIds','reference','识别来源照片不存在或重复'); end if;
    end if;
   end if;
   prior_provenance:=null;
   if t='reports' then select r.provenance into prior_provenance from public.fo_reports r where r.id=row_id and r.workspace_id=w;
   elsif t='visits' then select v.provenance into prior_provenance from public.fo_visits v where v.id=row_id and v.workspace_id=w;
   elsif t='report-events' then select e.provenance into prior_provenance from public.fo_report_events e join public.fo_reports r on r.id=e.report_id where e.id=row_id and r.workspace_id=w;
   end if;
   if prior_provenance is not null and fo_private.provenance_signature(prior_provenance) is distinct from fo_private.provenance_signature(prov) then issues:=issues||fo_private.issue(t,n,'/provenance','source','已有记录的原始来源、识别模式和来源资产不能被改写'); end if;
   if t='factory' then
    if row_id<>w then issues:=issues||fo_private.issue(t,n,'/id','workspace','首版只允许恢复同一个工作区'); end if;
    if not fo_private.object_keys_valid(d,array['name'],array['name']) or not fo_private.text_valid(d->'name',1,120) then issues:=issues||fo_private.issue(t,n,'/data/name','value','工厂名称须为1到120字'); end if;
   elsif t='reports' then
    required:=array['kind','contractNumber','materialNumber','station','reason','quantity','assetIds','status','version','fragmentsRecovered','createdBy','createdAt','updatedAt'];
    if not fo_private.object_keys_valid(d,required,required) then issues:=issues||fo_private.issue(t,n,'/data','shape','上报业务字段缺失或未知'); continue; end if;
    if coalesce(d->>'kind','') not in ('broken_needle','consumable') or coalesce(d->>'status','') not in ('submitted','approved','delivering','completed','rejected') or jsonb_typeof(d->'fragmentsRecovered')<>'boolean' then issues:=issues||fo_private.issue(t,n,'/data','enum','上报类型、状态或回收标识无效'); end if;
    foreach k in array array['contractNumber','materialNumber','station','reason'] loop
     if not fo_private.text_valid(d->k,1,case when k='reason' then 2000 else 120 end) then issues:=issues||fo_private.issue(t,n,'/data/'||k,'value','必填文本为空或超出长度限制'); end if;
    end loop;
    if not fo_private.integer_valid(d->'quantity',1,100000) then issues:=issues||fo_private.issue(t,n,'/data/quantity','number','数量须为1到100000的整数'); end if;
    if not fo_private.integer_valid(d->'version',1,2147483647) then issues:=issues||fo_private.issue(t,n,'/data/version','number','版本须为有效正整数'); end if;
    if jsonb_typeof(d->'assetIds')<>'array' then issues:=issues||fo_private.issue(t,n,'/data/assetIds','shape','附件须为数组');
    else
     select coalesce(array_agg(value),'{}') into refs from jsonb_array_elements_text(d->'assetIds');
     if cardinality(refs)>10 or cardinality(refs)<>(select count(distinct lower(x)) from unnest(refs) x) or exists(select 1 from unnest(refs) x where not exists(select 1 from public.fo_assets z where z.workspace_id=w and z.id::text=lower(x) and z.id::text=any(manifest_ids))) then issues:=issues||fo_private.issue(t,n,'/data/assetIds','reference','附件超过10项、重复或不属于当前工作区'); end if;
     if d->>'kind'='broken_needle' and not exists(select 1 from public.fo_assets z where z.workspace_id=w and z.id::text=any(array(select lower(x) from unnest(refs) x)) and z.media_type in ('image/jpeg','image/png','image/webp')) then issues:=issues||fo_private.issue(t,n,'/data/assetIds','photo','断针必须至少有一张已登记照片'); end if;
    end if;
    if not fo_private.date_valid(d->'createdAt',true) or not fo_private.date_valid(d->'updatedAt',true) then issues:=issues||fo_private.issue(t,n,'/data/createdAt','date','创建及更新时间必须是有效带时区时间'); end if;
    if not fo_private.uuid_valid(d->'createdBy') then issues:=issues||fo_private.issue(t,n,'/data/createdBy','actor','创建者ID无效'); elsif not exists(select 1 from auth.users u where u.id=(d->>'createdBy')::uuid) then issues:=issues||fo_private.issue(t,n,'/data/createdBy','actor','历史创建者未映射到当前身份系统'); end if;
   elsif t='visits' then
    required:=array['customer','visitedAt','summary','issues','nextStep','followUpDate','createdBy','createdAt'];
    if not fo_private.object_keys_valid(d,required,required) then issues:=issues||fo_private.issue(t,n,'/data','shape','拜访业务字段缺失或未知'); continue; end if;
    foreach k in array array['customer','summary','issues','nextStep'] loop
     if not fo_private.text_valid(d->k,case when k='issues' then 0 else 1 end,case when k='customer' then 200 when k='nextStep' then 2000 else 5000 end) then issues:=issues||fo_private.issue(t,n,'/data/'||k,'value','文本为空或超出长度限制'); end if;
    end loop;
    if not fo_private.date_valid(d->'visitedAt',true) or not fo_private.date_valid(d->'createdAt',true) or (d->'followUpDate'<>'null'::jsonb and not fo_private.date_valid(d->'followUpDate',false)) then issues:=issues||fo_private.issue(t,n,'/data/visitedAt','date','拜访或跟进日期无效'); end if;
    if not fo_private.uuid_valid(d->'createdBy') then issues:=issues||fo_private.issue(t,n,'/data/createdBy','actor','创建者ID无效'); elsif not exists(select 1 from auth.users u where u.id=(d->>'createdBy')::uuid) then issues:=issues||fo_private.issue(t,n,'/data/createdBy','actor','历史创建者未映射到当前身份系统'); end if;
   elsif t='report-events' then
    required:=array['reportId','actorId','action','note','createdAt','requestId','payload'];
    if not fo_private.object_keys_valid(d,required,required) then issues:=issues||fo_private.issue(t,n,'/data','shape','事件业务字段缺失或未知'); continue; end if;
    if not fo_private.uuid_valid(d->'reportId') or not fo_private.uuid_valid(d->'actorId') or not fo_private.date_valid(d->'createdAt',true) or not fo_private.text_valid(d->'note',case when d->>'action'='submitted' then 0 else 1 end,2000) or coalesce(d->>'action','') not in ('submitted','approved','delivering','completed','rejected','recovery') then issues:=issues||fo_private.issue(t,n,'/data','event','事件引用、操作者、时间、说明或动作无效'); end if;
    if fo_private.uuid_valid(d->'actorId') and not exists(select 1 from auth.users u where u.id=(d->>'actorId')::uuid) then issues:=issues||fo_private.issue(t,n,'/data/actorId','actor','历史操作者未映射到当前身份系统'); end if;
    if d->>'action'='submitted' then
     if d->'requestId'<>'null'::jsonb or d->'payload'<>'null'::jsonb then issues:=issues||fo_private.issue(t,n,'/data/requestId','event','初始事件的请求与payload必须为null'); end if;
    else
     payload:=d->'payload';
     if not fo_private.uuid_valid(d->'requestId') or not fo_private.object_keys_valid(payload,array['version','action','note'],array['version','action','note']) or not fo_private.integer_valid(payload->'version',1,2147483646) or payload->>'action' is distinct from d->>'action' or not fo_private.text_valid(payload->'note',1,2000) or btrim(payload->>'note') is distinct from d->>'note' then issues:=issues||fo_private.issue(t,n,'/data/payload','event','处理事件须保留有效请求ID及一致的版本/动作/说明'); end if;
    end if;
   end if;
  end loop;
 end loop;
 if jsonb_array_length(issues)>0 then return issues; end if;
 if fo_private.origin_for_tables(p->'tables') is distinct from p->'metadata'->>'contentOrigin' then issues:=issues||fo_private.issue(null,null,'/metadata/contentOrigin','source','包来源必须与业务记录来源聚合一致'); end if;
 -- 局部包的跨表引用和事件链在构造全部四表候选快照后再验证。
 if not(array['factory','reports','report-events','visits']<@scope) then return issues; end if;
 for rr in select value,ordinality::integer idx from jsonb_array_elements(p->'tables'->'report-events') with ordinality loop
  d:=rr.value->'data';
  if not exists(select 1 from jsonb_array_elements(p->'tables'->'reports') r where lower(r->>'id')=lower(d->>'reportId')) then issues:=issues||fo_private.issue('report-events',rr.idx,'/data/reportId','reference','事件引用的上报不存在于最终候选库'); end if;
 end loop;
 for rr in select value,ordinality::integer idx from jsonb_array_elements(p->'tables'->'reports') with ordinality loop
  report:=rr.value; d:=report->'data'; n:=rr.idx;
  select coalesce(jsonb_agg(e order by case when e->'data'->>'action'='submitted' then 0 else (e->'data'->'payload'->>'version')::numeric::integer end),'[]') into events from jsonb_array_elements(p->'tables'->'report-events') e where lower(e->'data'->>'reportId')=lower(report->>'id');
  select count(*) into initial_count from jsonb_array_elements(events) e where e->'data'->>'action'='submitted';
  if initial_count<>1 then issues:=issues||fo_private.issue('reports',n,'/data/status','timeline','每个上报必须恰好有一个提交起点'); continue; end if;
  if (select count(*) from jsonb_array_elements(events) e where e->'data'->>'requestId' is not null)<>(select count(distinct lower(e->'data'->>'requestId')) from jsonb_array_elements(events) e where e->'data'->>'requestId' is not null) then issues:=issues||fo_private.issue('reports',n,'/data/status','duplicate','同一上报的处理请求ID不能重复'); continue; end if;
  current_status:='submitted'; recovered:=false; version_no:=1; previous_time:=null; valid_events:=true;
  for event in select value from jsonb_array_elements(events) loop
   event_data:=event->'data'; event_action:=event_data->>'action'; event_time:=(event_data->>'createdAt')::timestamptz;
   if previous_time is null then
    if event_time<>(d->>'createdAt')::timestamptz then valid_events:=false; end if;
   else
    if event_time<previous_time or (event_data->'payload'->>'version')::numeric::integer<>version_no then valid_events:=false; end if;
    if event_action='recovery' then
     if d->>'kind'<>'broken_needle' or recovered or current_status not in ('submitted','approved','delivering') then valid_events:=false; end if; recovered:=true;
    else
     if not((current_status='submitted' and event_action in ('approved','rejected')) or(current_status='approved' and event_action='delivering') or(current_status='delivering' and event_action='completed')) then valid_events:=false; end if;
     if event_action='completed' and d->>'kind'='broken_needle' and not recovered then valid_events:=false; end if;
     current_status:=event_action;
    end if;
    version_no:=version_no+1;
   end if;
   previous_time:=event_time;
  end loop;
  if not valid_events or current_status<>d->>'status' or version_no<>(d->>'version')::numeric::integer or recovered<>(d->>'fragmentsRecovered')::boolean or previous_time<>(d->>'updatedAt')::timestamptz then issues:=issues||fo_private.issue('reports',n,'/data/status','timeline','事件链必须连续且重放到相同状态、版本、回收事实和时间'); end if;
 end loop;
 return issues;
end $$;

create function public.fo_dataset_state(p_workspace uuid) returns jsonb language sql security invoker set search_path='' as $$ select fo_private.dataset_state(p_workspace) $$;
create function public.fo_export_snapshot(p_workspace uuid) returns jsonb language sql security invoker set search_path='' as $$ select fo_private.export_snapshot(p_workspace) $$;
create function public.fo_preview_import(p_workspace uuid,p_package_text text,p_replace_scope text[]) returns jsonb language sql security invoker set search_path='' as $$ select fo_private.preview_import(p_workspace,p_package_text,p_replace_scope) $$;
create function public.fo_commit_import(p_workspace uuid,p_plan uuid,p_expected_revision text,p_request uuid) returns jsonb language sql security invoker set search_path='' as $$ select fo_private.commit_import(p_workspace,p_plan,p_expected_revision,p_request) $$;
create function public.fo_set_asset_hash(p_asset uuid,p_sha256 text) returns public.fo_assets language sql security invoker set search_path='' as $$ select fo_private.set_asset_hash(p_asset,p_sha256) $$;
create function public.fo_register_asset_with_hash(p_id uuid,p_workspace uuid,p_name text,p_media_type text,p_size bigint,p_path text,p_sha256 text) returns public.fo_assets language sql security invoker set search_path='' as $$ select fo_private.register_asset_with_hash(p_id,p_workspace,p_name,p_media_type,p_size,p_path,p_sha256) $$;
revoke execute on all functions in schema fo_private from public,anon,authenticated;
grant execute on function fo_private.workspace_role(uuid),fo_private.object_access(text),fo_private.object_unregistered(text),fo_private.create_workspace(text),fo_private.add_member(uuid,text,text),fo_private.register_asset(uuid,uuid,text,text,bigint,text),fo_private.create_report(uuid,jsonb),fo_private.change_report(uuid,integer,text,text,uuid),fo_private.create_visit(uuid,jsonb),fo_private.dataset_state(uuid),fo_private.export_snapshot(uuid),fo_private.preview_import(uuid,text,text[]),fo_private.commit_import(uuid,uuid,text,uuid),fo_private.set_asset_hash(uuid,text),fo_private.register_asset_with_hash(uuid,uuid,text,text,bigint,text,text) to authenticated;
revoke execute on function public.fo_dataset_state(uuid),public.fo_export_snapshot(uuid),public.fo_preview_import(uuid,text,text[]),public.fo_commit_import(uuid,uuid,text,uuid),public.fo_set_asset_hash(uuid,text),public.fo_register_asset_with_hash(uuid,uuid,text,text,bigint,text,text) from public,anon;
grant execute on function public.fo_dataset_state(uuid),public.fo_export_snapshot(uuid),public.fo_preview_import(uuid,text,text[]),public.fo_commit_import(uuid,uuid,text,uuid),public.fo_set_asset_hash(uuid,text),public.fo_register_asset_with_hash(uuid,uuid,text,text,bigint,text,text) to authenticated;
