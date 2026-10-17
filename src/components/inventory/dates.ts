const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const today = () => ymd(new Date());
export const monthStart = () => {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
};

/** [từ ngày, đến hết ngày] theo giờ máy → khoảng ISO nửa mở cho RPC */
export function dayRange(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  b.setDate(b.getDate() + 1);
  return { p_from: a.toISOString(), p_to: b.toISOString() };
}
