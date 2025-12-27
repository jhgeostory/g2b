-- Fix RLS Policy to allow Insert/Update/Delete (Full Access)
-- WARNING: This allows basic public access. For production, use Service Role Key or authenticated users.

drop policy if exists "Allow public read access" on public.g2b_bids;

create policy "Allow public full access"
on public.g2b_bids
for all
using (true)
with check (true);
