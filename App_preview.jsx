import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

/* ============================================================
   BẢN XEM TRƯỚC (PREVIEW) — dùng để kiểm tra giao diện khi viết code.
   Thay cho ./cloudStore.js thật (Supabase), bản này lưu dữ liệu
   TẠM trong bộ nhớ trình duyệt của artifact (mất khi tải lại trang).
   Bản build/deploy thật (trong file zip) vẫn dùng cloudStore.js
   với Supabase/localStorage như bình thường — không đụng tới.
   ============================================================ */
const _memoryStore = {};
const localDB = {
  async get(key) {
    return key in _memoryStore ? { key, value: _memoryStore[key] } : null;
  },
  async set(key, value) {
    _memoryStore[key] = value;
    return { key, value };
  },
  subscribe(_key, _callback) {
    return () => {};
  },
};
const cloudReady = false;
async function uploadAttachment(_file) {
  return { error: "Bản xem trước không kết nối máy chủ thật." };
}

/* ============================================================
   HỆ THỐNG QUẢN LÝ VĂN BẢN NỘI BỘ
   Công ty Nhiệt điện Duyên Hải
   ============================================================ */

const DEFAULT_ADMIN_PIN = "adminDHI";
// Lưu ý triển khai: đây là PIN mặc định ban đầu, KHÔNG hiển thị trên giao diện.
// Quản trị viên nên đổi PIN ngay sau lần đăng nhập đầu tiên (mục "Đổi mã PIN" trong sidebar).

/* ------------------------------------------------------------
   Lưu trữ: đến từ ./cloudStore.js (localDB = alias của "store").
   - Nếu đã cấu hình VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY:
     dữ liệu lưu chung trên Supabase, đồng bộ realtime cho mọi
     đồng nghiệp cùng mở ứng dụng.
   - Nếu chưa cấu hình: tự động rơi về localStorage (chỉ máy này).
   ------------------------------------------------------------ */

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalizeVN(str) {
  return (str || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function nextVersion(v) {
  const parts = String(v || "1.0").split(".");
  const major = parseInt(parts[0], 10) || 1;
  const minor = (parseInt(parts[1], 10) || 0) + 1;
  return `${major}.${minor}`;
}

// Trả về URL để tải tệp đính kèm với đúng tên gốc.
// Với tệp trên Supabase (khác domain), thuộc tính HTML "download" có thể bị
// trình duyệt bỏ qua do khác nguồn gốc — nên dùng tham số ?download= mà
// Supabase Storage hỗ trợ để ép đúng tên tệp qua header Content-Disposition.
// Với tệp base64 (data:), giữ nguyên vì thuộc tính "download" đã hoạt động tốt.
function attachmentHref(attachment) {
  if (!attachment || !attachment.url) return "#";
  if (attachment.url.startsWith("data:")) return attachment.url;
  const sep = attachment.url.includes("?") ? "&" : "?";
  return `${attachment.url}${sep}download=${encodeURIComponent(attachment.name)}`;
}

const LOCAL_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024; // 2MB — giới hạn khi chưa cấu hình Supabase

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Xử lý tệp đính kèm: tải lên Supabase Storage nếu đã cấu hình,
// nếu không thì lưu tạm dạng base64 trong trình duyệt (giới hạn kích thước nhỏ).
async function processAttachment(file) {
  if (!file) return { attachment: null, error: null };
  if (cloudReady) {
    const result = await uploadAttachment(file);
    if (result.error) return { attachment: null, error: `Tải tệp lên thất bại: ${result.error}` };
    return { attachment: result, error: null };
  }
  if (file.size > LOCAL_ATTACHMENT_MAX_BYTES) {
    return { attachment: null, error: "Chế độ chưa kết nối dữ liệu dùng chung: tệp đính kèm giới hạn tối đa 2MB. Thiết lập Supabase (xem README) để tải tệp lớn hơn." };
  }
  const dataUrl = await readFileAsDataUrl(file);
  return { attachment: { name: file.name, url: dataUrl }, error: null };
}

const CATEGORIES = [
  { key: "van-hanh", label: "Quy trình vận hành", prefix: "QT.VH", color: "#2B6CB0" },
  { key: "an-toan", label: "Quy định an toàn", prefix: "QĐ.AT", color: "#D97A2B" },
  { key: "quan-ly", label: "Quy chế quản lý", prefix: "QC", color: "#6E5AA6" },
  { key: "ky-thuat", label: "Hướng dẫn kỹ thuật", prefix: "HD.KT", color: "#1F8A70" },
  { key: "bieu-mau", label: "Biểu mẫu", prefix: "BM", color: "#5C6773" },
];

const DEPARTMENTS = [
  "Phòng Vận hành",
  "Phòng Kỹ thuật",
  "Phòng An toàn - PCCC",
  "Phòng Kế hoạch - Vật tư",
  "Phòng Tổ chức - Nhân sự",
];

const STATUSES = [
  { key: "hieu-luc", label: "Hiệu lực", color: "#2F9E5E" },
  { key: "du-thao", label: "Dự thảo", color: "#2B6CB0" },
  { key: "sap-het", label: "Sắp hết hiệu lực", color: "#FFB020" },
  { key: "het-hieu-luc", label: "Hết hiệu lực / Thu hồi", color: "#C0392B" },
];

const LIFECYCLE = [
  { label: "Soạn thảo", note: "Đơn vị chủ trì biên soạn nội dung" },
  { label: "Trình duyệt", note: "Gửi lãnh đạo phòng / ban xem xét" },
  { label: "Phê duyệt", note: "Giám đốc / Phó Giám đốc ký duyệt" },
  { label: "Ban hành", note: "Văn thư cấp số, phát hành toàn Công ty" },
  { label: "Hiệu lực", note: "Áp dụng thực hiện tại các đơn vị" },
  { label: "Rà soát / Thu hồi", note: "Sửa đổi, gia hạn hoặc bãi bỏ" },
];

function statusOf(key) { return STATUSES.find(s => s.key === key) || STATUSES[0]; }
function categoryOf(value) {
  return CATEGORIES.find(c => c.key === value || c.label === value)
    || { key: value, label: value || "Chưa phân loại", color: "#8895A7" };
}

function seedDocuments() {
  return [
    {
      id: "d1", code: "QT.VH-2023-012", title: "Quy trình vận hành lò hơi Tổ máy số 1",
      category: "van-hanh", department: "Phòng Vận hành", status: "hieu-luc", version: "2.1",
      author: "Nguyễn Văn Hải", approver: "GĐ Trần Minh Tuấn",
      issueDate: "2023-04-10", effectiveDate: "2023-05-01",
      summary: "Quy định trình tự khởi động, vận hành ổn định và dừng lò hơi Tổ máy số 1, các thông số kiểm soát an toàn nhiệt - áp.",
      history: [
        { date: "2022-11-02", action: "Soạn thảo", by: "Nguyễn Văn Hải", note: "Dự thảo lần 1" },
        { date: "2023-03-20", action: "Phê duyệt", by: "GĐ Trần Minh Tuấn", note: "Phê duyệt phiên bản 2.0" },
        { date: "2023-04-10", action: "Ban hành", by: "Văn thư Công ty", note: "Cấp số hiệu chính thức" },
        { date: "2024-02-15", action: "Sửa đổi", by: "Nguyễn Văn Hải", note: "Cập nhật ngưỡng áp suất theo khuyến cáo nhà chế tạo, thành v2.1" },
      ],
    },
    {
      id: "d2", code: "QĐ.AT-2024-005", title: "Quy định công tác phòng cháy chữa cháy khu vực nhà máy",
      category: "an-toan", department: "Phòng An toàn - PCCC", status: "hieu-luc", version: "1.0",
      author: "Lê Thị Ngọc", approver: "PGĐ Phạm Quốc Bảo",
      issueDate: "2024-01-18", effectiveDate: "2024-02-01",
      summary: "Phân công trách nhiệm, chế độ kiểm tra định kỳ phương tiện PCCC và phương án chữa cháy tại chỗ cho các phân xưởng.",
      history: [
        { date: "2023-10-05", action: "Soạn thảo", by: "Lê Thị Ngọc", note: "Dự thảo theo yêu cầu Cảnh sát PCCC tỉnh" },
        { date: "2024-01-10", action: "Phê duyệt", by: "PGĐ Phạm Quốc Bảo", note: "Thông qua sau góp ý các phân xưởng" },
        { date: "2024-01-18", action: "Ban hành", by: "Văn thư Công ty", note: "" },
      ],
    },
    {
      id: "d3", code: "QC-2022-003", title: "Quy chế tuyển dụng và đào tạo nguồn nhân lực",
      category: "quan-ly", department: "Phòng Tổ chức - Nhân sự", status: "hieu-luc", version: "3.0",
      author: "Đỗ Thành Nam", approver: "GĐ Trần Minh Tuấn",
      issueDate: "2022-06-01", effectiveDate: "2022-07-01",
      summary: "Quy định điều kiện, quy trình tuyển dụng, bố trí đào tạo mới và đào tạo nâng bậc cho người lao động.",
      history: [
        { date: "2020-05-01", action: "Ban hành", by: "Văn thư Công ty", note: "Phiên bản đầu tiên v1.0" },
        { date: "2021-08-12", action: "Sửa đổi", by: "Đỗ Thành Nam", note: "Bổ sung quy trình đào tạo nâng bậc, thành v2.0" },
        { date: "2022-06-01", action: "Sửa đổi", by: "Đỗ Thành Nam", note: "Cập nhật theo Bộ luật Lao động sửa đổi, thành v3.0" },
      ],
    },
    {
      id: "d4", code: "HD.KT-2024-018", title: "Hướng dẫn bảo trì hệ thống tuabin hơi",
      category: "ky-thuat", department: "Phòng Kỹ thuật", status: "du-thao", version: "0.2",
      author: "Vũ Đình Khoa", approver: "— chưa phê duyệt —",
      issueDate: "—", effectiveDate: "—",
      summary: "Hướng dẫn kiểm tra rung động, bôi trơn ổ trục và lịch bảo trì định kỳ tuabin hơi theo khuyến cáo nhà sản xuất.",
      history: [
        { date: "2024-05-14", action: "Soạn thảo", by: "Vũ Đình Khoa", note: "Dự thảo lần 1" },
        { date: "2024-06-30", action: "Sửa đổi", by: "Vũ Đình Khoa", note: "Bổ sung phụ lục thông số rung động, thành v0.2" },
      ],
    },
    {
      id: "d5", code: "BM.KH-2021-007", title: "Biểu mẫu đề xuất kế hoạch bảo dưỡng định kỳ",
      category: "bieu-mau", department: "Phòng Kế hoạch - Vật tư", status: "het-hieu-luc", version: "1.2",
      author: "Trịnh Thu Hà", approver: "PGĐ Phạm Quốc Bảo",
      issueDate: "2021-03-09", effectiveDate: "2021-04-01",
      summary: "Mẫu biểu đề xuất kế hoạch bảo dưỡng định kỳ hàng năm, đã được thay thế bởi biểu mẫu số BM.KH-2024-014.",
      history: [
        { date: "2021-03-09", action: "Ban hành", by: "Văn thư Công ty", note: "" },
        { date: "2024-03-01", action: "Thu hồi", by: "Trịnh Thu Hà", note: "Thay thế bởi BM.KH-2024-014" },
      ],
    },
    {
      id: "d6", code: "QT.VH-2024-020", title: "Quy trình xử lý sự cố mất điện tự dùng",
      category: "van-hanh", department: "Phòng Vận hành", status: "hieu-luc", version: "1.0",
      author: "Nguyễn Văn Hải", approver: "GĐ Trần Minh Tuấn",
      issueDate: "2024-03-22", effectiveDate: "2024-04-01",
      summary: "Trình tự xử lý khi mất điện tự dùng toàn nhà máy, thứ tự khôi phục thiết bị và báo cáo sự cố.",
      history: [
        { date: "2024-01-15", action: "Soạn thảo", by: "Nguyễn Văn Hải", note: "" },
        { date: "2024-03-10", action: "Phê duyệt", by: "GĐ Trần Minh Tuấn", note: "" },
        { date: "2024-03-22", action: "Ban hành", by: "Văn thư Công ty", note: "" },
      ],
    },
    {
      id: "d7", code: "QĐ.AT-2023-011", title: "Quy định an toàn lao động khu vực bãi thải xỉ",
      category: "an-toan", department: "Phòng An toàn - PCCC", status: "sap-het", version: "2.0",
      author: "Lê Thị Ngọc", approver: "PGĐ Phạm Quốc Bảo",
      issueDate: "2023-02-01", effectiveDate: "2023-03-01",
      summary: "Quy định trang bị bảo hộ, biển báo và giám sát an toàn khi làm việc tại khu vực bãi thải xỉ, tro bay.",
      history: [
        { date: "2022-11-20", action: "Soạn thảo", by: "Lê Thị Ngọc", note: "" },
        { date: "2023-02-01", action: "Ban hành", by: "Văn thư Công ty", note: "" },
        { date: "2026-06-01", action: "Rà soát", by: "Lê Thị Ngọc", note: "Sắp hết hiệu lực 3 năm, đang rà soát gia hạn" },
      ],
    },
  ];
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

function StatusDot({ statusKey }) {
  const s = statusOf(statusKey);
  return <span className="status-dot" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />;
}

function CodeChip({ code, color }) {
  return <span className="code-chip" style={{ borderColor: color, color }}>{code}</span>;
}

export default function App() {
  const [documents, setDocuments] = useState(null);
  const [tab, setTab] = useState("tra-cuu");
  const [toast, setToast] = useState("");
  const [q, setQ] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fDept, setFDept] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [historyDocId, setHistoryDocId] = useState(null);
  const [role, setRole] = useState(null); // null | "admin" | "staff"
  const [events, setEvents] = useState([]);
  const [editingDoc, setEditingDoc] = useState(null); // văn bản đang sửa, null = đang tạo mới
  const toastTimer = useRef(null);
  const searchLogTimer = useRef(null);
  const loggedViewRef = useRef(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await localDB.get("documents");
        if (res && res.value) {
          setDocuments(JSON.parse(res.value));
        } else {
          const seed = seedDocuments();
          setDocuments(seed);
          await localDB.set("documents", JSON.stringify(seed));
        }
      } catch (e) {
        const seed = seedDocuments();
        setDocuments(seed);
        try { await localDB.set("documents", JSON.stringify(seed)); } catch (e2) {}
      }
      try {
        const res2 = await localDB.get("events");
        setEvents(res2 && res2.value ? JSON.parse(res2.value) : []);
      } catch (e) { setEvents([]); }
    })();
  }, []);

  // Đồng bộ thời gian thực: khi đồng nghiệp khác thêm/sửa/xóa văn bản
  // (qua Supabase), tự động cập nhật lại danh sách trên máy mình.
  useEffect(() => {
    const unsubscribe = localDB.subscribe("documents", (value) => {
      if (value) {
        try { setDocuments(JSON.parse(value)); } catch (e) {}
      }
    });
    return unsubscribe;
  }, []);

  // Ghi nhận lượt truy cập một lần khi vào hệ thống (sau khi đã chọn vai trò)
  useEffect(() => {
    if (role) logEvent("access");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function logEvent(type, extra) {
    const now = new Date();
    const entry = { type, month: now.toISOString().slice(0, 7), date: now.toISOString(), ...(extra || {}) };
    setEvents(prev => {
      const next = [...prev, entry].slice(-3000);
      localDB.set("events", JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  function handleSearchChange(val) {
    setQ(val);
    if (searchLogTimer.current) clearTimeout(searchLogTimer.current);
    if (val.trim().length >= 2) {
      searchLogTimer.current = setTimeout(() => logEvent("search", { query: val.trim() }), 900);
    }
  }

  function handleSelectDoc(id) {
    setSelectedId(id);
    if (id && !loggedViewRef.current.has(id)) {
      loggedViewRef.current.add(id);
      logEvent("view", { docId: id });
    }
  }

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  }

  async function persist(next) {
    setDocuments(next);
    try { await localDB.set("documents", JSON.stringify(next)); } catch (e) {}
  }

  async function handleDelete(id) {
    const doc = documents.find(d => d.id === id);
    await persist(documents.filter(d => d.id !== id));
    setSelectedId(null);
    if (historyDocId === id) setHistoryDocId(null);
    showToast(doc ? `Đã xóa văn bản ${doc.code}` : "Đã xóa văn bản.");
  }

  async function handleRevoke(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    const updated = {
      ...doc,
      status: "het-hieu-luc",
      history: [...doc.history, { date: new Date().toISOString().slice(0, 10), action: "Thu hồi", by: "Quản trị viên", note: "" }],
    };
    await persist(documents.map(d => (d.id === id ? updated : d)));
    setSelectedId(null);
    showToast(`Đã thu hồi văn bản ${doc.code}`);
  }

  const categoryOptions = useMemo(() => {
    const known = new Set(CATEGORIES.map(c => c.key));
    const extra = Array.from(new Set((documents || []).map(d => d.category).filter(k => k && !known.has(k))));
    return [...CATEGORIES, ...extra.map(k => ({ key: k, label: k }))];
  }, [documents]);

  const departmentOptions = useMemo(() => {
    const known = new Set(DEPARTMENTS);
    const extra = Array.from(new Set((documents || []).map(d => d.department).filter(v => v && !known.has(v))));
    return [...DEPARTMENTS, ...extra];
  }, [documents]);

  const filtered = useMemo(() => {
    if (!documents) return [];
    return documents.filter(d => {
      if (fCategory.trim()) {
        const hay = normalizeVN(d.category + " " + categoryOf(d.category).label);
        if (!hay.includes(normalizeVN(fCategory.trim()))) return false;
      }
      if (fDept.trim()) {
        if (!normalizeVN(d.department).includes(normalizeVN(fDept.trim()))) return false;
      }
      if (fStatus.trim()) {
        const hay = normalizeVN(d.status + " " + statusOf(d.status).label);
        if (!hay.includes(normalizeVN(fStatus.trim()))) return false;
      }
      if (q.trim()) {
        const hay = normalizeVN(d.code + " " + d.title + " " + d.summary);
        if (!hay.includes(normalizeVN(q.trim()))) return false;
      }
      return true;
    });
  }, [documents, fCategory, fDept, fStatus, q]);

  const counts = useMemo(() => {
    const c = {};
    CATEGORIES.forEach(cat => c[cat.key] = 0);
    (documents || []).forEach(d => { c[d.category] = (c[d.category] || 0) + 1; });
    return c;
  }, [documents]);

  const selectedDoc = documents?.find(d => d.id === selectedId) || null;
  const historyDoc = documents?.find(d => d.id === historyDocId) || (documents ? documents[0] : null);

  const monthlyStats = useMemo(() => {
    const byMonth = {};
    events.forEach(e => {
      if (!byMonth[e.month]) byMonth[e.month] = { month: e.month, "Lượt truy cập": 0, "Lượt tra cứu": 0, "Lượt xem văn bản": 0 };
      if (e.type === "access") byMonth[e.month]["Lượt truy cập"]++;
      if (e.type === "search") byMonth[e.month]["Lượt tra cứu"]++;
      if (e.type === "view") byMonth[e.month]["Lượt xem văn bản"]++;
    });
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [events]);

  const topDocs = useMemo(() => {
    const c = {};
    events.forEach(e => { if (e.type === "view" && e.docId) c[e.docId] = (c[e.docId] || 0) + 1; });
    return Object.entries(c)
      .map(([docId, count]) => ({ doc: (documents || []).find(d => d.id === docId), count }))
      .filter(x => x.doc)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [events, documents]);

  const navItems = [
    { key: "tra-cuu", label: "Tra cứu văn bản", show: true, onClick: () => setTab("tra-cuu") },
    { key: "dang-tai", label: "Đăng tải văn bản", show: role === "admin", onClick: () => { setEditingDoc(null); setTab("dang-tai"); } },
    { key: "luoc-do", label: "Lược đồ văn bản", show: true, onClick: () => setTab("luoc-do") },
    { key: "luoc-su", label: "Lược sử văn bản", show: true, onClick: () => { setTab("luoc-su"); if (!historyDocId && documents) setHistoryDocId(documents[0].id); } },
    { key: "thong-ke", label: "Thống kê truy cập", show: role === "admin", onClick: () => setTab("thong-ke") },
  ].filter(item => item.show);

  if (!role) {
    return <LoginGate onEnter={setRole} />;
  }

  return (
    <div className="app">
      <style>{CSS}</style>
      <Toast msg={toast} />

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">NĐ</div>
          <div>
            <div className="brand-title">DUYÊN HẢI</div>
            <div className="brand-sub">Hệ thống quản lý văn bản nội bộ</div>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item, i) => (
            <NavItem
              key={item.key}
              active={tab === item.key}
              onClick={item.onClick}
              label={item.label}
              idx={String(i + 1).padStart(2, "0")}
            />
          ))}
        </nav>

        <div className="legend">
          <div className="legend-title">Trạng thái hiệu lực</div>
          {STATUSES.map(s => (
            <div className="legend-row" key={s.key}>
              <span className="status-dot" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="role-box">
          <span className="role-label">{role === "admin" ? "Quản trị viên" : "Nhân viên (chỉ xem)"}</span>
          <span className={"sync-badge " + (cloudReady ? "sync-on" : "sync-off")}>
            {cloudReady ? "● Dữ liệu dùng chung — đồng bộ" : "○ Chỉ lưu trên máy này"}
          </span>
          {role === "admin" && <ChangePinBox showToast={showToast} />}
          <button className="role-logout" onClick={() => setRole(null)}>Đổi vai trò</button>
        </div>
      </aside>

      <main className="main">
        {!documents && <div className="loading">Đang tải dữ liệu văn bản…</div>}

        {documents && tab === "tra-cuu" && (
          <SearchView
            filtered={filtered}
            q={q} setQ={handleSearchChange}
            fCategory={fCategory} setFCategory={setFCategory}
            fDept={fDept} setFDept={setFDept}
            fStatus={fStatus} setFStatus={setFStatus}
            onSelect={handleSelectDoc}
            selectedDoc={selectedDoc}
            onCloseDetail={() => setSelectedId(null)}
            onGoHistory={(id) => { setHistoryDocId(id); setTab("luoc-su"); setSelectedId(null); }}
            onDelete={role === "admin" ? handleDelete : null}
            onEdit={role === "admin" ? (doc) => { setEditingDoc(doc); setTab("dang-tai"); setSelectedId(null); } : null}
            onRevoke={role === "admin" ? handleRevoke : null}
            categoryOptions={categoryOptions}
            departmentOptions={departmentOptions}
            total={documents.length}
          />
        )}

        {documents && tab === "dang-tai" && role === "admin" && (
          <UploadView
            documents={documents}
            initialDoc={editingDoc}
            onCancel={() => { setEditingDoc(null); setTab("tra-cuu"); }}
            onSubmit={async (doc, extraUpdates) => {
              let nextDocs = editingDoc
                ? documents.map(d => (d.id === doc.id ? doc : d))
                : [doc, ...documents];
              if (extraUpdates && extraUpdates.length) {
                nextDocs = nextDocs.map(d => {
                  const upd = extraUpdates.find(u => u.id === d.id);
                  return upd ? { ...d, ...upd.changes } : d;
                });
              }
              await persist(nextDocs);
              const replacedNote = extraUpdates && extraUpdates.length
                ? ` · Đã chuyển ${extraUpdates.length} văn bản cũ sang Hết hiệu lực`
                : "";
              showToast(
                editingDoc
                  ? `Đã cập nhật văn bản ${doc.code} (v${doc.version})${replacedNote}`
                  : `Đã đăng tải văn bản ${doc.code}${replacedNote}`
              );
              setEditingDoc(null);
              setTab("tra-cuu");
            }}
          />
        )}

        {documents && tab === "luoc-do" && (
          <SchemaView
            counts={counts}
            categoryOptions={categoryOptions}
            onPickCategory={(key) => { setFCategory(key); setTab("tra-cuu"); }}
          />
        )}

        {documents && tab === "luoc-su" && (
          <HistoryView
            documents={documents}
            historyDoc={historyDoc}
            onPick={(id) => setHistoryDocId(id)}
          />
        )}

        {documents && tab === "thong-ke" && role === "admin" && (
          <StatsView monthlyStats={monthlyStats} topDocs={topDocs} events={events} />
        )}
      </main>
    </div>
  );
}

function ChangePinBox({ showToast }) {
  const [open, setOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [err, setErr] = useState("");

  async function save() {
    if (newPin.trim().length < 4) { setErr("PIN cần tối thiểu 4 ký tự."); return; }
    if (newPin !== confirmPin) { setErr("Hai lần nhập PIN không khớp."); return; }
    const hash = await sha256Hex(newPin.trim());
    await localDB.set("admin_pin_hash", hash);
    setErr(""); setOpen(false); setNewPin(""); setConfirmPin("");
    showToast("Đã cập nhật mã PIN quản trị.");
  }

  if (!open) {
    return <button className="role-logout" onClick={() => setOpen(true)}>Đổi mã PIN</button>;
  }
  return (
    <div className="pin-change-box">
      <input className="input" type="password" placeholder="PIN mới (tối thiểu 4 ký tự)" value={newPin} onChange={e => setNewPin(e.target.value)} autoFocus />
      <input className="input" type="password" placeholder="Nhập lại PIN mới" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} />
      {err && <div className="form-error">{err}</div>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button className="role-logout" onClick={save}>Lưu PIN</button>
        <button className="role-logout" onClick={() => { setOpen(false); setErr(""); setNewPin(""); setConfirmPin(""); }}>Hủy</button>
      </div>
    </div>
  );
}

function LoginGate({ onEnter }) {
  const [mode, setMode] = useState(null); // null | "pin"
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  async function checkPin() {
    let validHash = await sha256Hex(DEFAULT_ADMIN_PIN);
    try {
      const res = await localDB.get("admin_pin_hash");
      if (res && res.value) validHash = res.value;
    } catch (e) {}
    const inputHash = await sha256Hex(pin);
    if (inputHash === validHash) {
      setError("");
      onEnter("admin");
    } else {
      setError("Mã PIN không đúng. Vui lòng thử lại.");
    }
  }

  return (
    <div className="login-screen">
      <style>{CSS}</style>
      <div className="login-card">
        <div className="brand-mark login-mark">NĐ</div>
        <h1>Hệ thống quản lý văn bản nội bộ</h1>
        <p className="view-sub">Công ty Nhiệt điện Duyên Hải</p>

        {mode !== "pin" && (
          <div className="login-choices">
            <button className="btn-primary" onClick={() => onEnter("staff")}>Nhân viên — chỉ tra cứu</button>
            <button className="btn-secondary" onClick={() => setMode("pin")}>Quản trị viên — đăng nhập</button>
          </div>
        )}

        {mode === "pin" && (
          <div className="login-choices">
            <input
              className="input"
              type="password"
              placeholder="Nhập mã PIN quản trị"
              value={pin}
              onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === "Enter" && checkPin()}
              autoFocus
            />
            {error && <div className="form-error">{error}</div>}
            <button className="btn-primary" onClick={checkPin}>Đăng nhập</button>
            <button className="btn-link" onClick={() => { setMode(null); setError(""); }}>← Quay lại</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsView({ monthlyStats, topDocs, events }) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const totalAccess = events.filter(e => e.type === "access").length;
  const totalSearch = events.filter(e => e.type === "search").length;
  const thisMonthAccess = events.filter(e => e.type === "access" && e.month === thisMonth).length;
  const thisMonthSearch = events.filter(e => e.type === "search" && e.month === thisMonth).length;

  return (
    <div className="view">
      <div className="view-head">
        <h1>Thống kê tra cứu &amp; truy cập</h1>
        <p className="view-sub">Số liệu sử dụng hệ thống theo từng tháng (chỉ quản trị viên xem được)</p>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-num mono">{totalAccess}</span>
          <span className="stat-label">Tổng lượt truy cập</span>
        </div>
        <div className="stat-card">
          <span className="stat-num mono">{totalSearch}</span>
          <span className="stat-label">Tổng lượt tra cứu</span>
        </div>
        <div className="stat-card">
          <span className="stat-num mono">{thisMonthAccess}</span>
          <span className="stat-label">Truy cập tháng này</span>
        </div>
        <div className="stat-card">
          <span className="stat-num mono">{thisMonthSearch}</span>
          <span className="stat-label">Tra cứu tháng này</span>
        </div>
      </div>

      <div className="chart-panel">
        <h2 className="sub-title">Biến động theo tháng</h2>
        {monthlyStats.length === 0 ? (
          <div className="empty">Chưa có dữ liệu sử dụng. Số liệu sẽ xuất hiện khi có người tra cứu văn bản.</div>
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D8DEE4" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Lượt truy cập" fill="#FFB020" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Lượt tra cứu" fill="#2B6CB0" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Lượt xem văn bản" fill="#1F8A70" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="chart-panel" style={{ marginTop: "1.5rem" }}>
        <h2 className="sub-title">Văn bản được xem nhiều nhất</h2>
        {topDocs.length === 0 ? (
          <div className="empty">Chưa có lượt xem văn bản nào được ghi nhận.</div>
        ) : (
          <div className="top-docs">
            {topDocs.map(({ doc, count }, i) => (
              <div className="top-doc-row" key={doc.id}>
                <span className="top-doc-rank mono">{String(i + 1).padStart(2, "0")}</span>
                <CodeChip code={doc.code} color={categoryOf(doc.category).color} />
                <span className="top-doc-title">{doc.title}</span>
                <span className="top-doc-count mono">{count} lượt xem</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NavItem({ active, onClick, label, idx }) {
  return (
    <button className={"nav-item" + (active ? " active" : "")} onClick={onClick}>
      <span className="nav-idx">{idx}</span>
      <span>{label}</span>
    </button>
  );
}

function SearchView({ filtered, q, setQ, fCategory, setFCategory, fDept, setFDept, fStatus, setFStatus, onSelect, selectedDoc, onCloseDetail, onGoHistory, onDelete, onEdit, onRevoke, categoryOptions, departmentOptions, total }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => { setConfirmingDelete(false); }, [selectedDoc?.id]);

  return (
    <div className="view">
      <div className="view-head">
        <h1>Tra cứu văn bản</h1>
        <p className="view-sub">{filtered.length} / {total} văn bản phù hợp</p>
      </div>

      <div className="filter-bar">
        <input
          className="input search-input"
          placeholder="Tìm theo mã số, tên văn bản hoặc nội dung…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <input
          className="input"
          list="filter-category-suggestions"
          value={fCategory}
          onChange={e => setFCategory(e.target.value)}
          placeholder="Tất cả loại văn bản (gõ để lọc)"
        />
        <datalist id="filter-category-suggestions">
          {categoryOptions.map(c => <option key={c.key} value={c.label} />)}
        </datalist>
        <input
          className="input"
          list="filter-department-suggestions"
          value={fDept}
          onChange={e => setFDept(e.target.value)}
          placeholder="Tất cả phòng ban (gõ để lọc)"
        />
        <datalist id="filter-department-suggestions">
          {departmentOptions.map(d => <option key={d} value={d} />)}
        </datalist>
        <input
          className="input"
          list="filter-status-suggestions"
          value={fStatus}
          onChange={e => setFStatus(e.target.value)}
          placeholder="Tất cả trạng thái (gõ để lọc)"
        />
        <datalist id="filter-status-suggestions">
          {STATUSES.map(s => <option key={s.key} value={s.label} />)}
        </datalist>
      </div>

      <div className="table">
        <div className="table-head">
          <span>Mã văn bản</span>
          <span>Tên văn bản</span>
          <span>Phòng ban</span>
          <span>Phiên bản</span>
          <span>Trạng thái</span>
        </div>
        {filtered.length === 0 && (
          <div className="empty">Không tìm thấy văn bản nào khớp với bộ lọc hiện tại.</div>
        )}
        {filtered.map(d => {
          const cat = categoryOf(d.category);
          const st = statusOf(d.status);
          return (
            <div className="table-row" key={d.id} onClick={() => onSelect(d.id)}>
              <span><CodeChip code={d.code} color={cat.color} /></span>
              <span className="doc-title">{d.title}</span>
              <span className="muted">{d.department}</span>
              <span className="mono muted">v{d.version}</span>
              <span className="status-cell"><StatusDot statusKey={d.status} /> {st.label}</span>
            </div>
          );
        })}
      </div>

      {selectedDoc && (
        <div className="modal-backdrop" onClick={onCloseDetail}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={onCloseDetail}>Đóng ✕</button>
            <div className="modal-head">
              <CodeChip code={selectedDoc.code} color={categoryOf(selectedDoc.category).color} />
              <span className="status-cell"><StatusDot statusKey={selectedDoc.status} /> {statusOf(selectedDoc.status).label}</span>
            </div>
            <h2>{selectedDoc.title}</h2>
            <div className="modal-grid">
              <div><span className="k">Loại văn bản</span><span className="v">{categoryOf(selectedDoc.category).label}</span></div>
              <div><span className="k">Phòng ban</span><span className="v">{selectedDoc.department}</span></div>
              <div><span className="k">Người soạn thảo</span><span className="v">{selectedDoc.author}</span></div>
              <div><span className="k">Người phê duyệt</span><span className="v">{selectedDoc.approver}</span></div>
              <div><span className="k">Ngày ban hành</span><span className="v mono">{selectedDoc.issueDate}</span></div>
              <div><span className="k">Ngày hiệu lực</span><span className="v mono">{selectedDoc.effectiveDate}</span></div>
              <div><span className="k">Phiên bản</span><span className="v mono">v{selectedDoc.version}</span></div>
              {selectedDoc.replaces && (
                <div><span className="k">Thay thế cho</span><span className="v mono">{selectedDoc.replaces}</span></div>
              )}
              {selectedDoc.replacedBy && (
                <div><span className="k">Đã được thay thế bởi</span><span className="v mono">{selectedDoc.replacedBy}</span></div>
              )}
            </div>
            <p className="summary">{selectedDoc.summary}</p>

            {selectedDoc.attachment && (
              <a className="attachment-link" href={attachmentHref(selectedDoc.attachment)} target="_blank" rel="noreferrer" download={selectedDoc.attachment.name}>
                📎 {selectedDoc.attachment.name} — Xem / Tải tệp đính kèm
              </a>
            )}

            <div className="modal-actions">
              <button className="btn-primary" onClick={() => onGoHistory(selectedDoc.id)}>Xem lược sử văn bản</button>
              {onEdit && (
                <button className="btn-secondary" onClick={() => onEdit(selectedDoc)}>Sửa văn bản</button>
              )}
              {onRevoke && selectedDoc.status !== "het-hieu-luc" && (
                <button className="btn-secondary" onClick={() => onRevoke(selectedDoc.id)}>Thu hồi văn bản</button>
              )}
              {onDelete && !confirmingDelete && (
                <button className="btn-danger" onClick={() => setConfirmingDelete(true)}>Xóa văn bản</button>
              )}
            </div>

            {onDelete && confirmingDelete && (
              <div className="confirm-delete">
                <span>Xác nhận xóa văn bản <strong>{selectedDoc.code}</strong> khỏi hệ thống? Hành động này không thể hoàn tác.</span>
                <div className="confirm-delete-actions">
                  <button className="btn-danger" onClick={() => onDelete(selectedDoc.id)}>Xác nhận xóa</button>
                  <button className="btn-link" onClick={() => setConfirmingDelete(false)}>Hủy</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function emptyFormState() {
  return {
    code: "", title: "", category: "", department: "",
    author: "", approver: "", issueDate: "", effectiveDate: "", status: "du-thao",
    summary: "", attachmentFile: null, removeAttachment: false, replaces: "",
  };
}

function formFromDoc(doc) {
  return {
    code: doc.code, title: doc.title, category: doc.category, department: doc.department,
    author: doc.author === "—" ? "" : doc.author,
    approver: doc.approver === "— chưa phê duyệt —" ? "" : doc.approver,
    issueDate: doc.issueDate === "—" ? "" : doc.issueDate,
    effectiveDate: doc.effectiveDate === "—" ? "" : doc.effectiveDate,
    status: doc.status, summary: doc.summary, attachmentFile: null, removeAttachment: false,
    replaces: doc.replaces || "",
  };
}

function UploadView({ documents, initialDoc, onSubmit, onCancel }) {
  const isEdit = !!initialDoc;
  const [form, setForm] = useState(isEdit ? formFromDoc(initialDoc) : emptyFormState());
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const categorySuggestions = useMemo(() => {
    const base = CATEGORIES.map(c => c.label);
    const extra = (documents || [])
      .map(d => d.category)
      .filter(v => v && !CATEGORIES.some(c => c.key === v || c.label === v));
    return Array.from(new Set([...base, ...extra]));
  }, [documents]);

  const departmentSuggestions = useMemo(() => {
    const extra = (documents || []).map(d => d.department).filter(Boolean);
    return Array.from(new Set([...DEPARTMENTS, ...extra]));
  }, [documents]);

  function update(field, val) { setForm(f => ({ ...f, [field]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.code.trim() || !form.title.trim()) {
      setError("Vui lòng nhập Mã văn bản và Tên văn bản.");
      return;
    }
    if (!form.category || !form.department) {
      setError("Vui lòng chọn Loại văn bản và Phòng ban soạn thảo.");
      return;
    }
    const dupCode = (documents || []).some(
      d => d.code.trim().toLowerCase() === form.code.trim().toLowerCase() && (!isEdit || d.id !== initialDoc.id)
    );
    if (dupCode) {
      setError("Mã văn bản này đã tồn tại trong hệ thống. Vui lòng dùng mã khác.");
      return;
    }
    setError("");

    // Xử lý tệp đính kèm (nếu có chọn tệp mới)
    let attachment = isEdit ? (initialDoc.attachment || null) : null;
    if (form.removeAttachment) attachment = null;
    if (form.attachmentFile) {
      setUploading(true);
      const result = await processAttachment(form.attachmentFile);
      setUploading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      attachment = result.attachment;
    }

    // Xử lý "Thay thế cho văn bản/quyết định số": nếu trùng đúng mã một
    // văn bản đang có trong hệ thống, tự động chuyển văn bản đó sang
    // "Hết hiệu lực" và ghi chú bị thay thế.
    const replacesText = form.replaces.trim();
    const extraUpdates = [];
    let matchedReplaced = null;
    if (replacesText) {
      matchedReplaced = (documents || []).find(
        d => d.code.trim().toLowerCase() === replacesText.toLowerCase() && (!isEdit || d.id !== initialDoc.id)
      );
      if (matchedReplaced && matchedReplaced.status !== "het-hieu-luc") {
        extraUpdates.push({
          id: matchedReplaced.id,
          changes: {
            status: "het-hieu-luc",
            replacedBy: form.code.trim(),
            history: [
              ...matchedReplaced.history,
              {
                date: new Date().toISOString().slice(0, 10),
                action: "Bị thay thế",
                by: form.author.trim() || "—",
                note: `Được thay thế bởi văn bản ${form.code.trim()}`,
              },
            ],
          },
        });
      }
    }

    if (isEdit) {
      const newVersion = nextVersion(initialDoc.version);
      const doc = {
        ...initialDoc,
        code: form.code.trim(),
        title: form.title.trim(),
        category: form.category,
        department: form.department,
        status: form.status,
        version: newVersion,
        author: form.author.trim() || initialDoc.author,
        approver: form.approver.trim() || initialDoc.approver,
        issueDate: form.issueDate || initialDoc.issueDate,
        effectiveDate: form.effectiveDate || initialDoc.effectiveDate,
        summary: form.summary.trim(),
        attachment,
        replaces: replacesText || null,
        history: [
          ...initialDoc.history,
          {
            date: new Date().toISOString().slice(0, 10),
            action: "Sửa đổi",
            by: form.author.trim() || initialDoc.author,
            note: `Cập nhật nội dung, thành v${newVersion}${attachment ? ` · Tệp đính kèm: ${attachment.name}` : ""}`,
          },
        ],
      };
      onSubmit(doc, extraUpdates);
    } else {
      const doc = {
        id: "d" + Date.now(),
        code: form.code.trim(),
        title: form.title.trim(),
        category: form.category,
        department: form.department,
        status: form.status,
        version: "1.0",
        author: form.author.trim() || "—",
        approver: form.approver.trim() || "— chưa phê duyệt —",
        issueDate: form.issueDate || "—",
        effectiveDate: form.effectiveDate || "—",
        summary: form.summary.trim(),
        attachment,
        replaces: replacesText || null,
        history: [
          { date: form.issueDate || new Date().toISOString().slice(0, 10), action: "Soạn thảo", by: form.author.trim() || "—", note: attachment ? `Tệp đính kèm: ${attachment.name}` : "" },
        ],
      };
      onSubmit(doc, extraUpdates);
      setForm(emptyFormState());
    }
  }

  return (
    <div className="view">
      <div className="view-head">
        <h1>{isEdit ? `Sửa văn bản — ${initialDoc.code}` : "Đăng tải văn bản"}</h1>
        <p className="view-sub">
          {isEdit
            ? `Cập nhật nội dung sẽ tự động tăng phiên bản lên v${nextVersion(initialDoc.version)} và ghi vào lược sử.`
            : "Nhập thông tin văn bản mới để đưa vào hệ thống theo dõi"}
        </p>
      </div>

      <form className="upload-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>Mã văn bản
            <input className="input" value={form.code} onChange={e => update("code", e.target.value)} placeholder="VD: QT.VH-2026-021" />
          </label>
          <label>Tên văn bản
            <input className="input" value={form.title} onChange={e => update("title", e.target.value)} placeholder="VD: Quy trình vận hành máy biến áp chính" />
          </label>
          <label>Loại văn bản
            <input
              className="input"
              list="category-suggestions"
              value={form.category}
              onChange={e => update("category", e.target.value)}
              placeholder="Nhập hoặc chọn gợi ý (VD: Quy trình vận hành)"
            />
            <datalist id="category-suggestions">
              {categorySuggestions.map(v => <option key={v} value={v} />)}
            </datalist>
          </label>
          <label>Phòng ban soạn thảo
            <input
              className="input"
              list="department-suggestions"
              value={form.department}
              onChange={e => update("department", e.target.value)}
              placeholder="Nhập hoặc chọn gợi ý (VD: Phòng Vận hành)"
            />
            <datalist id="department-suggestions">
              {departmentSuggestions.map(v => <option key={v} value={v} />)}
            </datalist>
          </label>
          <label>Người soạn thảo
            <input className="input" value={form.author} onChange={e => update("author", e.target.value)} placeholder="Họ tên" />
          </label>
          <label>Người phê duyệt
            <input className="input" value={form.approver} onChange={e => update("approver", e.target.value)} placeholder="Để trống nếu chưa duyệt" />
          </label>
          <label>Ngày ban hành
            <input className="input" type="date" value={form.issueDate === "—" ? "" : form.issueDate} onChange={e => update("issueDate", e.target.value)} />
          </label>
          <label>Ngày hiệu lực
            <input className="input" type="date" value={form.effectiveDate === "—" ? "" : form.effectiveDate} onChange={e => update("effectiveDate", e.target.value)} />
          </label>
          <label>Trạng thái
            <select className="input" value={form.status} onChange={e => update("status", e.target.value)}>
              {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label>Thay thế cho văn bản/quyết định số
            <input
              className="input"
              list="replaces-suggestions"
              value={form.replaces}
              onChange={e => update("replaces", e.target.value)}
              placeholder="VD: QĐ.QLKT-2022-014 (để trống nếu không thay thế văn bản nào)"
            />
            <datalist id="replaces-suggestions">
              {(documents || [])
                .filter(d => !isEdit || d.id !== initialDoc.id)
                .map(d => <option key={d.id} value={d.code}>{d.title}</option>)}
            </datalist>
            <span className="field-hint">Nếu đúng mã một văn bản đang có trong hệ thống, văn bản đó sẽ tự động chuyển sang "Hết hiệu lực" khi lưu.</span>
          </label>
          <label>Tệp đính kèm
            <input
              className="input"
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              onChange={e => update("attachmentFile", e.target.files[0] || null)}
            />
            {!cloudReady && (
              <span className="field-hint">Chưa kết nối dữ liệu dùng chung — tệp đính kèm giới hạn 2MB, chỉ lưu trên máy này.</span>
            )}
            {isEdit && initialDoc.attachment && !form.removeAttachment && !form.attachmentFile && (
              <span className="field-hint">
                Đang có tệp: <a href={attachmentHref(initialDoc.attachment)} target="_blank" rel="noreferrer" download={initialDoc.attachment.name}>{initialDoc.attachment.name}</a>
                {" · "}
                <button type="button" className="btn-link" onClick={() => update("removeAttachment", true)}>Gỡ tệp này</button>
              </span>
            )}
            {form.removeAttachment && !form.attachmentFile && (
              <span className="field-hint">Sẽ gỡ tệp đính kèm hiện tại khi lưu.</span>
            )}
          </label>
        </div>
        <label className="full">Tóm tắt nội dung
          <textarea className="input textarea" rows={4} value={form.summary} onChange={e => update("summary", e.target.value)} placeholder="Mô tả ngắn gọn phạm vi áp dụng và nội dung chính của văn bản…" />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn-primary" type="submit" disabled={uploading}>
            {uploading ? "Đang tải tệp lên…" : isEdit ? "Lưu thay đổi" : "Đăng tải văn bản"}
          </button>
          {isEdit && onCancel && (
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={uploading}>Hủy</button>
          )}
        </div>
      </form>
    </div>
  );
}

function SchemaView({ counts, categoryOptions, onPickCategory }) {
  return (
    <div className="view">
      <div className="view-head">
        <h1>Lược đồ văn bản</h1>
        <p className="view-sub">Sơ đồ phân loại và vòng đời văn bản nội bộ</p>
      </div>

      <div className="schema-panel">
        <div className="schema-root">VĂN BẢN NỘI BỘ<br />NĐ DUYÊN HẢI</div>
        <div className="schema-branches">
          {categoryOptions.map(c => (
            <button key={c.key} className="schema-node" style={{ "--node-color": c.color || "#8895A7" }} onClick={() => onPickCategory(c.key)}>
              <span className="schema-node-label">{c.label}</span>
              {c.prefix && <span className="schema-node-prefix mono">{c.prefix}</span>}
              <span className="schema-node-count">{counts[c.key] || 0} văn bản</span>
            </button>
          ))}
        </div>
      </div>

      <div className="view-head" style={{ marginTop: "2.5rem" }}>
        <h2 className="sub-title">Vòng đời văn bản</h2>
      </div>
      <div className="lifecycle">
        {LIFECYCLE.map((step, i) => (
          <div className="lifecycle-step" key={step.label}>
            <div className="lifecycle-num mono">{String(i + 1).padStart(2, "0")}</div>
            <div className="lifecycle-label">{step.label}</div>
            <div className="lifecycle-note">{step.note}</div>
            {i < LIFECYCLE.length - 1 && <div className="lifecycle-arrow">→</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryView({ documents, historyDoc, onPick }) {
  return (
    <div className="view">
      <div className="view-head">
        <h1>Lược sử văn bản</h1>
        <p className="view-sub">Theo dõi toàn bộ quá trình soạn thảo, phê duyệt, sửa đổi của một văn bản</p>
      </div>

      <div className="history-layout">
        <div className="history-picker">
          {documents.map(d => (
            <button
              key={d.id}
              className={"history-picker-item" + (historyDoc && historyDoc.id === d.id ? " active" : "")}
              onClick={() => onPick(d.id)}
            >
              <CodeChip code={d.code} color={categoryOf(d.category).color} />
              <span className="hp-title">{d.title}</span>
            </button>
          ))}
        </div>

        <div className="history-timeline">
          {historyDoc ? (
            <>
              <h2>{historyDoc.title}</h2>
              <p className="muted mono">{historyDoc.code} · phiên bản hiện hành v{historyDoc.version}</p>
              <div className="timeline">
                {[...historyDoc.history].reverse().map((h, i) => (
                  <div className="timeline-item" key={i}>
                    <div className="timeline-dot" />
                    <div className="timeline-content">
                      <div className="timeline-top">
                        <span className="timeline-action">{h.action}</span>
                        <span className="timeline-date mono">{h.date}</span>
                      </div>
                      <div className="timeline-by">{h.by}</div>
                      {h.note && <div className="timeline-note">{h.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">Chọn một văn bản để xem lược sử.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');

:root {
  --bg-app: #EEF1F4;
  --bg-panel: #FFFFFF;
  --bg-dark: #171B21;
  --bg-dark-2: #232932;
  --accent-amber: #FFB020;
  --accent-blue: #2B6CB0;
  --text-dark: #1A1F26;
  --text-light: #F5F3ED;
  --border: #D8DEE4;
  --steel: #5C6773;
}

* { box-sizing: border-box; }

html { font-size: 16px; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }

.app {
  display: flex;
  min-height: 100vh;
  background: var(--bg-app);
  color: var(--text-dark);
  font-family: 'Be Vietnam Pro', sans-serif;
  font-size: 0.95rem;
  line-height: 1.6;
}

.app, .app input, .app select, .app textarea, .app button {
  font-family: 'Be Vietnam Pro', sans-serif;
}

.app p, .app li, .app td, .app .summary, .app .modal-grid, .app .timeline-note {
  line-height: 1.65;
}

.mono { font-family: 'IBM Plex Mono', monospace; }

/* ---------- Sidebar ---------- */
.sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--bg-dark);
  color: var(--text-light);
  display: flex;
  flex-direction: column;
  padding: 1.5rem 1rem;
}
.brand { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 2rem; padding: 0 0.25rem; }
.brand-mark {
  width: 40px; height: 40px; border-radius: 4px;
  background: linear-gradient(135deg, var(--accent-amber), #C97A1E);
  display: flex; align-items: center; justify-content: center;
  font-family: 'Be Vietnam Pro', sans-serif;
  font-weight: 700; color: var(--bg-dark); font-size: 0.85rem; letter-spacing: 0.5px;
  flex-shrink: 0;
}
.brand-title { font-family: 'Be Vietnam Pro', sans-serif; font-weight: 700; letter-spacing: 1px; font-size: 0.95rem; }
.brand-sub { font-size: 0.74rem; color: #A2ACB8; margin-top: 2px; line-height: 1.4; }

.nav { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: auto; }
.nav-item {
  display: flex; align-items: center; gap: 0.6rem;
  background: transparent; border: none; color: #A9B2BE;
  text-align: left; padding: 0.65rem 0.6rem; border-radius: 4px;
  font-size: 0.85rem; font-family: 'Be Vietnam Pro', sans-serif; cursor: pointer;
  transition: background 0.15s, color 0.15s;
  border-left: 2px solid transparent;
}
.nav-item:hover { background: var(--bg-dark-2); color: var(--text-light); }
.nav-item.active { background: var(--bg-dark-2); color: var(--text-light); border-left: 2px solid var(--accent-amber); }
.nav-idx { font-family: 'IBM Plex Mono', monospace; font-size: 0.74rem; color: var(--accent-amber); width: 1.4rem; }

.legend { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #2C333D; }
.legend-title { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.6px; color: #5C6773; margin-bottom: 0.6rem; }
.legend-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: #A9B2BE; padding: 0.25rem 0; }

.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

/* ---------- Main ---------- */
.main { flex: 1; padding: 2rem 2.5rem; overflow-x: hidden; }
.loading { color: var(--steel); padding: 2rem; }

.view-head h1 {
  font-family: 'Be Vietnam Pro', sans-serif; font-weight: 700;
  font-size: 1.6rem; letter-spacing: 0.2px; margin: 0 0 0.2rem 0;
}
.sub-title { font-family: 'Be Vietnam Pro', sans-serif; font-size: 1.15rem; font-weight: 700; margin: 0; }
.view-sub { color: var(--steel); font-size: 0.85rem; margin: 0 0 1.5rem 0; }

/* ---------- Filter bar & table ---------- */
.filter-bar { display: flex; gap: 0.6rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.input {
  background: var(--bg-panel); border: 1px solid var(--border); border-radius: 4px;
  padding: 0.55rem 0.75rem; font-size: 0.85rem; color: var(--text-dark);
  font-family: 'Be Vietnam Pro', sans-serif;
}
.input:focus { outline: 2px solid var(--accent-blue); outline-offset: 1px; }
.search-input { flex: 1; min-width: 220px; }

.table { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.table-head, .table-row {
  display: grid; grid-template-columns: 1.1fr 2.2fr 1.3fr 0.6fr 1.2fr;
  gap: 1rem; align-items: center; padding: 0.75rem 1.1rem;
}
.table-head { background: #F5F7F9; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.6px; color: var(--steel); font-weight: 600; }
.table-row { border-top: 1px solid var(--border); cursor: pointer; font-size: 0.85rem; transition: background 0.12s; }
.table-row:hover { background: #F7F9FB; }
.doc-title { font-weight: 500; }
.muted { color: var(--steel); }
.status-cell { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; }
.empty { padding: 2rem; text-align: center; color: var(--steel); font-size: 0.85rem; }

.code-chip {
  font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem;
  border: 1px solid; border-radius: 3px; padding: 0.15rem 0.45rem;
  white-space: nowrap;
}

/* ---------- Modal ---------- */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(23, 27, 33, 0.55);
  display: flex; align-items: center; justify-content: center; z-index: 50; padding: 1rem;
}
.modal {
  background: var(--bg-panel); border-radius: 8px; padding: 1.75rem 2rem;
  max-width: 560px; width: 100%; max-height: 85vh; overflow-y: auto; position: relative;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
}
.modal-close {
  position: absolute; top: 1rem; right: 1rem; background: none; border: none;
  font-size: 0.75rem; color: var(--steel); cursor: pointer;
}
.modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.modal h2 { font-family: 'Be Vietnam Pro', sans-serif; font-size: 1.25rem; margin: 0 0 1rem 0; }
.modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1.25rem; margin-bottom: 1rem; }
.modal-grid .k { display: block; font-size: 0.74rem; text-transform: uppercase; color: var(--steel); letter-spacing: 0.4px; }
.modal-grid .v { display: block; font-size: 0.88rem; margin-top: 2px; }
.summary { font-size: 0.88rem; line-height: 1.6; color: #2E3540; background: #F5F7F9; padding: 0.9rem 1rem; border-radius: 6px; margin-bottom: 1.25rem; }

.btn-primary {
  background: var(--accent-amber); border: none; color: var(--text-dark);
  font-weight: 600; padding: 0.65rem 1.2rem; border-radius: 4px; cursor: pointer;
  font-size: 0.85rem; font-family: 'Be Vietnam Pro', sans-serif; transition: filter 0.15s;
}
.btn-primary:hover { filter: brightness(0.95); }

.modal-actions { display: flex; gap: 0.7rem; flex-wrap: wrap; align-items: center; }

.btn-danger {
  background: #C0392B; border: none; color: #fff;
  font-weight: 600; padding: 0.65rem 1.2rem; border-radius: 4px; cursor: pointer;
  font-size: 0.85rem; font-family: 'Be Vietnam Pro', sans-serif; transition: filter 0.15s;
}
.btn-danger:hover { filter: brightness(0.9); }

.confirm-delete {
  margin-top: 0.9rem; background: #FBEAEA; border: 1px solid #E3A9A0; border-radius: 6px;
  padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.7rem;
  font-size: 0.82rem; line-height: 1.5; color: #7A2A20;
}
.confirm-delete-actions { display: flex; gap: 0.9rem; align-items: center; }

/* ---------- Upload form ---------- */
.upload-form { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 1.75rem; max-width: 780px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem 1.25rem; margin-bottom: 1rem; }
.upload-form label { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.78rem; color: var(--steel); font-weight: 500; }
.upload-form label.full { display: flex; flex-direction: column; margin-bottom: 1rem; }
.textarea { resize: vertical; font-family: 'Be Vietnam Pro', sans-serif; }
.form-error { color: #C0392B; font-size: 0.82rem; margin-bottom: 0.75rem; }
.field-hint { display: block; font-size: 0.76rem; color: var(--ink-3, #7A8494); margin-top: 0.35rem; line-height: 1.5; }
.attachment-link {
  display: inline-flex; align-items: center; gap: 0.4rem; margin-top: 0.5rem;
  font-size: 0.85rem; color: var(--accent-blue, #2B6CB0); text-decoration: none; font-weight: 600;
}
.attachment-link:hover { text-decoration: underline; }

/* ---------- Schema view ---------- */
.schema-panel {
  background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px;
  padding: 2.5rem 2rem; position: relative;
  background-image:
    linear-gradient(rgba(43,108,176,0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(43,108,176,0.06) 1px, transparent 1px);
  background-size: 24px 24px;
}
.schema-root {
  font-family: 'Be Vietnam Pro', sans-serif; font-weight: 700; text-align: center;
  background: var(--bg-dark); color: var(--text-light); padding: 0.9rem 1.5rem;
  border-radius: 6px; max-width: 260px; margin: 0 auto 2rem auto; font-size: 0.9rem; line-height: 1.3;
}
.schema-branches { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; }
.schema-node {
  --node-color: #2B6CB0;
  background: var(--bg-panel); border: 1.5px solid var(--node-color); border-top: 4px solid var(--node-color);
  border-radius: 6px; padding: 0.9rem 1rem; min-width: 160px; cursor: pointer;
  display: flex; flex-direction: column; gap: 0.3rem; text-align: left;
  transition: transform 0.15s, box-shadow 0.15s;
}
.schema-node:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.08); }
.schema-node-label { font-weight: 600; font-size: 0.85rem; }
.schema-node-prefix { font-size: 0.72rem; color: var(--node-color); }
.schema-node-count { font-size: 0.72rem; color: var(--steel); }

.lifecycle { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: stretch; }
.lifecycle-step {
  background: var(--bg-panel); border: 1px dashed var(--accent-blue); border-radius: 6px;
  padding: 0.9rem 1rem; flex: 1; min-width: 130px; position: relative;
}
.lifecycle-num { color: var(--accent-blue); font-size: 0.72rem; margin-bottom: 0.3rem; }
.lifecycle-label { font-weight: 600; font-size: 0.85rem; margin-bottom: 0.25rem; }
.lifecycle-note { font-size: 0.72rem; color: var(--steel); line-height: 1.4; }
.lifecycle-arrow { position: absolute; right: -1.05rem; top: 50%; transform: translateY(-50%); color: var(--accent-blue); font-size: 1rem; z-index: 2; }
@media (max-width: 900px) { .lifecycle-arrow { display: none; } }

/* ---------- History view ---------- */
.history-layout { display: flex; gap: 1.5rem; align-items: flex-start; }
.history-picker { width: 280px; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.history-picker-item {
  display: flex; flex-direction: column; gap: 0.3rem; text-align: left;
  background: var(--bg-panel); border: 1px solid var(--border); border-radius: 6px;
  padding: 0.6rem 0.75rem; cursor: pointer; font-size: 0.8rem;
}
.history-picker-item.active { border-color: var(--accent-blue); box-shadow: 0 0 0 1px var(--accent-blue) inset; }
.hp-title { color: var(--text-dark); font-weight: 500; }

.history-timeline { flex: 1; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 1.75rem 2rem; min-width: 0; }
.history-timeline h2 { font-family: 'Be Vietnam Pro', sans-serif; margin: 0 0 0.2rem 0; font-size: 1.2rem; }

.timeline { margin-top: 1.5rem; border-left: 2px solid var(--border); padding-left: 1.25rem; display: flex; flex-direction: column; gap: 1.4rem; }
.timeline-item { position: relative; }
.timeline-dot { position: absolute; left: -1.5rem; top: 0.2rem; width: 10px; height: 10px; border-radius: 50%; background: var(--accent-amber); border: 2px solid var(--bg-panel); box-shadow: 0 0 0 2px var(--accent-amber); }
.timeline-top { display: flex; justify-content: space-between; align-items: baseline; }
.timeline-action { font-weight: 600; font-size: 0.9rem; }
.timeline-date { font-size: 0.75rem; color: var(--steel); }
.timeline-by { font-size: 0.8rem; color: var(--steel); margin-top: 2px; }
.timeline-note { font-size: 0.8rem; margin-top: 0.3rem; color: #2E3540; background: #F5F7F9; padding: 0.5rem 0.7rem; border-radius: 5px; }

/* ---------- Role box ---------- */
.role-box { margin-top: 1rem; padding-top: 0.9rem; border-top: 1px solid #2C333D; display: flex; flex-direction: column; gap: 0.4rem; }
.role-label { font-size: 0.75rem; color: var(--text-light); font-weight: 500; }
.role-logout { background: none; border: 1px solid #3A4249; color: #A9B2BE; font-size: 0.7rem; padding: 0.35rem 0.6rem; border-radius: 4px; cursor: pointer; align-self: flex-start; }
.role-logout:hover { border-color: var(--accent-amber); color: var(--accent-amber); }
.pin-change-box { display: flex; flex-direction: column; gap: 0.4rem; margin: 0.3rem 0; }
.pin-change-box .input { padding: 0.4rem 0.55rem; font-size: 0.78rem; }
.sync-badge { display: block; font-size: 0.72rem; margin: 0.25rem 0 0.4rem; }
.sync-on { color: #6FCF97; }
.sync-off { color: #B0B7C3; }

/* ---------- Login screen ---------- */
.login-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg-dark); font-family: 'Be Vietnam Pro', sans-serif; padding: 1.5rem; }
.login-card { background: var(--bg-panel); border-radius: 10px; padding: 2.5rem 2.25rem; width: 100%; max-width: 380px; text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,0.35); }
.login-mark { margin: 0 auto 1.25rem auto; width: 52px; height: 52px; font-size: 1rem; }
.login-card h1 { font-family: 'Be Vietnam Pro', sans-serif; font-size: 1.15rem; font-weight: 700; margin: 0 0 0.2rem 0; }
.login-choices { display: flex; flex-direction: column; gap: 0.7rem; margin-top: 1.5rem; }
.btn-secondary { background: var(--bg-panel); border: 1.5px solid var(--accent-blue); color: var(--accent-blue); font-weight: 600; padding: 0.65rem 1.2rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
.btn-secondary:hover { background: #EEF4FA; }
.btn-link { background: none; border: none; color: var(--steel); font-size: 0.78rem; cursor: pointer; text-decoration: underline; }
.pin-hint { font-size: 0.7rem; color: var(--steel); margin-top: 0.25rem; }

/* ---------- Stats view ---------- */
.stat-cards { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
.stat-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 1.1rem 1.4rem; flex: 1; min-width: 150px; border-top: 3px solid var(--accent-amber); }
.stat-num { display: block; font-size: 1.6rem; font-weight: 600; color: var(--text-dark); }
.stat-label { font-size: 0.75rem; color: var(--steel); }
.chart-panel { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem 1.75rem; }
.top-docs { display: flex; flex-direction: column; gap: 0.6rem; }
.top-doc-row { display: flex; align-items: center; gap: 0.8rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
.top-doc-row:last-child { border-bottom: none; }
.top-doc-rank { color: var(--accent-blue); width: 1.5rem; }
.top-doc-title { flex: 1; }
.top-doc-count { color: var(--steel); font-size: 0.75rem; }

/* ---------- Toast ---------- */
.toast {
  position: fixed; top: 1.25rem; right: 1.25rem; background: var(--bg-dark); color: var(--text-light);
  padding: 0.7rem 1.1rem; border-radius: 6px; font-size: 0.82rem; z-index: 100;
  border-left: 3px solid var(--accent-amber); box-shadow: 0 10px 30px rgba(0,0,0,0.25);
}

/* ---------- Responsive ---------- */
@media (max-width: 860px) {
  .app { flex-direction: column; }
  .sidebar { width: 100%; flex-direction: row; align-items: center; padding: 1rem; gap: 1rem; }
  .brand { margin-bottom: 0; }
  .nav { flex-direction: row; margin-bottom: 0; overflow-x: auto; }
  .legend { display: none; }
  .main { padding: 1.25rem; }
  .table-head { display: none; }
  .table-row { grid-template-columns: 1fr; gap: 0.3rem; }
  .form-grid { grid-template-columns: 1fr; }
  .history-layout { flex-direction: column; }
  .history-picker { width: 100%; flex-direction: row; overflow-x: auto; }
}

button:focus-visible, .schema-node:focus-visible, input:focus-visible, select:focus-visible {
  outline: 2px solid var(--accent-blue); outline-offset: 2px;
}
`;
