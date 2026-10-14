-- 将业务版本冲突映射为 HTTP 409，避免被识别为可重试的序列化失败。
-- 官方契约：https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes
create or replace function fo_private.change_report(p_report uuid,p_version integer,p_action text,p_note text,p_request uuid) returns public.fo_reports
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
 if v.version<>p_version then raise exception '记录已更新，请刷新后重试' using errcode='PT409'; end if;
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
