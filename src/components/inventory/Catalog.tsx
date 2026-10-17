"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Row } from "exceljs";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";
import { enterNav, isSaveCombo, norm, vnd } from "@/lib/util";

const HEADERS = ["Mã", "Tên", "Loại", "ĐVT", "Giá nhập", "Giá bán", "SL mặc định", "Tồn tối thiểu", "Trạng thái", "Tồn đầu"];

function download(buf: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function buildWorkbook(rows: (string | number)[][], sheet: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(HEADERS);
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  ws.columns = [14, 36, 12, 8, 12, 12, 13, 14, 14, 10].map((width) => ({ width }));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

type Edit = {
  id?: string; code: string; name: string; kind: "thuoc" | "thu_thuat"; unit: string;
  cost_price: string; sell_price: string; default_qty: string; min_stock: string; favorite: boolean;
};
const blank: Edit = { code: "", name: "", kind: "thuoc", unit: "lọ", cost_price: "0", sell_price: "0", default_qty: "1", min_stock: "0", favorite: false };

export default function Catalog() {
  const [rows, setRows] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "thuoc" | "thu_thuat">("all");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("products_with_stock").select("*").order("name");
    setRows((data as Product[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => {
    const k = norm(q.trim());
    return rows.filter(
      (p) =>
        (kind === "all" || p.kind === kind) &&
        (status === "all" || (status === "active" ? p.active : !p.active)) &&
        (!k || norm(p.name).includes(k) || norm(p.code).includes(k))
    );
  }, [rows, q, kind, status]);

  async function saveEdit() {
    if (!edit) return;
    if (!edit.code.trim() || !edit.name.trim()) return setErr("Nhập mã và tên");
    const row = {
      code: edit.code.trim(),
      name: edit.name.trim(),
      kind: edit.kind,
      unit: edit.kind === "thu_thuat" ? "lần" : edit.unit.trim() || "cái",
      cost_price: Number(edit.cost_price) || 0,
      sell_price: Number(edit.sell_price) || 0,
      default_qty: Number(edit.default_qty) || 1,
      min_stock: Number(edit.min_stock) || 0,
      favorite: edit.favorite,
    };
    const { error } = edit.id ? await supabase.from("products").update(row).eq("id", edit.id) : await supabase.from("products").insert(row);
    if (error) return setErr(error.message.includes("duplicate") ? "Mã đã tồn tại" : error.message);
    setEdit(null);
    setErr("");
    load();
  }

  async function toggleActive(p: Product) {
    await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
    load();
  }
  async function toggleFav(p: Product) {
    await supabase.from("products").update({ favorite: !p.favorite }).eq("id", p.id);
    load();
  }

  async function exportXlsx() {
    const data = rows.map((p) => [p.code, p.name, p.kind === "thuoc" ? "Thuốc" : "Thủ thuật", p.unit, p.cost_price, p.sell_price, p.default_qty, p.min_stock, p.active ? "Đang KD" : "Ngừng KD", ""]);
    download(await buildWorkbook(data, "Danh mục"), `danh-muc-thuoc-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  async function template() {
    download(await buildWorkbook([["T001", "Natri clorid 0.9% 10ml", "Thuốc", "lọ", 3000, 5000, 1, 10, "Đang KD", 20], ["TT01", "Rửa lệ đạo", "Thủ thuật", "lần", 0, 50000, 1, 0, "Đang KD", ""]], "Mẫu"), "mau-nhap-danh-muc.xlsx");
  }

  async function importXlsx(file: File) {
    setInfo("Đang đọc file…");
    setErr("");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      const head: Record<string, number> = {};
      ws.getRow(1).eachCell((c, i) => (head[String(c.value ?? "").trim()] = i));
      if (!head["Mã"] || !head["Tên"]) throw new Error("File thiếu cột 'Mã' hoặc 'Tên' (dùng file mẫu)");
      const cell = (r: Row, h: string) => {
        const v = head[h] ? r.getCell(head[h]).value : null;
        return v == null ? "" : typeof v === "object" && "result" in v ? String(v.result ?? "") : String(v);
      };
      const existing = new Set(rows.map((r) => r.code));
      const upserts: Record<string, unknown>[] = [];
      const opening: { code: string; qty: number; cost: number }[] = [];
      const bad: string[] = [];
      ws.eachRow((r, i) => {
        if (i === 1) return;
        const code = cell(r, "Mã").trim();
        const name = cell(r, "Tên").trim();
        if (!code && !name) return;
        if (!code || !name) return bad.push(`Dòng ${i}: thiếu mã hoặc tên`);
        const kindVal = norm(cell(r, "Loại")).includes("thuat") ? "thu_thuat" : "thuoc"; // "Thủ thuật" → "thu thuat"
        const cost = Number(cell(r, "Giá nhập")) || 0;
        upserts.push({
          code, name, kind: kindVal,
          unit: kindVal === "thu_thuat" ? "lần" : cell(r, "ĐVT").trim() || "cái",
          cost_price: cost,
          sell_price: Number(cell(r, "Giá bán")) || 0,
          default_qty: Number(cell(r, "SL mặc định")) || 1,
          min_stock: Number(cell(r, "Tồn tối thiểu")) || 0,
          active: !norm(cell(r, "Trạng thái")).includes("ngung"),
        });
        const od = Number(cell(r, "Tồn đầu"));
        if (kindVal === "thuoc" && od > 0 && !existing.has(code)) opening.push({ code, qty: od, cost });
      });
      if (upserts.length === 0) throw new Error("Không có dòng hợp lệ");
      for (let i = 0; i < upserts.length; i += 200) {
        const { error } = await supabase.from("products").upsert(upserts.slice(i, i + 200), { onConflict: "code" });
        if (error) throw error;
      }
      if (opening.length) {
        const { data } = await supabase.from("products").select("id, code").in("code", opening.map((o) => o.code));
        const idOf = new Map((data ?? []).map((d) => [d.code as string, d.id as string]));
        const mv = opening.filter((o) => idOf.has(o.code)).map((o) => ({ product_id: idOf.get(o.code)!, type: "nhap", qty: o.qty, unit_cost: o.cost, note: "Tồn đầu (nhập từ Excel)" }));
        if (mv.length) await supabase.from("stock_movements").insert(mv);
      }
      setInfo(`Đã nhập ${upserts.length} dòng${opening.length ? `, ghi tồn đầu cho ${opening.length} thuốc mới` : ""}.${bad.length ? ` Bỏ qua: ${bad.join("; ")}` : ""}`);
      load();
    } catch (e) {
      setInfo("");
      setErr(e instanceof Error ? e.message : (e as { message?: string }).message ?? "Lỗi nhập file");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const f = (k: keyof Edit) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEdit((p) => (p ? { ...p, [k]: e.target.value } : p));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="inp max-w-xs" placeholder="Tìm tên / mã…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="inp w-auto" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="all">Thuốc + thủ thuật</option>
          <option value="thuoc">Chỉ thuốc</option>
          <option value="thu_thuat">Chỉ thủ thuật</option>
        </select>
        <select className="inp w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">Đang kinh doanh</option>
          <option value="inactive">Ngừng kinh doanh</option>
          <option value="all">Tất cả</option>
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && importXlsx(e.target.files[0])} />
          <button className="btn-ghost" onClick={template}>Tải file mẫu</button>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>⬆ Nhập Excel</button>
          <button className="btn-ghost" onClick={exportXlsx}>⬇ Xuất Excel</button>
          <button className="btn" onClick={() => { setErr(""); setEdit({ ...blank }); }}>+ Thêm mới</button>
        </div>
      </div>
      {info && <p className="text-sm text-emerald-700">{info}</p>}
      {err && !edit && <p className="text-sm text-rose-600">{err}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="th w-8" /><th className="th">Mã</th><th className="th">Tên</th><th className="th">Loại</th><th className="th">ĐVT</th>
              <th className="th text-right">Giá nhập</th><th className="th text-right">Giá bán</th><th className="th text-right">SL mặc định</th>
              <th className="th text-right">Tồn</th><th className="th" /><th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.map((p) => (
              <tr key={p.id} className={`${!p.active ? "bg-slate-50 text-slate-400" : ""} ${p.kind === "thu_thuat" ? "bg-violet-50/60" : ""}`}>
                <td className="px-2"><button onClick={() => toggleFav(p)} title="Hiện ở hàng chọn nhanh khi kê đơn">{p.favorite ? "⭐" : "☆"}</button></td>
                <td className="px-2 font-mono text-xs">{p.code}</td>
                <td className="px-2 font-medium">{p.name}</td>
                <td className="px-2">{p.kind === "thuoc" ? "Thuốc" : <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">THỦ THUẬT</span>}</td>
                <td className="px-2">{p.unit}</td>
                <td className="px-2 text-right">{vnd(p.cost_price)}</td>
                <td className="px-2 text-right">{vnd(p.sell_price)}</td>
                <td className="px-2 text-right">{p.default_qty}</td>
                <td className={`px-2 text-right font-semibold ${p.kind === "thuoc" && p.stock <= p.min_stock ? "text-rose-600" : ""}`}>{p.kind === "thuoc" ? p.stock : "—"}</td>
                <td className="px-2">
                  <button className={`rounded px-2 py-0.5 text-xs ${p.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`} onClick={() => toggleActive(p)}>
                    {p.active ? "Đang KD" : "Ngừng KD"}
                  </button>
                </td>
                <td className="px-2 py-1">
                  <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => {
                    setErr("");
                    setEdit({ id: p.id, code: p.code, name: p.name, kind: p.kind, unit: p.unit, cost_price: String(p.cost_price), sell_price: String(p.sell_price), default_qty: String(p.default_qty), min_stock: String(p.min_stock), favorite: p.favorite });
                  }}>Sửa</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-slate-400">Không có mục nào.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Cột "Tồn đầu" trong file Excel chỉ áp dụng cho thuốc mới (chưa có mã). Thủ thuật luôn có đơn vị "lần". Thuốc ngừng KD sẽ không hiện khi kê đơn nhưng vẫn giữ lịch sử.
      </p>

      {edit && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 md:items-center md:p-4" onClick={() => setEdit(null)}>
          <div
            className="card max-h-[92vh] w-full max-w-lg overflow-auto p-4"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { enterNav(e); if (isSaveCombo(e)) saveEdit(); if (e.key === "Escape") setEdit(null); }}
          >
            <h2 className="mb-3 font-bold">{edit.id ? "Sửa" : "Thêm"} thuốc / thủ thuật</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="lbl">Mã *</label><input data-nav autoFocus className="inp" value={edit.code} onChange={f("code")} /></div>
              <div>
                <label className="lbl">Loại</label>
                <select data-nav className="inp" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Edit["kind"], unit: e.target.value === "thu_thuat" ? "lần" : edit.unit === "lần" ? "lọ" : edit.unit })}>
                  <option value="thuoc">Thuốc</option>
                  <option value="thu_thuat">Thủ thuật (đơn vị: lần)</option>
                </select>
              </div>
              <div className="col-span-2"><label className="lbl">Tên *</label><input data-nav className="inp" value={edit.name} onChange={f("name")} /></div>
              <div><label className="lbl">Đơn vị tính</label><input data-nav className="inp" disabled={edit.kind === "thu_thuat"} value={edit.kind === "thu_thuat" ? "lần" : edit.unit} onChange={f("unit")} /></div>
              <div><label className="lbl">SL mặc định khi kê</label><input data-nav className="inp" inputMode="decimal" value={edit.default_qty} onChange={f("default_qty")} onFocus={(e) => e.target.select()} /></div>
              <div><label className="lbl">Giá nhập</label><input data-nav className="inp" inputMode="numeric" value={edit.cost_price} onChange={f("cost_price")} onFocus={(e) => e.target.select()} /></div>
              <div><label className="lbl">Giá bán</label><input data-nav className="inp" inputMode="numeric" value={edit.sell_price} onChange={f("sell_price")} onFocus={(e) => e.target.select()} /></div>
              {edit.kind === "thuoc" && <div><label className="lbl">Tồn tối thiểu (cảnh báo)</label><input data-nav className="inp" inputMode="decimal" value={edit.min_stock} onChange={f("min_stock")} onFocus={(e) => e.target.select()} /></div>}
              <label className="flex items-center gap-2 self-end text-sm">
                <input type="checkbox" checked={edit.favorite} onChange={(e) => setEdit({ ...edit, favorite: e.target.checked })} /> ⭐ Hiện ở hàng chọn nhanh
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">Đổi giá nhập / giá bán sẽ tự ghi vào lịch sử giá.</p>
            {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEdit(null)}>Hủy</button>
              <button className="btn" onClick={saveEdit}>Lưu (Ctrl+Enter)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
