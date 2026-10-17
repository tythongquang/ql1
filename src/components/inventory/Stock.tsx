"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";
import { enterNav, fmtDateTime, isSaveCombo, vnd } from "@/lib/util";
import { dayRange, monthStart, today } from "./dates";

type Report = { product_id: string; code: string; name: string; unit: string; opening: number; qty_in: number; qty_out: number; qty_adjust: number; closing: number };
type Move = { id: number; type: string; qty: number; unit_cost: number | null; supplier: string | null; note: string | null; created_at: string; products: { name: string; unit: string } | null };

const TYPE_LABEL: Record<string, string> = { nhap: "Nhập", xuat: "Xuất", dieu_chinh: "Điều chỉnh" };

export default function Stock() {
  const [drugs, setDrugs] = useState<Product[]>([]);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<Report[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [f, setF] = useState({ product: "", qty: "", cost: "", sell: "", supplier: "", note: "" });

  const loadAll = useCallback(async () => {
    const [p, r, m] = await Promise.all([
      supabase.from("products_with_stock").select("*").eq("kind", "thuoc").eq("active", true).order("name"),
      supabase.rpc("stock_report", dayRange(from, to)),
      supabase.from("stock_movements").select("*, products(name, unit)").order("created_at", { ascending: false }).limit(100),
    ]);
    setDrugs((p.data as Product[]) ?? []);
    setReport((r.data as Report[]) ?? []);
    setMoves((m.data as unknown as Move[]) ?? []);
  }, [from, to]);
  useEffect(() => { loadAll(); }, [loadAll]);

  function pick(id: string) {
    const p = drugs.find((d) => d.id === id);
    setF((s) => ({ ...s, product: id, cost: p ? String(p.cost_price) : "", sell: p ? String(p.sell_price) : "" }));
  }

  async function receive() {
    const qty = Number(f.qty);
    if (!f.product || !(qty > 0)) return setMsg({ ok: false, text: "Chọn thuốc và nhập số lượng > 0" });
    const { error } = await supabase.rpc("receive_stock", {
      p_product: f.product,
      p_qty: qty,
      p_unit_cost: Number(f.cost) || 0,
      p_supplier: f.supplier.trim() || null,
      p_note: f.note.trim() || null,
      p_new_sell_price: f.sell ? Number(f.sell) : null,
    });
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: "Đã nhập kho" });
    setF({ product: "", qty: "", cost: "", sell: "", supplier: f.supplier, note: "" });
    loadAll();
    document.querySelector<HTMLSelectElement>('[data-nav="first"]')?.focus();
  }

  async function stocktake(r: Report) {
    const s = prompt(`Kiểm kê "${r.name}": nhập tồn thực tế (hệ thống đang ghi ${r.closing} ${r.unit})`, String(r.closing));
    if (s == null || s.trim() === "" || isNaN(Number(s))) return;
    const { error } = await supabase.rpc("adjust_stock", { p_product: r.product_id, p_actual: Number(s), p_note: "Kiểm kê" });
    if (error) alert(error.message);
    loadAll();
  }

  return (
    <div className="space-y-4">
      {/* NHẬP KHO */}
      <div className="card p-3" onKeyDown={(e) => { enterNav(e); if (isSaveCombo(e)) receive(); }}>
        <h3 className="mb-2 font-bold">Nhập kho</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="lbl">Thuốc</label>
            <select data-nav="first" className="inp" value={f.product} onChange={(e) => pick(e.target.value)}>
              <option value="">— chọn thuốc —</option>
              {drugs.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.unit}) · tồn {d.stock}</option>)}
            </select>
          </div>
          <div><label className="lbl">Số lượng</label><input data-nav className="inp" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></div>
          <div><label className="lbl">Giá nhập / đơn vị</label><input data-nav className="inp" inputMode="numeric" value={f.cost} onFocus={(e) => e.target.select()} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/\D/g, "") })} /></div>
          <div><label className="lbl">Giá bán mới (tuỳ chọn)</label><input data-nav className="inp" inputMode="numeric" value={f.sell} onFocus={(e) => e.target.select()} onChange={(e) => setF({ ...f, sell: e.target.value.replace(/\D/g, "") })} /></div>
          <div><label className="lbl">Nhà cung cấp</label><input data-nav className="inp" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></div>
          <div className="lg:col-span-5"><label className="lbl">Ghi chú</label><input data-nav className="inp" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          <div className="flex items-end"><button className="btn w-full" onClick={receive}>Nhập kho</button></div>
        </div>
        {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>}
      </div>

      {/* BÁO CÁO XNT */}
      <div className="card p-3">
        <div className="mb-2 flex flex-wrap items-end gap-2">
          <h3 className="mr-2 font-bold">Xuất – nhập – tồn</h3>
          <div><label className="lbl">Từ ngày</label><input type="date" className="inp" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="lbl">Đến ngày</label><input type="date" className="inp" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b bg-slate-50">
              <tr><th className="th">Thuốc</th><th className="th">ĐVT</th><th className="th text-right">Tồn đầu</th><th className="th text-right">Nhập</th><th className="th text-right">Xuất</th><th className="th text-right">Điều chỉnh</th><th className="th text-right">Tồn cuối</th><th className="th" /></tr>
            </thead>
            <tbody className="divide-y">
              {report.map((r) => (
                <tr key={r.product_id}>
                  <td className="px-2 py-1 font-medium">{r.name}</td>
                  <td className="px-2">{r.unit}</td>
                  <td className="px-2 text-right">{r.opening}</td>
                  <td className="px-2 text-right text-emerald-700">{r.qty_in || ""}</td>
                  <td className="px-2 text-right text-rose-700">{r.qty_out || ""}</td>
                  <td className="px-2 text-right">{r.qty_adjust || ""}</td>
                  <td className="px-2 text-right font-bold">{r.closing}</td>
                  <td className="px-2"><button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => stocktake(r)}>Kiểm kê</button></td>
                </tr>
              ))}
              {report.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-slate-400">Chưa có thuốc.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* NHẬT KÝ */}
      <div className="card p-3">
        <h3 className="mb-2 font-bold">100 biến động kho gần nhất</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b bg-slate-50">
              <tr><th className="th">Thời gian</th><th className="th">Thuốc</th><th className="th">Loại</th><th className="th text-right">SL</th><th className="th text-right">Giá nhập</th><th className="th">NCC / ghi chú</th></tr>
            </thead>
            <tbody className="divide-y">
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-2 py-1 text-xs text-slate-500">{fmtDateTime(m.created_at)}</td>
                  <td className="px-2">{m.products?.name}</td>
                  <td className="px-2">{TYPE_LABEL[m.type]}</td>
                  <td className={`px-2 text-right font-semibold ${m.qty > 0 ? "text-emerald-700" : "text-rose-700"}`}>{m.qty > 0 ? "+" : ""}{m.qty}</td>
                  <td className="px-2 text-right">{m.unit_cost != null ? vnd(m.unit_cost) : ""}</td>
                  <td className="px-2 text-slate-500">{[m.supplier, m.note].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
