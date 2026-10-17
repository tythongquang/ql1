-- =====================================================================
-- PHÒNG KHÁM MẮT - SCHEMA SUPABASE
-- Chạy toàn bộ file này trong Supabase > SQL Editor
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- BỆNH NHÂN ----------
create sequence if not exists patient_seq start 1;
create table patients (
  id uuid primary key default gen_random_uuid(),
  seq bigint not null default nextval('patient_seq'),
  code text generated always as ('BN' || lpad(seq::text, 6, '0')) stored,
  full_name text not null,
  phone text,
  birth_year int,
  gender text check (gender in ('nam','nu','khac')),
  address text,
  note text,
  created_at timestamptz not null default now()
);
create index on patients (full_name);
create index on patients (phone);

-- ---------- DANH MỤC THUỐC / THỦ THUẬT ----------
create table products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null default 'thuoc' check (kind in ('thuoc','thu_thuat')),
  unit text not null default 'lọ',
  cost_price numeric(14,0) not null default 0,   -- giá nhập gần nhất
  sell_price numeric(14,0) not null default 0,
  default_qty numeric(10,2) not null default 1,  -- SL mặc định khi kê (VD thủ thuật 5 hoặc 10)
  min_stock numeric(10,2) not null default 0,
  favorite boolean not null default false,
  active boolean not null default true,          -- false = ngừng kinh doanh
  created_at timestamptz not null default now(),
  constraint thu_thuat_unit check (kind <> 'thu_thuat' or unit = 'lần')
);
create index on products (kind, active);

-- ---------- LỊCH SỬ GIÁ ----------
create table price_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references products(id) on delete cascade,
  cost_price numeric(14,0) not null,
  sell_price numeric(14,0) not null,
  changed_at timestamptz not null default now()
);
create index on price_history (product_id, changed_at desc);

create or replace function log_price_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT'
     or new.cost_price is distinct from old.cost_price
     or new.sell_price is distinct from old.sell_price then
    insert into price_history (product_id, cost_price, sell_price)
    values (new.id, new.cost_price, new.sell_price);
  end if;
  return new;
end $$;
create trigger trg_products_price after insert or update on products
  for each row execute function log_price_change();

-- ---------- KHO ----------
create table stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references products(id),
  type text not null check (type in ('nhap','xuat','dieu_chinh')),
  qty numeric(12,2) not null,              -- có dấu: nhập +, xuất -, điều chỉnh +/-
  unit_cost numeric(14,0),
  supplier text,
  note text,
  prescription_id uuid,
  created_at timestamptz not null default now()
);
create index on stock_movements (product_id, created_at desc);

create view products_with_stock with (security_invoker = true) as
select p.*, coalesce(s.stock, 0) as stock
from products p
left join (select product_id, sum(qty) as stock from stock_movements group by product_id) s
  on s.product_id = p.id;

-- ---------- ĐƠN THUỐC ----------
create sequence if not exists rx_seq start 1;
create table prescriptions (
  id uuid primary key default gen_random_uuid(),
  seq bigint not null default nextval('rx_seq'),
  code text generated always as ('DT' || seq::text) stored unique,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_date timestamptz not null default now(),
  diagnosis text,
  note text,
  subtotal numeric(14,0) not null default 0,
  discount numeric(14,0) not null default 0,
  total numeric(14,0) not null default 0,
  paid numeric(14,0) not null default 0,   -- tự cập nhật từ bảng payments
  created_at timestamptz not null default now()
);
create index on prescriptions (patient_id, visit_date desc);

create table prescription_items (
  id bigint generated always as identity primary key,
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  product_id uuid references products(id),
  name text not null,
  unit text not null,
  kind text not null,
  qty numeric(10,2) not null,
  unit_price numeric(14,0) not null,
  cost_price numeric(14,0) not null default 0,  -- chụp giá vốn tại thời điểm kê để tính lãi
  usage text
);
create index on prescription_items (prescription_id);

create table payments (
  id bigint generated always as identity primary key,
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  amount numeric(14,0) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash','transfer')),
  sepay_id text unique,
  note text,
  created_at timestamptz not null default now()
);

create or replace function sync_paid() returns trigger language plpgsql as $$
begin
  update prescriptions set paid = coalesce((select sum(amount) from payments
    where prescription_id = new.prescription_id), 0)
  where id = new.prescription_id;
  return new;
end $$;
create trigger trg_payments_sync after insert on payments
  for each row execute function sync_paid();

-- ---------- ĐƠN KÍNH ----------
create table glasses_prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  visit_date timestamptz not null default now(),
  od_sph numeric(5,2), od_cyl numeric(5,2), od_axis int, od_add numeric(5,2), od_va text, od_pd numeric(4,1),
  os_sph numeric(5,2), os_cyl numeric(5,2), os_axis int, os_add numeric(5,2), os_va text, os_pd numeric(4,1),
  pd numeric(4,1),
  lens_type text,
  frame text,
  note text,
  price numeric(14,0) not null default 0,
  deposit numeric(14,0) not null default 0,
  created_at timestamptz not null default now()
);
create index on glasses_prescriptions (patient_id, visit_date desc);

-- ---------- ẢNH TÌNH TRẠNG BỆNH (file nằm ở Cloudflare R2) ----------
create table visit_images (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  prescription_id uuid references prescriptions(id) on delete set null,
  r2_key text not null,
  caption text,
  taken_at timestamptz not null default now()
);
create index on visit_images (patient_id, taken_at desc);

-- =====================================================================
-- RPC
-- =====================================================================

-- Tạo đơn thuốc nguyên tử: tính tiền, chụp giá vốn, trừ kho, ghi thanh toán
-- p_items: [{product_id, qty, unit_price, usage}]
create or replace function create_prescription(
  p_patient uuid, p_diagnosis text, p_note text,
  p_discount numeric, p_paid numeric, p_items jsonb
) returns uuid language plpgsql as $$
declare
  rx_id uuid; it jsonb; prod products; sub numeric := 0; tot numeric;
begin
  if jsonb_array_length(p_items) = 0 then raise exception 'Đơn không có mục nào'; end if;
  insert into prescriptions (patient_id, diagnosis, note) values (p_patient, p_diagnosis, p_note)
  returning id into rx_id;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into prod from products where id = (it->>'product_id')::uuid;
    insert into prescription_items (prescription_id, product_id, name, unit, kind, qty, unit_price, cost_price, usage)
    values (rx_id, prod.id, prod.name, prod.unit, prod.kind, (it->>'qty')::numeric,
            (it->>'unit_price')::numeric, prod.cost_price, nullif(it->>'usage',''));
    sub := sub + (it->>'qty')::numeric * (it->>'unit_price')::numeric;
    if prod.kind = 'thuoc' then
      insert into stock_movements (product_id, type, qty, prescription_id, note)
      values (prod.id, 'xuat', -(it->>'qty')::numeric, rx_id, 'Xuất theo đơn');
    end if;
  end loop;

  tot := greatest(sub - coalesce(p_discount,0), 0);
  update prescriptions set subtotal = sub, discount = coalesce(p_discount,0), total = tot where id = rx_id;
  if coalesce(p_paid,0) > 0 then
    insert into payments (prescription_id, amount, method) values (rx_id, least(p_paid, tot), 'cash');
  end if;
  return rx_id;
end $$;

-- Nhập kho (cập nhật giá nhập -> trigger ghi lịch sử giá)
create or replace function receive_stock(
  p_product uuid, p_qty numeric, p_unit_cost numeric, p_supplier text, p_note text,
  p_new_sell_price numeric default null
) returns void language plpgsql as $$
begin
  insert into stock_movements (product_id, type, qty, unit_cost, supplier, note)
  values (p_product, 'nhap', p_qty, p_unit_cost, p_supplier, p_note);
  update products set cost_price = p_unit_cost,
                      sell_price = coalesce(p_new_sell_price, sell_price)
  where id = p_product;
end $$;

-- Kiểm kê: đặt tồn thực tế
create or replace function adjust_stock(p_product uuid, p_actual numeric, p_note text)
returns void language plpgsql as $$
declare cur numeric;
begin
  select coalesce(sum(qty),0) into cur from stock_movements where product_id = p_product;
  if p_actual <> cur then
    insert into stock_movements (product_id, type, qty, note)
    values (p_product, 'dieu_chinh', p_actual - cur, coalesce(p_note,'Kiểm kê'));
  end if;
end $$;

-- Báo cáo xuất nhập tồn theo kỳ
create or replace function stock_report(p_from timestamptz, p_to timestamptz)
returns table (product_id uuid, code text, name text, unit text,
               opening numeric, qty_in numeric, qty_out numeric, qty_adjust numeric, closing numeric)
language sql stable as $$
  select p.id, p.code, p.name, p.unit,
    coalesce(sum(m.qty) filter (where m.created_at < p_from),0),
    coalesce(sum(m.qty) filter (where m.type='nhap' and m.created_at >= p_from and m.created_at < p_to),0),
    coalesce(-sum(m.qty) filter (where m.type='xuat' and m.created_at >= p_from and m.created_at < p_to),0),
    coalesce(sum(m.qty) filter (where m.type='dieu_chinh' and m.created_at >= p_from and m.created_at < p_to),0),
    coalesce(sum(m.qty) filter (where m.created_at < p_to),0)
  from products p left join stock_movements m on m.product_id = p.id
  where p.kind = 'thuoc'
  group by p.id order by p.name;
$$;

-- Báo cáo doanh thu - giá vốn - lãi theo mặt hàng
create or replace function profit_report(p_from timestamptz, p_to timestamptz)
returns table (name text, kind text, unit text, qty numeric, revenue numeric, cost numeric, profit numeric)
language sql stable as $$
  select i.name, i.kind, i.unit, sum(i.qty), sum(i.qty*i.unit_price), sum(i.qty*i.cost_price),
         sum(i.qty*(i.unit_price - i.cost_price))
  from prescription_items i join prescriptions r on r.id = i.prescription_id
  where r.visit_date >= p_from and r.visit_date < p_to
  group by i.name, i.kind, i.unit order by 7 desc;
$$;

-- =====================================================================
-- RLS: chỉ người đã đăng nhập (nhân viên phòng khám) được truy cập
-- Tắt "Allow new users to sign up" trong Authentication > Providers > Email
-- và tự tạo tài khoản nhân viên trong Authentication > Users.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['patients','products','price_history','stock_movements','prescriptions',
    'prescription_items','payments','glasses_prescriptions','visit_images'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "staff_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
