export type Patient = {
  id: string;
  code: string;
  full_name: string;
  phone: string | null;
  birth_year: number | null;
  gender: "nam" | "nu" | "khac" | null;
  address: string | null;
  note: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  code: string;
  name: string;
  kind: "thuoc" | "thu_thuat";
  unit: string;
  cost_price: number;
  sell_price: number;
  default_qty: number;
  min_stock: number;
  favorite: boolean;
  active: boolean;
  stock: number;
};

export type RxItem = {
  id: number;
  name: string;
  unit: string;
  kind: string;
  qty: number;
  unit_price: number;
  cost_price: number;
  usage: string | null;
};

export type Prescription = {
  id: string;
  code: string;
  patient_id: string;
  visit_date: string;
  diagnosis: string | null;
  note: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  prescription_items: RxItem[];
};

export type Glasses = {
  id: string;
  patient_id: string;
  visit_date: string;
  od_sph: number | null; od_cyl: number | null; od_axis: number | null; od_add: number | null; od_va: string | null; od_pd: number | null;
  os_sph: number | null; os_cyl: number | null; os_axis: number | null; os_add: number | null; os_va: string | null; os_pd: number | null;
  pd: number | null;
  lens_type: string | null;
  frame: string | null;
  note: string | null;
  price: number;
  deposit: number;
};

export type VisitImage = {
  id: string;
  patient_id: string;
  prescription_id: string | null;
  r2_key: string;
  caption: string | null;
  taken_at: string;
};
