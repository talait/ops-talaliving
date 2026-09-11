-- Local only. Proves the access model actually refuses, rather than assuming
-- it does — the failure mode this whole design exists to avoid is a screen
-- that shows a button the database then refuses, or worse, allows (§3.3).
--
--   psql -h /tmp -p 5433 -U postgres -f supabase/local/smoke.sql

begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','wulan@talaliving.com'),
  ('22222222-2222-2222-2222-222222222222','evin@talaliving.com');

insert into core.users (id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111','wulan@talaliving.com','Wulan Sari'),
  ('22222222-2222-2222-2222-222222222222','evin@talaliving.com','Evin Jonathan');

-- HRD: may open HR and run payroll, holds no authority.
insert into core.user_modules (user_id, module, level) values
  ('11111111-1111-1111-1111-111111111111','hrd','write'),
  ('11111111-1111-1111-1111-111111111111','payroll','write');

-- The Direktur: approves, but administers nothing.
insert into core.user_modules (user_id, module, level) values
  ('22222222-2222-2222-2222-222222222222','procurement','read');
insert into core.user_authorities (user_id, authority) values
  ('22222222-2222-2222-2222-222222222222','approve_goods'),
  ('22222222-2222-2222-2222-222222222222','approve_funds');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$ begin
  assert core.has_permission('hrd.read'),        'HRD should read HR';
  assert core.has_permission('payroll.run'),     'HRD should run payroll';
  assert not core.has_permission('it.manage_users'),
         'write is not admin — manage_users is admin-only';
  assert not core.has_permission('procurement.create'),
         'a module nobody granted opens nothing';
  assert not core.has_authority('approve_funds'),
         'an authority is never implied by a module level (D24)';
end $$;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$ begin
  assert core.has_authority('approve_goods'), 'the Direktur approves goods';
  assert not core.has_permission('procurement.update'),
         'read is read: approving is not editing';
  assert not core.has_permission('payroll.read'),
         'approving funds does not open payroll';
end $$;

-- RLS itself, not only the function: the grant tables are readable by their
-- owner and by whoever administers access, and by nobody else.
do $$
declare n int;
begin
  select count(*) into n from core.user_modules;
  assert n = 1, format('the Direktur should see only their own grant, saw %s', n);
end $$;

-- And the numbering seam still mints in order under a real role.
do $$
declare a text; b text;
begin
  a := core.next_doc_number('spk');
  b := core.next_doc_number('spk');
  assert right(a, 2)::int + 1 = right(b, 2)::int, 'document numbers must not collide';
end $$;

rollback;
