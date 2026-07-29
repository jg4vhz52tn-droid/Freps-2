-- N2: hochschulen/studiengaenge only ever had insert policies -- any typo or
-- duplicate a user created stayed forever, nobody could ever fix or remove
-- one. Reviewers get update+delete on both catalog tables; regular users
-- keep exactly the insert-only access they already had.
create policy "hochschulen: reviewer update" on public.hochschulen
  for update using (public.is_reviewer());

create policy "hochschulen: reviewer delete" on public.hochschulen
  for delete using (public.is_reviewer());

create policy "studiengaenge: reviewer update" on public.studiengaenge
  for update using (public.is_reviewer());

create policy "studiengaenge: reviewer delete" on public.studiengaenge
  for delete using (public.is_reviewer());
