import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const s3 = () =>
  new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });

export async function POST(req: Request) {
  // Chỉ nhân viên đã đăng nhập Supabase mới được cấp link
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: u } = await sb.auth.getUser(token);
  if (!u.user) return NextResponse.json({ error: "Phiên đăng nhập hết hạn" }, { status: 401 });

  const body = await req.json();
  const Bucket = process.env.R2_BUCKET!;

  try {
    if (body.action === "put") {
      const key = `patients/${String(body.patientId).replace(/[^a-zA-Z0-9-]/g, "")}/${Date.now()}-${randomUUID().slice(0, 8)}.jpg`;
      const url = await getSignedUrl(s3(), new PutObjectCommand({ Bucket, Key: key, ContentType: "image/jpeg" }), { expiresIn: 300 });
      return NextResponse.json({ key, url });
    }
    if (body.action === "get" && typeof body.key === "string" && body.key.startsWith("patients/")) {
      const url = await getSignedUrl(s3(), new GetObjectCommand({ Bucket, Key: body.key }), { expiresIn: 3600 });
      return NextResponse.json({ url });
    }
    if (body.action === "delete" && typeof body.key === "string" && body.key.startsWith("patients/")) {
      await s3().send(new DeleteObjectCommand({ Bucket, Key: body.key }));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Lỗi R2" }, { status: 500 });
  }
}
