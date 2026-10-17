# Phần mềm quản lý phòng khám mắt

Next.js 15 + Supabase (CSDL, đăng nhập) + Cloudflare R2 (ảnh) + SePay (thanh toán chuyển khoản) + Vercel (hosting).

## Cấu trúc

| Đường dẫn | Chức năng |
|---|---|
| `/` | Danh sách bệnh nhân chung. Desktop: bấm vào BN để xem đơn thuốc, đơn kính. Mobile: hiện nút Kê đơn thuốc / Kê đơn kính / Gọi / Nhắn tin / Sửa |
| `/rx/[id]` | **Module kê đơn thuốc** (tách biệt) |
| `/glasses/[id]` | **Module kê đơn kính** (tách biệt) |
| `/inventory` | Kho thuốc: Danh mục · Xuất nhập tồn · Giá & lãi |
| `/api/r2/presign` | Cấp link upload/xem ảnh R2 (yêu cầu đăng nhập) |
| `/api/sepay/webhook` | Nhận thông báo tiền vào từ SePay, tự ghi thanh toán |

## Cài đặt

1. **Supabase**: tạo project → SQL Editor → dán toàn bộ `supabase/migrations/001_schema.sql` → Run.
   Authentication → Providers → Email: **tắt "Allow new users to sign up"**, rồi tạo tài khoản nhân viên ở Authentication → Users.
2. **Cloudflare R2**: tạo bucket (để **private**), tạo API Token (Object Read & Write), thêm CORS cho bucket:
   ```json
   [{ "AllowedOrigins": ["https://ten-mien-cua-ban.vercel.app", "http://localhost:3000"],
      "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
   ```
3. **SePay**: Tích hợp Webhooks → URL `https://<domain>/api/sepay/webhook`, xác thực API Key (khớp `SEPAY_WEBHOOK_API_KEY`).
4. Copy `.env.example` → `.env.local`, điền các giá trị.
5. Chạy thử: `npm install && npm run dev`
6. **Vercel**: đẩy lên GitHub → Import vào Vercel → thêm toàn bộ biến môi trường ở Settings → Environment Variables.

## Phím tắt kê đơn thuốc

| Phím | Tác dụng |
|---|---|
| `F2` | Nhảy vào ô tìm thuốc |
| `↑` `↓` + `Enter` | Chọn và thêm thuốc từ gợi ý |
| `Enter` | SL → Cách dùng → quay lại ô tìm |
| `↑` `↓` (trong ô SL) | Đổi dòng |
| `Backspace` khi ô SL trống | Xóa dòng |
| `Ctrl+Enter` | Lưu đơn |
| `Esc` | Xóa ô tìm |

Các phím này không đụng phím tắt trình duyệt/HĐH (đã tránh Ctrl+S, Ctrl+P, Ctrl+D, Alt+D…).

## Quy tắc nghiệp vụ

- **Thủ thuật** nằm cùng danh mục với thuốc, `kind = thu_thuat`, đơn vị bắt buộc là **lần**, hiển thị màu tím. Số lượng mặc định (ví dụ 5 hoặc 10) đặt ở cột "SL mặc định" trong danh mục.
- Thủ thuật **không trừ kho**; thuốc trừ kho khi lưu đơn.
- **Ngừng kinh doanh**: nút trạng thái trong danh mục; thuốc ngừng KD không còn hiện khi kê đơn, lịch sử vẫn giữ.
- **Giá vốn** của từng dòng đơn được chụp tại thời điểm kê (giá nhập gần nhất). Mọi lần đổi giá nhập/bán đều ghi vào lịch sử giá.
- **Ghi nợ**: nợ = tổng đơn − tổng thanh toán. Thu nợ bằng nút "Thu nợ" (tiền mặt) hoặc chuyển khoản qua QR; SePay tự khớp theo mã đơn `DTxxx` trong nội dung chuyển khoản.
- **Excel**: cột `Mã, Tên, Loại (Thuốc/Thủ thuật), ĐVT, Giá nhập, Giá bán, SL mặc định, Tồn tối thiểu, Trạng thái (Đang KD/Ngừng KD), Tồn đầu`. Nhập theo `Mã` (có rồi thì cập nhật, chưa có thì thêm). "Tồn đầu" chỉ áp dụng cho thuốc mới.

## Chưa có (có thể làm tiếp)

- Sửa / hủy đơn thuốc đã lưu (hiện chỉ tạo mới; muốn hủy cần xóa trực tiếp và hoàn kho thủ công).
- In đơn thuốc / đơn kính (PDF).
- Phân quyền theo vai trò (hiện mọi tài khoản đăng nhập đều có toàn quyền).
- Tính giá vốn bình quân gia quyền hoặc FIFO (hiện dùng giá nhập gần nhất).
