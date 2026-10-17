import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * SePay gọi vào đây khi có tiền vào tài khoản.
 * Cấu hình SePay: URL = https://<domain>/api/sepay/webhook, kiểu xác thực API Key,
 * giá trị = SEPAY_WEBHOOK_API_KEY. SePay gửi header "Authorization: Apikey <key>".
 * Nội dung chuyển khoản phải chứa mã đơn, ví dụ "DT123" (QR trong app đã điền sẵn).
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Apikey ${process.env.SEPAY_WEBHOOK_API_KEY}`) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  const b = await req.json();
  if (b.transferType !== "in") return NextResponse.json({ success: true, message: "ignored" });

  const text = `${b.code ?? ""} ${b.content ?? ""}`.toUpperCase();
  const m = text.match(/DT\d+/);
  if (!m) return NextResponse.json({ success: true, message: "no order code" });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: rx } = await sb.from("prescriptions").select("id, total, paid").eq("code", m[0]).maybeSingle();
  if (!rx) return NextResponse.json({ success: true, message: "order not found" });

  const owe = Number(rx.total) - Number(rx.paid);
  const amount = Math.min(Number(b.transferAmount), owe);
  if (amount <= 0) return NextResponse.json({ success: true, message: "already paid" });

  // sepay_id unique → SePay gọi lại cùng giao dịch sẽ không ghi trùng
  const { error } = await sb.from("payments").insert({
    prescription_id: rx.id,
    amount,
    method: "transfer",
    sepay_id: String(b.id),
    note: `SePay ${b.gateway ?? ""} ${b.referenceCode ?? ""}`.trim(),
  });
  if (error && !error.message.includes("duplicate")) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
