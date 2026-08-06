import { createClient } from "@supabase/supabase-js";

/* ============================================================
   LỚP LƯU TRỮ DÙNG CHUNG (Supabase) — cho phép đồng nghiệp
   cùng xem/sửa một bộ dữ liệu văn bản, đồng bộ theo thời gian
   thực (realtime) giữa nhiều trình duyệt/máy khác nhau.

   Nếu CHƯA cấu hình biến môi trường VITE_SUPABASE_URL /
   VITE_SUPABASE_ANON_KEY, hệ thống tự động rơi về localStorage
   (chỉ lưu trên máy đang mở, giống bản demo ban đầu) để ứng
   dụng luôn chạy được kể cả khi chưa thiết lập backend.
   ============================================================ */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = cloudReady ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const ATTACHMENT_BUCKET = "van-ban-dinh-kem";

// Tải tệp đính kèm thật (PDF, Word, Excel…) lên Supabase Storage.
// Trả về { name, url } nếu thành công, hoặc { error: "..." } nếu thất bại/chưa cấu hình Supabase.
export async function uploadAttachment(file) {
  if (!cloudReady) return { error: "Chưa cấu hình Supabase (thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)." };
  if (!file) return { error: "Không có tệp." };
  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, { upsert: false });
    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return { error: uploadError.message || "Tải tệp lên Supabase Storage thất bại." };
    }
    const { data } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
    return { name: file.name, url: data.publicUrl };
  } catch (e) {
    console.error("Supabase upload exception:", e);
    return { error: e && e.message ? e.message : "Có lỗi không xác định khi tải tệp lên." };
  }
}

const LS_PREFIX = "qlvb-duyenhai:";
const TABLE = "app_storage";

export const store = {
  async get(key) {
    if (cloudReady) {
      try {
        const { data, error } = await supabase.from(TABLE).select("value").eq("key", key).maybeSingle();
        if (error || !data) return null;
        return { key, value: data.value };
      } catch (e) {
        return null;
      }
    }
    try {
      const raw = window.localStorage.getItem(LS_PREFIX + key);
      return raw !== null ? { key, value: raw } : null;
    } catch (e) {
      return null;
    }
  },

  async set(key, value) {
    if (cloudReady) {
      try {
        const { error } = await supabase.from(TABLE).upsert({ key, value, updated_at: new Date().toISOString() });
        if (error) return null;
        return { key, value };
      } catch (e) {
        return null;
      }
    }
    try {
      window.localStorage.setItem(LS_PREFIX + key, value);
      return { key, value };
    } catch (e) {
      return null;
    }
  },

  // Lắng nghe thay đổi của một key trong bảng dùng chung, gọi callback(value)
  // mỗi khi có người khác (đồng nghiệp khác) cập nhật dữ liệu.
  // Trả về hàm huỷ đăng ký (unsubscribe).
  subscribe(key, callback) {
    if (!cloudReady) return () => {};
    const channel = supabase
      .channel(`app_storage_${key}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `key=eq.${key}` },
        (payload) => callback(payload.new ? payload.new.value : null)
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(channel); } catch (e) {}
    };
  },
};
