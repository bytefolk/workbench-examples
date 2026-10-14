-- 工厂运营：工作空间隔离、受控写入、断针回收、私有文件。
create schema if not exists fo_private;
revoke all on schema fo_private from public, anon;
grant usage on schema fo_private to authenticated;

create table public.fo_workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check (length(btrim(name)) between 1 and 120),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.fo_members (
 workspace_id uuid not null references public.fo_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id), email text not null,
 role text not null check (role in ('owner','manager','operator','sales')),
 primary key(workspace_id,user_id)
);
create index fo_members_user_idx on public.fo_members(user_id,workspace_id);
create index fo_workspaces_creator_idx on public.fo_workspaces(created_by);
create table public.fo_assets (
 id uuid primary key, workspace_id uuid not null references public.fo_workspaces(id),
 name text not null check(length(name) between 1 and 240),
 media_type text not null check(media_type in ('image/jpeg','image/png','image/webp','application/pdf','video/mp4','audio/mpeg')),
 size bigint not null check(size between 1 and 20971520), storage_path text not null unique,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index fo_assets_workspace_idx on public.fo_assets(workspace_id,created_at desc);
create index fo_assets_creator_idx on public.fo_assets(created_by);
create table public.fo_reports (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.fo_workspaces(id),
 kind text not null check(kind in ('broken_needle','consumable')),
 contract_number text not null check(length(btrim(contract_number)) between 1 and 120),
 material_number text not null check(length(btrim(material_number)) between 1 and 120),
 station text not null check(length(btrim(station)) between 1 and 120),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 quantity integer not null check(quantity between 1 and 100000), asset_ids uuid[] not null default '{}',
 status text not null default 'submitted' check(status in ('submitted','approved','delivering','completed','rejected')),
 fragments_recovered boolean not null default false, version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(cardinality(asset_ids)<=10),
 check(kind<>'broken_needle' or cardinality(asset_ids)>0),
 check(status<>'completed' or kind<>'broken_needle' or fragments_recovered)
);
create index fo_reports_workspace_idx on public.fo_reports(workspace_id,created_at desc);
create index fo_reports_creator_idx on public.fo_reports(created_by);
create index fo_reports_tracking_idx on public.fo_reports(workspace_id,contract_number,material_number);
create table public.fo_report_events (
 id uuid primary key default gen_random_uuid(), report_id uuid not null references public.fo_reports(id),
 actor_id uuid not null references auth.users(id), action text not null, note text not null default '',
 request_id uuid, payload jsonb, created_at timestamptz not null default now(), unique(report_id,request_id)
);
create index fo_report_events_report_idx on public.fo_report_events(report_id,created_at);
create index fo_report_events_actor_idx on public.fo_report_events(actor_id);
create table public.fo_visits (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.fo_workspaces(id),
 customer text not null check(length(btrim(customer)) between 1 and 200), visited_at timestamptz not null,
 summary text not null check(length(btrim(summary)) between 1 and 5000), issues text not null default '' check(length(issues)<=5000),
 next_step text not null check(length(btrim(next_step)) between 1 and 2000), follow_up_date date,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index fo_visits_workspace_idx on public.fo_visits(workspace_id,visited_at desc);
create index fo_visits_creator_idx on public.fo_visits(created_by);

-- 非暴露 schema 中的权限查询，避免成员表 RLS 自递归。
create function fo_private.workspace_role(p_workspace uuid) returns text
language sql stable security definer set search_path='' as $$
 select m.role from public.fo_members m where m.workspace_id=p_workspace and m.user_id=(select auth.uid()) and (select auth.uid()) is not null
$$;
create function fo_private.object_access(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.fo_members m where m.workspace_id::text=split_part(p_name,'/',1) and m.user_id=(select auth.uid()) and (select auth.uid()) is not null)
$$;
create function fo_private.object_unregistered(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and split_part(p_name,'/',2)=(select auth.uid())::text and not exists(select 1 from public.fo_assets a where a.storage_path=p_name)
$$;

alter table public.fo_workspaces enable row level security;
alter table public.fo_members enable row level security;
alter table public.fo_assets enable row level security;
alter table public.fo_reports enable row level security;
alter table public.fo_report_events enable row level security;
alter table public.fo_visits enable row level security;
create policy fo_workspaces_read on public.fo_workspaces for select to authenticated using (fo_private.workspace_role(id) is not null);
create policy fo_members_read on public.fo_members for select to authenticated using (fo_private.workspace_role(workspace_id) is not null);
create policy fo_assets_read on public.fo_assets for select to authenticated using (fo_private.workspace_role(workspace_id) is not null);
create policy fo_reports_read on public.fo_reports for select to authenticated using (fo_private.workspace_role(workspace_id) is not null);
create policy fo_events_read on public.fo_report_events for select to authenticated using (exists(select 1 from public.fo_reports r where r.id=report_id));
create policy fo_visits_read on public.fo_visits for select to authenticated using (fo_private.workspace_role(workspace_id) in ('owner','manager') or (fo_private.workspace_role(workspace_id)='sales' and created_by=(select auth.uid())));
revoke all on public.fo_workspaces,public.fo_members,public.fo_assets,public.fo_reports,public.fo_report_events,public.fo_visits from anon,authenticated;
grant select on public.fo_workspaces,public.fo_members,public.fo_assets,public.fo_reports,public.fo_report_events,public.fo_visits to authenticated;

create function fo_private.create_workspace(p_name text) returns public.fo_workspaces
language plpgsql security definer set search_path='' as $$
declare v public.fo_workspaces; v_email text;
begin
 if auth.uid() is null then raise exception '请先登录' using errcode='42501'; end if;
 select email into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then raise exception '请先确认邮箱' using errcode='42501'; end if;
 insert into public.fo_workspaces(name,created_by) values(btrim(p_name),auth.uid()) returning * into v;
 insert into public.fo_members(workspace_id,user_id,email,role) values(v.id,auth.uid(),v_email,'owner');
 return v;
end $$;
create function fo_private.add_member(p_workspace uuid,p_email text,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_email text;
begin
 if auth.uid() is null or fo_private.workspace_role(p_workspace) is distinct from 'owner' then raise exception '只有所有者可以添加成员' using errcode='42501'; end if;
 if p_role not in ('manager','operator','sales') or p_role is null then raise exception '角色无效'; end if;
 select id,email into v_user,v_email from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null limit 1;
 if v_user is null then raise exception '成员须先注册并确认邮箱'; end if;
 insert into public.fo_members(workspace_id,user_id,email,role) values(p_workspace,v_user,v_email,p_role);
end $$;
create function fo_private.register_asset(p_id uuid,p_workspace uuid,p_name text,p_media_type text,p_size bigint,p_path text) returns public.fo_assets
language plpgsql security definer set search_path='' as $$
declare v public.fo_assets; v_media_type text; v_size bigint;
begin
 if auth.uid() is null or fo_private.workspace_role(p_workspace) is null then raise exception '无权上传文件' using errcode='42501'; end if;
 if split_part(p_path,'/',1)<>p_workspace::text or split_part(p_path,'/',2)<>auth.uid()::text or split_part(split_part(p_path,'/',3),'.',1)<>p_id::text or array_length(string_to_array(p_path,'/'),1)<>3 then raise exception '文件路径无效'; end if;
 select metadata->>'mimetype',(metadata->>'size')::bigint into v_media_type,v_size from storage.objects where bucket_id='factory-operations-assets' and name=p_path;
 if v_media_type is null or v_size is null then raise exception '文件尚未上传或缺少存储元信息'; end if;
 if p_media_type is distinct from v_media_type or p_size is distinct from v_size then raise exception '文件描述与实际上传内容不一致'; end if;
 insert into public.fo_assets(id,workspace_id,name,media_type,size,storage_path,created_by) values(p_id,p_workspace,p_name,v_media_type,v_size,p_path,auth.uid()) returning * into v;
 return v;
end $$;
create function fo_private.create_report(p_workspace uuid,p_input jsonb) returns public.fo_reports
language plpgsql security definer set search_path='' as $$
declare v public.fo_reports; v_assets uuid[];
begin
 if auth.uid() is null or coalesce(fo_private.workspace_role(p_workspace),'') not in ('owner','manager','operator') then raise exception '无权提交上报' using errcode='42501'; end if;
 select coalesce(array_agg(x::uuid),'{}') into v_assets from jsonb_array_elements_text(coalesce(p_input->'assetIds','[]'::jsonb)) x;
 if cardinality(v_assets)<>(select count(distinct x) from unnest(v_assets) x) or exists(select 1 from unnest(v_assets) x where not exists(select 1 from public.fo_assets a where a.id=x and a.workspace_id=p_workspace)) then raise exception '附件无效或不属于当前工作空间'; end if;
 if p_input->>'kind'='broken_needle' and not exists(select 1 from public.fo_assets a where a.id=any(v_assets) and a.workspace_id=p_workspace and a.media_type in ('image/jpeg','image/png','image/webp')) then raise exception '断针上报至少需要一张照片'; end if;
 insert into public.fo_reports(workspace_id,kind,contract_number,material_number,station,reason,quantity,asset_ids,created_by)
 values(p_workspace,p_input->>'kind',btrim(p_input->>'contractNumber'),btrim(p_input->>'materialNumber'),btrim(p_input->>'station'),btrim(p_input->>'reason'),(p_input->>'quantity')::integer,v_assets,auth.uid()) returning * into v;
 insert into public.fo_report_events(report_id,actor_id,action,note) values(v.id,auth.uid(),'submitted','提交上报');
 return v;
end $$;
create function fo_private.change_report(p_report uuid,p_version integer,p_action text,p_note text,p_request uuid) returns public.fo_reports
language plpgsql security definer set search_path='' as $$
declare v public.fo_reports; prior public.fo_report_events; v_payload jsonb;
begin
 if auth.uid() is null then raise exception '请先登录' using errcode='42501'; end if;
 if p_request is null or p_version is null or p_action is null then raise exception '缺少请求标识或版本'; end if;
 if p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception '请填写处理说明（不超过2000字）'; end if;
 select * into v from public.fo_reports where id=p_report for update;
 if v.id is null or coalesce(fo_private.workspace_role(v.workspace_id),'') not in ('owner','manager') then raise exception '无权处理此上报' using errcode='42501'; end if;
 v_payload:=jsonb_build_object('version',p_version,'action',p_action,'note',p_note);
 select * into prior from public.fo_report_events where report_id=p_report and request_id=p_request;
 if prior.id is not null then
   if prior.actor_id<>auth.uid() or prior.payload<>v_payload then raise exception '请求标识已用于其他操作' using errcode='23505'; end if;
   return v;
 end if;
 if v.version<>p_version then raise exception '记录已更新，请刷新后重试' using errcode='40001'; end if;
 if p_action='recovery' then
   if v.kind<>'broken_needle' or v.fragments_recovered or v.status not in ('submitted','approved','delivering') then raise exception '当前状态无法确认碎片回收'; end if;
   update public.fo_reports set fragments_recovered=true,version=version+1,updated_at=now() where id=p_report returning * into v;
 else
   if not ((v.status='submitted' and p_action in ('approved','rejected')) or (v.status='approved' and p_action='delivering') or (v.status='delivering' and p_action='completed')) then raise exception '当前状态不允许此操作'; end if;
   if p_action='completed' and v.kind='broken_needle' and not v.fragments_recovered then raise exception '请先确认断针碎片已全部回收'; end if;
   update public.fo_reports set status=p_action,version=version+1,updated_at=now() where id=p_report returning * into v;
 end if;
 insert into public.fo_report_events(report_id,actor_id,action,note,request_id,payload) values(p_report,auth.uid(),p_action,btrim(p_note),p_request,v_payload);
 return v;
end $$;
create function fo_private.create_visit(p_workspace uuid,p_input jsonb) returns public.fo_visits
language plpgsql security definer set search_path='' as $$
declare v public.fo_visits;
begin
 if auth.uid() is null or coalesce(fo_private.workspace_role(p_workspace),'') not in ('owner','manager','sales') then raise exception '无权记录拜访' using errcode='42501'; end if;
 insert into public.fo_visits(workspace_id,customer,visited_at,summary,issues,next_step,follow_up_date,created_by)
 values(p_workspace,btrim(p_input->>'customer'),(p_input->>'visitedAt')::timestamptz,btrim(p_input->>'summary'),coalesce(p_input->>'issues',''),btrim(p_input->>'nextStep'),nullif(p_input->>'followUpDate','')::date,auth.uid()) returning * into v;
 return v;
end $$;

-- 暴露的 RPC 只使用调用者权限，授权与原子写入集中在私有函数。
create function public.fo_create_workspace(p_name text) returns public.fo_workspaces language sql security invoker set search_path='' as $$ select fo_private.create_workspace(p_name) $$;
create function public.fo_add_member(p_workspace uuid,p_email text,p_role text) returns void language sql security invoker set search_path='' as $$ select fo_private.add_member(p_workspace,p_email,p_role) $$;
create function public.fo_register_asset(p_id uuid,p_workspace uuid,p_name text,p_media_type text,p_size bigint,p_path text) returns public.fo_assets language sql security invoker set search_path='' as $$ select fo_private.register_asset(p_id,p_workspace,p_name,p_media_type,p_size,p_path) $$;
create function public.fo_create_report(p_workspace uuid,p_input jsonb) returns public.fo_reports language sql security invoker set search_path='' as $$ select fo_private.create_report(p_workspace,p_input) $$;
create function public.fo_change_report(p_report uuid,p_version integer,p_action text,p_note text,p_request uuid) returns public.fo_reports language sql security invoker set search_path='' as $$ select fo_private.change_report(p_report,p_version,p_action,p_note,p_request) $$;
create function public.fo_create_visit(p_workspace uuid,p_input jsonb) returns public.fo_visits language sql security invoker set search_path='' as $$ select fo_private.create_visit(p_workspace,p_input) $$;
revoke execute on all functions in schema fo_private from public,anon;
grant execute on all functions in schema fo_private to authenticated;
revoke execute on function public.fo_create_workspace(text),public.fo_add_member(uuid,text,text),public.fo_register_asset(uuid,uuid,text,text,bigint,text),public.fo_create_report(uuid,jsonb),public.fo_change_report(uuid,integer,text,text,uuid),public.fo_create_visit(uuid,jsonb) from public,anon;
grant execute on function public.fo_create_workspace(text),public.fo_add_member(uuid,text,text),public.fo_register_asset(uuid,uuid,text,text,bigint,text),public.fo_create_report(uuid,jsonb),public.fo_change_report(uuid,integer,text,text,uuid),public.fo_create_visit(uuid,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('factory-operations-assets','factory-operations-assets',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','audio/mpeg']);
create policy fo_storage_read on storage.objects for select to authenticated using(bucket_id='factory-operations-assets' and fo_private.object_access(name));
create policy fo_storage_insert on storage.objects for insert to authenticated with check(bucket_id='factory-operations-assets' and fo_private.object_access(name) and split_part(name,'/',2)=(select auth.uid())::text);
-- 仅允许补偿删除尚未登记的本人上传；已关联的审计素材不可覆盖或删除。
create policy fo_storage_cleanup on storage.objects for delete to authenticated using(bucket_id='factory-operations-assets' and fo_private.object_access(name) and fo_private.object_unregistered(name));
