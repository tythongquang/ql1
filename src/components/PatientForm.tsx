"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Patient } from "@/lib/types";
import { enterNav, isSaveCombo } from "@/lib/util";

export default function PatientForm({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient | null;
  onClose: () => void;
  onSaved: (p: Patient) => void;
}) {
  const [f, setF] = useState({
    full_name: patient?.full_name ?? "",
    phone: patient?.phone ?? "",
    birth_year: patient?.birth_year?.toString() ?? "",
    gender: patient?.gender ?? "",
    address: patient?.address ?? "",
    note: patient?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!f.full_name.trim()) return setErr("Nhập họ tên");
    setBusy(true);
    const row = {
      full_name: f.full_name.trim(),
      phone: f.phone.trim() || null,
      birth_year: f.birth_year ? Number(f.birth_year) : null,
      gender: f.gender || null,
      address: f.address.trim() || null,
      note: f.note.trim() || null,
    };
    const q = patient
      ? supabase.from("patients").update(row).eq("id", patient.id)
      : supabase.from("patients").insert(row);
    const { data, error } = await q.select().single();
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved(data as Patient);
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4" onClick={onClose}>
      <div
        className="card max-h-[92vh] w-full max-w-lg overflow-auto p-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          enterNav(e);
          if (isSaveCombo(e)) save();
          if (e.key === "Escape") onClose();
        }}
      >
        <h2 className="mb-3 text-base font-bold">{patient ? "Sửa thông tin bệnh nhân" : "Thêm bệnh nhân"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="lbl">Họ tên *</label>
            <input data-nav autoFocus className="inp" value={f.full_name} onChange={set("full_name")} />
          </div>
          <div>
            <label className="lbl">Số điện thoại</label>
            <input data-nav className="inp" inputMode="tel" value={f.phone} onChange={set("phone")} />
          </div>
          <div>
            <label className="lbl">Năm sinh</label>
            <input data-nav className="inp" inputMode="numeric" value={f.birth_year} onChange={set("birth_year")} />
          </div>
          <div>
            <label className="lbl">Giới tính</label>
            <select data-nav className="inp" value={f.gender} onChange={set("gender")}>
              <option value="">—</option>
              <option value="nam">Nam</option>
              <option value="nu">Nữ</option>
              <option value="khac">Khác</option>
            </select>
          </div>
          <div>
            <label className="lbl">Địa chỉ</label>
            <input data-nav className="inp" value={f.address} onChange={set("address")} />
          </div>
          <div className="col-span-2">
            <label className="lbl">Ghi chú (dị ứng, tiền sử…)</label>
            <textarea className="inp" rows={2} value={f.note} onChange={set("note")} />
          </div>
        </div>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Hủy</button>
          <button className="btn" disabled={busy} onClick={save}>Lưu (Ctrl+Enter)</button>
        </div>
      </div>
    </div>
  );
}
