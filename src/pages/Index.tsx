import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";

const AUTH_URL = "https://functions.poehali.dev/e7256c2b-25ee-4d8d-a177-79b9ba10f5b5";
const POSTS_URL = "https://functions.poehali.dev/a9e9bed7-8a44-4828-a993-216d5efd7b3d";
const SOCIAL_URL = "https://functions.poehali.dev/1373884d-4344-47b3-a502-a1dfcf1f2028";

function getToken() { return localStorage.getItem("nexus_token") || ""; }

const TIMEOUT_MS = 12000;

function fetchWithTimeout(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

async function apiPost(url: string, body: Record<string, unknown>) {
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": getToken() },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (typeof json === "string") { try { json = JSON.parse(json as string); } catch { /* ignore */ } }
    return { ok: res.ok, data: json };
  } catch {
    return { ok: false, data: { error: "Нет соединения с сервером" } };
  }
}

async function apiGet(url: string, params: Record<string, string> = {}) {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetchWithTimeout(qs ? `${url}?${qs}` : url, {
      headers: { "X-Auth-Token": getToken() },
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (typeof json === "string") { try { json = JSON.parse(json as string); } catch { /* ignore */ } }
    return { ok: res.ok, data: json };
  } catch {
    return { ok: false, data: { error: "Нет соединения с сервером" } };
  }
}

interface Comment {
  id: number;
  text: string;
  created_at: string;
  author: PostAuthor;
}

interface Notification {
  id: number;
  type: string;
  is_read: boolean;
  created_at: string;
  actor_name: string;
  actor_title: string;
  post_preview: string | null;
  label: string;
  icon: string;
  color: string;
}

interface SocialUser {
  id: number;
  full_name: string;
  job_title: string;
  initials: string;
  is_following: boolean;
  avatar_url?: string;
}

interface PostAuthor {
  id: number;
  full_name: string;
  job_title: string;
  initials: string;
  avatar_url?: string;
}

interface Post {
  id: number;
  text: string;
  tags: string[];
  likes_count: number;
  comments_count: number;
  views_count: number;
  share_count: number;
  created_at: string;
  author: PostAuthor;
  liked: boolean;
  is_mine: boolean;
  media_url?: string;
  media_type?: string;
}

interface UserStats {
  followers: number;
  following: number;
  posts: number;
  views: number;
  reach: number;
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return `${Math.floor(diff / 86400)} д назад`;
}

interface User {
  id: number;
  email: string;
  full_name: string;
  job_title: string;
  bio: string;
  avatar_url?: string;
  cover_url?: string;
  social_vk?: string;
  social_tg?: string;
  social_linkedin?: string;
  social_instagram?: string;
}

interface ChatMessage {
  id: number;
  sender_id: number;
  text: string;
  media_url: string;
  media_type: string;
  created_at: string;
  sender_name: string;
  sender_initials: string;
  sender_avatar: string;
  is_me: boolean;
}

interface Conversation {
  id: number;
  partner: { id: number; full_name: string; job_title: string; initials: string; avatar_url: string };
  last_message: string;
  last_at: string;
}

// Утилита: чтение файла как base64
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function apiAuth(action: string, data: Record<string, string>) {
  try {
    const res = await fetchWithTimeout(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data }),
    });
    const text = await res.text();
    let json: Record<string, unknown>;
    try { json = JSON.parse(text); } catch { json = {}; }
    if (typeof json === "string") {
      try { json = JSON.parse(json as string); } catch { json = {}; }
    }
    return { ok: res.ok, status: res.status, data: json };
  } catch {
    return { ok: false, status: 0, data: { error: "Нет соединения с сервером" } };
  }
}

function AuthScreen({ onAuth }: { onAuth: (user: User, token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "reset" | "reset_confirm">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const inp = "w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all";
  const inpStyle = { background: "hsl(221,35%,10%)", border: "1px solid hsl(221,25%,25%)", color: "hsl(214,30%,90%)" };
  const lbl = "block text-xs font-medium mb-1.5";
  const lblStyle = { color: "hsl(214,25%,65%)" };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    setLoading(true);

    if (mode === "reset") {
      const r = await apiAuth("reset_password_request", { email });
      setLoading(false);
      if (!r.ok) { setError(r.data?.error as string || "Ошибка"); return; }
      setSuccess(`Код отправлен. Ваш код: ${r.data?.code}`);
      setMode("reset_confirm");
      return;
    }

    if (mode === "reset_confirm") {
      const r = await apiAuth("reset_password_confirm", { email, code: resetCode, new_password: newPassword });
      setLoading(false);
      if (!r.ok) { setError(r.data?.error as string || "Неверный код"); return; }
      const token = r.data?.token; const user = r.data?.user;
      if (token && user) { localStorage.setItem("nexus_token", token as string); localStorage.setItem("nexus_user", JSON.stringify(user)); onAuth(user as User, token as string); }
      return;
    }

    const result = await apiAuth(mode, { email, password, full_name: fullName, job_title: jobTitle });
    setLoading(false);
    if (!result.ok) { setError(result.data?.error as string || "Произошла ошибка"); return; }
    const token = result.data?.token; const user = result.data?.user;
    if (token && user) {
      localStorage.setItem("nexus_token", token as string);
      localStorage.setItem("nexus_user", JSON.stringify(user));
      onAuth(user as User, token as string);
    }
  };

  const tabLabel: Record<string, string> = { login: "Вход", register: "Регистрация", reset: "Забыли пароль?", reset_confirm: "Новый пароль" };
  const btnLabel: Record<string, string> = { login: "Войти", register: "Создать аккаунт", reset: "Получить код", reset_confirm: "Сохранить пароль" };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "hsl(221,35%,12%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4" style={{ background: "hsl(213,80%,42%)" }}>
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <h1 className="text-white font-semibold tracking-widest text-xl">CLANSE</h1>
          <p className="text-sm mt-1" style={{ color: "hsl(214,25%,55%)" }}>Деловая профессиональная сеть</p>
        </div>

        <div className="rounded-xl p-6 md:p-8" style={{ background: "hsl(221,30%,16%)", border: "1px solid hsl(221,25%,22%)" }}>
          {mode !== "reset_confirm" && (
            <div className="flex rounded-lg mb-6 p-1" style={{ background: "hsl(221,35%,10%)" }}>
              {(["login", "register"] as const).map((m) => (
                <button key={m} onClick={() => { setMode(m); setError(""); setSuccess(""); }}
                  className="flex-1 py-2 rounded-md text-sm font-medium transition-all"
                  style={mode === m ? { background: "hsl(213,80%,40%)", color: "white" } : { color: "hsl(214,25%,55%)" }}>
                  {m === "login" ? "Вход" : "Регистрация"}
                </button>
              ))}
            </div>
          )}

          {(mode === "reset" || mode === "reset_confirm") && (
            <div className="flex items-center gap-2 mb-5">
              <button onClick={() => { setMode("login"); setError(""); setSuccess(""); }} style={{ color: "hsl(214,25%,55%)" }}>
                <Icon name="ArrowLeft" size={16} />
              </button>
              <h3 className="font-semibold text-sm text-white">{tabLabel[mode]}</h3>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <div><label className={lbl} style={lblStyle}>Имя и фамилия *</label>
                  <input className={inp} style={inpStyle} placeholder="Андрей Козлов" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
                <div><label className={lbl} style={lblStyle}>Должность</label>
                  <input className={inp} style={inpStyle} placeholder="Директор по развитию" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></div>
              </>
            )}

            {(mode === "login" || mode === "register" || mode === "reset" || mode === "reset_confirm") && (
              <div><label className={lbl} style={lblStyle}>Email *</label>
                <input type="email" className={inp} style={inpStyle} placeholder="email@company.ru" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={mode === "reset_confirm"} /></div>
            )}

            {(mode === "login" || mode === "register") && (
              <div>
                <label className={lbl} style={lblStyle}>Пароль *</label>
                <input type="password" className={inp} style={inpStyle} placeholder={mode === "register" ? "Минимум 6 символов" : "Введите пароль"} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            )}

            {mode === "reset_confirm" && (
              <>
                <div><label className={lbl} style={lblStyle}>Код из письма</label>
                  <input className={inp} style={inpStyle} placeholder="ABC123" value={resetCode} onChange={(e) => setResetCode(e.target.value.toUpperCase())} required maxLength={6} /></div>
                <div><label className={lbl} style={lblStyle}>Новый пароль *</label>
                  <input type="password" className={inp} style={inpStyle} placeholder="Минимум 6 символов" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
              </>
            )}

            {error && <div className="px-3.5 py-2.5 rounded-lg text-sm" style={{ background: "hsl(0,60%,18%)", color: "hsl(0,80%,75%)", border: "1px solid hsl(0,60%,28%)" }}>{error}</div>}
            {success && <div className="px-3.5 py-2.5 rounded-lg text-sm" style={{ background: "hsl(142,50%,18%)", color: "hsl(142,80%,70%)", border: "1px solid hsl(142,50%,28%)" }}>{success}</div>}

            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all mt-2"
              style={{ background: loading ? "hsl(213,60%,32%)" : "hsl(213,80%,40%)", color: "white", cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Подождите..." : btnLabel[mode]}
            </button>

            {mode === "login" && (
              <button type="button" className="w-full text-xs py-1 transition-opacity hover:opacity-80" style={{ color: "hsl(214,25%,50%)" }}
                onClick={() => { setMode("reset"); setError(""); setSuccess(""); }}>
                Забыли пароль?
              </button>
            )}
          </form>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "hsl(214,25%,40%)" }}>Nexus © 2026 · Деловая профессиональная сеть</p>
      </div>
    </div>
  );
}

type Section = "feed" | "friends" | "notifications" | "search" | "messages" | "profile" | "admin" | "groups";

const navItems: { id: Section; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: "feed", label: "Главная", icon: "LayoutDashboard" },
  { id: "friends", label: "Контакты", icon: "Users" },
  { id: "groups", label: "Группы", icon: "Globe" },
  { id: "notifications", label: "Уведомления", icon: "Bell" },
  { id: "search", label: "Поиск", icon: "Search" },
  { id: "messages", label: "Сообщения", icon: "MessageSquare" },
  { id: "profile", label: "Профиль", icon: "User" },
  { id: "admin", label: "Админ", icon: "Shield", adminOnly: true },
];

const contacts = [
  { name: "Игорь Петров", role: "Директор по продажам", avatar: "ИП", mutual: 12, online: true },
  { name: "Анна Белова", role: "Head of Marketing", avatar: "АБ", mutual: 8, online: false },
  { name: "Сергей Морозов", role: "Технический директор", avatar: "СМ", mutual: 15, online: true },
  { name: "Юлия Новикова", role: "Операционный директор", avatar: "ЮН", mutual: 6, online: false },
];

const recommended = [
  { name: "Павел Громов", role: "Инвестиционный аналитик", avatar: "ПГ", mutual: 4 },
  { name: "Ольга Смирнова", role: "PR-директор", avatar: "ОС", mutual: 9 },
  { name: "Антон Захаров", role: "Генеральный директор", avatar: "АЗ", mutual: 11 },
];

const notifications = [
  { id: 1, icon: "Heart", color: "hsl(0,72%,51%)", text: "Марина Соколова оценила ваш пост", sub: "«Итоги Q1 2026: рост на 34%»", time: "10 мин" },
  { id: 2, icon: "MessageCircle", color: "hsl(213,80%,40%)", text: "Дмитрий Волков прокомментировал", sub: "«Отличный анализ! Мы тоже столкнулись с...»", time: "25 мин" },
  { id: 3, icon: "UserPlus", color: "hsl(142,70%,40%)", text: "Новый подписчик: Елена Карпова", sub: "Финансовый директор, FinBridge Capital", time: "1 ч" },
  { id: 4, icon: "Heart", color: "hsl(0,72%,51%)", text: "32 человека оценили ваш пост", sub: "«Три принципа эффективных переговоров»", time: "3 ч" },
  { id: 5, icon: "Share2", color: "hsl(270,60%,55%)", text: "Игорь Петров поделился вашей публикацией", sub: "", time: "5 ч" },
  { id: 6, icon: "Users", color: "hsl(40,90%,50%)", text: "Вас добавили в группу «CFO Russia 2026»", sub: "127 участников", time: "1 д" },
  { id: 7, icon: "BarChart2", color: "hsl(213,80%,40%)", text: "Ваш пост набрал 1000 просмотров", sub: "«Итоги Q1 2026»", time: "2 д" },
];

const conversations = [
  { id: 1, name: "Марина Соколова", avatar: "МС", last: "Отлично! Договоримся на следующей неделе.", time: "12:45", unread: 2, online: true },
  { id: 2, name: "TechVenture Group", avatar: "ТВ", last: "Дмитрий: Смотрите презентацию во вложении", time: "10:20", unread: 0, online: false },
  { id: 3, name: "Игорь Петров", avatar: "ИП", last: "Вы: Согласован. Жду договор.", time: "Вчера", unread: 0, online: true },
  { id: 4, name: "CFO Russia 2026", avatar: "CF", last: "Елена: Следующая встреча в четверг", time: "Вчера", unread: 5, online: false },
];

const chatMessages = [
  { id: 1, me: false, text: "Андрей, добрый день! Видела ваш последний пост — очень актуально.", time: "10:02" },
  { id: 2, me: true, text: "Марина, здравствуйте! Рад, что нашло отклик. Это реальный кейс из нашей практики.", time: "10:15" },
  { id: 3, me: false, text: "Хотела бы обсудить возможность сотрудничества в рамках нашего нового проекта. Есть время на звонок?", time: "10:18" },
  { id: 4, me: true, text: "Конечно! В среду или четверг после 15:00 — буду рад поговорить.", time: "10:31" },
  { id: 5, me: false, text: "Отлично! Договоримся на следующей неделе.", time: "12:45" },
];

const avatarColors = [
  "hsl(213,80%,38%)",
  "hsl(142,60%,35%)",
  "hsl(270,60%,50%)",
  "hsl(40,80%,42%)",
  "hsl(0,60%,45%)",
  "hsl(190,70%,38%)",
];

function getAvatarColor(initials: string) {
  const idx = (initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % avatarColors.length;
  return avatarColors[idx];
}

function Avatar({ initials, avatarUrl, size = "md" }: { initials: string; avatarUrl?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-16 h-16 text-base" };
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={initials}
        className={`${sizes[size]} rounded-full object-cover flex-shrink-0`}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`}
      style={{ background: getAvatarColor(initials) }}
    >
      {initials}
    </div>
  );
}

function CreatePostModal({ userInitials, onClose, onCreated }: { userInitials: string; onClose: () => void; onCreated: (p: Post) => void }) {
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [error, setError] = useState("");
  const [mediaPreview, setMediaPreview] = useState<string>("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { setError("Файл не более 100 МБ"); return; }
    setMediaFile(file);
    if (file.type.startsWith("image/")) {
      const b64 = await readFileAsBase64(file);
      setMediaPreview(b64);
    } else {
      setMediaPreview("video");
    }
  };

  const submit = async () => {
    if (!text.trim() && !mediaFile) { setError("Введите текст или добавьте медиа"); return; }
    setLoading(true); setError(""); setUploadPercent(0);
    let media_url = "", media_type = "";
    if (mediaFile) {
      setUploadPercent(15);
      const b64 = await readFileAsBase64(mediaFile);
      setUploadPercent(55);
      const r = await apiPost(SOCIAL_URL, { action: "upload_media", file_data: b64, file_type: mediaFile.type });
      setUploadPercent(85);
      if (!r.ok) { setError((r.data.error as string) || "Ошибка загрузки файла"); setLoading(false); setUploadPercent(0); return; }
      media_url = r.data.url as string;
      media_type = r.data.media_type as string;
    }
    const r = await apiPost(POSTS_URL, { action: "create", text: text.trim(), tags: tags.trim(), media_url, media_type });
    setUploadPercent(100);
    setLoading(false);
    if (!r.ok) { setError((r.data.error as string) || "Ошибка создания поста"); setUploadPercent(0); return; }
    onCreated(r.data.post as Post);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,15,30,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaSelect} />
      <div className="w-full max-w-lg rounded-xl p-6 section-enter" style={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(216,20%,88%)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-base">Новая публикация</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-muted" style={{ color: "hsl(220,15%,55%)" }}>
            <Icon name="X" size={16} />
          </button>
        </div>
        <div className="flex items-start gap-3 mb-4">
          <Avatar initials={userInitials} />
          <textarea
            className="flex-1 px-3 py-2.5 rounded-lg border text-sm outline-none focus:border-blue-400 transition-all resize-none"
            style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)", minHeight: 100 }}
            placeholder="Поделитесь профессиональными мыслями, новостями или опытом..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </div>

        {/* Media preview */}
        {mediaPreview && (
          <div className="relative mb-3 rounded-lg overflow-hidden">
            {mediaPreview === "video" ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: "hsl(216,20%,96%)" }}>
                <Icon name="Video" size={20} style={{ color: "hsl(213,80%,40%)" }} />
                <div>
                  <div className="text-sm font-medium truncate">{mediaFile?.name}</div>
                  <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{mediaFile ? (mediaFile.size / 1024 / 1024).toFixed(1) + " МБ" : ""}</div>
                </div>
              </div>
            ) : (
              <img src={mediaPreview} alt="preview" className="w-full max-h-48 object-cover rounded-lg" />
            )}
            <button onClick={() => { setMediaPreview(""); setMediaFile(null); }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.6)", color: "white" }}>
              <Icon name="X" size={14} />
            </button>
          </div>
        )}

        <div className="mb-4">
          <input
            className="w-full px-3.5 py-2 rounded-lg border text-sm outline-none focus:border-blue-400 transition-all"
            style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)" }}
            placeholder="Теги через запятую: Стратегия, B2B, Управление"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        {error && (
          <div className="px-3 py-2 rounded-lg text-sm mb-3" style={{ background: "hsl(0,80%,97%)", color: "hsl(0,72%,40%)", border: "1px solid hsl(0,72%,88%)" }}>{error}</div>
        )}
        {loading && uploadPercent > 0 && uploadPercent < 100 && (
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1" style={{ color: "hsl(220,15%,55%)" }}>
              <span>{mediaFile ? "Загрузка файла..." : "Публикация..."}</span>
              <span>{uploadPercent}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full" style={{ background: "hsl(216,20%,90%)" }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadPercent}%`, background: "hsl(213,80%,40%)" }} />
            </div>
          </div>
        )}
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <button onClick={() => fileInputRef.current?.click()} className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5" disabled={loading}>
              <Icon name="Image" size={13} />Фото/Видео
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-outline text-xs px-4 py-2" disabled={loading}>Отмена</button>
            <button onClick={submit} disabled={loading || (!text.trim() && !mediaFile)} className="btn-primary text-xs px-4 py-2" style={{ opacity: loading ? 0.7 : 1 }}>
              {loading ? <span className="flex items-center gap-1.5"><Icon name="Loader" size={12} className="animate-spin" />{uploadPercent < 90 ? "Загрузка..." : "Публикация..."}</span> : "Опубликовать"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MediaViewer ──────────────────────────────────────────────────────────────
function MediaViewer({ url, type, onClose }: { url: string; type: string; onClose: () => void }) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.95)" }} onClick={onClose}>
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center z-10" style={{ background: "rgba(255,255,255,0.15)", color: "white" }} onClick={onClose}>
        <Icon name="X" size={20} />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full flex items-center justify-center p-4">
        {type === "video"
          ? <video src={url} controls autoPlay className="max-w-screen max-h-screen rounded-lg" style={{ maxWidth: "95vw", maxHeight: "90vh" }} />
          : <img src={url} alt="media" className="rounded-lg" style={{ maxWidth: "95vw", maxHeight: "90vh", objectFit: "contain" }} />}
      </div>
    </div>
  );
}

// ─── ShareModal ───────────────────────────────────────────────────────────────
function ShareModal({ postId, text, onClose }: { postId: number; text: string; onClose: () => void }) {
  const url = window.location.href;
  const shortText = text ? text.slice(0, 80) : "Пост из NEXUS";
  const socials = [
    { name: "ВКонтакте", icon: "Globe", color: "hsl(213,90%,50%)", href: `https://vk.com/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(shortText)}` },
    { name: "Telegram", icon: "Send", color: "hsl(200,90%,45%)", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shortText)}` },
    { name: "Twitter/X", icon: "Twitter", color: "hsl(210,90%,40%)", href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shortText)}` },
    { name: "WhatsApp", icon: "MessageCircle", color: "hsl(142,70%,38%)", href: `https://wa.me/?text=${encodeURIComponent(shortText + " " + url)}` },
    { name: "LinkedIn", icon: "Briefcase", color: "hsl(210,80%,40%)", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  ];
  const copyLink = () => { navigator.clipboard.writeText(url).catch(() => {}); alert("Ссылка скопирована!"); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl p-5" style={{ background: "white", border: "1px solid hsl(216,20%,88%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">Поделиться</h3>
          <button onClick={onClose}><Icon name="X" size={16} style={{ color: "hsl(220,15%,55%)" }} /></button>
        </div>
        <div className="grid grid-cols-5 gap-3 mb-4">
          {socials.map((s) => (
            <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" title={s.name}
              className="flex flex-col items-center gap-1.5" onClick={() => { apiPost(POSTS_URL, { action: "share", post_id: postId }); }}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: `${s.color}18`, border: `1.5px solid ${s.color}40` }}>
                <Icon name={s.icon} size={20} style={{ color: s.color }} />
              </div>
              <span className="text-xs" style={{ color: "hsl(220,15%,55%)", fontSize: "9px" }}>{s.name}</span>
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: "hsl(216,20%,96%)" }}>
          <span className="flex-1 text-xs truncate" style={{ color: "hsl(220,15%,55%)" }}>{url}</span>
          <button className="btn-primary text-xs px-3 py-1.5 flex-shrink-0" onClick={copyLink}>Скопировать</button>
        </div>
      </div>
    </div>
  );
}

// ─── UsersListModal ───────────────────────────────────────────────────────────
function UsersListModal({ title, users, onClose, onFollowToggle, onOpenProfile, onStartChat }: {
  title: string;
  users: { id: number; full_name: string; job_title: string; avatar_url: string; initials: string; is_following?: boolean }[];
  onClose: () => void;
  onFollowToggle?: (uid: number, following: boolean) => void;
  onOpenProfile?: (uid: number) => void;
  onStartChat?: (uid: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl" style={{ background: "white", border: "1px solid hsl(216,20%,88%)", maxHeight: "70vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "hsl(216,20%,88%)" }}>
          <h3 className="font-semibold text-sm">{title} · {users.length}</h3>
          <button onClick={onClose}><Icon name="X" size={16} style={{ color: "hsl(220,15%,55%)" }} /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {users.length === 0 && <div className="text-center py-10 text-sm" style={{ color: "hsl(220,15%,55%)" }}>Пока никого нет</div>}
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-b cursor-pointer hover:bg-gray-50 transition-colors"
              style={{ borderColor: "hsl(216,20%,94%)" }}
              onClick={() => { if (onOpenProfile) { onOpenProfile(u.id); onClose(); } }}>
              <Avatar initials={u.initials} avatarUrl={u.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{u.full_name}</div>
                <div className="text-xs truncate" style={{ color: "hsl(220,15%,55%)" }}>{u.job_title || "Участник"}</div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                {onStartChat && (
                  <button className="btn-outline text-xs p-1.5" title="Написать"
                    onClick={() => { onStartChat(u.id); onClose(); }}>
                    <Icon name="MessageSquare" size={13} />
                  </button>
                )}
                {onFollowToggle && (
                  <button className={u.is_following ? "btn-outline text-xs px-2 py-1" : "btn-primary text-xs px-2 py-1"}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const action = u.is_following ? "unfollow" : "follow";
                      const r = await apiPost(SOCIAL_URL, { action, user_id: u.id });
                      if (r.ok) onFollowToggle(u.id, !u.is_following);
                    }}>
                    {u.is_following ? "✓" : "+"}
                  </button>
                )}
                {onOpenProfile && <Icon name="ChevronRight" size={14} style={{ color: "hsl(220,15%,65%)" }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── UserProfilePage (просмотр профиля другого пользователя) ─────────────────
interface PublicUser {
  id: number; full_name: string; job_title: string; bio: string;
  avatar_url: string; cover_url: string;
  social_vk: string; social_tg: string; social_linkedin: string; social_instagram: string;
  stats: { followers: number; following: number; posts: number; views: number; reach: number };
  is_following: boolean; is_me: boolean;
}

function UserProfilePage({ userId, currentUser, onBack, onOpenChat, onOpenProfile }: {
  userId: number;
  currentUser: User | null;
  onBack: () => void;
  onOpenChat?: (uid: number) => void;
  onOpenProfile?: (uid: number) => void;
}) {
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: string } | null>(null);
  const [followersModal, setFollowersModal] = useState<"followers" | "following" | null>(null);
  const [followUsers, setFollowUsers] = useState<{ id: number; full_name: string; job_title: string; avatar_url: string; initials: string; is_following: boolean }[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiPost(SOCIAL_URL, { action: "get_profile_by_id", user_id: userId }),
      apiPost(POSTS_URL, { action: "user_posts", user_id: userId }),
    ]).then(([pr, postsR]) => {
      if (pr.ok) {
        const p = pr.data as unknown as PublicUser;
        setProfile(p);
        setFollowing(p.is_following);
        setFollowersCount(p.stats.followers);
      }
      setPosts((postsR.data.posts as Post[]) || []);
      setLoading(false);
    });
  }, [userId]);

  const handleFollow = async () => {
    if (!currentUser) return;
    const action = following ? "unfollow" : "follow";
    const r = await apiPost(SOCIAL_URL, { action, user_id: userId });
    if (r.ok) {
      setFollowing(!following);
      setFollowersCount(r.data.followers_count as number ?? followersCount + (following ? -1 : 1));
    }
  };

  const openFollowModal = async (type: "followers" | "following") => {
    setFollowersModal(type);
    setFollowUsers([]);
    const action = type === "followers" ? "get_followers" : "get_following";
    const r = await apiPost(POSTS_URL, { action, user_id: userId });
    setFollowUsers((r.data.users as typeof followUsers) || []);
  };

  const [postView, setPostView] = useState<"grid" | "list">("grid");
  const mediaOnly = posts.filter((p) => p.media_url);

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-10"><div className="h-48 rounded-xl shimmer" /></div>;
  if (!profile) return <div className="text-center py-20 text-sm" style={{ color: "hsl(220,15%,55%)" }}>Профиль не найден</div>;

  const socials = [
    { key: "vk", label: "ВКонтакте", icon: "Globe", color: "hsl(213,90%,50%)", href: `https://vk.com/${profile.social_vk}`, value: profile.social_vk },
    { key: "tg", label: "Telegram", icon: "Send", color: "hsl(200,90%,45%)", href: `https://t.me/${profile.social_tg}`, value: profile.social_tg },
    { key: "li", label: "LinkedIn", icon: "Briefcase", color: "hsl(210,90%,40%)", href: `https://linkedin.com/in/${profile.social_linkedin}`, value: profile.social_linkedin },
    { key: "ig", label: "Instagram", icon: "Camera", color: "hsl(320,80%,55%)", href: `https://instagram.com/${profile.social_instagram}`, value: profile.social_instagram },
  ].filter((s) => s.value);

  const displayInitials = profile.full_name.split(" ").map((w) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase();

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      {mediaViewer && <MediaViewer url={mediaViewer.url} type={mediaViewer.type} onClose={() => setMediaViewer(null)} />}
      {followersModal && (
        <UsersListModal title={followersModal === "followers" ? "Подписчики" : "Подписки"} users={followUsers}
          onClose={() => setFollowersModal(null)}
          onFollowToggle={(uid, f) => setFollowUsers((prev) => prev.map((u) => u.id === uid ? { ...u, is_following: f } : u))}
          onOpenProfile={onOpenProfile}
          onStartChat={onOpenChat} />
      )}

      <button className="flex items-center gap-2 text-sm mb-4" style={{ color: "hsl(213,80%,40%)" }} onClick={onBack}>
        <Icon name="ArrowLeft" size={16} />Назад
      </button>

      <div className="post-card mb-4 overflow-hidden p-0">
        {/* Обложка */}
        <div className="relative w-full" style={{ height: 160 }}>
          {profile.cover_url
            ? <img src={profile.cover_url} alt="cover" className="w-full h-full object-cover" />
            : <div className="w-full h-full" style={{ background: "linear-gradient(135deg, hsl(221,55%,20%) 0%, hsl(213,80%,35%) 100%)" }} />}
        </div>

        <div className="px-5 pb-5">
          {/* Аватар + кнопки */}
          <div className="flex items-end justify-between -mt-10 mb-3">
            <div className="flex-shrink-0">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt={displayInitials} className="w-20 h-20 rounded-full border-4 object-cover" style={{ borderColor: "white" }} />
                : <div className="w-20 h-20 rounded-full border-4 flex items-center justify-center text-xl font-bold text-white" style={{ background: "hsl(213,80%,40%)", borderColor: "white" }}>{displayInitials}</div>}
            </div>
            {currentUser && !profile.is_me && (
              <div className="flex gap-2 items-center pt-1 flex-wrap">
                <button className={following ? "btn-outline text-xs px-4 py-2" : "btn-primary text-xs px-4 py-2"} onClick={handleFollow}>
                  {following ? "Подписан" : "+ Подписаться"}
                </button>
                {onOpenChat && (
                  <button className="btn-outline text-xs px-3 py-2 flex items-center gap-1.5" onClick={() => onOpenChat(userId)}>
                    <Icon name="MessageSquare" size={14} />Написать
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Имя, должность, bio */}
          <h1 className="font-bold text-xl leading-tight">{profile.full_name}</h1>
          <p className="text-sm mt-0.5" style={{ color: "hsl(220,15%,50%)" }}>{profile.job_title}</p>
          {profile.bio && <p className="text-sm mt-2 leading-relaxed" style={{ color: "hsl(220,25%,25%)" }}>{profile.bio}</p>}

          {/* Соцсети */}
          {socials.length > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {socials.map((s) => (
                <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-opacity hover:opacity-75"
                  style={{ background: `${s.color}15`, color: s.color, border: `1px solid ${s.color}30` }}>
                  <Icon name={s.icon} size={11} />{s.label}
                </a>
              ))}
            </div>
          )}

          {/* Статистика */}
          <div className="grid grid-cols-4 gap-1 pt-3 mt-3 border-t" style={{ borderColor: "hsl(216,20%,90%)" }}>
            {[
              { label: "Подписчиков", value: followersCount, click: () => openFollowModal("followers") },
              { label: "Подписок", value: profile.stats.following, click: () => openFollowModal("following") },
              { label: "Постов", value: profile.stats.posts, click: undefined },
              { label: "Просмотров", value: profile.stats.views, click: undefined },
            ].map((s, i) => (
              <button key={s.label} className="text-center py-1 px-1 rounded-lg hover:bg-gray-50 transition-colors" onClick={s.click}>
                <div className="font-bold text-base leading-tight" style={{ color: "hsl(221,65%,22%)" }}>{s.value.toLocaleString("ru")}</div>
                <div className="leading-tight mt-0.5" style={{ fontSize: "9px", color: i < 2 ? "hsl(213,80%,40%)" : "hsl(220,15%,55%)" }}>{s.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Аналитика */}
      <div className="post-card mb-4">
        <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Icon name="BarChart2" size={15} style={{ color: "hsl(213,80%,40%)" }} />
          Аналитика
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Просмотры", value: profile.stats.views.toLocaleString("ru"), icon: "Eye" },
            { label: "Охват", value: profile.stats.reach.toLocaleString("ru"), icon: "Users" },
            { label: "Подписчики", value: followersCount.toLocaleString("ru"), icon: "UserPlus" },
          ].map((m) => (
            <div key={m.label} className="p-3 rounded-lg" style={{ background: "hsl(216,20%,96%)" }}>
              <div className="text-xs mb-1 flex items-center gap-1" style={{ color: "hsl(220,15%,55%)" }}>
                <Icon name={m.icon} size={11} />{m.label}
              </div>
              <div className="font-bold text-base" style={{ color: "hsl(221,65%,22%)" }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Публикации */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-xs uppercase tracking-wider" style={{ color: "hsl(220,15%,50%)" }}>Публикации</h2>
        <div className="flex gap-1">
          <button onClick={() => setPostView("grid")} className={`p-1.5 rounded ${postView === "grid" ? "btn-primary" : "btn-outline"}`}><Icon name="Grid3X3" size={13} /></button>
          <button onClick={() => setPostView("list")} className={`p-1.5 rounded ${postView === "list" ? "btn-primary" : "btn-outline"}`}><Icon name="List" size={13} /></button>
        </div>
      </div>

      {loading && <div className="h-32 rounded-lg shimmer mb-4" />}

      {!loading && postView === "grid" && (
        <div>
          {mediaOnly.length > 0 && (
            <>
              <div className="text-xs font-medium mb-2" style={{ color: "hsl(220,15%,50%)" }}>Фото и видео</div>
              <div className="grid grid-cols-3 gap-1 mb-4">
                {mediaOnly.map((p) => (
                  <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer"
                    onClick={() => setMediaViewer({ url: p.media_url!, type: p.media_type || "image" })}>
                    {p.media_type === "image"
                      ? <img src={p.media_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center" style={{ background: "hsl(221,25%,18%)" }}>
                          <Icon name="Play" size={24} style={{ color: "white" }} />
                        </div>}
                    {p.media_type === "video" && (
                      <span className="absolute top-1 right-1"><Icon name="Video" size={12} style={{ color: "white" }} /></span>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-2 py-1" style={{ background: "rgba(0,0,0,0.4)", color: "white", fontSize: "10px" }}>
                      <Icon name="Heart" size={10} />{p.likes_count}
                      <Icon name="Eye" size={10} />{p.views_count}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {posts.filter((p) => !p.media_url).length > 0 && (
            <>
              <div className="text-xs font-medium mb-2" style={{ color: "hsl(220,15%,50%)" }}>Текстовые посты</div>
              <div className="space-y-2">
                {posts.filter((p) => !p.media_url).map((p) => (
                  <div key={p.id} className="post-card py-2 px-4">
                    <p className="text-sm" style={{ color: "hsl(220,25%,20%)" }}>{p.text || "—"}</p>
                    <div className="text-xs mt-1 flex items-center gap-3" style={{ color: "hsl(220,15%,60%)" }}>
                      <span>{timeAgo(p.created_at)}</span>
                      <span className="flex items-center gap-1"><Icon name="Heart" size={11} />{p.likes_count}</span>
                      <span className="flex items-center gap-1"><Icon name="Eye" size={11} />{p.views_count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {posts.length === 0 && (
            <div className="post-card text-center py-10" style={{ color: "hsl(220,15%,60%)" }}>
              <Icon name="FileText" size={28} className="mx-auto mb-2 opacity-30" />
              <div className="text-sm">Публикаций пока нет</div>
            </div>
          )}
        </div>
      )}

      {!loading && postView === "list" && (
        <div className="space-y-4">
          {posts.map((p) => (
            <PostCard key={p.id} post={p}
              onLike={async (id) => { const r = await apiPost(POSTS_URL, { action: "like", post_id: id }); if (r.ok) setPosts((prev) => prev.map((pp) => pp.id === id ? { ...pp, liked: r.data.liked as boolean, likes_count: r.data.likes_count as number } : pp)); }}
              onCommentAdded={(id) => setPosts((prev) => prev.map((pp) => pp.id === id ? { ...pp, comments_count: pp.comments_count + 1 } : pp))}
              onOpenProfile={onOpenProfile}
              userInitials={currentUser ? getInitials(currentUser.full_name) : "?"}
              userAvatarUrl={currentUser?.avatar_url}
            />
          ))}
          {posts.length === 0 && (
            <div className="post-card text-center py-10" style={{ color: "hsl(220,15%,60%)" }}>
              <Icon name="FileText" size={28} className="mx-auto mb-2 opacity-30" />
              <div className="text-sm">Публикаций пока нет</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Groups Page ──────────────────────────────────────────────────────────────
interface Group { id: number; name: string; description: string; avatar_url: string; members_count: number; owner_id: number; is_member: boolean; initials: string; }
interface GroupPost { id: number; text: string; media_url: string; media_type: string; likes_count: number; comments_count: number; created_at: string; author: PostAuthor; liked: boolean; is_mine: boolean; }

function GroupDetailPage({ group, currentUser, onBack }: { group: Group; currentUser: User | null; onBack: () => void }) {
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [members, setMembers] = useState<{ id: number; full_name: string; job_title: string; avatar_url: string; initials: string; role: string }[]>([]);
  const [tab, setTab] = useState<"posts" | "members">("posts");
  const [isMember, setIsMember] = useState(group.is_member);
  const [membersCount, setMembersCount] = useState(group.members_count);
  const [newPostText, setNewPostText] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [posting, setPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const docRef = useRef<HTMLInputElement | null>(null);

  const [openComments, setOpenComments] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});
  const [sharePostId, setSharePostId] = useState<number | null>(null);

  useEffect(() => {
    apiPost(SOCIAL_URL, { action: "group_posts_v2", group_id: group.id }).then((r) => setPosts((r.data.posts as GroupPost[]) || []));
    apiPost(SOCIAL_URL, { action: "group_members", group_id: group.id }).then((r) => setMembers((r.data.members as typeof members) || []));
  }, [group.id]);

  const handleLike = async (postId: number) => {
    const r = await apiPost(SOCIAL_URL, { action: "group_like", post_id: postId });
    if (r.ok) setPosts((prev) => prev.map((p) => p.id === postId
      ? { ...p, liked: r.data.liked as boolean, likes_count: r.data.likes_count as number } : p));
  };

  const handleDelete = async (postId: number) => {
    if (!confirm("Удалить публикацию?")) return;
    const r = await apiPost(SOCIAL_URL, { action: "group_post_delete", post_id: postId });
    if (r.ok) setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const loadComments = async (postId: number) => {
    if (openComments === postId) { setOpenComments(null); return; }
    setOpenComments(postId);
    if (!comments[postId]) {
      const r = await apiPost(SOCIAL_URL, { action: "group_comments", post_id: postId });
      setComments((prev) => ({ ...prev, [postId]: (r.data.comments as Comment[]) || [] }));
    }
  };

  const sendComment = async (postId: number) => {
    const text = commentTexts[postId]?.trim();
    if (!text) return;
    const r = await apiPost(SOCIAL_URL, { action: "group_comment", post_id: postId, text });
    if (r.ok) {
      setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), r.data.comment as Comment] }));
      setCommentTexts((prev) => ({ ...prev, [postId]: "" }));
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p));
    }
  };

  const handleJoin = async () => {
    const action = isMember ? "group_leave" : "group_join";
    const r = await apiPost(SOCIAL_URL, { action, group_id: group.id });
    if (r.ok) { setIsMember(!isMember); setMembersCount(r.data.members_count as number); }
  };

  const handlePost = async () => {
    if (!newPostText.trim() && !mediaFile) return;
    setPosting(true);
    setUploadProgress(0);
    let media_url = "", media_type = "";
    if (mediaFile) {
      setUploadProgress(20);
      const b64 = await readFileAsBase64(mediaFile);
      setUploadProgress(60);
      const r2 = await apiPost(SOCIAL_URL, { action: "upload_media", file_data: b64, file_type: mediaFile.type });
      setUploadProgress(90);
      if (r2.ok) { media_url = r2.data.url as string; media_type = r2.data.media_type as string; }
    }
    const r = await apiPost(SOCIAL_URL, { action: "group_post_create", group_id: group.id, text: newPostText.trim(), media_url, media_type });
    setPosting(false);
    setUploadProgress(0);
    if (r.ok) { setPosts((prev) => [r.data.post as GroupPost, ...prev]); setNewPostText(""); setMediaFile(null); setMediaPreview(""); setShowCreate(false); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      {mediaViewer && <MediaViewer url={mediaViewer.url} type={mediaViewer.type} onClose={() => setMediaViewer(null)} />}
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setMediaFile(f); if (f.type.startsWith("image/")) { setMediaPreview(await readFileAsBase64(f)); } else { setMediaPreview("video"); } }} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setMediaFile(f); setMediaPreview("document"); }} />

      <button className="flex items-center gap-2 text-sm mb-4" style={{ color: "hsl(213,80%,40%)" }} onClick={onBack}>
        <Icon name="ArrowLeft" size={16} />Назад
      </button>

      {/* Group header */}
      <div className="post-card mb-4">
        <div className="h-20 rounded-lg -mx-5 -mt-5 mb-4" style={{ background: "linear-gradient(135deg, hsl(213,80%,25%) 0%, hsl(270,60%,35%) 100%)" }} />
        <div className="flex items-end gap-4 -mt-8 mb-3">
          <div className="w-14 h-14 rounded-xl border-4 border-card flex items-center justify-center text-white font-bold text-lg flex-shrink-0" style={{ background: getAvatarColor(group.initials) }}>
            {group.initials}
          </div>
          <div className="flex-1 pb-1">
            <h2 className="font-bold text-base">{group.name}</h2>
            <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{membersCount} участников</div>
          </div>
          {currentUser && (
            <button className={isMember ? "btn-outline text-xs px-4 py-2" : "btn-primary text-xs px-4 py-2"} onClick={handleJoin}>
              {isMember ? "Выйти" : "Вступить"}
            </button>
          )}
        </div>
        {group.description && <p className="text-sm" style={{ color: "hsl(220,25%,30%)" }}>{group.description}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(["posts", "members"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? "btn-primary text-xs px-4 py-2" : "btn-outline text-xs px-4 py-2"}>
            {{ posts: "Публикации", members: "Участники" }[t]}
          </button>
        ))}
      </div>

      {tab === "posts" && (
        <>
          {isMember && (
            <div className="post-card mb-4">
              {!showCreate ? (
                <button className="w-full text-left px-4 py-2.5 rounded-full border text-sm" style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,15%,55%)" }} onClick={() => setShowCreate(true)}>
                  Написать в группе...
                </button>
              ) : (
                <div>
                  <textarea className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none" style={{ borderColor: "hsl(216,20%,85%)", minHeight: 80 }}
                    placeholder="Текст публикации..." value={newPostText} onChange={(e) => setNewPostText(e.target.value)} />
                  {mediaPreview && (
                    <div className="relative mt-2">
                      {mediaPreview === "video" ? (
                        <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "hsl(216,20%,96%)" }}>
                          <Icon name="Video" size={18} style={{ color: "hsl(213,80%,40%)" }} />
                          <span className="text-sm truncate">{mediaFile?.name}</span>
                        </div>
                      ) : mediaPreview === "document" ? (
                        <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "hsl(216,20%,96%)" }}>
                          <Icon name="FileText" size={18} style={{ color: "hsl(213,80%,40%)" }} />
                          <span className="text-sm truncate">{mediaFile?.name}</span>
                        </div>
                      ) : (
                        <img src={mediaPreview} className="w-full max-h-40 object-cover rounded-lg" />
                      )}
                      <button className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", color: "white" }} onClick={() => { setMediaFile(null); setMediaPreview(""); }}>
                        <Icon name="X" size={12} />
                      </button>
                    </div>
                  )}
                  {posting && uploadProgress > 0 && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-1" style={{ color: "hsl(220,15%,55%)" }}>
                        <span>Загрузка...</span><span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full" style={{ background: "hsl(216,20%,90%)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, background: "hsl(213,80%,40%)" }} />
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between mt-2 flex-wrap gap-2">
                    <div className="flex gap-1.5">
                      <button className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={() => fileRef.current?.click()}>
                        <Icon name="Image" size={12} />Фото/Видео
                      </button>
                      <button className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={() => docRef.current?.click()}>
                        <Icon name="Paperclip" size={12} />Документ
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-outline text-xs px-3 py-1.5" onClick={() => { setShowCreate(false); setNewPostText(""); setMediaFile(null); setMediaPreview(""); }}>Отмена</button>
                      <button className="btn-primary text-xs px-3 py-1.5" onClick={handlePost} disabled={posting}>
                        {posting ? <span className="flex items-center gap-1"><Icon name="Loader" size={12} className="animate-spin" />Отправка...</span> : "Опубликовать"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="space-y-4">
            {sharePostId && (
              <ShareModal postId={sharePostId} onClose={() => setSharePostId(null)} />
            )}
            {posts.map((p) => (
              <div key={p.id} className="post-card">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar initials={p.author.initials} avatarUrl={p.author.avatar_url} size="sm" />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{p.author.full_name}</div>
                    <div className="text-xs" style={{ color: "hsl(220,15%,60%)" }}>{timeAgo(p.created_at)}</div>
                  </div>
                  {p.is_mine && (
                    <button className="p-1.5 rounded hover:bg-red-50 transition-colors" style={{ color: "hsl(0,72%,48%)" }}
                      onClick={() => handleDelete(p.id)} title="Удалить">
                      <Icon name="Trash2" size={14} />
                    </button>
                  )}
                </div>
                {p.text && <p className="text-sm mb-3" style={{ color: "hsl(220,25%,20%)" }}>{p.text}</p>}
                {p.media_url && p.media_type === "image" && (
                  <img src={p.media_url} className="w-full rounded-lg max-h-80 object-cover cursor-pointer mb-3" onClick={() => setMediaViewer({ url: p.media_url, type: "image" })} />
                )}
                {p.media_url && p.media_type === "video" && (
                  <video src={p.media_url} controls className="w-full rounded-lg max-h-80 mb-3" />
                )}
                {p.media_url && p.media_type === "document" && (
                  <a href={p.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-sm" style={{ background: "hsl(216,20%,96%)", color: "hsl(213,80%,40%)" }}>
                    <Icon name="FileText" size={15} />Открыть документ
                  </a>
                )}
                {/* Действия */}
                <div className="flex items-center gap-1 pt-2 border-t" style={{ borderColor: "hsl(216,20%,92%)" }}>
                  <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${p.liked ? "text-red-500" : ""}`}
                    style={{ color: p.liked ? "hsl(0,72%,48%)" : "hsl(220,15%,55%)" }}
                    onClick={() => handleLike(p.id)}>
                    <Icon name={p.liked ? "Heart" : "Heart"} size={14} style={{ fill: p.liked ? "currentColor" : "none" }} />
                    {p.likes_count > 0 && p.likes_count}
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-muted"
                    style={{ color: "hsl(220,15%,55%)" }}
                    onClick={() => loadComments(p.id)}>
                    <Icon name="MessageCircle" size={14} />
                    {p.comments_count > 0 && p.comments_count}
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-muted ml-auto"
                    style={{ color: "hsl(220,15%,55%)" }}
                    onClick={() => setSharePostId(p.id)}>
                    <Icon name="Share2" size={14} />
                  </button>
                </div>
                {/* Комментарии */}
                {openComments === p.id && (
                  <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: "hsl(216,20%,92%)" }}>
                    {(comments[p.id] || []).map((c) => (
                      <div key={c.id} className="flex gap-2">
                        <Avatar initials={c.author.initials} size="sm" />
                        <div className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: "hsl(216,20%,96%)" }}>
                          <div className="font-medium text-xs mb-0.5">{c.author.full_name}</div>
                          <div style={{ color: "hsl(220,25%,25%)" }}>{c.text}</div>
                        </div>
                      </div>
                    ))}
                    {currentUser && (
                      <div className="flex gap-2 mt-2">
                        <Avatar initials={getInitials(currentUser.full_name)} avatarUrl={currentUser.avatar_url} size="sm" />
                        <div className="flex-1 flex gap-2">
                          <input className="flex-1 px-3 py-1.5 rounded-lg border text-sm outline-none"
                            style={{ borderColor: "hsl(216,20%,85%)" }}
                            placeholder="Комментарий..."
                            value={commentTexts[p.id] || ""}
                            onChange={(e) => setCommentTexts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") sendComment(p.id); }}
                          />
                          <button className="btn-primary text-xs px-3 py-1.5" onClick={() => sendComment(p.id)}>
                            <Icon name="Send" size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {posts.length === 0 && <div className="text-center py-10 text-sm" style={{ color: "hsl(220,15%,55%)" }}>Публикаций пока нет</div>}
          </div>
        </>
      )}

      {tab === "members" && (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="post-card flex items-center gap-3">
              <Avatar initials={m.initials} avatarUrl={m.avatar_url} size="sm" />
              <div className="flex-1">
                <div className="font-medium text-sm">{m.full_name}</div>
                <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{m.job_title || m.role}</div>
              </div>
              {m.role === "owner" && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "hsl(213,80%,94%)", color: "hsl(213,80%,40%)" }}>Владелец</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupsPage({ currentUser }: { currentUser: User | null }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiPost(SOCIAL_URL, { action: "groups_list" }).then((r) => {
      setGroups((r.data.groups as Group[]) || []);
      setLoading(false);
    });
  }, []);

  const handleSearch = async (q: string) => {
    setQuery(q);
    const r = await apiPost(SOCIAL_URL, { action: "groups_list", q });
    setGroups((r.data.groups as Group[]) || []);
  };

  const handleCreate = async () => {
    if (!newGroupName.trim()) return;
    setCreating(true);
    const r = await apiPost(SOCIAL_URL, { action: "group_create", name: newGroupName.trim(), description: newGroupDesc.trim() });
    setCreating(false);
    if (r.ok && r.data.group) { setGroups((prev) => [r.data.group as Group, ...prev]); setShowCreate(false); setNewGroupName(""); setNewGroupDesc(""); }
  };

  if (activeGroup) return <GroupDetailPage group={activeGroup} currentUser={currentUser} onBack={() => setActiveGroup(null)} />;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-xl p-5" style={{ background: "white" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-base mb-4">Создать группу</h3>
            <input className="w-full px-3 py-2.5 rounded-lg border text-sm mb-3 outline-none" style={{ borderColor: "hsl(216,20%,85%)" }} placeholder="Название группы *" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
            <textarea className="w-full px-3 py-2.5 rounded-lg border text-sm mb-4 outline-none resize-none" style={{ borderColor: "hsl(216,20%,85%)", minHeight: 80 }} placeholder="Описание (необязательно)" value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-outline flex-1 py-2" onClick={() => setShowCreate(false)}>Отмена</button>
              <button className="btn-primary flex-1 py-2" onClick={handleCreate} disabled={creating || !newGroupName.trim()}>
                {creating ? "Создание..." : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(220,15%,60%)" }} />
          <input className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: "hsl(216,20%,85%)" }} placeholder="Поиск групп..." value={query} onChange={(e) => handleSearch(e.target.value)} />
        </div>
        {currentUser && <button className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5" onClick={() => setShowCreate(true)}><Icon name="Plus" size={13} />Создать</button>}
      </div>

      {loading && [1,2,3].map((i) => <div key={i} className="h-20 rounded-lg shimmer mb-2" />)}
      {!loading && groups.length === 0 && (
        <div className="text-center py-12" style={{ color: "hsl(220,15%,55%)" }}>
          <Icon name="Users" size={36} className="mx-auto mb-3 opacity-30" />
          <div className="text-sm font-medium">Групп пока нет</div>
          {currentUser && <button className="btn-primary text-xs px-4 py-2 mt-3" onClick={() => setShowCreate(true)}>Создать первую группу</button>}
        </div>
      )}
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.id} className="post-card flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveGroup(g)}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0" style={{ background: getAvatarColor(g.initials) }}>
              {g.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{g.name}</div>
              <div className="text-xs truncate" style={{ color: "hsl(220,15%,55%)" }}>{g.members_count} участников · {g.description || "Группа NEXUS"}</div>
            </div>
            <div className="flex-shrink-0">
              {g.is_member ? (
                <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: "hsl(142,60%,93%)", color: "hsl(142,70%,35%)" }}>Участник</span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: "hsl(216,20%,94%)", color: "hsl(220,15%,45%)" }}>Вступить</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PostCard({ post, onLike, onCommentAdded, onDelete, userInitials, userAvatarUrl, onOpenProfile }: {
  post: Post;
  onLike: (id: number) => void;
  onCommentAdded: (id: number) => void;
  onDelete?: (id: number) => void;
  userInitials: string;
  userAvatarUrl?: string;
  onOpenProfile?: (uid: number) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shareCount, setShareCount] = useState(post.share_count || 0);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: string } | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [likesUsers, setLikesUsers] = useState<{ id: number; full_name: string; job_title: string; avatar_url: string; initials: string }[]>([]);
  const [showLikes, setShowLikes] = useState(false);
  const [loadingLikes, setLoadingLikes] = useState(false);

  const toggleComments = async () => {
    if (!showComments && comments.length === 0) {
      setLoadingComments(true);
      const r = await apiPost(POSTS_URL, { action: "get_comments", post_id: post.id });
      setComments((r.data.comments as Comment[]) || []);
      setLoadingComments(false);
    }
    setShowComments((v) => !v);
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    const r = await apiPost(POSTS_URL, { action: "add_comment", post_id: post.id, text: commentText.trim() });
    setSubmitting(false);
    if (r.ok && r.data.comment) {
      setComments((prev) => [...prev, r.data.comment as Comment]);
      setCommentText("");
      onCommentAdded(post.id);
    }
  };

  const handleShare = () => setShowShare(true);

  const handleShowLikes = async () => {
    if (post.likes_count === 0) return;
    setLoadingLikes(true);
    setShowLikes(true);
    const r = await apiPost(POSTS_URL, { action: "get_likes_users", post_id: post.id });
    setLikesUsers((r.data.users as typeof likesUsers) || []);
    setLoadingLikes(false);
  };

  const handleDelete = async () => {
    if (!confirm("Удалить этот пост?")) return;
    setDeleting(true);
    const r = await apiPost(POSTS_URL, { action: "delete", post_id: post.id });
    setDeleting(false);
    if (r.ok) onDelete?.(post.id);
  };

  return (
    <div className="post-card">
      {mediaViewer && <MediaViewer url={mediaViewer.url} type={mediaViewer.type} onClose={() => setMediaViewer(null)} />}
      {showShare && <ShareModal postId={post.id} text={post.text} onClose={() => { setShowShare(false); setShareCount(c => c + 1); }} />}
      {showLikes && (
        <UsersListModal title="Лайки" users={loadingLikes ? [] : likesUsers} onClose={() => setShowLikes(false)} />
      )}

      <div className="flex items-start gap-3">
        <div className="cursor-pointer" onClick={() => onOpenProfile?.(post.author.id)}>
          <Avatar initials={post.author.initials} avatarUrl={post.author.avatar_url} />
        </div>
        <div className="flex-1 min-w-0">
          <button className="font-semibold text-sm hover:underline text-left" onClick={() => onOpenProfile?.(post.author.id)}>{post.author.full_name}</button>
          <div className="text-xs mt-0.5" style={{ color: "hsl(220,15%,55%)" }}>{post.author.job_title}</div>
          <div className="text-xs mt-0.5" style={{ color: "hsl(220,15%,65%)" }}>{timeAgo(post.created_at)}</div>
        </div>
        {post.is_mine && (
          <div className="relative">
            <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted" style={{ color: "hsl(220,15%,55%)" }} onClick={() => setMenuOpen(v => !v)}>
              <Icon name="MoreHorizontal" size={15} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 rounded-lg shadow-lg py-1 min-w-[130px]" style={{ background: "white", border: "1px solid hsl(216,20%,88%)" }}>
                <button className="w-full text-left px-4 py-2 text-xs flex items-center gap-2 hover:bg-red-50" style={{ color: "hsl(0,72%,48%)" }}
                  onClick={() => { setMenuOpen(false); handleDelete(); }} disabled={deleting}>
                  <Icon name="Trash2" size={13} />{deleting ? "Удаление..." : "Удалить пост"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {post.text && <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "hsl(220,25%,20%)" }}>{post.text}</p>}
      {post.media_url && post.media_type === "image" && (
        <div className="mt-3 relative cursor-pointer" onClick={() => setMediaViewer({ url: post.media_url!, type: "image" })}>
          <img src={post.media_url} alt="media" className="w-full rounded-xl object-cover" style={{ maxHeight: "480px" }} />
          <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.15)" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)", color: "white" }}>
              <Icon name="Maximize2" size={18} />
            </div>
          </div>
        </div>
      )}
      {post.media_url && post.media_type === "video" && (
        <div className="mt-3 relative">
          <video src={post.media_url} controls className="w-full rounded-xl" style={{ maxHeight: "480px" }} />
          <button className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)", color: "white" }}
            onClick={() => setMediaViewer({ url: post.media_url!, type: "video" })}>
            <Icon name="Maximize2" size={14} />
          </button>
        </div>
      )}
      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {post.tags.map((tag) => <span key={tag} className="stat-badge">#{tag}</span>)}
        </div>
      )}
      <div className="flex items-center justify-between mt-4 pt-3 border-t text-xs" style={{ borderColor: "hsl(216,20%,90%)", color: "hsl(220,15%,55%)" }}>
        <span className="flex items-center gap-1"><Icon name="Eye" size={13} />{post.views_count.toLocaleString("ru")}</span>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1.5 transition-colors" onClick={() => onLike(post.id)} style={{ color: post.liked ? "hsl(0,72%,51%)" : "hsl(220,15%,55%)" }}>
            <Icon name="Heart" size={14} />
            <span className={post.likes_count > 0 ? "cursor-pointer hover:underline" : ""} onClick={(e) => { e.stopPropagation(); handleShowLikes(); }}>{post.likes_count}</span>
          </button>
          <button className="flex items-center gap-1.5 transition-colors hover:text-blue-600" onClick={toggleComments} style={{ color: showComments ? "hsl(213,80%,40%)" : "hsl(220,15%,55%)" }}>
            <Icon name="MessageCircle" size={14} />{post.comments_count}
          </button>
          <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors" onClick={handleShare}>
            <Icon name="Share2" size={14} />{shareCount > 0 ? shareCount : ""}
          </button>
        </div>
      </div>

      {showComments && (
        <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: "hsl(216,20%,92%)" }}>
          {loadingComments && <div className="h-8 rounded shimmer" />}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar initials={(c.author as PostAuthor & { avatar_url?: string }).avatar_url ? "" : c.author.initials} avatarUrl={(c.author as PostAuthor & { avatar_url?: string }).avatar_url} size="sm" />
              <div className="flex-1 px-3 py-2 rounded-lg" style={{ background: "hsl(216,20%,96%)" }}>
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-xs">{c.author.full_name}</span>
                  <span className="text-xs" style={{ color: "hsl(220,15%,62%)" }}>{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-sm mt-0.5" style={{ color: "hsl(220,25%,22%)" }}>{c.text}</p>
              </div>
            </div>
          ))}
          {!loadingComments && comments.length === 0 && (
            <p className="text-xs text-center py-2" style={{ color: "hsl(220,15%,62%)" }}>Будьте первым — оставьте комментарий</p>
          )}
          <div className="flex items-center gap-2">
            <Avatar initials={userInitials} avatarUrl={userAvatarUrl} size="sm" />
            <input
              className="flex-1 px-3 py-1.5 rounded-full border text-sm outline-none focus:border-blue-400 transition-all"
              style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)" }}
              placeholder="Написать комментарий..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
            />
            <button className="btn-primary p-2 rounded-full" onClick={submitComment} disabled={submitting || !commentText.trim()}>
              <Icon name="Send" size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FeedPage({ currentUser, onOpenProfile, cache, setCache, loaded, onLoaded }: {
  currentUser: User | null; onOpenProfile?: (uid: number) => void;
  cache: Post[]; setCache: (p: Post[]) => void; loaded: boolean; onLoaded: () => void;
}) {
  const [feedPosts, setFeedPostsLocal] = useState<Post[]>(cache);
  const [loading, setLoading] = useState(!loaded);
  const [showCreate, setShowCreate] = useState(false);
  const userInitials = currentUser ? getInitials(currentUser.full_name) : "?";

  const setFeedPosts = (fn: Post[] | ((prev: Post[]) => Post[])) => {
    setFeedPostsLocal((prev) => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      setCache(next);
      return next;
    });
  };

  useEffect(() => {
    if (loaded) return;
    apiGet(POSTS_URL).then((r) => {
      const posts = (r.data.posts as Post[]) || [];
      setFeedPostsLocal(posts);
      setCache(posts);
      setLoading(false);
      onLoaded();
    }).catch(() => setLoading(false));
  }, []);

  const handleLike = async (postId: number) => {
    const r = await apiPost(POSTS_URL, { action: "like", post_id: postId });
    if (r.ok) setFeedPosts((prev) => prev.map((p) => p.id === postId
      ? { ...p, liked: r.data.liked as boolean, likes_count: r.data.likes_count as number } : p));
  };

  const handleCommentAdded = (postId: number) => {
    setFeedPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p));
  };

  const handleDelete = (postId: number) => {
    setFeedPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      {showCreate && currentUser && (
        <CreatePostModal userInitials={userInitials} onClose={() => setShowCreate(false)} onCreated={(p) => { setFeedPosts((prev) => [p, ...prev]); }} />
      )}

      <div className="post-card">
        <div className="flex items-center gap-3">
          <Avatar initials={userInitials} avatarUrl={currentUser?.avatar_url} />
          <button className="flex-1 text-left px-4 py-2.5 rounded-full border text-sm transition-colors hover:border-blue-400" style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,15%,55%)" }} onClick={() => setShowCreate(true)}>
            Поделитесь профессиональными новостями...
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t" style={{ borderColor: "hsl(216,20%,90%)" }}>
          <button className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
            <Icon name="FileText" size={13} />Написать пост
          </button>
          <button className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
            <Icon name="Image" size={13} />Фото/Видео
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="post-card space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full shimmer" />
                <div className="flex-1 space-y-2"><div className="h-3 rounded shimmer w-1/3" /><div className="h-2.5 rounded shimmer w-1/2" /></div>
              </div>
              <div className="h-3 rounded shimmer" /><div className="h-3 rounded shimmer w-4/5" />
            </div>
          ))}
        </div>
      )}

      {!loading && feedPosts.length === 0 && (
        <div className="post-card text-center py-12" style={{ color: "hsl(220,15%,55%)" }}>
          <Icon name="Newspaper" size={36} className="mx-auto mb-3 opacity-30" />
          <div className="text-sm font-medium mb-1">Лента пока пуста</div>
          <div className="text-xs">Будьте первым — опубликуйте пост!</div>
          <button className="btn-primary text-xs px-4 py-2 mt-4" onClick={() => setShowCreate(true)}>Написать пост</button>
        </div>
      )}

      {feedPosts.map((post) => (
        <PostCard key={post.id} post={post} onLike={handleLike} onCommentAdded={handleCommentAdded}
          onDelete={handleDelete} userInitials={userInitials} userAvatarUrl={currentUser?.avatar_url}
          onOpenProfile={onOpenProfile} />
      ))}
    </div>
  );
}

function FriendsPage({ onOpenProfile, onStartChat, cache, setCache, loaded, onLoaded }: {
  onOpenProfile?: (uid: number) => void;
  onStartChat?: (uid: number) => void;
  cache: SocialUser[]; setCache: (u: SocialUser[]) => void; loaded: boolean; onLoaded: () => void;
}) {
  const [users, setUsersLocal] = useState<SocialUser[]>(cache);
  const [loading, setLoading] = useState(!loaded);

  const setUsers = (fn: SocialUser[] | ((prev: SocialUser[]) => SocialUser[])) => {
    setUsersLocal((prev) => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      setCache(next);
      return next;
    });
  };

  useEffect(() => {
    if (loaded) return;
    apiPost(SOCIAL_URL, { action: "search_users", q: "" }).then((r) => {
      const u = (r.data.users as SocialUser[]) || [];
      setUsersLocal(u);
      setCache(u);
      setLoading(false);
      onLoaded();
    }).catch(() => setLoading(false));
  }, []);

  const toggleFollow = async (u: SocialUser) => {
    const action = u.is_following ? "unfollow" : "follow";
    const r = await apiPost(SOCIAL_URL, { action, user_id: u.id });
    if (r.ok) setUsers((prev) => prev.map((p) => p.id === u.id ? { ...p, is_following: !p.is_following } : p));
  };

  const following = users.filter((u) => u.is_following);
  const suggestions = users.filter((u) => !u.is_following);

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 space-y-6">
      {loading && (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 rounded-lg shimmer" />)}</div>
      )}

      {!loading && following.length > 0 && (
        <div>
          <h2 className="font-semibold text-xs uppercase tracking-wider mb-3" style={{ color: "hsl(220,15%,50%)" }}>Мои подписки</h2>
          <div className="space-y-2">
            {following.map((u) => (
              <div key={u.id} className="post-card flex items-center gap-3">
                <div className="cursor-pointer flex-shrink-0" onClick={() => onOpenProfile?.(u.id)}><Avatar initials={u.initials} avatarUrl={u.avatar_url} /></div>
                <div className="flex-1 min-w-0">
                  <button className="font-medium text-sm hover:underline text-left block truncate w-full" onClick={() => onOpenProfile?.(u.id)}>{u.full_name}</button>
                  <div className="text-xs truncate" style={{ color: "hsl(220,15%,55%)" }}>{u.job_title || "Участник"}</div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {onStartChat && (
                    <button className="btn-outline text-xs p-2" onClick={() => onStartChat(u.id)} title="Написать">
                      <Icon name="MessageSquare" size={13} />
                    </button>
                  )}
                  <button className="btn-outline text-xs p-2" onClick={() => toggleFollow(u)} title="Отписаться">
                    <Icon name="UserMinus" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && suggestions.length > 0 && (
        <div>
          <h2 className="font-semibold text-xs uppercase tracking-wider mb-3" style={{ color: "hsl(220,15%,50%)" }}>
            {following.length > 0 ? "Рекомендации" : "Участники сети"}
          </h2>
          <div className="space-y-2">
            {suggestions.map((u) => (
              <div key={u.id} className="post-card flex items-center gap-3">
                <div className="cursor-pointer flex-shrink-0" onClick={() => onOpenProfile?.(u.id)}><Avatar initials={u.initials} avatarUrl={u.avatar_url} /></div>
                <div className="flex-1 min-w-0">
                  <button className="font-medium text-sm hover:underline text-left block truncate w-full" onClick={() => onOpenProfile?.(u.id)}>{u.full_name}</button>
                  <div className="text-xs truncate" style={{ color: "hsl(220,15%,55%)" }}>{u.job_title || "Участник сети"}</div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {onStartChat && (
                    <button className="btn-outline text-xs p-2" onClick={() => onStartChat(u.id)} title="Написать">
                      <Icon name="MessageSquare" size={13} />
                    </button>
                  )}
                  <button className="btn-primary text-xs px-3 py-1.5 flex-shrink-0" onClick={() => toggleFollow(u)}>+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && users.length === 0 && (
        <div className="text-center py-12" style={{ color: "hsl(220,15%,55%)" }}>
          <Icon name="Users" size={36} className="mx-auto mb-3 opacity-30" />
          <div className="text-sm">Других пользователей пока нет</div>
          <div className="text-xs mt-1">Пригласите коллег зарегистрироваться</div>
        </div>
      )}
    </div>
  );
}

function NotificationsPage({ onOpenProfile, cache, setCache, loaded, onLoaded }: {
  onOpenProfile?: (uid: number) => void;
  cache: Notification[]; setCache: (n: Notification[]) => void; loaded: boolean; onLoaded: () => void;
}) {
  const [notifs, setNotifs] = useState<Notification[]>(cache);
  const [loading, setLoading] = useState(!loaded);

  useEffect(() => {
    if (loaded) return;
    apiPost(SOCIAL_URL, { action: "get_notifications" }).then((r) => {
      const n = (r.data.notifications as Notification[]) || [];
      setNotifs(n);
      setCache(n);
      setLoading(false);
      onLoaded();
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-2">
      {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg shimmer" />)}
    </div>
  );

  if (notifs.length === 0) return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center" style={{ color: "hsl(220,15%,55%)" }}>
      <Icon name="Bell" size={36} className="mx-auto mb-3 opacity-30" />
      <div className="text-sm font-medium">Уведомлений пока нет</div>
      <div className="text-xs mt-1">Здесь появятся лайки, комментарии и подписки</div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      <div className="space-y-1">
        {notifs.map((n) => (
          <div key={n.id} className={`flex items-start gap-4 px-4 py-3.5 rounded-lg cursor-pointer transition-colors hover:bg-muted ${!n.is_read ? "bg-card border border-border" : ""}`}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${n.color}18` }}>
              <Icon name={n.icon} size={18} style={{ color: n.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "hsl(220,30%,15%)" }}>
                <span className="font-semibold">{n.actor_name}</span> {n.label}
              </div>
              {n.post_preview && <div className="text-xs mt-0.5 truncate" style={{ color: "hsl(220,15%,55%)" }}>«{n.post_preview}»</div>}
              <div className="text-xs mt-0.5" style={{ color: "hsl(220,15%,65%)" }}>{timeAgo(n.created_at)}</div>
            </div>
            {!n.is_read && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: "hsl(213,80%,40%)" }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchPage({ onStartChat, onOpenProfile }: { onStartChat?: (userId: number) => void; onOpenProfile?: (uid: number) => void }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [tab, setTab] = useState<"people" | "groups">("people");

  useEffect(() => {
    apiPost(SOCIAL_URL, { action: "search_users" }).then((r) => {
      setUsers((r.data.users as SocialUser[]) || []);
      setLoading(false);
    }).catch(() => setLoading(false));
    apiPost(SOCIAL_URL, { action: "groups_list" }).then((r) => {
      setGroups((r.data.groups as Group[]) || []);
      setLoadingGroups(false);
    }).catch(() => setLoadingGroups(false));
  }, []);

  const handleSearch = async (q: string) => {
    setQuery(q);
    setLoading(true);
    setLoadingGroups(true);
    const [rUsers, rGroups] = await Promise.all([
      apiPost(SOCIAL_URL, { action: "search_users", q }),
      apiPost(SOCIAL_URL, { action: "groups_list", q }),
    ]);
    setUsers((rUsers.data.users as SocialUser[]) || []);
    setGroups((rGroups.data.groups as Group[]) || []);
    setLoading(false);
    setLoadingGroups(false);
  };

  const toggleFollow = async (u: SocialUser) => {
    const action = u.is_following ? "unfollow" : "follow";
    const r = await apiPost(SOCIAL_URL, { action, user_id: u.id });
    if (r.ok) {
      setUsers((prev) => prev.map((p) => p.id === u.id ? { ...p, is_following: !p.is_following } : p));
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      <div className="relative mb-4">
        <Icon name="Search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "hsl(220,15%,55%)" }} />
        <input
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm outline-none focus:border-blue-400 transition-all bg-card"
          style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)" }}
          placeholder={tab === "people" ? "Поиск людей по имени или должности..." : "Поиск групп..."}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>
      <div className="flex gap-2 mb-4">
        {(["people", "groups"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? "btn-primary text-xs px-4 py-1.5" : "btn-outline text-xs px-4 py-1.5"}>
            {{ people: "Люди", groups: "Группы" }[t]}
          </button>
        ))}
      </div>

      {tab === "people" && (
        <div className="space-y-2">
          {loading && [1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg shimmer" />)}
          {!loading && users.map((u) => (
            <div key={u.id} className="post-card flex items-center gap-3">
              <div className="cursor-pointer" onClick={() => onOpenProfile?.(u.id)}><Avatar initials={u.initials} /></div>
              <div className="flex-1">
                <button className="font-medium text-sm hover:underline text-left" onClick={() => onOpenProfile?.(u.id)}>{u.full_name}</button>
                <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{u.job_title || "Участник сети"}</div>
              </div>
              <div className="flex gap-1.5">
                <button className="btn-outline text-xs p-2" onClick={() => onStartChat?.(u.id)} title="Написать">
                  <Icon name="MessageSquare" size={13} />
                </button>
                <button className={u.is_following ? "btn-outline text-xs px-3 py-1.5" : "btn-primary text-xs px-3 py-1.5"} onClick={() => toggleFollow(u)}>
                  {u.is_following ? "Подписан" : "+"}
                </button>
              </div>
            </div>
          ))}
          {!loading && users.length === 0 && (
            <div className="text-center py-12" style={{ color: "hsl(220,15%,55%)" }}>
              <Icon name="SearchX" size={32} className="mx-auto mb-3 opacity-40" />
              <div className="text-sm">Ничего не найдено</div>
            </div>
          )}
        </div>
      )}

      {tab === "groups" && (
        <div className="space-y-2">
          {loadingGroups && [1, 2].map((i) => <div key={i} className="h-16 rounded-lg shimmer" />)}
          {!loadingGroups && groups.map((g) => (
            <div key={g.id} className="post-card flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: getAvatarColor(g.initials) }}>
                {g.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{g.name}</div>
                <div className="text-xs truncate" style={{ color: "hsl(220,15%,55%)" }}>{g.members_count} участников{g.description ? ` · ${g.description}` : ""}</div>
              </div>
            </div>
          ))}
          {!loadingGroups && groups.length === 0 && (
            <div className="text-center py-12" style={{ color: "hsl(220,15%,55%)" }}>
              <Icon name="Users" size={32} className="mx-auto mb-3 opacity-40" />
              <div className="text-sm">{query ? "Группы не найдены" : "Пока нет групп"}</div>
              <div className="text-xs mt-1" style={{ color: "hsl(220,15%,65%)" }}>Создайте группу в разделе «Группы»</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessagesPage({ currentUser }: { currentUser: User | null }) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: string } | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const docRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    apiPost(SOCIAL_URL, { action: "chat_list" }).then((r) => {
      setConvs((r.data.conversations as Conversation[]) || []);
      setLoadingConvs(false);
    });
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Push уведомления
  useEffect(() => {
    if (!("Notification" in window) || !currentUser) return;
    if (Notification.permission === "default") Notification.requestPermission();
  }, [currentUser]);

  const openConv = async (conv: Conversation) => {
    setActiveConv(conv);
    setShowMobileChat(true);
    setLoadingMsgs(true);
    const r = await apiPost(SOCIAL_URL, { action: "chat_messages", conv_id: conv.id });
    setMessages((r.data.messages as ChatMessage[]) || []);
    setLoadingMsgs(false);
  };

  const sendMessage = async (mediaUrl = "", mediaType = "") => {
    if (!activeConv) return;
    if (!newMsg.trim() && !mediaUrl) return;
    const r = await apiPost(SOCIAL_URL, {
      action: "chat_send", partner_id: activeConv.partner.id,
      text: newMsg.trim(), media_url: mediaUrl, media_type: mediaType,
    });
    if (r.ok && r.data.message) {
      setMessages((prev) => [...prev, r.data.message as ChatMessage]);
      setNewMsg("");
      setConvs((prev) => prev.map((c) => c.id === activeConv.id
        ? { ...c, last_message: newMsg.trim() || "📎 Вложение", last_at: new Date().toISOString() } : c));
    }
  };

  const handleFileSend = async (e: React.ChangeEvent<HTMLInputElement>, isDoc = false) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv) return;
    setSendingMedia(true);
    const b64 = await readFileAsBase64(file);
    let fileType = file.type;
    if (isDoc && !fileType) fileType = "application/octet-stream";
    const mediaType = fileType.startsWith("video/") ? "video" : fileType.startsWith("image/") ? "image" : "document";
    const r = await apiPost(SOCIAL_URL, { action: "upload_media", file_data: b64, file_type: fileType });
    setSendingMedia(false);
    if (r.ok) await sendMessage(r.data.url as string, mediaType);
    e.target.value = "";
  };

  const myInitials = currentUser ? getInitials(currentUser.full_name) : "?";

  const ConvList = () => (
    <div className="flex-1 overflow-y-auto">
      {loadingConvs && [1,2,3].map((i) => <div key={i} className="h-16 mx-3 my-1 rounded-lg shimmer" />)}
      {!loadingConvs && convs.length === 0 && (
        <div className="text-center py-10 px-4" style={{ color: "hsl(220,15%,55%)" }}>
          <Icon name="MessageSquare" size={28} className="mx-auto mb-2 opacity-30" />
          <div className="text-xs">Найдите людей в Поиске и начните диалог</div>
        </div>
      )}
      {convs.map((conv) => (
        <button key={conv.id}
          className={`w-full px-3 py-3 flex items-center gap-3 text-left transition-colors border-b ${activeConv?.id === conv.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
          style={{ borderColor: "hsl(216,20%,93%)" }}
          onClick={() => openConv(conv)}>
          <Avatar initials={conv.partner.initials} avatarUrl={conv.partner.avatar_url} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-medium text-xs">{conv.partner.full_name}</span>
              <span className="text-xs" style={{ color: "hsl(220,15%,60%)" }}>{timeAgo(conv.last_at)}</span>
            </div>
            <div className="text-xs truncate mt-0.5" style={{ color: "hsl(220,15%,55%)" }}>{conv.last_message}</div>
          </div>
        </button>
      ))}
    </div>
  );

  const ChatWindow = () => (
    activeConv ? (
      <div className="flex flex-col min-w-0 h-full" style={{ flex: 1 }}>
        {mediaViewer && <MediaViewer url={mediaViewer.url} type={mediaViewer.type} onClose={() => setMediaViewer(null)} />}
        <div className="px-4 py-3 border-b flex items-center gap-3 bg-card flex-shrink-0" style={{ borderColor: "hsl(216,20%,88%)" }}>
          <button className="md:hidden p-1 rounded" style={{ color: "hsl(213,80%,40%)" }} onClick={() => setShowMobileChat(false)}>
            <Icon name="ArrowLeft" size={18} />
          </button>
          <Avatar initials={activeConv.partner.initials} avatarUrl={activeConv.partner.avatar_url} size="sm" />
          <div>
            <div className="font-semibold text-sm">{activeConv.partner.full_name}</div>
            <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{activeConv.partner.job_title}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2" style={{ background: "hsl(216,20%,97%)" }}>
          {loadingMsgs && <div className="text-center text-xs py-4" style={{ color: "hsl(220,15%,60%)" }}>Загрузка...</div>}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex items-end gap-2 ${msg.is_me ? "justify-end" : "justify-start"}`}>
              {!msg.is_me && <Avatar initials={msg.sender_initials} avatarUrl={msg.sender_avatar} size="sm" />}
              <div className={`max-w-xs md:max-w-sm ${msg.is_me ? "message-bubble-me" : "message-bubble-other"}`}>
                {msg.media_url && msg.media_type === "image" && (
                  <img src={msg.media_url} alt="media" className="rounded-lg max-w-full max-h-52 object-cover mb-1 cursor-pointer" onClick={() => setMediaViewer({ url: msg.media_url, type: "image" })} />
                )}
                {msg.media_url && msg.media_type === "video" && (
                  <video src={msg.media_url} controls className="rounded-lg max-w-full max-h-52 mb-1" />
                )}
                {msg.media_url && msg.media_type === "document" && (
                  <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1" style={{ background: "rgba(255,255,255,0.2)" }}>
                    <Icon name="FileText" size={16} />
                    <span className="text-xs truncate">Документ</span>
                  </a>
                )}
                {msg.text && <p className="px-4 py-2.5 text-sm break-words">{msg.text}</p>}
                {!msg.text && msg.media_url && <div className="px-4 pb-1" />}
                <div className="text-xs px-4 pb-2 text-right opacity-70">{timeAgo(msg.created_at)}</div>
              </div>
              {msg.is_me && <Avatar initials={myInitials} avatarUrl={currentUser?.avatar_url} size="sm" />}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-3 py-2.5 border-t bg-card flex items-center gap-2 flex-shrink-0" style={{ borderColor: "hsl(216,20%,88%)" }}>
          <div className="flex gap-1">
            <button className="p-2 rounded-lg hover:bg-muted" onClick={() => fileRef.current?.click()} disabled={sendingMedia} title="Фото/Видео" style={{ color: "hsl(220,15%,50%)" }}>
              {sendingMedia ? <Icon name="Loader" size={16} className="animate-spin" /> : <Icon name="Image" size={16} />}
            </button>
            <button className="p-2 rounded-lg hover:bg-muted" onClick={() => docRef.current?.click()} disabled={sendingMedia} title="Документ" style={{ color: "hsl(220,15%,50%)" }}>
              <Icon name="Paperclip" size={16} />
            </button>
          </div>
          <input
            className="flex-1 px-4 py-2 rounded-full border text-sm outline-none focus:border-blue-400"
            style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)" }}
            placeholder="Написать сообщение..."
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          />
          <button className="btn-primary px-3 py-2 rounded-full flex-shrink-0" onClick={() => sendMessage()} disabled={!newMsg.trim()}>
            <Icon name="Send" size={15} />
          </button>
        </div>
      </div>
    ) : (
      <div className="flex-1 hidden md:flex items-center justify-center" style={{ color: "hsl(220,15%,60%)" }}>
        <div className="text-center">
          <Icon name="MessageSquare" size={40} className="mx-auto mb-3 opacity-30" />
          <div className="text-sm font-medium mb-1">Выберите диалог</div>
          <div className="text-xs">Или найдите человека через Поиск</div>
        </div>
      </div>
    )
  );

  return (
    <div className="flex" style={{ height: "calc(100vh - 3rem)" }}>
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleFileSend(e, false)} />
      <input ref={docRef} type="file" accept="*/*" className="hidden" onChange={(e) => handleFileSend(e, true)} />

      {/* Список диалогов — скрыт на мобилке когда открыт чат */}
      <div className={`w-full md:w-72 flex-shrink-0 border-r flex flex-col ${showMobileChat ? "hidden md:flex" : "flex"}`} style={{ borderColor: "hsl(216,20%,88%)" }}>
        <div className="px-3 py-3 border-b flex-shrink-0" style={{ borderColor: "hsl(216,20%,88%)" }}>
          <div className="relative">
            <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(220,15%,60%)" }} />
            <input className="w-full pl-8 pr-3 py-2 rounded-md border text-xs outline-none bg-card" style={{ borderColor: "hsl(216,20%,87%)", color: "hsl(220,30%,20%)" }} placeholder="Поиск диалогов..." />
          </div>
        </div>
        <ConvList />
      </div>

      {/* Чат — полный экран на мобилке */}
      <div className={`flex-1 min-w-0 ${showMobileChat ? "flex flex-col fixed inset-0 z-40 bg-white md:static md:z-auto" : "hidden md:flex md:flex-col"}`}
        style={showMobileChat ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : {}}>
        <ChatWindow />
      </div>
    </div>
  );
}

function EditProfileModal({
  user,
  onClose,
  onSave,
}: {
  user: User;
  onClose: () => void;
  onSave: (updated: User) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [jobTitle, setJobTitle] = useState(user.job_title);
  const [bio, setBio] = useState(user.bio);
  const [socialVk, setSocialVk] = useState(user.social_vk || "");
  const [socialTg, setSocialTg] = useState(user.social_tg || "");
  const [socialLi, setSocialLi] = useState(user.social_linkedin || "");
  const [socialIg, setSocialIg] = useState(user.social_instagram || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!fullName.trim()) { setError("Имя не может быть пустым"); return; }
    setLoading(true); setError("");
    const token = localStorage.getItem("nexus_token") || "";
    const [r1, r2] = await Promise.all([
      fetch(AUTH_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Auth-Token": token },
        body: JSON.stringify({ action: "update_profile", full_name: fullName.trim(), job_title: jobTitle.trim(), bio: bio.trim() }) }),
      apiPost(SOCIAL_URL, { action: "update_socials", social_vk: socialVk.trim(), social_tg: socialTg.trim(),
        social_linkedin: socialLi.trim(), social_instagram: socialIg.trim() }),
    ]);
    const text = await r1.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (typeof json === "string") { try { json = JSON.parse(json as string); } catch { /* ignore */ } }
    setLoading(false);
    if (!r1.ok) { setError((json.error as string) || "Ошибка сохранения"); return; }
    const updated = { ...(json as unknown as User), social_vk: socialVk, social_tg: socialTg, social_linkedin: socialLi, social_instagram: socialIg };
    localStorage.setItem("nexus_user", JSON.stringify(updated));
    onSave(updated);
    if (r2.ok) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,15,30,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-xl p-6 section-enter"
        style={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(216,20%,88%)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-base">Редактировать профиль</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
            style={{ color: "hsl(220,15%,55%)" }}
          >
            <Icon name="X" size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "hsl(220,15%,45%)" }}>Имя и фамилия *</label>
            <input
              className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none focus:border-blue-400 transition-all"
              style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)" }}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Иван Иванов"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "hsl(220,15%,45%)" }}>Должность</label>
            <input
              className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none focus:border-blue-400 transition-all"
              style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)" }}
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Генеральный директор"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "hsl(220,15%,45%)" }}>О себе</label>
            <textarea
              className="w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none focus:border-blue-400 transition-all resize-none"
              style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)" }}
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Расскажите о своём опыте и специализации..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "hsl(220,15%,45%)" }}>Социальные сети</label>
            <div className="space-y-2">
              {[
                { label: "ВКонтакте (username)", val: socialVk, set: setSocialVk, ph: "username" },
                { label: "Telegram (username)", val: socialTg, set: setSocialTg, ph: "username" },
                { label: "LinkedIn (username)", val: socialLi, set: setSocialLi, ph: "username" },
                { label: "Instagram (username)", val: socialIg, set: setSocialIg, ph: "username" },
              ].map((s) => (
                <input key={s.label}
                  className="w-full px-3.5 py-2 rounded-lg border text-sm outline-none focus:border-blue-400 transition-all"
                  style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)" }}
                  placeholder={`${s.label}`}
                  value={s.val}
                  onChange={(e) => s.set(e.target.value.replace(/^@/, ""))}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="px-3.5 py-2.5 rounded-lg text-sm" style={{ background: "hsl(0,80%,97%)", color: "hsl(0,72%,40%)", border: "1px solid hsl(0,72%,88%)" }}>
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="btn-outline flex-1 py-2.5"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="btn-primary flex-1 py-2.5"
              style={{ opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilePage({ user, onUserUpdate, onOpenProfile, onStartChat }: { user?: User; onUserUpdate?: (u: User) => void; onOpenProfile?: (uid: number) => void; onStartChat?: (uid: number) => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postView, setPostView] = useState<"grid" | "list">("grid");
  const [followersModal, setFollowersModal] = useState<"followers" | "following" | null>(null);
  const [followUsers, setFollowUsers] = useState<{ id: number; full_name: string; job_title: string; avatar_url: string; initials: string; is_following: boolean }[]>([]);
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: string } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const displayName = user?.full_name || "Пользователь";
  const displayTitle = user?.job_title || "Участник сети";
  const displayBio = user?.bio || "";
  const displayInitials = getInitials(displayName);

  useEffect(() => {
    if (!user?.id) return;
    apiPost(SOCIAL_URL, { action: "get_stats" }).then((r) => {
      if (r.ok) setStats(r.data as unknown as UserStats);
    });
    setLoadingPosts(true);
    apiPost(POSTS_URL, { action: "user_posts", user_id: user.id }).then((r) => {
      setUserPosts((r.data.posts as Post[]) || []);
      setLoadingPosts(false);
    });
  }, [user?.id]);

  const uploadWithProgress = async (file: File, action: string, resultKey: string) => {
    setUploadPercent(10);
    const b64 = await readFileAsBase64(file);
    setUploadPercent(50);
    const r = await apiPost(SOCIAL_URL, { action, file_data: b64, file_type: file.type });
    setUploadPercent(100);
    setTimeout(() => setUploadPercent(0), 800);
    return r.ok ? (r.data[resultKey] as string) : null;
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const url = await uploadWithProgress(file, "update_avatar", "avatar_url");
    setUploadingAvatar(false);
    if (url) {
      const updated = { ...user!, avatar_url: url };
      onUserUpdate?.(updated);
      localStorage.setItem("nexus_user", JSON.stringify(updated));
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    const url = await uploadWithProgress(file, "upload_cover", "cover_url");
    setUploadingCover(false);
    if (url) {
      const updated = { ...user!, cover_url: url };
      onUserUpdate?.(updated);
      localStorage.setItem("nexus_user", JSON.stringify(updated));
    }
  };

  const handleDeletePost = (postId: number) => {
    setUserPosts((prev) => prev.filter((p) => p.id !== postId));
    if (stats) setStats({ ...stats, posts: Math.max(0, stats.posts - 1) });
  };

  const openFollowModal = async (type: "followers" | "following") => {
    setFollowersModal(type);
    setFollowUsers([]);
    const action = type === "followers" ? "get_followers" : "get_following";
    const r = await apiPost(POSTS_URL, { action });
    setFollowUsers((r.data.users as typeof followUsers) || []);
  };

  const socials = [
    { key: "social_vk", label: "ВКонтакте", icon: "Globe", color: "hsl(213,90%,50%)", prefix: "https://vk.com/", value: user?.social_vk },
    { key: "social_tg", label: "Telegram", icon: "Send", color: "hsl(200,90%,45%)", prefix: "https://t.me/", value: user?.social_tg },
    { key: "social_linkedin", label: "LinkedIn", icon: "Briefcase", color: "hsl(210,90%,40%)", prefix: "https://linkedin.com/in/", value: user?.social_linkedin },
    { key: "social_instagram", label: "Instagram", icon: "Camera", color: "hsl(320,80%,55%)", prefix: "https://instagram.com/", value: user?.social_instagram },
  ].filter((s) => s.value);

  const mediaOnly = userPosts.filter((p) => p.media_url);
  const allStats = [
    { label: "Подписчиков", value: stats ? stats.followers.toLocaleString("ru") : "…" },
    { label: "Подписок", value: stats ? stats.following.toLocaleString("ru") : "…" },
    { label: "Постов", value: stats ? stats.posts.toLocaleString("ru") : "…" },
    { label: "Просмотров", value: stats ? stats.views.toLocaleString("ru") : "…" },
  ];

  return (
    <>
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
      {editOpen && user && (
        <EditProfileModal user={user} onClose={() => setEditOpen(false)} onSave={(u) => { onUserUpdate?.(u); }} />
      )}
      {mediaViewer && <MediaViewer url={mediaViewer.url} type={mediaViewer.type} onClose={() => setMediaViewer(null)} />}
      {followersModal && (
        <UsersListModal
          title={followersModal === "followers" ? "Подписчики" : "Подписки"}
          users={followUsers}
          onClose={() => setFollowersModal(null)}
          onFollowToggle={(uid, following) => setFollowUsers((prev) => prev.map((u) => u.id === uid ? { ...u, is_following: following } : u))}
          onOpenProfile={onOpenProfile}
          onStartChat={onStartChat}
        />
      )}
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="post-card mb-4 overflow-hidden p-0">
        {/* Cover — кликабельная, загрузка фото */}
        <div className="relative w-full group cursor-pointer" style={{ height: 160 }} onClick={() => coverInputRef.current?.click()}>
          {user?.cover_url
            ? <img src={user.cover_url} alt="cover" className="w-full h-full object-cover" />
            : <div className="w-full h-full" style={{ background: "linear-gradient(135deg, hsl(221,55%,20%) 0%, hsl(213,80%,35%) 100%)" }} />}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.3)" }}>
            {uploadingCover
              ? <Icon name="Loader" size={24} style={{ color: "white" }} className="animate-spin" />
              : <div className="flex flex-col items-center gap-1"><Icon name="Camera" size={24} style={{ color: "white" }} /><span className="text-xs text-white">Изменить обложку</span></div>}
          </div>
          {(uploadingAvatar || uploadingCover) && uploadPercent > 0 && (
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-2">
              <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.3)" }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadPercent}%`, background: "white" }} />
              </div>
              <div className="text-xs text-white text-center mt-0.5">{uploadPercent}%</div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          {/* Avatar row — ниже обложки */}
          <div className="flex items-end justify-between -mt-10 mb-3">
            <div className="relative flex-shrink-0 group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
              {user?.avatar_url
                ? <img src={user.avatar_url} alt={displayInitials} className="w-20 h-20 rounded-full border-4 object-cover" style={{ borderColor: "white" }} />
                : <div className="w-20 h-20 rounded-full border-4 flex items-center justify-center text-xl font-bold text-white" style={{ background: "hsl(213,80%,40%)", borderColor: "white" }}>{displayInitials}</div>}
              <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.45)" }}>
                {uploadingAvatar ? <Icon name="Loader" size={20} style={{ color: "white" }} className="animate-spin" /> : <Icon name="Camera" size={20} style={{ color: "white" }} />}
              </div>
            </div>
            <div className="flex gap-2 items-center pt-1 flex-shrink-0">
              <button className="btn-primary text-xs px-4 py-2" onClick={() => setEditOpen(true)}>Редактировать</button>
            </div>
          </div>

          {/* Name + title */}
          <div className="pt-1 pb-3">
            <h1 className="font-bold text-xl leading-tight">{displayName}</h1>
            <p className="text-sm mt-0.5" style={{ color: "hsl(220,15%,50%)" }}>{displayTitle}</p>
            {socials.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {socials.map((s) => (
                  <a key={s.key} href={`${s.prefix}${s.value}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-opacity hover:opacity-75"
                    style={{ background: `${s.color}15`, color: s.color, border: `1px solid ${s.color}30` }}>
                    <Icon name={s.icon} size={11} />{s.label}
                  </a>
                ))}
              </div>
            )}
            {displayBio && <p className="text-sm mt-2 leading-relaxed" style={{ color: "hsl(220,25%,25%)" }}>{displayBio}</p>}
            {!displayBio && (
              <p className="text-sm mt-2 italic cursor-pointer hover:underline" style={{ color: "hsl(220,15%,65%)" }} onClick={() => setEditOpen(true)}>Добавьте информацию о себе...</p>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1 pt-3 border-t" style={{ borderColor: "hsl(216,20%,90%)" }}>
            {allStats.map((s, i) => (
              <button key={s.label} className="text-center py-1 px-1 rounded-lg hover:bg-gray-50 transition-colors"
                onClick={() => { if (i === 0) openFollowModal("followers"); else if (i === 1) openFollowModal("following"); }}>
                <div className="font-bold text-base leading-tight" style={{ color: "hsl(221,65%,22%)" }}>{s.value}</div>
                <div className="leading-tight mt-0.5" style={{ fontSize: "9px", color: i < 2 ? "hsl(213,80%,40%)" : "hsl(220,15%,55%)" }}>{s.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Analytics */}
      {stats && (
        <div className="post-card mb-4">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Icon name="BarChart2" size={15} style={{ color: "hsl(213,80%,40%)" }} />
            Аналитика
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Просмотры", value: stats.views.toLocaleString("ru"), icon: "Eye" },
              { label: "Охват", value: stats.reach.toLocaleString("ru"), icon: "Users" },
              { label: "Подписчики", value: stats.followers.toLocaleString("ru"), icon: "UserPlus" },
            ].map((m) => (
              <div key={m.label} className="p-3 rounded-lg" style={{ background: "hsl(216,20%,96%)" }}>
                <div className="text-xs mb-1 flex items-center gap-1" style={{ color: "hsl(220,15%,55%)" }}>
                  <Icon name={m.icon} size={11} />{m.label}
                </div>
                <div className="font-bold text-base" style={{ color: "hsl(221,65%,22%)" }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Posts in profile */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-xs uppercase tracking-wider" style={{ color: "hsl(220,15%,50%)" }}>Публикации</h2>
        <div className="flex gap-1">
          <button onClick={() => setPostView("grid")} className={`p-1.5 rounded ${postView === "grid" ? "btn-primary" : "btn-outline"}`}><Icon name="Grid3X3" size={13} /></button>
          <button onClick={() => setPostView("list")} className={`p-1.5 rounded ${postView === "list" ? "btn-primary" : "btn-outline"}`}><Icon name="List" size={13} /></button>
        </div>
      </div>

      {loadingPosts && <div className="h-32 rounded-lg shimmer" />}

      {!loadingPosts && postView === "grid" && (
        <div>
          {mediaOnly.length > 0 && (
            <>
              <div className="text-xs font-medium mb-2" style={{ color: "hsl(220,15%,50%)" }}>Фото и видео</div>
              <div className="grid grid-cols-3 gap-1 mb-4">
                {mediaOnly.map((p) => (
                  <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer"
                    onClick={() => setMediaViewer({ url: p.media_url!, type: p.media_type || "image" })}>
                    {p.media_type === "image"
                      ? <img src={p.media_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center" style={{ background: "hsl(221,25%,18%)" }}>
                          <Icon name="Play" size={24} style={{ color: "white" }} />
                        </div>}
                    {p.media_type === "video" && (
                      <span className="absolute top-1 right-1"><Icon name="Video" size={12} style={{ color: "white" }} /></span>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-2 py-1" style={{ background: "rgba(0,0,0,0.4)", color: "white", fontSize: "10px" }}>
                      <Icon name="Heart" size={10} />{p.likes_count}
                      <Icon name="Eye" size={10} />{p.views_count}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {userPosts.filter((p) => !p.media_url).length > 0 && (
            <>
              <div className="text-xs font-medium mb-2" style={{ color: "hsl(220,15%,50%)" }}>Текстовые посты</div>
              <div className="space-y-2">
                {userPosts.filter((p) => !p.media_url).map((p) => (
                  <div key={p.id} className="post-card py-2 px-4 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: "hsl(220,25%,20%)" }}>{p.text || "—"}</p>
                      <div className="text-xs mt-1 flex items-center gap-3" style={{ color: "hsl(220,15%,60%)" }}>
                        <span>{timeAgo(p.created_at)}</span>
                        <span className="flex items-center gap-1"><Icon name="Heart" size={11} />{p.likes_count}</span>
                        <span className="flex items-center gap-1"><Icon name="Eye" size={11} />{p.views_count}</span>
                      </div>
                    </div>
                    {p.is_mine && (
                      <button className="text-xs px-2 py-1 rounded hover:bg-red-50 flex items-center gap-1" style={{ color: "hsl(0,72%,48%)" }}
                        onClick={async () => { if (!confirm("Удалить?")) return; await apiPost(POSTS_URL, { action: "delete", post_id: p.id }); handleDeletePost(p.id); }}>
                        <Icon name="Trash2" size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {!loadingPosts && userPosts.length === 0 && (
            <div className="post-card text-center py-10" style={{ color: "hsl(220,15%,60%)" }}>
              <Icon name="FileText" size={28} className="mx-auto mb-2 opacity-30" />
              <div className="text-sm">Публикаций пока нет</div>
            </div>
          )}
        </div>
      )}

      {!loadingPosts && postView === "list" && (
        <div className="space-y-4">
          {userPosts.map((p) => (
            <PostCard key={p.id} post={p}
              onLike={async (id) => { const r = await apiPost(POSTS_URL, { action: "like", post_id: id }); if (r.ok) setUserPosts((prev) => prev.map((pp) => pp.id === id ? { ...pp, liked: r.data.liked as boolean, likes_count: r.data.likes_count as number } : pp)); }}
              onCommentAdded={(id) => setUserPosts((prev) => prev.map((pp) => pp.id === id ? { ...pp, comments_count: pp.comments_count + 1 } : pp))}
              onDelete={handleDeletePost}
              userInitials={displayInitials}
              userAvatarUrl={user?.avatar_url}
            />
          ))}
          {userPosts.length === 0 && (
            <div className="post-card text-center py-10" style={{ color: "hsl(220,15%,60%)" }}>
              <Icon name="FileText" size={28} className="mx-auto mb-2 opacity-30" />
              <div className="text-sm">Публикаций пока нет</div>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

function AdminPage() {
  const [data, setData] = useState<{ users: unknown[]; posts: unknown[]; stats: { total_users: number; total_posts: number; total_views: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"stats" | "users" | "posts">("stats");

  useEffect(() => {
    apiPost(POSTS_URL, { action: "admin_data" }).then((r) => {
      if (r.ok) setData(r.data as typeof data);
      setLoading(false);
    });
  }, []);

  const deleteUser = async (uid: number, name: string) => {
    if (!confirm(`Удалить пользователя «${name}»? Все его посты тоже удалятся.`)) return;
    const r = await apiPost(POSTS_URL, { action: "admin_delete_user", user_id: uid });
    if (r.ok) setData((d) => d ? { ...d, users: d.users.filter((u: unknown) => (u as { id: number }).id !== uid) } : d);
  };

  const deletePost = async (pid: number) => {
    if (!confirm("Удалить этот пост?")) return;
    const r = await apiPost(POSTS_URL, { action: "delete", post_id: pid });
    if (r.ok) setData((d) => d ? { ...d, posts: d.posts.filter((p: unknown) => (p as { id: number }).id !== pid) } : d);
  };

  const toggleAdmin = async (uid: number) => {
    const r = await apiPost(POSTS_URL, { action: "admin_toggle", user_id: uid });
    if (r.ok) setData((d) => d ? { ...d, users: d.users.map((u: unknown) => (u as { id: number }).id === uid ? { ...(u as object), is_admin: r.data.is_admin } : u) } : d);
  };

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-10"><div className="h-20 rounded-lg shimmer" /></div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "hsl(0,72%,48%)" }}>
          <Icon name="Shield" size={16} style={{ color: "white" }} />
        </div>
        <h1 className="font-bold text-lg">Панель администратора</h1>
      </div>

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {(["stats", "users", "posts"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-shrink-0 ${tab === t ? "btn-primary text-xs px-4 py-2" : "btn-outline text-xs px-4 py-2"}`}>
            {{ stats: "Статистика", users: "Пользователи", posts: "Посты" }[t]}
          </button>
        ))}
      </div>

      {tab === "stats" && data && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Пользователей", value: data.stats.total_users, icon: "Users", color: "hsl(213,80%,40%)" },
            { label: "Публикаций", value: data.stats.total_posts, icon: "FileText", color: "hsl(142,70%,38%)" },
            { label: "Просмотров", value: data.stats.total_views, icon: "Eye", color: "hsl(270,60%,50%)" },
          ].map((s) => (
            <div key={s.label} className="post-card text-center py-6">
              <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: `${s.color}18` }}>
                <Icon name={s.icon} size={18} style={{ color: s.color }} />
              </div>
              <div className="font-bold text-2xl" style={{ color: "hsl(221,65%,22%)" }}>{s.value.toLocaleString("ru")}</div>
              <div className="text-xs mt-1" style={{ color: "hsl(220,15%,55%)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "users" && data && (
        <div className="post-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 480 }}>
              <thead>
                <tr style={{ background: "hsl(216,20%,96%)" }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: "hsl(220,15%,50%)" }}>Пользователь</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: "hsl(220,15%,50%)" }}>Email</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: "hsl(220,15%,50%)" }}>Постов</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: "hsl(220,15%,50%)" }}>Подп.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: "hsl(220,15%,50%)" }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {(data.users as { id: number; email: string; full_name: string; job_title: string; is_admin: boolean; posts_count: number; followers_count: number }[]).map((u) => (
                  <tr key={u.id} className="border-t" style={{ borderColor: "hsl(216,20%,92%)" }}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm whitespace-nowrap">{u.full_name}</div>
                      <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{u.job_title || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "hsl(220,15%,55%)" }}>{u.email}</td>
                    <td className="px-3 py-3 text-center text-sm">{u.posts_count}</td>
                    <td className="px-3 py-3 text-center text-sm">{u.followers_count}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button title={u.is_admin ? "Снять права" : "Сделать админом"}
                          className="text-xs px-2 py-1 rounded" style={{ background: u.is_admin ? "hsl(0,80%,95%)" : "hsl(216,20%,94%)", color: u.is_admin ? "hsl(0,72%,45%)" : "hsl(220,15%,45%)" }}
                          onClick={() => toggleAdmin(u.id)}>
                          <Icon name={u.is_admin ? "ShieldOff" : "Shield"} size={12} />
                        </button>
                        <button title="Удалить" className="text-xs px-2 py-1 rounded" style={{ background: "hsl(0,80%,95%)", color: "hsl(0,72%,45%)" }}
                          onClick={() => deleteUser(u.id, u.full_name)}>
                          <Icon name="Trash2" size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "posts" && data && (
        <div className="space-y-2">
          {(data.posts as { id: number; text: string; created_at: string; author: string; likes_count: number; views_count: number; media_type: string }[]).map((p) => (
            <div key={p.id} className="post-card flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-xs">{p.author}</span>
                  <span className="text-xs" style={{ color: "hsl(220,15%,62%)" }}>{timeAgo(p.created_at)}</span>
                  {p.media_type && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "hsl(213,80%,94%)", color: "hsl(213,80%,40%)" }}>{p.media_type}</span>}
                </div>
                <p className="text-sm" style={{ color: "hsl(220,25%,22%)" }}>{p.text || "—"}</p>
                <div className="flex gap-3 mt-1 text-xs" style={{ color: "hsl(220,15%,60%)" }}>
                  <span className="flex items-center gap-1"><Icon name="Heart" size={11} />{p.likes_count}</span>
                  <span className="flex items-center gap-1"><Icon name="Eye" size={11} />{p.views_count}</span>
                </div>
              </div>
              <button className="text-xs px-2 py-1 rounded flex-shrink-0" style={{ background: "hsl(0,80%,95%)", color: "hsl(0,72%,45%)" }} onClick={() => deletePost(p.id)}>
                <Icon name="Trash2" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function requestPushPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function sendPushNotification(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
}

export default function Index() {
  const [active, setActive] = useState<Section>("feed");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<number | null>(null);
  // Связанные аккаунты для переключения (токен → user)
  const [linkedAccounts, setLinkedAccounts] = useState<{ token: string; user: User }[]>(() => {
    try { return JSON.parse(localStorage.getItem("nexus_linked_accounts") || "[]"); } catch { return []; }
  });
  // === КЭШ ДАННЫХ — чтобы не перезагружать при переключении вкладок ===
  const [cachedFeed, setCachedFeed] = useState<Post[]>([]);
  const [cachedFriends, setCachedFriends] = useState<SocialUser[]>([]);
  const [cachedNotifs, setCachedNotifs] = useState<Notification[]>([]);
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = localStorage.getItem("nexus_token");
    const saved = localStorage.getItem("nexus_user");
    if (token && saved) {
      try {
        const u = JSON.parse(saved) as User;
        setCurrentUser(u);
        // is_admin определяем только по полю из сохранённого профиля
        if ((u as User & { is_admin?: boolean }).is_admin) setIsAdmin(true);
      } catch { /* ignore */ }
    }
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    // Запрос is_admin только один раз при входе (через auth/me не грузим admin_data)
    const token = localStorage.getItem("nexus_token");
    if (token) {
      fetch(AUTH_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Auth-Token": token }, body: JSON.stringify({ action: "me" }) })
        .then((r) => r.json()).then((j) => {
          try {
            const data = typeof j === "string" ? JSON.parse(j) : j;
            if (data?.is_admin) setIsAdmin(true);
          } catch { /* ignore */ }
        }).catch(() => {});
    }
    requestPushPermission();
    let prevCount = 0;
    const fetchCount = () => {
      apiPost(SOCIAL_URL, { action: "unread_count" }).then((r) => {
        const count = (r.data.count as number) || 0;
        if (count > prevCount && prevCount !== 0 && document.hidden) {
          sendPushNotification("NEXUS", `У вас ${count} новых уведомлений`);
        }
        prevCount = count;
        setUnreadCount(count);
      }).catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  const handleAuth = (user: User, _token: string) => {
    setCurrentUser(user);
    setIsAdmin(!!(user as User & { is_admin?: boolean }).is_admin);
    requestPushPermission();
  };

  const handleLogout = async () => {
    const token = localStorage.getItem("nexus_token");
    if (token) {
      await fetch(AUTH_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Auth-Token": token }, body: JSON.stringify({ action: "logout" }) });
    }
    localStorage.removeItem("nexus_token");
    localStorage.removeItem("nexus_user");
    setCurrentUser(null);
    setIsAdmin(false);
  };

  const navigate = (section: Section) => {
    setActive(section);
    setViewingUserId(null);
    setMobileMenuOpen(false);
    if (section === "notifications") setUnreadCount(0);
  };

  const openUserProfile = (uid: number) => {
    if (uid === currentUser?.id) { setActive("profile"); setViewingUserId(null); return; }
    setViewingUserId(uid);
  };

  const switchAccount = (token: string, user: User) => {
    // Сохранить текущий в linked
    const curToken = localStorage.getItem("nexus_token");
    const curUser = localStorage.getItem("nexus_user");
    if (curToken && curUser) {
      setLinkedAccounts((prev) => {
        const exists = prev.some((a) => a.token === curToken);
        const updated = exists ? prev : [...prev, { token: curToken, user: currentUser! }];
        const filtered = updated.filter((a) => a.token !== token);
        localStorage.setItem("nexus_linked_accounts", JSON.stringify(filtered));
        return filtered;
      });
    }
    localStorage.setItem("nexus_token", token);
    localStorage.setItem("nexus_user", JSON.stringify(user));
    setCurrentUser(user);
    setIsAdmin(!!(user as User & { is_admin?: boolean }).is_admin);
    setActive("feed");
    setViewingUserId(null);
  };

  if (!authChecked) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(221,35%,12%)" }}>
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4" style={{ background: "hsl(213,80%,42%)" }}>
          <span className="text-white font-bold text-lg">N</span>
        </div>
        <div className="text-sm" style={{ color: "hsl(214,25%,50%)" }}>Загрузка...</div>
      </div>
    </div>
  );
  if (!currentUser) return <AuthScreen onAuth={handleAuth} />;

  const userInitials = getInitials(currentUser.full_name);
  const visibleNav = navItems.filter((item) => !item.adminOnly || isAdmin);

  const markLoaded = (tab: string) => setLoadedTabs((prev) => new Set([...prev, tab]));

  const renderPage = () => {
    switch (active) {
      case "feed": return <FeedPage currentUser={currentUser} onOpenProfile={openUserProfile}
        cache={cachedFeed} setCache={setCachedFeed}
        loaded={loadedTabs.has("feed")} onLoaded={() => markLoaded("feed")} />;
      case "friends": return <FriendsPage onOpenProfile={openUserProfile}
        onStartChat={async (uid) => {
          const r = await apiPost(SOCIAL_URL, { action: "chat_start", partner_id: uid });
          if (r.ok) setActive("messages");
        }}
        cache={cachedFriends} setCache={setCachedFriends}
        loaded={loadedTabs.has("friends")} onLoaded={() => markLoaded("friends")} />;
      case "groups": return <GroupsPage currentUser={currentUser} />;
      case "notifications": return <NotificationsPage onOpenProfile={openUserProfile}
        cache={cachedNotifs} setCache={setCachedNotifs}
        loaded={loadedTabs.has("notifications")} onLoaded={() => markLoaded("notifications")} />;
      case "search": return <SearchPage onStartChat={async (uid) => {
        const r = await apiPost(SOCIAL_URL, { action: "chat_start", partner_id: uid });
        if (r.ok) setActive("messages");
      }} onOpenProfile={openUserProfile} />;
      case "messages": return <MessagesPage currentUser={currentUser} />;
      case "profile": return <ProfilePage user={currentUser} onUserUpdate={(u) => { setCurrentUser(u); localStorage.setItem("nexus_user", JSON.stringify(u)); }} onOpenProfile={openUserProfile}
        onStartChat={async (uid) => { const r = await apiPost(SOCIAL_URL, { action: "chat_start", partner_id: uid }); if (r.ok) setActive("messages"); }} />;
      case "admin": return <AdminPage />;
    }
  };

  const SidebarContent = () => (
    <>
      <div className="px-5 py-5 border-b" style={{ borderColor: "hsl(221,25%,20%)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: "hsl(213,80%,42%)" }}>
              <span className="text-white font-bold text-sm font-mono-ibm">C</span>
            </div>
            <div>
              <div className="text-white font-semibold tracking-widest text-sm">CLANSE</div>
              <div className="text-xs" style={{ color: "hsl(214,25%,48%)" }}>Деловая сеть</div>
            </div>
          </div>
          <button className="md:hidden p-1 rounded" style={{ color: "hsl(214,25%,55%)" }} onClick={() => setMobileMenuOpen(false)}>
            <Icon name="X" size={18} />
          </button>
        </div>
      </div>

      <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map((item) => (
          <button key={item.id} onClick={() => navigate(item.id)}
            className={`nav-item w-full text-left ${active === item.id ? "active" : ""}`}>
            <div className="relative flex-shrink-0">
              <Icon name={item.icon} size={17} />
              {item.id === "notifications" && unreadCount > 0 && active !== "notifications" && (
                <span className="notification-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </div>
            <span className="flex-1">{item.label}</span>
            {item.id === "notifications" && unreadCount > 0 && active === "notifications" && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>{unreadCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="px-3 py-4 border-t" style={{ borderColor: "hsl(221,25%,20%)" }}>
        {/* Связанные аккаунты */}
        {linkedAccounts.length > 0 && (
          <div className="mb-2 pt-2 border-t" style={{ borderColor: "hsl(221,25%,20%)" }}>
            <div className="text-xs px-2 mb-1" style={{ color: "hsl(214,25%,38%)" }}>Другие аккаунты</div>
            {linkedAccounts.map((acc) => (
              <button key={acc.token} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors" onClick={() => switchAccount(acc.token, acc.user)}>
                {acc.user.avatar_url
                  ? <img src={acc.user.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: "hsl(213,80%,38%)" }}>{acc.user.full_name.split(" ").map((w) => w[0]).join("").slice(0,2).toUpperCase()}</div>}
                <span className="text-xs truncate" style={{ color: "hsl(214,25%,60%)" }}>{acc.user.full_name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          {currentUser.avatar_url
            ? <img src={currentUser.avatar_url} alt={userInitials} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            : <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0" style={{ background: "hsl(213,80%,42%)" }}>{userInitials}</div>}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate" style={{ color: "hsl(214,30%,88%)" }}>{currentUser.full_name}</div>
            <div className="text-xs truncate" style={{ color: "hsl(214,25%,48%)" }}>{currentUser.job_title || "Участник"}</div>
          </div>
          <button className="opacity-40 hover:opacity-80 transition-opacity" onClick={handleLogout} title="Выйти">
            <Icon name="LogOut" size={14} style={{ color: "hsl(214,30%,72%)" }} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background font-ibm">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-shrink-0 flex-col sidebar-dark">
        <SidebarContent />
      </aside>

      {/* Mobile overlay menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 flex flex-col sidebar-dark h-full shadow-2xl">
            <SidebarContent />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {showCreatePost && currentUser && (
          <CreatePostModal userInitials={userInitials} onClose={() => setShowCreatePost(false)}
            onCreated={() => { setShowCreatePost(false); setActive("feed"); }} />
        )}
        <header className="h-12 flex-shrink-0 flex items-center justify-between px-4 border-b bg-card" style={{ borderColor: "hsl(216,20%,88%)" }}>
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button className="md:hidden w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted" style={{ color: "hsl(220,15%,50%)" }} onClick={() => setMobileMenuOpen(true)}>
              <Icon name="Menu" size={18} />
            </button>
            <h1 className="font-semibold text-sm">{visibleNav.find((n) => n.id === active)?.label}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={() => setShowCreatePost(true)}>
              <Icon name="Plus" size={13} /><span className="hidden sm:inline">Создать пост</span>
            </button>
            <button className="relative w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              style={{ color: "hsl(220,15%,50%)" }} onClick={() => navigate("notifications")}>
              <Icon name="Bell" size={16} />
              {unreadCount > 0 && <span className="notification-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
          </div>
        </header>

        {/* Mobile bottom nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t bg-card" style={{ borderColor: "hsl(216,20%,88%)" }}>
          {visibleNav.filter((i) => i.id !== "admin").slice(0, 5).map((item) => (
            <button key={item.id} onClick={() => navigate(item.id)}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors"
              style={{ color: active === item.id ? "hsl(213,80%,40%)" : "hsl(220,15%,55%)" }}>
              <div className="relative">
                <Icon name={item.icon} size={18} />
                {item.id === "notifications" && unreadCount > 0 && (
                  <span className="notification-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}
              </div>
              <span style={{ fontSize: "9px" }}>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {viewingUserId ? (
            <UserProfilePage userId={viewingUserId} currentUser={currentUser}
              onBack={() => setViewingUserId(null)}
              onOpenProfile={(uid) => setViewingUserId(uid)}
              onOpenChat={async (uid) => {
                const r = await apiPost(SOCIAL_URL, { action: "chat_start", partner_id: uid });
                if (r.ok) { setViewingUserId(null); setActive("messages"); }
              }} />
          ) : (
            <div key={active} className="section-enter h-full">{renderPage()}</div>
          )}
        </div>
      </main>
    </div>
  );
}