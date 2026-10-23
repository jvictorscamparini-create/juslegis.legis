alter table public.petitions
  add column verified_sources jsonb not null default '{"topic":"","categories":[],"request_hash":"","consulted_at":null,"sources":[]}'::jsonb;
