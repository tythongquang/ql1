import { supabase } from "./supabase";

async function call(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/r2/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Lỗi kết nối R2");
  return json;
}

/** Thu nhỏ ảnh về tối đa 1600px, JPEG 0.82 để upload nhanh và tiết kiệm dung lượng R2 */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.82));
}

export async function uploadImage(file: File, patientId: string): Promise<string> {
  const blob = await shrink(file);
  const { key, url } = await call({ action: "put", patientId, contentType: "image/jpeg" });
  const put = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
  if (!put.ok) throw new Error("Upload thất bại");
  return key as string;
}

const cache = new Map<string, { url: string; exp: number }>();
export async function signedUrl(key: string): Promise<string> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { url } = await call({ action: "get", key });
  cache.set(key, { url, exp: Date.now() + 50 * 60 * 1000 });
  return url as string;
}

export async function deleteObject(key: string) {
  await call({ action: "delete", key });
}
