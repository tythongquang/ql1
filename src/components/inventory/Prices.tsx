"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";
import { fmtDateTime, vnd } from "@/lib/util";
import { dayRange, monthStart, today } from "./dates";

type Hist = { id: number; cost_price: number; sell_price: number; changed_at: string };
type Profit = { name: string; kind: string; unit: string; qty: number; revenue: number; cost: number; profit: number };

export default function Prices() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pid, setPid] = useState("");
  const [hist, setHist] = useState<Hist[]>([]);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<Profit[]>([]);
  const [discount, setDiscount] = useState(0);

  useEffect(() => {
    supabase.from("products_with_stock").select("*").order("name").then(({ data }) => setProducts((data as Product[]) ?? []));
  }, []);

  useEffect(() => {
    if (!pid) { setHist([]); return; }
    supabase.from("price_history").select("*").eq("product_id", pid).order("changed_at", { ascending: false }).limit(100)
      .then(({ data }) => setHist((data as Hist[]) ?? []));
  }, [pid]);

  useEffect(() => {
    const r = dayRange(from, to);
    supabase.rpc("profit_report", r).then(({ data }) => setRows((data as Profit[]) ?? []));
    supabase.from("prescriptions").select("discount").gte("visit_date", r.p_from).lt("visit_date", r.p_to)
      .then(({ data }) => setDiscount((data ?? []).reduce((s, x) => s + Number(x.discount), 0)));
  }, [from, to]);

  const rev = rows.reduce((s, r) => s + Number(r.revenue), 0);
  const cost = rows.reduce((s, r) => s + Number(r.cost), 0);
  const gross = rev - cost;
  const net = gross - discount;

  const delta = (cur: number, prev?: number) =>
    prev == null || cur === prev ? null : (
      <span className={cur > prev ? "text-rose-600" : "text-emerald-600"}> {cur > prev ? "▲" : "▼"} {vnd(Math.abs(cur - prev))}</span>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-3 lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <h3 className="mr-2 font-bold">Doanh thu – giá vốn – lãi</h3>
          <div><label className="lbl">Từ ngày</label><input type="date" className="inp" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="lbl">Đến ngày</label><input type="date" className="inp" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[["Doanh thu", rev], ["Giá vốn", cost], ["Lãi gộp", gross], ["Giảm giá", discount], ["Lãi sau giảm giá", net]].map(([l, v]) => (
            <div key={l as string} className="rounded-md border bg-slate-50 p-2">
              <div className="text-xs text-slate-500">{l}</div>
              <div className={`text-lg font-bold ${l === "Lãi sau giảm giá" ? (net >= 0 ? "text-emerald-700" : "text-rose-700") : ""}`}>{vnd(v as number)}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b bg-slate-50">
              <tr><th className="th">Mặt hàng</th><th className="th text-right">SL</th><th className="th text-right">Doanh thu</th><th className="th text-right">Giá vốn</th><th className="th text-right">Lãi</th><th className="th text-right">Biên LN</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.name + r.unit} className={r.kind === "thu_thuat" ? "bg-violet-50/60" : ""}>
                  <td className="px-2 py-1 font-medium">{r.kind === "thu_thuat" && "🔧 "}{r.name}</td>
                  <td className="px-2 text-right">{Number(r.qty)} {r.unit}</td>
                  <td className="px-2 text-right">{vnd(r.revenue)}</td>
                  <td className="px-2 text-right">{vnd(r.cost)}</td>
                  <td className="px-2 text-right font-semibold">{vnd(r.profit)}</td>
                  <td className="px-2 text-right text-slate-500">{Number(r.revenue) ? Math.round((Number(r.profit) / Number(r.revenue)) * 100) : 0}%</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">Chưa có dữ liệu bán trong kỳ.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Giá vốn được chụp theo giá nhập gần nhất tại thời điểm kê đơn, nên đổi giá nhập không làm sai lãi của các đơn cũ.</p>
      </div>

      <div className="card p-3 lg:col-span-2">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="font-bold">Lịch sử thay đổi giá</h3>
          <select className="inp max-w-sm" value={pid} onChange={(e) => setPid(e.target.value)}>
            <option value="">— chọn thuốc / thủ thuật —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (ngừng KD)"}</option>)}
          </select>
        </div>
        <table className="w-full max-w-2xl text-sm">
          <thead className="border-b bg-slate-50">
            <tr><th className="th">Thời gian</th><th className="th text-right">Giá nhập</th><th className="th text-right">Giá bán</th><th className="th text-right">Lãi / đơn vị</th></tr>
          </thead>
          <tbody className="divide-y">
            {hist.map((h, i) => (
              <tr key={h.id}>
                <td className="px-2 py-1 text-xs text-slate-500">{fmtDateTime(h.changed_at)}</td>
                <td className="px-2 text-right">{vnd(h.cost_price)}{delta(h.cost_price, hist[i + 1]?.cost_price)}</td>
                <td className="px-2 text-right">{vnd(h.sell_price)}{delta(h.sell_price, hist[i + 1]?.sell_price)}</td>
                <td className="px-2 text-right font-semibold">{vnd(h.sell_price - h.cost_price)}</td>
              </tr>
            ))}
            {pid && hist.length === 0 && <tr><td colSpan={4} className="p-3 text-center text-slate-400">Chưa có lịch sử.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
