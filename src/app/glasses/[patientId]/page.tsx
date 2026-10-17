"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Glasses, Patient } from "@/lib/types";
import { enterNav, fmtDate, isSaveCombo, vnd } from "@/lib/util";

const EYE_FIELDS = ["sph", "cyl", "axis", "add", "va", "pd"] as const;
const EYE_LABEL: Record<(typeof EYE_FIELDS)[number], string> = {
  sph: "SPH (cầu)", cyl: "CYL (trụ)", axis: "AXIS (trục)", add: "ADD", va: "Thị lực", pd: "PD",
};

type Form = Record<string, string>;
const empty = (): Form => {
  const f: Form = { pd: "", lens_type: "", frame: "", note: "", price: "", deposit: "" };
  for (const e of ["od", "os"]) for (const k of EYE_FIELDS) f[`${e}_${k}`] = "";
  return f;
};

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export default function GlassesPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = use(params);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [history, setHistory] = useState<Glasses[]>([]);
  const [f, setF] = useState<Form>(empty());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from("glasses_prescriptions").select("*").eq("patient_id", patientId).order("visit_date", { ascending: false }).limit(50);
    setHistory((data as Glasses[]) ?? []);
  }, [patientId]);

  useEffect(() => {
    supabase.from("patients").select("*").eq("id", patientId).single().then(({ data }) => setPatient(data as Patient));
    loadHistory();
  }, [patientId, loadHistory]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (busy) return;
    const has = Object.entries(f).some(([k, v]) => !["note", "price", "deposit", "lens_type", "frame"].includes(k) && v.trim() !== "");
    if (!has) return setMsg({ ok: false, text: "Chưa nhập số đo" });
    setBusy(true);
    setMsg(null);
    const row: Record<string, unknown> = {
      patient_id: patientId,
      pd: num(f.pd),
      lens_type: f.lens_type.trim() || null,
      frame: f.frame.trim() || null,
      note: f.note.trim() || null,
      price: Number(f.price) || 0,
      deposit: Number(f.deposit) || 0,
    };
    for (const e of ["od", "os"]) {
      row[`${e}_sph`] = num(f[`${e}_sph`]);
      row[`${e}_cyl`] = num(f[`${e}_cyl`]);
      row[`${e}_axis`] = num(f[`${e}_axis`]);
      row[`${e}_add`] = num(f[`${e}_add`]);
      row[`${e}_va`] = f[`${e}_va`].trim() || null;
      row[`${e}_pd`] = num(f[`${e}_pd`]);
    }
    const { error } = await supabase.from("glasses_prescriptions").insert(row);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: "Đã lưu đơn kính" });
    setF(empty());
    loadHistory();
    document.querySelector<HTMLInputElement>('[data-nav="first"]')?.focus();
  }

  function copyFrom(g: Glasses) {
    const n = (v: number | null) => (v == null ? "" : String(v));
    const nf = empty();
    for (const e of ["od", "os"] as const) {
      nf[`${e}_sph`] = n(g[`${e}_sph`]);
      nf[`${e}_cyl`] = n(g[`${e}_cyl`]);
      nf[`${e}_axis`] = n(g[`${e}_axis`]);
      nf[`${e}_add`] = n(g[`${e}_add`]);
      nf[`${e}_va`] = g[`${e}_va`] ?? "";
      nf[`${e}_pd`] = n(g[`${e}_pd`]);
    }
    nf.pd = n(g.pd);
    nf.lens_type = g.lens_type ?? "";
    setF(nf);
  }

  const eyeRow = (eye: "od" | "os", title: string) => (
    <tr>
      <td className="whitespace-nowrap pr-2 text-sm font-bold">{title}</td>
      {EYE_FIELDS.map((k, i) => (
        <td key={k} className="p-1">
          <input
            data-nav={eye === "od" && i === 0 ? "first" : "1"}
            autoFocus={eye === "od" && i === 0}
            className="inp text-center font-mono"
            inputMode={k === "va" ? "text" : "decimal"}
            value={f[`${eye}_${k}`]}
            onFocus={(e) => e.target.select()}
            onChange={set(`${eye}_${k}`)}
          />
        </td>
      ))}
    </tr>
  );

  const eyeTxt = (s: number | null, c: number | null, a: number | null, ad: number | null) =>
    [s != null ? `${s > 0 ? "+" : ""}${s}` : "—", c != null ? `${c}` : null, a != null ? `x${a}` : null, ad != null ? `ADD ${ad}` : null].filter(Boolean).join(" ");

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <div className="card flex flex-wrap items-center gap-x-4 px-3 py-2">
          <Link href="/" className="text-sm text-sky-700">← Danh sách</Link>
          <b className="text-base">{patient?.full_name ?? "…"}</b>
          <span className="text-sm text-slate-500">{patient?.code} {patient?.birth_year ? `· ${patient.birth_year}` : ""} {patient?.phone ? `· ${patient.phone}` : ""}</span>
          <Link href={`/rx/${patientId}`} className="ml-auto text-sm text-sky-700">💊 Sang kê đơn thuốc</Link>
        </div>

        <div
          className="card p-3"
          onKeyDown={(e) => {
            enterNav(e);
            if (isSaveCombo(e)) { e.preventDefault(); save(); }
          }}
        >
          <h2 className="mb-2 font-bold">Đơn kính</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <th />
                  {EYE_FIELDS.map((k) => <th key={k} className="th text-center">{EYE_LABEL[k]}</th>)}
                </tr>
              </thead>
              <tbody>
                {eyeRow("od", "Mắt phải (OD)")}
                {eyeRow("os", "Mắt trái (OS)")}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="lbl">PD chung (mm)</label>
              <input data-nav="1" className="inp" inputMode="decimal" value={f.pd} onChange={set("pd")} onFocus={(e) => e.target.select()} />
            </div>
            <div className="sm:col-span-3">
              <label className="lbl">Loại tròng</label>
              <input data-nav="1" className="inp" placeholder="VD: Chống ánh sáng xanh 1.56" value={f.lens_type} onChange={set("lens_type")} />
            </div>
            <div className="sm:col-span-4">
              <label className="lbl">Gọng</label>
              <input data-nav="1" className="inp" value={f.frame} onChange={set("frame")} />
            </div>
            <div className="col-span-2">
              <label className="lbl">Thành tiền</label>
              <input data-nav="1" className="inp text-right" inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, "") })} onFocus={(e) => e.target.select()} />
            </div>
            <div className="col-span-2">
              <label className="lbl">Đặt cọc / đã trả</label>
              <input data-nav="1" className="inp text-right" inputMode="numeric" value={f.deposit} onChange={(e) => setF({ ...f, deposit: e.target.value.replace(/\D/g, "") })} onFocus={(e) => e.target.select()} />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <label className="lbl">Ghi chú</label>
              <textarea className="inp" rows={2} value={f.note} onChange={set("note")} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {Number(f.price) > Number(f.deposit) && (
              <span className="rounded bg-rose-100 px-2 py-1 text-sm font-semibold text-rose-700">Còn nợ {vnd(Number(f.price) - Number(f.deposit))}</span>
            )}
            <button className="btn ml-auto !px-5 !py-2.5 text-base" disabled={busy} onClick={save}>
              {busy ? "Đang lưu…" : "Lưu đơn kính (Ctrl+Enter)"}
            </button>
          </div>
          {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>}
          <p className="mt-2 text-[11px] text-slate-400">Enter: sang ô kế · Ctrl+Enter: lưu</p>
        </div>
      </div>

      <aside className="card h-fit p-3 lg:sticky lg:top-14 lg:max-h-[calc(100vh-4.5rem)] lg:overflow-auto">
        <h3 className="mb-2 font-bold">Đơn kính cũ</h3>
        {history.length === 0 && <p className="text-sm text-slate-500">Chưa có đơn kính.</p>}
        <div className="space-y-2">
          {history.map((g) => (
            <div key={g.id} className="rounded-md border p-2 text-sm">
              <div className="flex justify-between">
                <b>{fmtDate(g.visit_date)}</b>
                <span>{g.price ? vnd(g.price) : ""}</span>
              </div>
              <div className="mt-1 font-mono text-xs">
                <div>P: {eyeTxt(g.od_sph, g.od_cyl, g.od_axis, g.od_add)} {g.od_va && `· TL ${g.od_va}`}</div>
                <div>T: {eyeTxt(g.os_sph, g.os_cyl, g.os_axis, g.os_add)} {g.os_va && `· TL ${g.os_va}`}</div>
                {g.pd != null && <div>PD {g.pd}</div>}
              </div>
              {(g.lens_type || g.frame) && <div className="text-slate-600">{[g.lens_type, g.frame].filter(Boolean).join(" · ")}</div>}
              {g.note && <div className="text-slate-500">{g.note}</div>}
              {g.price > g.deposit && <div className="font-semibold text-rose-600">nợ {vnd(g.price - g.deposit)}</div>}
              <button className="btn-ghost mt-1.5 !px-2 !py-0.5 text-xs" onClick={() => copyFrom(g)}>↻ Dùng lại số đo</button>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
