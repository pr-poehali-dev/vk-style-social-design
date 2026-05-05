import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";

const AUTH_URL = "https://functions.poehali.dev/e7256c2b-25ee-4d8d-a177-79b9ba10f5b5";
const POSTS_URL = "https://functions.poehali.dev/a9e9bed7-8a44-4828-a993-216d5efd7b3d";
const SOCIAL_URL = "https://functions.poehali.dev/1373884d-4344-47b3-a502-a1dfcf1f2028";

function getToken() { return localStorage.getItem("nexus_token") || ""; }

async function apiPost(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-Token": getToken() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (typeof json === "string") { try { json = JSON.parse(json as string); } catch { /* ignore */ } }
  return { ok: res.ok, data: json };
}

async function apiGet(url: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(qs ? `${url}?${qs}` : url, {
    headers: { "X-Auth-Token": getToken() },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (typeof json === "string") { try { json = JSON.parse(json as string); } catch { /* ignore */ } }
  return { ok: res.ok, data: json };
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
}

interface PostAuthor {
  id: number;
  full_name: string;
  job_title: string;
  initials: string;
}

interface Post {
  id: number;
  text: string;
  tags: string[];
  likes_count: number;
  comments_count: number;
  views_count: number;
  created_at: string;
  author: PostAuthor;
  liked: boolean;
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
}

async function apiAuth(action: string, data: Record<string, string>) {
  const res = await fetch(AUTH_URL, {
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
}

function AuthScreen({ onAuth }: { onAuth: (user: User, token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await apiAuth(mode, { email, password, full_name: fullName, job_title: jobTitle });
    setLoading(false);
    if (!result.ok) {
      setError(result.data?.error || "Произошла ошибка");
      return;
    }
    const token = result.data?.token;
    const user = result.data?.user;
    if (token && user) {
      localStorage.setItem("nexus_token", token);
      localStorage.setItem("nexus_user", JSON.stringify(user));
      onAuth(user, token);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(221,35%,12%)" }}>
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4" style={{ background: "hsl(213,80%,42%)" }}>
            <span className="text-white font-bold text-lg font-mono-ibm">N</span>
          </div>
          <h1 className="text-white font-semibold tracking-widest text-xl">NEXUS</h1>
          <p className="text-sm mt-1" style={{ color: "hsl(214,25%,55%)" }}>Деловая профессиональная сеть</p>
        </div>

        <div className="rounded-xl p-8" style={{ background: "hsl(221,30%,16%)", border: "1px solid hsl(221,25%,22%)" }}>
          <div className="flex rounded-lg mb-6 p-1" style={{ background: "hsl(221,35%,10%)" }}>
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className="flex-1 py-2 rounded-md text-sm font-medium transition-all"
                style={mode === m
                  ? { background: "hsl(213,80%,40%)", color: "white" }
                  : { color: "hsl(214,25%,55%)" }
                }
              >
                {m === "login" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "hsl(214,25%,65%)" }}>Имя и фамилия *</label>
                  <input
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all"
                    style={{ background: "hsl(221,35%,10%)", border: "1px solid hsl(221,25%,25%)", color: "hsl(214,30%,90%)" }}
                    placeholder="Андрей Козлов"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "hsl(214,25%,65%)" }}>Должность</label>
                  <input
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all"
                    style={{ background: "hsl(221,35%,10%)", border: "1px solid hsl(221,25%,25%)", color: "hsl(214,30%,90%)" }}
                    placeholder="Директор по развитию"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "hsl(214,25%,65%)" }}>Email *</label>
              <input
                type="email"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{ background: "hsl(221,35%,10%)", border: "1px solid hsl(221,25%,25%)", color: "hsl(214,30%,90%)" }}
                placeholder="email@company.ru"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "hsl(214,25%,65%)" }}>Пароль *</label>
              <input
                type="password"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{ background: "hsl(221,35%,10%)", border: "1px solid hsl(221,25%,25%)", color: "hsl(214,30%,90%)" }}
                placeholder={mode === "register" ? "Минимум 6 символов" : "Введите пароль"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="px-3.5 py-2.5 rounded-lg text-sm" style={{ background: "hsl(0,60%,18%)", color: "hsl(0,80%,75%)", border: "1px solid hsl(0,60%,28%)" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all mt-2"
              style={{ background: loading ? "hsl(213,60%,32%)" : "hsl(213,80%,40%)", color: "white", cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "Подождите..." : mode === "login" ? "Войти" : "Создать аккаунт"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "hsl(214,25%,40%)" }}>
          Nexus © 2026 · Деловая профессиональная сеть
        </p>
      </div>
    </div>
  );
}

type Section = "feed" | "friends" | "notifications" | "search" | "messages" | "profile";

const navItems: { id: Section; label: string; icon: string }[] = [
  { id: "feed", label: "Главная", icon: "LayoutDashboard" },
  { id: "friends", label: "Контакты", icon: "Users" },
  { id: "notifications", label: "Уведомления", icon: "Bell" },
  { id: "search", label: "Поиск", icon: "Search" },
  { id: "messages", label: "Сообщения", icon: "MessageSquare" },
  { id: "profile", label: "Профиль", icon: "User" },
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

function Avatar({ initials, size = "md" }: { initials: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-16 h-16 text-base" };
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
  const [error, setError] = useState("");

  const submit = async () => {
    if (!text.trim()) { setError("Введите текст поста"); return; }
    setLoading(true); setError("");
    const token = localStorage.getItem("nexus_token") || "";
    const res = await fetch(POSTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token },
      body: JSON.stringify({ action: "create", text: text.trim(), tags: tags.trim() }),
    });
    const raw = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(raw); } catch { /* ignore */ }
    if (typeof json === "string") { try { json = JSON.parse(json as string); } catch { /* ignore */ } }
    setLoading(false);
    if (!res.ok) { setError((json.error as string) || "Ошибка создания поста"); return; }
    onCreated((json.post as Post));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,15,30,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
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
            style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)", minHeight: 120 }}
            placeholder="Поделитесь профессиональными мыслями, новостями или опытом..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </div>
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
        <div className="flex justify-between items-center">
          <span className="text-xs" style={{ color: text.length > 2800 ? "hsl(0,72%,51%)" : "hsl(220,15%,60%)" }}>{text.length} / 3000</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-outline text-xs px-4 py-2">Отмена</button>
            <button onClick={submit} disabled={loading || !text.trim()} className="btn-primary text-xs px-4 py-2" style={{ opacity: loading ? 0.7 : 1 }}>
              {loading ? "Публикация..." : "Опубликовать"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostCard({ post, onLike, onCommentAdded, userInitials }: {
  post: Post;
  onLike: (id: number) => void;
  onCommentAdded: (id: number) => void;
  userInitials: string;
}) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="post-card">
      <div className="flex items-start gap-3">
        <Avatar initials={post.author.initials} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{post.author.full_name}</div>
          <div className="text-xs mt-0.5" style={{ color: "hsl(220,15%,55%)" }}>{post.author.job_title}</div>
          <div className="text-xs mt-0.5" style={{ color: "hsl(220,15%,65%)" }}>{timeAgo(post.created_at)}</div>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "hsl(220,25%,20%)" }}>{post.text}</p>
      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {post.tags.map((tag) => <span key={tag} className="stat-badge">#{tag}</span>)}
        </div>
      )}
      <div className="flex items-center justify-between mt-4 pt-3 border-t text-xs" style={{ borderColor: "hsl(216,20%,90%)", color: "hsl(220,15%,55%)" }}>
        <span className="flex items-center gap-1"><Icon name="Eye" size={13} />{post.views_count.toLocaleString("ru")} просмотров</span>
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-1.5 transition-colors" onClick={() => onLike(post.id)} style={{ color: post.liked ? "hsl(0,72%,51%)" : "hsl(220,15%,55%)" }}>
            <Icon name="Heart" size={14} />{post.likes_count}
          </button>
          <button className="flex items-center gap-1.5 transition-colors hover:text-blue-600" onClick={toggleComments} style={{ color: showComments ? "hsl(213,80%,40%)" : "hsl(220,15%,55%)" }}>
            <Icon name="MessageCircle" size={14} />{post.comments_count}
          </button>
          <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
            <Icon name="Share2" size={14} />Поделиться
          </button>
        </div>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: "hsl(216,20%,92%)" }}>
          {loadingComments && <div className="h-8 rounded shimmer" />}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar initials={c.author.initials} size="sm" />
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
            <Avatar initials={userInitials} size="sm" />
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

function FeedPage({ currentUser }: { currentUser: User | null }) {
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const userInitials = currentUser ? getInitials(currentUser.full_name) : "?";

  useEffect(() => {
    apiGet(POSTS_URL).then((r) => {
      setFeedPosts((r.data.posts as Post[]) || []);
      setLoading(false);
    });
  }, []);

  const handleLike = async (postId: number) => {
    const r = await apiPost(POSTS_URL, { action: "like", post_id: postId });
    if (r.ok) {
      setFeedPosts((prev) => prev.map((p) => p.id === postId
        ? { ...p, liked: r.data.liked as boolean, likes_count: r.data.likes_count as number }
        : p
      ));
    }
  };

  const handleCommentAdded = (postId: number) => {
    setFeedPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      {showCreate && currentUser && (
        <CreatePostModal userInitials={userInitials} onClose={() => setShowCreate(false)} onCreated={(p) => { setFeedPosts((prev) => [p, ...prev]); }} />
      )}

      <div className="post-card">
        <div className="flex items-center gap-3">
          <Avatar initials={userInitials} />
          <button className="flex-1 text-left px-4 py-2.5 rounded-full border text-sm transition-colors hover:border-blue-400" style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,15%,55%)" }} onClick={() => setShowCreate(true)}>
            Поделитесь профессиональными новостями...
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t" style={{ borderColor: "hsl(216,20%,90%)" }}>
          <button className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
            <Icon name="FileText" size={13} />Написать пост
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
        <PostCard key={post.id} post={post} onLike={handleLike} onCommentAdded={handleCommentAdded} userInitials={userInitials} />
      ))}
    </div>
  );
}

function FriendsPage() {
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiPost(SOCIAL_URL, { action: "search_users", q: "" }).then((r) => {
      setUsers((r.data.users as SocialUser[]) || []);
      setLoading(false);
    });
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
          <div className="grid grid-cols-2 gap-3">
            {following.map((u) => (
              <div key={u.id} className="post-card flex items-center gap-3">
                <Avatar initials={u.initials} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{u.full_name}</div>
                  <div className="text-xs truncate" style={{ color: "hsl(220,15%,55%)" }}>{u.job_title || "Участник"}</div>
                </div>
                <button className="btn-outline text-xs p-2" onClick={() => toggleFollow(u)} title="Отписаться">
                  <Icon name="UserMinus" size={13} />
                </button>
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
              <div key={u.id} className="post-card flex items-center gap-4">
                <Avatar initials={u.initials} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{u.full_name}</div>
                  <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{u.job_title || "Участник сети"}</div>
                </div>
                <button className="btn-primary text-xs px-4 py-1.5" onClick={() => toggleFollow(u)}>
                  + Подписаться
                </button>
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

function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiPost(SOCIAL_URL, { action: "get_notifications" }).then((r) => {
      setNotifs((r.data.notifications as Notification[]) || []);
      setLoading(false);
    });
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

function SearchPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"people" | "groups">("people");

  useEffect(() => {
    apiGet(SOCIAL_URL, query ? { action: "search_users", q: query } : { action: "search_users" }).then((r) => {
      setUsers((r.data.users as SocialUser[]) || []);
      setLoading(false);
    });
  }, []);

  const handleSearch = async (q: string) => {
    setQuery(q);
    setLoading(true);
    const r = await apiPost(SOCIAL_URL, { action: "search_users", q });
    setUsers((r.data.users as SocialUser[]) || []);
    setLoading(false);
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
          placeholder="Поиск людей по имени или должности..."
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
              <Avatar initials={u.initials} />
              <div className="flex-1">
                <div className="font-medium text-sm">{u.full_name}</div>
                <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{u.job_title || "Участник сети"}</div>
              </div>
              <button
                className={u.is_following ? "btn-outline text-xs px-3 py-1.5" : "btn-primary text-xs px-3 py-1.5"}
                onClick={() => toggleFollow(u)}
              >
                {u.is_following ? "Подписан" : "+ Подписаться"}
              </button>
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
          {[
            { name: "CFO Russia 2026", members: 127, desc: "Сообщество финансовых директоров" },
            { name: "B2B Sales Masters", members: 894, desc: "Лучшие практики B2B продаж" },
            { name: "Tech Leadership", members: 2341, desc: "Технологическое лидерство и трансформация" },
          ].map((g) => (
            <div key={g.name} className="post-card flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: getAvatarColor(g.name) }}>
                {g.name.slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">{g.name}</div>
                <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{g.members.toLocaleString("ru")} участников · {g.desc}</div>
              </div>
              <button className="btn-outline text-xs px-3 py-1.5">Вступить</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessagesPage() {
  const [activeChat, setActiveChat] = useState<number>(1);
  const [newMsg, setNewMsg] = useState("");

  return (
    <div className="flex" style={{ height: "calc(100vh - 3rem)" }}>
      <div className="w-72 flex-shrink-0 border-r overflow-y-auto" style={{ borderColor: "hsl(216,20%,88%)" }}>
        <div className="px-3 py-3 border-b" style={{ borderColor: "hsl(216,20%,88%)" }}>
          <div className="relative">
            <Icon name="Search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(220,15%,60%)" }} />
            <input className="w-full pl-8 pr-3 py-2 rounded-md border text-xs outline-none bg-card" style={{ borderColor: "hsl(216,20%,87%)", color: "hsl(220,30%,20%)" }} placeholder="Поиск чатов..." />
          </div>
        </div>
        {conversations.map((conv) => (
          <button
            key={conv.id}
            className={`w-full px-3 py-3 flex items-center gap-3 text-left transition-colors border-b ${activeChat === conv.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
            style={{ borderColor: "hsl(216,20%,93%)" }}
            onClick={() => setActiveChat(conv.id)}
          >
            <div className="relative">
              <Avatar initials={conv.avatar} size="sm" />
              {conv.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card" style={{ background: "hsl(142,70%,42%)" }} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-xs">{conv.name}</span>
                <span className="text-xs" style={{ color: "hsl(220,15%,60%)" }}>{conv.time}</span>
              </div>
              <div className="text-xs truncate mt-0.5" style={{ color: "hsl(220,15%,55%)" }}>{conv.last}</div>
            </div>
            {conv.unread > 0 && (
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0 font-bold" style={{ background: "hsl(213,80%,40%)", fontSize: "10px" }}>
                {conv.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {(() => {
          const conv = conversations.find((c) => c.id === activeChat)!;
          return (
            <>
              <div className="px-5 py-3 border-b flex items-center gap-3 bg-card flex-shrink-0" style={{ borderColor: "hsl(216,20%,88%)" }}>
                <div className="relative">
                  <Avatar initials={conv.avatar} size="sm" />
                  {conv.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card" style={{ background: "hsl(142,70%,42%)" }} />}
                </div>
                <div>
                  <div className="font-semibold text-sm">{conv.name}</div>
                  <div className="text-xs" style={{ color: conv.online ? "hsl(142,70%,38%)" : "hsl(220,15%,55%)" }}>{conv.online ? "В сети" : "Не в сети"}</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button className="btn-outline p-2"><Icon name="Phone" size={13} /></button>
                  <button className="btn-outline p-2"><Icon name="Video" size={13} /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ background: "hsl(216,20%,97%)" }}>
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.me ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-sm px-4 py-2.5 text-sm ${msg.me ? "message-bubble-me" : "message-bubble-other"}`}>
                      <p>{msg.text}</p>
                      <div className="text-xs mt-1 text-right" style={{ color: msg.me ? "rgba(255,255,255,0.6)" : "hsl(220,15%,60%)" }}>{msg.time}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t bg-card flex items-center gap-2 flex-shrink-0" style={{ borderColor: "hsl(216,20%,88%)" }}>
                <button className="btn-outline p-2"><Icon name="Paperclip" size={15} /></button>
                <input
                  className="flex-1 px-4 py-2 rounded-full border text-sm outline-none focus:border-blue-400"
                  style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)" }}
                  placeholder="Написать сообщение..."
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                />
                <button className="btn-primary px-4 py-2 rounded-full"><Icon name="Send" size={15} /></button>
              </div>
            </>
          );
        })()}
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!fullName.trim()) { setError("Имя не может быть пустым"); return; }
    setLoading(true);
    setError("");
    const token = localStorage.getItem("nexus_token") || "";
    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": token },
      body: JSON.stringify({ action: "update_profile", full_name: fullName.trim(), job_title: jobTitle.trim(), bio: bio.trim() }),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (typeof json === "string") { try { json = JSON.parse(json as string); } catch { /* ignore */ } }
    setLoading(false);
    if (!res.ok) { setError((json.error as string) || "Ошибка сохранения"); return; }
    const updated = json as unknown as User;
    localStorage.setItem("nexus_user", JSON.stringify(updated));
    onSave(updated);
    onClose();
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
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Расскажите о своём опыте и специализации..."
            />
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

function ProfilePage({ user, onUserUpdate }: { user?: User; onUserUpdate?: (u: User) => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const displayName = user?.full_name || "Пользователь";
  const displayTitle = user?.job_title || "Участник сети";
  const displayBio = user?.bio || "";
  const displayInitials = getInitials(displayName);
  const stats = [
    { label: "Подписчиков", value: "1 284" },
    { label: "Подписок", value: "347" },
    { label: "Постов", value: "89" },
    { label: "Просмотров", value: "48.2K" },
  ];

  return (
    <>
      {editOpen && user && (
        <EditProfileModal
          user={user}
          onClose={() => setEditOpen(false)}
          onSave={(u) => { onUserUpdate?.(u); }}
        />
      )}
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="post-card mb-4">
        <div
          className="h-24 rounded-lg -mx-5 -mt-5 mb-4"
          style={{ background: "linear-gradient(135deg, hsl(221,55%,20%) 0%, hsl(213,80%,35%) 100%)" }}
        />
        <div className="flex items-end gap-4 -mt-10 mb-4">
          <div
            className="w-16 h-16 rounded-full border-4 border-card flex items-center justify-center text-base font-bold text-white flex-shrink-0"
            style={{ background: "hsl(213,80%,40%)" }}
          >
            {displayInitials}
          </div>
          <div className="pb-1 flex-1">
            <h1 className="font-bold text-lg">{displayName}</h1>
            <p className="text-sm" style={{ color: "hsl(220,15%,50%)" }}>{displayTitle}</p>
          </div>
          <div className="pb-1 flex gap-2">
            <button className="btn-primary text-xs px-4 py-2" onClick={() => setEditOpen(true)}>Редактировать</button>
            <button className="btn-outline text-xs px-3 py-2"><Icon name="Share2" size={13} /></button>
          </div>
        </div>

        {displayBio ? (
          <p className="text-sm leading-relaxed mb-4" style={{ color: "hsl(220,25%,25%)" }}>{displayBio}</p>
        ) : (
          <p
            className="text-sm leading-relaxed mb-4 italic cursor-pointer hover:underline"
            style={{ color: "hsl(220,15%,65%)" }}
            onClick={() => setEditOpen(true)}
          >
            Добавьте информацию о себе...
          </p>
        )}

        <div className="grid grid-cols-4 gap-3 pt-4 border-t" style={{ borderColor: "hsl(216,20%,90%)" }}>
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-bold text-lg" style={{ color: "hsl(221,65%,22%)" }}>{s.value}</div>
              <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="post-card mb-4">
        <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <Icon name="BarChart2" size={15} style={{ color: "hsl(213,80%,40%)" }} />
          Аналитика за 30 дней
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Просмотры", value: "12 480", change: "+18%", up: true },
            { label: "Охват", value: "8 930", change: "+24%", up: true },
            { label: "Подписчики", value: "+127", change: "-3%", up: false },
          ].map((m) => (
            <div key={m.label} className="p-3 rounded-lg" style={{ background: "hsl(216,20%,96%)" }}>
              <div className="text-xs mb-1" style={{ color: "hsl(220,15%,55%)" }}>{m.label}</div>
              <div className="font-bold text-base" style={{ color: "hsl(221,65%,22%)" }}>{m.value}</div>
              <div className="text-xs font-medium mt-1 flex items-center gap-1" style={{ color: m.up ? "hsl(142,70%,38%)" : "hsl(0,72%,51%)" }}>
                <Icon name={m.up ? "TrendingUp" : "TrendingDown"} size={11} />
                {m.change}
              </div>
            </div>
          ))}
        </div>
      </div>

      <h2 className="font-semibold text-xs uppercase tracking-wider mb-3" style={{ color: "hsl(220,15%,50%)" }}>Публикации</h2>
      <div className="post-card text-center py-10" style={{ color: "hsl(220,15%,60%)" }}>
        <Icon name="FileText" size={28} className="mx-auto mb-2 opacity-30" />
        <div className="text-sm">Публикации появятся здесь</div>
      </div>
    </div>
    </>
  );
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function Index() {
  const [active, setActive] = useState<Section>("feed");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem("nexus_token");
    const saved = localStorage.getItem("nexus_user");
    if (token && saved) {
      try { setCurrentUser(JSON.parse(saved)); } catch { /* ignore */ }
    }
    setAuthChecked(true);
  }, []);

  // Подтягиваем счётчик непрочитанных уведомлений
  useEffect(() => {
    if (!currentUser) return;
    const fetchCount = () => {
      apiPost(SOCIAL_URL, { action: "unread_count" }).then((r) => {
        setUnreadCount((r.data.count as number) || 0);
      });
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleAuth = (user: User, _token: string) => {
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    const token = localStorage.getItem("nexus_token");
    if (token) {
      await fetch(AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Auth-Token": token },
        body: JSON.stringify({ action: "logout" }),
      });
    }
    localStorage.removeItem("nexus_token");
    localStorage.removeItem("nexus_user");
    setCurrentUser(null);
  };

  if (!authChecked) return null;
  if (!currentUser) return <AuthScreen onAuth={handleAuth} />;

  const userInitials = getInitials(currentUser.full_name);

  const renderPage = () => {
    switch (active) {
      case "feed": return <FeedPage currentUser={currentUser} />;
      case "friends": return <FriendsPage />;
      case "notifications": return <NotificationsPage />;
      case "search": return <SearchPage />;
      case "messages": return <MessagesPage />;
      case "profile": return <ProfilePage user={currentUser} onUserUpdate={(u) => { setCurrentUser(u); }} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background font-ibm">
      <aside className="w-60 flex-shrink-0 flex flex-col sidebar-dark">
        <div className="px-5 py-5 border-b" style={{ borderColor: "hsl(221,25%,20%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: "hsl(213,80%,42%)" }}>
              <span className="text-white font-bold text-sm font-mono-ibm">N</span>
            </div>
            <div>
              <div className="text-white font-semibold tracking-widest text-sm">NEXUS</div>
              <div className="text-xs" style={{ color: "hsl(214,25%,48%)" }}>Деловая сеть</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActive(item.id); if (item.id === "notifications") setUnreadCount(0); }}
              className={`nav-item w-full text-left ${active === item.id ? "active" : ""}`}
            >
              <div className="relative flex-shrink-0">
                <Icon name={item.icon} size={17} />
                {item.id === "notifications" && unreadCount > 0 && active !== "notifications" && (
                  <span className="notification-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}
              </div>
              <span className="flex-1">{item.label}</span>
              {item.id === "notifications" && unreadCount > 0 && active === "notifications" && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t" style={{ borderColor: "hsl(221,25%,20%)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0" style={{ background: "hsl(213,80%,42%)" }}>
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate" style={{ color: "hsl(214,30%,88%)" }}>{currentUser.full_name}</div>
              <div className="text-xs truncate" style={{ color: "hsl(214,25%,48%)" }}>{currentUser.job_title || "Участник"}</div>
            </div>
            <button className="opacity-40 hover:opacity-80 transition-opacity" onClick={handleLogout} title="Выйти">
              <Icon name="LogOut" size={14} style={{ color: "hsl(214,30%,72%)" }} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {showCreatePost && currentUser && (
          <CreatePostModal
            userInitials={userInitials}
            onClose={() => setShowCreatePost(false)}
            onCreated={() => { setShowCreatePost(false); setActive("feed"); }}
          />
        )}
        <header className="h-12 flex-shrink-0 flex items-center justify-between px-6 border-b bg-card" style={{ borderColor: "hsl(216,20%,88%)" }}>
          <h1 className="font-semibold text-sm">{navItems.find((n) => n.id === active)?.label}</h1>
          <div className="flex items-center gap-2">
            <button className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={() => setShowCreatePost(true)}>
              <Icon name="Plus" size={13} />Создать пост
            </button>
            <button
              className="relative w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              style={{ color: "hsl(220,15%,50%)" }}
              onClick={() => { setActive("notifications"); setUnreadCount(0); }}
            >
              <Icon name="Bell" size={16} />
              {unreadCount > 0 && (
                <span className="notification-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div key={active} className="section-enter h-full">{renderPage()}</div>
        </div>
      </main>
    </div>
  );
}