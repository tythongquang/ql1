"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { deleteObject, signedUrl, uploadImage } from "@/lib/r2client";
import type { VisitImage } from "@/lib/types";
import { fmtDate } from "@/lib/util";

export default function VisitImages({ patientId }: { patientId: string }) {
  const [imgs, setImgs] = useState<VisitImage[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState<VisitImage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("visit_images").select("*").eq("patient_id", patientId).order("taken_at", { ascending: false });
    const list = (data as VisitImage[]) ?? [];
    setImgs(list);
    const entries = await Promise.all(list.map(async (i) => [i.id, await signedUrl(i.r2_key).catch(() => "")] as const));
    setUrls(Object.fromEntries(entries));
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr("");
    try {
      for (const f of Array.from(files)) {
        const key = await uploadImage(f, patientId);
        const { error } = await supabase.from("visit_images").insert({ patient_id: patientId, r2_key: key });
        if (error) throw error;
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi upload");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function remove(i: VisitImage) {
    if (!confirm("Xóa ảnh này?")) return;
    await supabase.from("visit_images").delete().eq("id", i.id);
    deleteObject(i.r2_key).catch(() => {});
    setZoom(null);
    load();
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      <button className="btn-ghost mb-2 w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "Đang tải lên…" : "📷 Chụp / thêm ảnh"}
      </button>
      {err && <p className="mb-2 text-xs text-rose-600">{err}</p>}
      {imgs.length === 0 && <p className="text-sm text-slate-500">Chưa có ảnh.</p>}
      <div className="grid grid-cols-3 gap-2">
        {imgs.map((i) => (
          <button key={i.id} className="relative aspect-square overflow-hidden rounded border bg-slate-100" onClick={() => setZoom(i)}>
            {urls[i.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[i.id]} alt="" className="h-full w-full object-cover" />
            ) : null}
            <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-white">{fmtDate(i.taken_at)}</span>
          </button>
        ))}
      </div>
      {zoom && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[zoom.id]} alt="" className="max-h-[85vh] max-w-full rounded" />
          <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm text-white">{fmtDate(zoom.taken_at)}</span>
            <button className="btn-danger !py-1" onClick={() => remove(zoom)}>Xóa ảnh</button>
            <button className="btn-ghost !py-1" onClick={() => setZoom(null)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
