# Hệ thống quản lý văn bản nội bộ — Nhiệt điện Duyên Hải

## 0. Thiết lập dữ liệu DÙNG CHUNG cho nhiều đồng nghiệp (khuyến nghị làm trước)

Mặc định (chưa thiết lập gì) ứng dụng vẫn chạy được, nhưng mỗi người sẽ
thấy dữ liệu riêng trên máy mình. Để tất cả đồng nghiệp cùng xem — một
người đăng tải/sửa, người khác thấy ngay (đồng bộ realtime) — làm theo
các bước sau (khoảng 5 phút, miễn phí):

1. Tạo tài khoản tại https://supabase.com → **New project** (chọn vùng
   Singapore cho gần Việt Nam).
2. Vào **SQL Editor** → New query → dán toàn bộ nội dung file
   `supabase-setup.sql` (đi kèm trong gói này) → **Run**. Bước này tạo
   bảng lưu trữ dùng chung, bật đồng bộ realtime, và tạo bucket lưu
   **tệp đính kèm** (PDF/Word/Excel...) khi đăng tải văn bản.
3. Vào **Project Settings → API**, lấy 2 giá trị: **Project URL** và
   **anon public key**.
4. Sao chép file `.env.example` thành `.env`, điền 2 giá trị vừa lấy vào:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
5. Build lại (`npm run build`) rồi publish như bình thường (xem mục 2-3
   bên dưới). Nếu publish qua GitHub + Netlify, khai báo 2 biến này tại
   **Site settings → Environment variables** trên Netlify thay vì file
   `.env` (Netlify sẽ tự build lại với biến này).

Sau khi thiết lập xong, trong sidebar ứng dụng sẽ hiện dòng
**"● Dữ liệu dùng chung — đồng bộ"** (thay vì "○ Chỉ lưu trên máy này")
để xác nhận đã kết nối thành công.

> **Lưu ý bảo mật**: cách thiết lập trên cho phép bất kỳ ai có link ứng
> dụng đều đọc/ghi được dữ liệu (qua anon key), vì đây là giải pháp không
> có máy chủ xác thực riêng — phù hợp cho văn bản nội bộ không mật, phục
> vụ demo/xét sáng kiến. Nếu công ty muốn triển khai chính thức với dữ
> liệu cần bảo mật cao hơn, nên bổ sung Supabase Auth (đăng nhập bằng
> tài khoản công ty) và Row Level Security theo từng người dùng — đây là
> bước phát triển tiếp theo, ngoài phạm vi bản này.

## 1. Chạy thử trên máy (tuỳ chọn)
```
npm install
npm run dev
```
Mở địa chỉ hiển thị trong terminal (thường là http://localhost:5173).

## 2. Build bản triển khai
```
npm install
npm run build
```
Lệnh này tạo ra thư mục `dist/` — đây là toàn bộ trang web tĩnh sẵn sàng publish.

## 3. Đưa lên Netlify — có 2 cách

### Cách A — Nhanh nhất, không cần Git (kéo-thả)
1. Nếu đã làm mục 0 (Supabase), đảm bảo file `.env` đã điền đúng trước khi build.
2. Chạy `npm run build` để có thư mục `dist/`.
3. Vào https://app.netlify.com/drop
4. Kéo thả thư mục `dist/` vào trang đó.
5. Netlify cấp ngay một đường link dạng `https://ten-ngau-nhien.netlify.app` — gửi link này cho đồng nghiệp.
6. Muốn đổi tên miền phụ dễ nhớ hơn: vào **Site settings → Change site name**.

### Cách B — Qua GitHub (khuyến nghị nếu còn chỉnh sửa tiếp hoặc dùng Supabase)
1. Đẩy toàn bộ thư mục này lên một repo GitHub (có thể để private). **Không đẩy file `.env`** (đã có trong `.gitignore`).
2. Vào https://app.netlify.com → **Add new site → Import an existing project** → chọn repo.
3. Netlify tự nhận cấu hình từ file `netlify.toml` (build command: `npm run build`, publish: `dist`).
4. Nếu dùng Supabase: vào **Site settings → Environment variables**, thêm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` với giá trị đã lấy ở mục 0.
5. Từ lần sau, mỗi lần bạn push code mới lên GitHub, Netlify tự build và cập nhật link.

## 4. Lưu ý khác trước khi cho đồng nghiệp trải nghiệm

- **Đăng nhập quản trị viên**: mã PIN mặc định ban đầu là `adminDHI`.
  Hãy đăng nhập bằng vai trò **Quản trị viên** trước, sau đó vào mục
  **"Đổi mã PIN"** ở sidebar để đặt PIN riêng — không nên dùng PIN mặc
  định khi đã public link. Nếu đã thiết lập Supabase, PIN mới sẽ dùng
  chung cho tất cả admin (đồng bộ), không cần đổi lại trên từng máy.

- **PIN quản trị chỉ mang tính chất phân quyền giao diện**, không phải
  cơ chế bảo mật thật (không có máy chủ xác thực riêng cho việc này).
  Không nên dùng để bảo vệ văn bản mật.

- **Tệp đính kèm khi đăng tải/sửa văn bản**: nếu đã thiết lập Supabase
  (mục 0), tệp được tải lên thật (PDF, Word, Excel, ảnh...) và lưu ở
  bucket `van-ban-dinh-kem`, mọi đồng nghiệp mở link đều xem/tải được.
  Nếu **chưa** thiết lập Supabase, tệp chỉ lưu tạm trên trình duyệt
  (giới hạn 2MB/tệp) và không dùng chung được giữa các máy — nên hoàn
  thành bước 0 trước khi cho đồng nghiệp thử tính năng này.
