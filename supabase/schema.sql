-- Multi-client support bot schema. Run once in the Supabase SQL editor (or via migration).
create extension if not exists vector with schema extensions;

-- One row per client/brand. Everything a bot needs is configured here.
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  -- Free-form context: who the company is, tone, policies, escalation rules.
  context text not null default '',
  model text not null default 'openai/gpt-4.1-mini',
  temperature real not null default 0.3,
  -- { enabled, allowed_domains[], excluded_domains[], max_results }
  web_search jsonb not null default '{"enabled": false, "allowed_domains": [], "excluded_domains": [], "max_results": 5}',
  -- Live API tools: [{ name, description, method, url, headers{}, parameters (JSON schema) }]
  tools jsonb not null default '[]',
  -- Widget look and behaviour: { title, greeting, color, position, suggestions[] }
  widget jsonb not null default '{"title": "Support", "greeting": "Hi! How can I help you today?", "color": "#2563eb", "position": "right", "suggestions": []}',
  -- Websites allowed to embed the widget. Empty = any.
  allowed_origins text[] not null default '{}',
  handoff_message text not null default 'I''m not sure about that. Let me connect you with our team.',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Each uploaded file / URL / CSV / text snippet.
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null check (kind in ('text', 'pdf', 'csv', 'url', 'file')),
  name text not null,
  origin text,               -- URL or filename
  status text not null default 'ready',
  error text,
  chunk_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists sources_client_idx on sources(client_id);

create table if not exists chunks (
  id bigint generated always as identity primary key,
  client_id uuid not null references clients(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  content text not null,
  meta jsonb not null default '{}',
  embedding extensions.vector(1536),
  fts tsvector generated always as (to_tsvector('simple', content)) stored
);
create index if not exists chunks_client_idx on chunks(client_id);
create index if not exists chunks_source_idx on chunks(source_id);
create index if not exists chunks_fts_idx on chunks using gin(fts);
create index if not exists chunks_embedding_idx on chunks using hnsw (embedding extensions.vector_cosine_ops);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  visitor_id text,
  created_at timestamptz not null default now()
);
create index if not exists conversations_client_idx on conversations(client_id, created_at desc);

create table if not exists messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on messages(conversation_id, created_at);

-- Hybrid search: vector similarity + keyword match, fused with reciprocal rank fusion.
create or replace function match_chunks(
  p_client_id uuid,
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_match_count int default 8
) returns table (id bigint, source_id uuid, content text, meta jsonb, score float)
language sql stable
set search_path = public, extensions
as $$
  with semantic as (
    select c.id, row_number() over (order by c.embedding <=> p_query_embedding) as rnk
    from chunks c
    where c.client_id = p_client_id and c.embedding is not null
    order by c.embedding <=> p_query_embedding
    limit p_match_count * 3
  ),
  keyword as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q) desc) as rnk
    from chunks c, websearch_to_tsquery('simple', p_query_text) q
    where c.client_id = p_client_id and c.fts @@ q
    order by ts_rank_cd(c.fts, q) desc
    limit p_match_count * 3
  ),
  fused as (
    select coalesce(s.id, k.id) as id,
           coalesce(1.0 / (60 + s.rnk), 0) + coalesce(1.0 / (60 + k.rnk), 0) as score
    from semantic s full outer join keyword k on s.id = k.id
  )
  select c.id, c.source_id, c.content, c.meta, f.score::float
  from fused f join chunks c on c.id = f.id
  order by f.score desc
  limit p_match_count;
$$;

-- Lock everything down: the app only talks to these tables with the service role key, server-side.
alter table clients enable row level security;
alter table sources enable row level security;
alter table chunks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
revoke execute on function match_chunks(uuid, extensions.vector, text, int) from anon, authenticated, public;
grant execute on function match_chunks(uuid, extensions.vector, text, int) to service_role;
