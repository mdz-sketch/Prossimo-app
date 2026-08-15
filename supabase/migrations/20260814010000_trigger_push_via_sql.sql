-- Alternativa a "Database Webhooks" via dashboard (a volte difficile da
-- trovare / rinominata a seconda della versione): stesso risultato, un
-- trigger su Postgres che chiama direttamente la Edge Function send-push
-- ad ogni UPDATE di "businesses", usando l'estensione pg_net.
--
-- PRIMA DI ESEGUIRE QUESTO FILE, sostituisci i due segnaposto qui sotto:
--
-- 1) '<URL_SEND_PUSH>' con l'URL della function dopo il deploy, del tipo:
--    https://<il-tuo-project-ref>.supabase.co/functions/v1/send-push
--    (lo trovi nella pagina della function "send-push" su Supabase, sotto
--    "Edge Functions", una volta fatto il deploy)
--
-- 2) '<SERVICE_ROLE_KEY>' con la Service Role Key del progetto, che trovi
--    in Project Settings -> API -> service_role (la chiave "secret", NON
--    quella "anon"/pubblica). Serve per autorizzare la chiamata alla
--    function (che richiede un token valido).

create extension if not exists pg_net with schema extensions;

create or replace function trigger_invia_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := '<URL_SEND_PUSH>',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := jsonb_build_object('record', to_jsonb(new), 'old_record', to_jsonb(old))
  );
  return new;
end;
$$;

drop trigger if exists trg_invia_push on businesses;
create trigger trg_invia_push
after update on businesses
for each row execute function trigger_invia_push();
