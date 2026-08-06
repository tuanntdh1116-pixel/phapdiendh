-- Chạy toàn bộ đoạn này trong Supabase Dashboard → SQL Editor → New query → Run

create table if not exists app_storage (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

alter table app_storage enable row level security;

-- Cho phép ứng dụng (dùng anon key) đọc/ghi bảng này.
-- Lưu ý: đây là quyền mở cho toàn bộ người có link ứng dụng — phù hợp
-- với dữ liệu nội bộ không mật. Không dùng cách này cho dữ liệu cần
-- bảo mật nghiêm ngặt (xem lưu ý bảo mật trong README).
create policy "allow read" on app_storage
  for select using (true);

create policy "allow insert" on app_storage
  for insert with check (true);

create policy "allow update" on app_storage
  for update using (true);

-- Bật realtime để các trình duyệt tự đồng bộ khi có người khác sửa dữ liệu.
alter publication supabase_realtime add table app_storage;

-- ============================================================
-- Bucket lưu trữ tệp đính kèm (PDF, Word, Excel...) của văn bản.
-- Chạy tiếp đoạn dưới đây (cùng SQL Editor) để tạo bucket công khai
-- và cho phép ứng dụng tải lên/tải xuống tệp.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('van-ban-dinh-kem', 'van-ban-dinh-kem', true)
on conflict (id) do nothing;

create policy "allow read attachments" on storage.objects
  for select using (bucket_id = 'van-ban-dinh-kem');

create policy "allow upload attachments" on storage.objects
  for insert with check (bucket_id = 'van-ban-dinh-kem');
