-- No public API access: called only by the database scheduler.
create table if not exists public.agenda_email_log (
 id text primary key, due_date date not null, payload jsonb not null,
 status text not null default 'pending', request_id bigint, attempts integer not null default 0,
 attempted_at timestamptz, accepted_at timestamptz, http_status integer
);
alter table public.agenda_email_log enable row level security;
revoke all on public.agenda_email_log from public,anon,authenticated;

create or replace function public.agenda_email_candidates(projects jsonb, users_data jsonb, suppliers jsonb, reference_day date)
returns table(id text,due_date date,payload jsonb) language sql immutable set search_path='' as $fn$
 with people as (
 select 'usuario:'||(u->>'id') as key, u->>'nome' as name, lower(trim(u->>'email')) as email
 from jsonb_array_elements(users_data) u where u->>'aprovado'='true' and u->>'ativo'='true'
 union all
 select 'terceiro:'||(f->>'id'),coalesce(nullif(f->>'fantasia',''),f->>'nome'),lower(trim(f->>'email'))
 from jsonb_array_elements(suppliers) f where f->>'status'='Ativo' and f->>'habilitadoObra'='true'
 ), tasks as (
 select p->>'id' as project_id,p->>'nome' as project_name,t,person.*
 from jsonb_array_elements(projects) p cross join lateral jsonb_array_elements(coalesce(p->'cronograma','[]')) t
 join people person on person.key=t->>'responsibleKey'
 where t->>'end'=to_char(reference_day+1,'YYYY-MM-DD') and coalesce(t->>'status','A iniciar')<>'Concluído'
 and nullif(t->>'id','') is not null and nullif(p->>'id','') is not null
 and person.email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 )
 select md5(project_id||'/'||(t->>'id')||'/'||(t->>'end')||'/'||key||'/'||email),reference_day+1,
 jsonb_build_object('from','Camber <lead@mabeinteriores.com.br>','to',jsonb_build_array(email),
 'subject','Camber: prazo de conclusão amanhã — '||coalesce(t->>'title','Etapa da obra'),
 'text','Olá, '||coalesce(name,'responsável')||E'.\n\nLembrete: o prazo de conclusão desta etapa é amanhã.\n\nObra: '||coalesce(project_name,'')||E'\nEtapa: '||coalesce(t->>'title','')||E'\nPrazo final: '||to_char(reference_day+1,'DD/MM/YYYY')||E'\n\nConfira o andamento na Agenda de Obras e atualize o status da etapa.\nhttp://app.camberinteriores.com.br/projetos.html')
 from tasks;
$fn$;
revoke all on function public.agenda_email_candidates(jsonb,jsonb,jsonb,date) from public,anon,authenticated;

create or replace function public.agenda_send_reminders(dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
 local_now timestamp := now() at time zone 'America/Sao_Paulo';
 projects jsonb; suppliers jsonb; users_data jsonb; api_key text; r record; job record; request bigint; total integer:=0;
begin
 if not pg_try_advisory_xact_lock(91718082) then return jsonb_build_object('busy',true); end if;
 select value into projects from public.kv_store where workspace='mabe' and key='mabe-projects-v3';
 select value into suppliers from public.kv_store where workspace='mabe' and key='mabe-fornecedores-v1';
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,'email',email,'ativo',ativo,'aprovado',aprovado)),'[]') into users_data from public.profiles;
 if dry_run then
 select count(*) into total from public.agenda_email_candidates(coalesce(projects,'[]'),users_data,coalesce(suppliers,'[]'),local_now::date);
 return jsonb_build_object('dry_run',true,'eligible',total,'time_zone','America/Sao_Paulo','hour',8,'target','end');
 end if;
 -- Provider acceptance is tracked separately from final inbox delivery.
 update public.agenda_email_log l set status=case when n.status_code between 200 and 299 then 'accepted' else 'failed' end,
 http_status=n.status_code,accepted_at=case when n.status_code between 200 and 299 then now() else null end
 from net._http_response n where n.id=l.request_id and l.status='pending';
 if local_now::time < time '08:00' then return jsonb_build_object('outside_hours',true); end if;
 select decrypted_secret into api_key from vault.decrypted_secrets where name='resend_camber';
 if api_key is null then raise exception 'Email provider is not configured'; end if;
 for r in select * from public.agenda_email_candidates(coalesce(projects,'[]'),users_data,coalesce(suppliers,'[]'),local_now::date) loop
 insert into public.agenda_email_log(id,due_date,payload) values(r.id,r.due_date,r.payload) on conflict do nothing;
 select * into job from public.agenda_email_log where id=r.id;
 if job.status='accepted' or job.attempts>=6 or (job.attempted_at is not null and job.attempted_at>now()-interval '20 minutes') then continue; end if;
 -- Fixed payload + same idempotency key across retries within the same reminder day.
 request:=net.http_post(url:='https://api.resend.com/emails',
 headers:=jsonb_build_object('Authorization','Bearer '||api_key,'Content-Type','application/json','Idempotency-Key','agenda/'||r.id),
 body:=job.payload,timeout_milliseconds:=10000);
 update public.agenda_email_log set request_id=request,attempts=attempts+1,attempted_at=now(),status='pending' where id=r.id;
 total:=total+1;
 if total>=40 then exit; end if;
 end loop;
 return jsonb_build_object('queued',total);
end;
$fn$;
revoke all on function public.agenda_send_reminders(boolean) from public,anon,authenticated;
-- First attempt 08:00 Brasilia; later runs handle retries/newly scheduled tasks.
select cron.schedule('agenda-lembrete-conclusao','*/10 * * * *','select public.agenda_send_reminders(false);');
select cron.alter_job((select jobid from cron.job where jobname='agenda-lembrete-conclusao'),active:=false);
