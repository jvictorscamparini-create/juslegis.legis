update public.admin_settings
set value = jsonb_set(value, '{price_brl}', '44.90'::jsonb, true),
    updated_at = now()
where key = 'plan'
  and (
    value -> 'price_brl' is null
    or value -> 'price_brl' = 'null'::jsonb
  );
