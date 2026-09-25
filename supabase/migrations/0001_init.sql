-- Koya Talent Lead Agent — initial schema
-- Tables follow LEAD_AGENT_IMPLEMENTATION.md, plus the columns the PRD requires
-- (tool limits on the run record, source_urls on leads, purpose/summaries on tool calls).

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- campaign_settings
-- ─────────────────────────────────────────────────────────────────────────────
create table campaign_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tone varchar(50),
  offer text,
  target_persona varchar(255),
  additional_context text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- runs
-- ─────────────────────────────────────────────────────────────────────────────
create table runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_name varchar(255),
  original_objective text not null,
  campaign_settings_id uuid references campaign_settings(id),
  -- Lead limit is set by the user and read by tools; the agent can never change it.
  target_lead_count int not null default 10 check (target_lead_count between 1 and 25),
  tool_limits jsonb not null default '{}'::jsonb,
  refined_icp jsonb,
  icp_status varchar(50) default 'pending',          -- pending | pending_user_review | approved
  icp_approved_at timestamptz,
  current_phase int default 1,
  overall_status varchar(50) default 'in_progress',
  -- in_progress | awaiting_icp_approval | researching | validation_passed | validation_failed
  -- | approved | cancelled | error
  search_round int not null default 0,
  agent_turns_used int not null default 0,
  shortfall_choice varchar(50),
  final_approved_at timestamptz,
  final_approval_checklist jsonb,
  last_error varchar(500),
  last_error_at timestamptz,
  total_cost_estimate decimal(10,2),
  total_cost_actual decimal(10,4) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

-- ─────────────────────────────────────────────────────────────────────────────
-- phase_states
-- ─────────────────────────────────────────────────────────────────────────────
create table phase_states (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  phase_number int not null,
  status varchar(50) default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  error_message varchar(500),
  checkpoint_data jsonb,
  cost_actual decimal(10,4) default 0,
  tokens_input int default 0,
  tokens_output int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (run_id, phase_number)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- leads
-- ─────────────────────────────────────────────────────────────────────────────
create table leads (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  company_name varchar(255) not null,
  company_domain varchar(255) not null,
  employee_count int,
  industry varchar(255),
  country varchar(100),
  website_url varchar(500),
  discovery_data jsonb,          -- company-level fields only; contact PII is stripped before insert
  search_round int default 1,
  scrape_status varchar(50),     -- pending | success | failed
  scrape_error varchar(500),
  source_urls text[] default '{}',
  source_summary text,
  source_content text,
  extracted_fields jsonb,
  injection_warning boolean default false,
  scrape_timestamp timestamptz,
  qualification_status varchar(50),
  confidence float,
  fit_reasons jsonb,
  concerns jsonb,
  hard_filter_check jsonb,
  needs_review_explanation text,
  needs_review_meta jsonb,
  qualification_timestamp timestamptz,
  manual_decision boolean default false,
  selected boolean default false,  -- within the user's target count (top-N qualified by confidence)
  outreach_drafts jsonb,
  outreach_status varchar(50),
  outreach_quality_score float,
  outreach_attempts int default 0,
  outreach_timestamp timestamptz,
  final_approved boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (run_id, company_domain)
);
create index leads_run_idx on leads(run_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- tool_calls
-- ─────────────────────────────────────────────────────────────────────────────
create table tool_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  phase_number int,
  tool_name varchar(100),
  purpose text,
  input_summary text,
  output_summary text,
  input jsonb,
  output jsonb,
  status varchar(50),
  error_message varchar(500),
  tokens_input int,
  tokens_output int,
  cost_estimate decimal(10,4),
  cost_actual decimal(10,4),
  duration_ms int,
  created_at timestamptz default now()
);
create index tool_calls_run_idx on tool_calls(run_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- error_logs
-- ─────────────────────────────────────────────────────────────────────────────
create table error_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  phase_number int,
  error_type varchar(100),
  error_message text,
  error_stack text,
  context jsonb,
  severity varchar(50),
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- validations
-- ─────────────────────────────────────────────────────────────────────────────
create table validations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  overall_score float,
  pass boolean,
  qualified_lead_count int,
  needs_review_count int,
  dimensions jsonb,
  safety_checks jsonb,
  flagged_leads text[],
  shortfall boolean default false,
  shortfall_explanation text,
  agent_notes text,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger runs_updated before update on runs for each row execute function set_updated_at();
create trigger leads_updated before update on leads for each row execute function set_updated_at();
create trigger phase_states_updated before update on phase_states for each row execute function set_updated_at();
create trigger campaign_settings_updated before update on campaign_settings for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Selection: the top target_lead_count qualified leads (human decisions first,
-- then by confidence) are `selected`. Used by both the worker and the web app.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function recompute_selection(p_run_id uuid) returns table (qualified_count int, selected_count int)
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select r.target_lead_count into n from runs r where r.id = p_run_id;
  update leads l set selected = false where l.run_id = p_run_id and l.selected;
  update leads l set selected = true where l.id in (
    select x.id from leads x
    where x.run_id = p_run_id and x.qualification_status = 'qualified'
    order by x.manual_decision desc, x.confidence desc nulls last, x.created_at
    limit n
  );
  return query select
    (select count(*)::int from leads x where x.run_id = p_run_id and x.qualification_status = 'qualified'),
    (select count(*)::int from leads x where x.run_id = p_run_id and x.selected);
end $$;
revoke execute on function recompute_selection(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- The worker uses the service-role key (bypasses RLS). The browser only ever
-- reads its own runs; all writes from the web app go through API routes that
-- enforce the approval gates.
-- ─────────────────────────────────────────────────────────────────────────────
alter table campaign_settings enable row level security;
alter table runs enable row level security;
alter table phase_states enable row level security;
alter table leads enable row level security;
alter table tool_calls enable row level security;
alter table error_logs enable row level security;
alter table validations enable row level security;

create policy "own settings" on campaign_settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own runs select" on runs for select using (user_id = auth.uid());
create policy "own runs insert" on runs for insert with check (user_id = auth.uid());

create or replace function owns_run(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from runs where id = rid and user_id = auth.uid())
$$;

create policy "own phase_states" on phase_states for select using (owns_run(run_id));
create policy "own leads" on leads for select using (owns_run(run_id));
create policy "own tool_calls" on tool_calls for select using (owns_run(run_id));
create policy "own error_logs" on error_logs for select using (owns_run(run_id));
create policy "own validations" on validations for select using (owns_run(run_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime (activity sidebar)
-- ─────────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table runs, phase_states, leads, tool_calls, error_logs, validations;
