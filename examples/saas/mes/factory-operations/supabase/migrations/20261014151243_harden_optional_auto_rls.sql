-- 部分 Supabase 项目预置自动启用 RLS 的事件触发函数。
-- 事件触发器由数据库执行，浏览器角色不需要手工执行权限。
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;
