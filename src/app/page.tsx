"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Glasses, Patient, Prescription } from "@/lib/types";
import { fmtDate, norm, vnd } from "@/lib/util";
import PatientForm from "@/components/PatientForm";

type Detail = { rx: Prescription[]; glasses: Glasses[] };

function glassesLine(g: Glasses) {
  const eye = (s: number | null, c: number | null, a: number | null) =>
    [s != null ? `${s > 0 ? "+" : ""}${s}` : "—", c != null ? `${c}` : null, a != null ? `x${a}` : null].filter(Boolean).join(" ");
  return `P: ${eye(g.od_sph, g.od_cyl, g.od_axis)}  |  T: ${eye(g.os_sph, g.os_cyl, g.os_axis)}`;
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<{ patient: Patient | null } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("patients").select("*").order("created_at", { ascending: false }).limit(2000);
    setPatients((data as Patient[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // F2 hoặc "/" để nhảy vào ô tìm kiếm
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "F2" || (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    setDetail(null);
    (async () => {
      const [rx, gl] = await Promise.all([
        supabase.from("prescriptions").select("*, prescription_items(*)").eq("patient_id", selected).order("visit_date", { ascending: false }).limit(20),
        supabase.from("glasses_prescriptions").select("*").eq("patient_id", selected).order("visit_date", { ascending: false }).limit(20),
      ]);
      setDetail({ rx: (rx.data as Prescription[]) ?? [], glasses: (gl.data as Glasses[]) ?? [] });
    })();
  }, [selected]);

  const list = useMemo(() => {
    const k = norm(q.trim());
    if (!k) return patients.slice(0, 200);
    return patients.filter((p) => norm(p.full_name).includes(k) || (p.phone ?? "").includes(k) || p.code.toLowerCase().includes(k)).slice(0, 200);
  }, [patients, q]);

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input ref={searchRef} className="inp" placeholder="Tìm tên / SĐT / mã BN…  (F2)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn whitespace-nowrap" onClick={() => setForm({ patient: null })}>+ Thêm BN</button>
      </div>

      <div className="card divide-y">
        {loading && <p className="p-4 text-sm text-slate-500">Đang tải…</p>}
        {!loading && list.length === 0 && <p className="p-4 text-sm text-slate-500">Không có bệnh nhân.</p>}

        {list.map((p) => {
          const open = selected === p.id;
          return (
            <div key={p.id}>
              <button
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sky-50 ${open ? "bg-sky-50" : ""}`}
                onClick={() => setSelected(open ? null : p.id)}
              >
                <span className="w-20 shrink-0 font-mono text-xs text-slate-500">{p.code}</span>
                <span className="flex-1 font-medium">{p.full_name}</span>
                <span className="hidden w-16 text-sm text-slate-500 sm:block">{p.birth_year ?? ""}</span>
                <span className="text-sm text-slate-600">{p.phone}</span>
                <span className="text-slate-400">{open ? "▲" : "▼"}</span>
              </button>

              {open && (
                <div className="border-t bg-slate-50 px-3 py-3">
                  {/* Hàng nút hành động: chủ yếu cho điện thoại, desktop cũng dùng được */}
                  <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                    <Link className="btn" href={`/rx/${p.id}`}>💊 Kê đơn thuốc</Link>
                    <Link className="btn" href={`/glasses/${p.id}`}>👓 Kê đơn kính</Link>
                    {p.phone ? (
                      <>
                        <a className="btn-ghost" href={`tel:${p.phone}`}>📞 Gọi điện</a>
                        <a className="btn-ghost" href={`sms:${p.phone}`}>💬 Nhắn tin</a>
                      </>
                    ) : null}
                    <button className="btn-ghost" onClick={() => setForm({ patient: p })}>✏️ Sửa thông tin</button>
                  </div>

                  {(p.note || p.address) && (
                    <p className="mt-2 text-sm text-slate-600">
                      {p.address && <span>📍 {p.address}  </span>}
                      {p.note && <span className="text-rose-700">⚠ {p.note}</span>}
                    </p>
                  )}

                  {/* Chi tiết đơn: chỉ hiện trên desktop */}
                  <div className="mt-3 hidden gap-4 md:grid md:grid-cols-2">
                    <section>
                      <h3 className="mb-1 text-sm font-bold">Đơn thuốc gần đây</h3>
                      {!detail && <p className="text-sm text-slate-500">Đang tải…</p>}
                      {detail?.rx.length === 0 && <p className="text-sm text-slate-500">Chưa có đơn thuốc.</p>}
                      <div className="space-y-2">
                        {detail?.rx.map((r) => (
                          <div key={r.id} className="card p-2 text-sm">
                            <div className="flex justify-between">
                              <b>{fmtDate(r.visit_date)} · {r.code}</b>
                              <span>
                                {vnd(r.total)}
                                {r.total - r.paid > 0 && <span className="ml-2 font-semibold text-rose-600">nợ {vnd(r.total - r.paid)}</span>}
                              </span>
                            </div>
                            {r.diagnosis && <div className="text-slate-600">CĐ: {r.diagnosis}</div>}
                            <div className="text-slate-600">
                              {r.prescription_items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section>
                      <h3 className="mb-1 text-sm font-bold">Đơn kính gần đây</h3>
                      {!detail && <p className="text-sm text-slate-500">Đang tải…</p>}
                      {detail?.glasses.length === 0 && <p className="text-sm text-slate-500">Chưa có đơn kính.</p>}
                      <div className="space-y-2">
                        {detail?.glasses.map((g) => (
                          <div key={g.id} className="card p-2 text-sm">
                            <div className="flex justify-between">
                              <b>{fmtDate(g.visit_date)}</b>
                              <span>{g.price ? vnd(g.price) : ""}</span>
                            </div>
                            <div className="font-mono text-slate-700">{glassesLine(g)}</div>
                            {(g.lens_type || g.frame) && <div className="text-slate-600">{[g.lens_type, g.frame].filter(Boolean).join(" · ")}</div>}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {form && (
        <PatientForm
          patient={form.patient}
          onClose={() => setForm(null)}
          onSaved={(p) => {
            setForm(null);
            setPatients((prev) => [p, ...prev.filter((x) => x.id !== p.id)]);
            setSelected(p.id);
          }}
        />
      )}
    </div>
  );
}
