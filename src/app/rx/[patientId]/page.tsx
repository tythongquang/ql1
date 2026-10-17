"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Patient, Prescription, Product } from "@/lib/types";
import { fmtDate, fmtDateTime, isSaveCombo, norm, vnd } from "@/lib/util";
import VisitImages from "@/components/VisitImages";

type Line = { key: string; product: Product; qty: string; price: string; usage: string };
type Tab = "don" | "ghichu" | "anh";

let seq = 0;
const newKey = () => `l${++seq}`;

export default function RxPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = use(params);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<Prescription[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [diagnosis, setDiagnosis] = useState("");
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  const [search, setSearch] = useState("");
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>("don");
  const [qr, setQr] = useState<{ code: string; amount: number } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<string | null>(null);

  // ---------- load ----------
  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from("prescriptions")
      .select("*, prescription_items(*)")
      .eq("patient_id", patientId)
      .order("visit_date", { ascending: false })
      .limit(50);
    setHistory((data as Prescription[]) ?? []);
  }, [patientId]);

  useEffect(() => {
    (async () => {
      const [p, pr] = await Promise.all([
        supabase.from("patients").select("*").eq("id", patientId).single(),
        supabase.from("products_with_stock").select("*").eq("active", true).order("name"),
      ]);
      setPatient(p.data as Patient);
      setProducts((pr.data as Product[]) ?? []);
    })();
    loadHistory();
  }, [patientId, loadHistory]);

  // focus ô số lượng của dòng vừa thêm
  useEffect(() => {
    if (pendingFocus.current) {
      const el = document.querySelector<HTMLInputElement>(`[data-qty="${pendingFocus.current}"]`);
      el?.focus();
      el?.select();
      pendingFocus.current = null;
    }
  }, [lines]);

  // ---------- tìm thuốc ----------
  const results = useMemo(() => {
    const k = norm(search.trim());
    if (!k) return [];
    return products
      .filter((p) => norm(p.name).includes(k) || norm(p.code).includes(k))
      .sort((a, b) => {
        const as = norm(a.name).startsWith(k) || norm(a.code).startsWith(k) ? 0 : 1;
        const bs = norm(b.name).startsWith(k) || norm(b.code).startsWith(k) ? 0 : 1;
        return as - bs || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, "vi");
      })
      .slice(0, 8);
  }, [products, search]);

  useEffect(() => setHi(0), [search]);

  const favorites = useMemo(() => products.filter((p) => p.favorite), [products]);

  function addProduct(p: Product) {
    const exist = lines.find((l) => l.product.id === p.id);
    if (exist) {
      pendingFocus.current = exist.key;
      setLines([...lines]); // kích hoạt effect focus
    } else {
      const key = newKey();
      pendingFocus.current = key;
      setLines([...lines, { key, product: p, qty: String(p.default_qty), price: String(p.sell_price), usage: "" }]);
    }
    setSearch("");
  }

  const patch = (key: string, ch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...ch } : l)));
  const remove = (key: string) => {
    setLines((ls) => ls.filter((l) => l.key !== key));
    searchRef.current?.focus();
  };

  // ---------- tính tiền ----------
  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  const discNum = Math.min(Number(discount) || 0, subtotal);
  const total = Math.max(subtotal - discNum, 0);
  const paidNum = paidTouched ? Math.min(Number(paid) || 0, total) : total;
  const debt = total - paidNum;

  // ---------- lưu ----------
  async function save() {
    if (busy) return;
    if (lines.length === 0) return setMsg({ ok: false, text: "Đơn chưa có thuốc / thủ thuật" });
    if (lines.some((l) => !(Number(l.qty) > 0))) return setMsg({ ok: false, text: "Có dòng số lượng chưa hợp lệ" });
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("create_prescription", {
      p_patient: patientId,
      p_diagnosis: diagnosis.trim() || null,
      p_note: note.trim() || null,
      p_discount: discNum,
      p_paid: paidNum,
      p_items: lines.map((l) => ({
        product_id: l.product.id,
        qty: Number(l.qty),
        unit_price: Number(l.price) || 0,
        usage: l.usage.trim(),
      })),
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });

    const { data: rx } = await supabase.from("prescriptions").select("code").eq("id", data as string).single();
    setMsg({ ok: true, text: `Đã lưu đơn ${rx?.code ?? ""} — ${vnd(total)}${debt > 0 ? ` (ghi nợ ${vnd(debt)})` : ""}` });
    if (debt > 0 && rx) setQr({ code: rx.code, amount: debt });
    setLines([]); setDiagnosis(""); setNote(""); setDiscount(""); setPaid(""); setPaidTouched(false);
    loadHistory();
    // làm mới tồn kho
    const pr = await supabase.from("products_with_stock").select("*").eq("active", true).order("name");
    setProducts((pr.data as Product[]) ?? []);
    searchRef.current?.focus();
  }

  // ---------- phím tắt toàn trang ----------
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isSaveCombo(e)) { e.preventDefault(); save(); }
      else if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  function reuse(r: Prescription) {
    const add: Line[] = [];
    for (const it of r.prescription_items) {
      const p = products.find((x) => x.name === it.name);
      if (p) add.push({ key: newKey(), product: p, qty: String(it.qty), price: String(p.sell_price), usage: it.usage ?? "" });
    }
    const skipped = r.prescription_items.length - add.length;
    setLines((ls) => [...ls, ...add.filter((a) => !ls.some((l) => l.product.id === a.product.id))]);
    if (r.diagnosis && !diagnosis) setDiagnosis(r.diagnosis);
    if (skipped) setMsg({ ok: false, text: `${skipped} mục không còn trong danh mục (đã ngừng KD) nên không thêm` });
  }

  async function collectDebt(r: Prescription) {
    const owe = r.total - r.paid;
    const s = prompt(`Thu nợ đơn ${r.code} (còn ${vnd(owe)}). Nhập số tiền thu:`, String(owe));
    const amt = Number(s);
    if (!s || !(amt > 0)) return;
    const { error } = await supabase.from("payments").insert({ prescription_id: r.id, amount: Math.min(amt, owe), method: "cash", note: "Thu nợ" });
    if (error) alert(error.message);
    loadHistory();
  }

  const qrUrl = (code: string, amount: number) =>
    `https://qr.sepay.vn/img?acc=${process.env.NEXT_PUBLIC_SEPAY_ACCOUNT}&bank=${process.env.NEXT_PUBLIC_SEPAY_BANK}&amount=${amount}&des=${code}`;

  const totalDebtAll = history.reduce((s, r) => s + (r.total - r.paid), 0);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ================= CỘT TRÁI: KÊ ĐƠN ================= */}
      <div className="space-y-3">
        <div className="card flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
          <Link href="/" className="text-sm text-sky-700">← Danh sách</Link>
          <b className="text-base">{patient?.full_name ?? "…"}</b>
          <span className="text-sm text-slate-500">
            {patient?.code} {patient?.birth_year ? `· ${patient.birth_year}` : ""} {patient?.phone ? `· ${patient.phone}` : ""}
          </span>
          {patient?.note && <span className="text-sm font-medium text-rose-700">⚠ {patient.note}</span>}
          {totalDebtAll > 0 && <span className="ml-auto rounded bg-rose-100 px-2 py-0.5 text-sm font-semibold text-rose-700">Nợ cũ: {vnd(totalDebtAll)}</span>}
        </div>

        <div className="card p-3">
          {/* Ô chọn nhanh */}
          <div className="relative">
            <input
              ref={searchRef}
              autoFocus
              className="inp !py-2.5 text-base"
              placeholder="Gõ tên / mã thuốc hoặc thủ thuật, ↑↓ chọn, Enter thêm   (F2)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
                else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (results[hi]) addProduct(results[hi]); }
                else if (e.key === "Escape") setSearch("");
              }}
            />
            {results.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border bg-white shadow-lg">
                {results.map((p, i) => (
                  <button
                    key={p.id}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => addProduct(p)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === hi ? "bg-sky-100" : ""} ${p.kind === "thu_thuat" ? "text-violet-800" : ""}`}
                  >
                    <span className="font-mono text-xs text-slate-400">{p.code}</span>
                    <span className="flex-1 font-medium">{p.kind === "thu_thuat" && "🔧 "}{p.name}</span>
                    <span className="text-xs text-slate-500">{p.kind === "thuoc" ? `tồn ${p.stock}` : "thủ thuật"} · {p.unit}</span>
                    <span className="w-24 text-right">{vnd(p.sell_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {favorites.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {favorites.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${p.kind === "thu_thuat" ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-300 bg-white"}`}
                >
                  ⭐ {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Bảng dòng thuốc */}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className="th">Tên</th>
                  <th className="th w-14">ĐVT</th>
                  <th className="th w-20">SL</th>
                  <th className="th w-28">Đơn giá</th>
                  <th className="th w-28 text-right">Thành tiền</th>
                  <th className="th">Cách dùng</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-slate-400">Chưa có mục nào — gõ vào ô phía trên để thêm</td></tr>
                )}
                {lines.map((l) => {
                  const proc = l.product.kind === "thu_thuat";
                  const q = Number(l.qty) || 0;
                  const over = !proc && q > l.product.stock;
                  return (
                    <tr key={l.key} className={proc ? "border-l-4 border-violet-500 bg-violet-50" : "border-l-4 border-transparent"}>
                      <td className="px-2 py-1 font-medium">
                        {proc && <span className="mr-1 rounded bg-violet-600 px-1 text-[10px] font-semibold text-white">THỦ THUẬT</span>}
                        {l.product.name}
                        {over && <div className="text-[11px] font-normal text-amber-600">⚠ tồn chỉ còn {l.product.stock}</div>}
                      </td>
                      <td className="px-2 text-slate-500">{l.product.unit}</td>
                      <td className="px-1 py-1">
                        <input
                          data-qty={l.key}
                          className="inp !px-1.5 text-center font-semibold"
                          inputMode="decimal"
                          value={l.qty}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => patch(l.key, { qty: e.target.value.replace(",", ".") })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                              e.preventDefault();
                              document.querySelector<HTMLInputElement>(`[data-usage="${l.key}"]`)?.focus();
                            } else if (e.key === "Backspace" && l.qty === "") {
                              e.preventDefault();
                              remove(l.key);
                            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                              const i = lines.findIndex((x) => x.key === l.key) + (e.key === "ArrowUp" ? -1 : 1);
                              const t = lines[i];
                              if (t) document.querySelector<HTMLInputElement>(`[data-qty="${t.key}"]`)?.focus();
                              else if (i >= lines.length) searchRef.current?.focus();
                            }
                          }}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          className="inp !px-1.5 text-right"
                          inputMode="numeric"
                          value={l.price}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => patch(l.key, { price: e.target.value.replace(/\D/g, "") })}
                        />
                      </td>
                      <td className="px-2 text-right font-semibold">{vnd(q * (Number(l.price) || 0))}</td>
                      <td className="px-1 py-1">
                        <input
                          data-usage={l.key}
                          className="inp !px-1.5"
                          placeholder="VD: 1 giọt x 4 lần/ngày"
                          value={l.usage}
                          onChange={(e) => patch(l.key, { usage: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); searchRef.current?.focus(); }
                          }}
                        />
                      </td>
                      <td className="text-center">
                        <button tabIndex={-1} className="text-slate-400 hover:text-rose-600" onClick={() => remove(l.key)} title="Xóa dòng">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Chẩn đoán / ghi chú */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <label className="lbl">Chẩn đoán</label>
              <input className="inp" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
            </div>
            <div>
              <label className="lbl">Ghi chú lần khám</label>
              <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {/* Thanh toán */}
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
            <div className="w-28">
              <label className="lbl">Giảm giá</label>
              <input className="inp text-right" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="w-32">
              <label className="lbl">Khách trả</label>
              <input
                className="inp text-right"
                inputMode="numeric"
                value={paidTouched ? paid : String(total)}
                onFocus={(e) => e.target.select()}
                onChange={(e) => { setPaidTouched(true); setPaid(e.target.value.replace(/\D/g, "")); }}
              />
            </div>
            <div className="text-sm">
              <div className="text-slate-500">Tổng cộng</div>
              <div className="text-xl font-bold">{vnd(total)}</div>
            </div>
            {debt > 0 && (
              <div className="rounded bg-rose-100 px-2 py-1 text-sm font-semibold text-rose-700">Ghi nợ {vnd(debt)}</div>
            )}
            <button className="btn ml-auto !px-5 !py-2.5 text-base" disabled={busy} onClick={save}>
              {busy ? "Đang lưu…" : "Lưu đơn (Ctrl+Enter)"}
            </button>
          </div>
          {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>}
          <p className="mt-2 text-[11px] text-slate-400">
            Enter: sang ô kế (SL → cách dùng → ô tìm) · Ctrl+Enter: lưu · F2: tìm thuốc · ↑↓: chọn / đổi dòng · Backspace khi SL trống: xóa dòng · Esc: xóa ô tìm
          </p>
        </div>
      </div>

      {/* ================= CỘT PHẢI: LỊCH SỬ ================= */}
      <aside className="card h-fit p-3 lg:sticky lg:top-14 lg:max-h-[calc(100vh-4.5rem)] lg:overflow-auto">
        <div className="mb-2 flex gap-1">
          {([["don", "Đơn cũ"], ["ghichu", "Ghi chú"], ["anh", "Ảnh"]] as [Tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-md px-2 py-1 text-sm font-medium ${tab === k ? "bg-sky-600 text-white" : "bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "don" && (
          <div className="space-y-2">
            {history.length === 0 && <p className="text-sm text-slate-500">Chưa có đơn nào.</p>}
            {history.map((r) => {
              const owe = r.total - r.paid;
              return (
                <div key={r.id} className="rounded-md border p-2 text-sm">
                  <div className="flex justify-between">
                    <b>{fmtDate(r.visit_date)}</b>
                    <span className="font-mono text-xs text-slate-400">{r.code}</span>
                  </div>
                  {r.diagnosis && <div className="text-slate-600">CĐ: {r.diagnosis}</div>}
                  <ul className="mt-1 space-y-0.5">
                    {r.prescription_items.map((i) => (
                      <li key={i.id} className={i.kind === "thu_thuat" ? "text-violet-700" : ""}>
                        {i.kind === "thu_thuat" ? "🔧 " : "• "}{i.name} ×{i.qty} {i.unit}
                        {i.usage && <span className="text-slate-400"> — {i.usage}</span>}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-semibold">{vnd(r.total)}</span>
                    {owe > 0 && <span className="font-semibold text-rose-600">nợ {vnd(owe)}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => reuse(r)}>↻ Dùng lại đơn</button>
                    {owe > 0 && <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => collectDebt(r)}>Thu nợ</button>}
                    {owe > 0 && <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setQr({ code: r.code, amount: owe })}>QR</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "ghichu" && (
          <div className="space-y-2">
            {history.filter((r) => r.note || r.diagnosis).length === 0 && <p className="text-sm text-slate-500">Chưa có ghi chú.</p>}
            {history.filter((r) => r.note || r.diagnosis).map((r) => (
              <div key={r.id} className="rounded-md border p-2 text-sm">
                <div className="text-xs text-slate-400">{fmtDateTime(r.visit_date)}</div>
                {r.diagnosis && <div><b>CĐ:</b> {r.diagnosis}</div>}
                {r.note && <div className="whitespace-pre-wrap">{r.note}</div>}
              </div>
            ))}
          </div>
        )}

        {tab === "anh" && <VisitImages patientId={patientId} />}
      </aside>

      {qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setQr(null)}>
          <div className="card w-full max-w-xs p-4 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-sm">Quét mã để chuyển khoản <b>{vnd(qr.amount)}</b></p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl(qr.code, qr.amount)} alt="QR thanh toán" className="mx-auto w-64" />
            <p className="mt-2 text-xs text-slate-500">Nội dung CK: <b>{qr.code}</b> — hệ thống tự ghi nhận khi SePay báo có tiền.</p>
            <button className="btn-ghost mt-3 w-full" onClick={() => setQr(null)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
