import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";

const AUTH_URL = "https://functions.poehali.dev/e7256c2b-25ee-4d8d-a177-79b9ba10f5b5";

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

const navItems: { id: Section; label: string; icon: string; badge?: number }[] = [
  { id: "feed", label: "Главная", icon: "LayoutDashboard" },
  { id: "friends", label: "Контакты", icon: "Users", badge: 3 },
  { id: "notifications", label: "Уведомления", icon: "Bell", badge: 7 },
  { id: "search", label: "Поиск", icon: "Search" },
  { id: "messages", label: "Сообщения", icon: "MessageSquare", badge: 2 },
  { id: "profile", label: "Профиль", icon: "User" },
];

const posts = [
  {
    id: 1,
    author: "Марина Соколова",
    role: "Управляющий партнёр, Sokolova Legal",
    avatar: "МС",
    time: "2 ч назад",
    text: "Подписали стратегическое соглашение с ключевыми партнёрами в Европе. Рынок меняется быстрее, чем мы ожидали — важно оставаться гибкими и не упускать момент. Делюсь нашим кейсом адаптации стратегии за 6 месяцев.",
    likes: 148,
    comments: 34,
    views: 2310,
    tags: ["Стратегия", "B2B", "Партнёрство"],
  },
  {
    id: 2,
    author: "Дмитрий Волков",
    role: "CEO, TechVenture Group",
    avatar: "ДВ",
    time: "5 ч назад",
    text: "Три главных ошибки при масштабировании команды от 20 до 200 человек — и как мы их исправляли. Сохраните пост, пригодится тем, кто планирует рост.",
    likes: 312,
    comments: 67,
    views: 5890,
    tags: ["HR", "Масштабирование", "Управление"],
  },
  {
    id: 3,
    author: "Елена Карпова",
    role: "CFO, FinBridge Capital",
    avatar: "ЕК",
    time: "1 д назад",
    text: "Инфляционное давление на операционные расходы во II квартале 2026 — как мы оптимизировали бюджет без потери качества. Кратко о методологии и результатах.",
    likes: 95,
    comments: 18,
    views: 1420,
    tags: ["Финансы", "Оптимизация"],
  },
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

function FeedPage() {
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      <div className="post-card">
        <div className="flex items-center gap-3">
          <Avatar initials="АК" />
          <button
            className="flex-1 text-left px-4 py-2.5 rounded-full border text-sm transition-colors"
            style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,15%,55%)" }}
          >
            Поделитесь профессиональными новостями...
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t" style={{ borderColor: "hsl(216,20%,90%)" }}>
          {[{ icon: "Image", label: "Фото" }, { icon: "BarChart2", label: "Опрос" }, { icon: "FileText", label: "Статья" }].map((btn) => (
            <button key={btn.label} className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
              <Icon name={btn.icon} size={13} />
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {posts.map((post) => (
        <div key={post.id} className="post-card">
          <div className="flex items-start gap-3">
            <Avatar initials={post.avatar} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">{post.author}</div>
                  <div className="text-xs mt-0.5" style={{ color: "hsl(220,15%,55%)" }}>{post.role}</div>
                  <div className="text-xs mt-0.5" style={{ color: "hsl(220,15%,65%)" }}>{post.time}</div>
                </div>
                <button className="btn-primary text-xs px-3 py-1 flex-shrink-0">+ Подписаться</button>
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "hsl(220,25%,20%)" }}>{post.text}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {post.tags.map((tag) => (
              <span key={tag} className="stat-badge">#{tag}</span>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t text-xs" style={{ borderColor: "hsl(216,20%,90%)", color: "hsl(220,15%,55%)" }}>
            <span className="flex items-center gap-1"><Icon name="Eye" size={13} />{post.views.toLocaleString("ru")} просмотров</span>
            <div className="flex items-center gap-4">
              <button
                className="flex items-center gap-1.5 transition-colors"
                onClick={() => setLiked((p) => ({ ...p, [post.id]: !p[post.id] }))}
                style={{ color: liked[post.id] ? "hsl(0,72%,51%)" : "hsl(220,15%,55%)" }}
              >
                <Icon name="Heart" size={14} />
                {liked[post.id] ? post.likes + 1 : post.likes}
              </button>
              <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <Icon name="MessageCircle" size={14} />{post.comments}
              </button>
              <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <Icon name="Share2" size={14} />Поделиться
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FriendsPage() {
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  return (
    <div className="max-w-3xl mx-auto px-4 py-5 space-y-6">
      <div>
        <h2 className="font-semibold text-xs uppercase tracking-wider mb-3" style={{ color: "hsl(220,15%,50%)" }}>Мои контакты</h2>
        <div className="grid grid-cols-2 gap-3">
          {contacts.map((c) => (
            <div key={c.name} className="post-card flex items-center gap-3">
              <div className="relative">
                <Avatar initials={c.avatar} />
                {c.online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card" style={{ background: "hsl(142,70%,42%)" }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{c.name}</div>
                <div className="text-xs truncate" style={{ color: "hsl(220,15%,55%)" }}>{c.role}</div>
                <div className="text-xs mt-0.5" style={{ color: "hsl(220,15%,65%)" }}>{c.mutual} общих</div>
              </div>
              <button className="btn-outline text-xs p-2"><Icon name="MessageSquare" size={13} /></button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className="font-semibold text-xs uppercase tracking-wider mb-3" style={{ color: "hsl(220,15%,50%)" }}>Рекомендации</h2>
        <div className="space-y-2">
          {recommended.map((r) => (
            <div key={r.name} className="post-card flex items-center gap-4">
              <Avatar initials={r.avatar} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{r.name}</div>
                <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{r.role}</div>
                <div className="text-xs mt-0.5" style={{ color: "hsl(220,15%,65%)" }}>{r.mutual} общих контакта</div>
              </div>
              <button
                className={followed[r.name] ? "btn-outline text-xs px-4 py-1.5" : "btn-primary text-xs px-4 py-1.5"}
                onClick={() => setFollowed((p) => ({ ...p, [r.name]: !p[r.name] }))}
              >
                {followed[r.name] ? "Подписан" : "+ Подписаться"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      <div className="space-y-1">
        {notifications.map((n, i) => (
          <div
            key={n.id}
            className={`flex items-start gap-4 px-4 py-3.5 rounded-lg cursor-pointer transition-colors hover:bg-muted ${i < 3 ? "bg-card border border-border" : ""}`}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${n.color}18` }}>
              <Icon name={n.icon} size={18} style={{ color: n.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: "hsl(220,30%,15%)" }}>{n.text}</div>
              {n.sub && <div className="text-xs mt-0.5 truncate" style={{ color: "hsl(220,15%,55%)" }}>{n.sub}</div>}
            </div>
            <div className="text-xs flex-shrink-0 mt-0.5" style={{ color: "hsl(220,15%,60%)" }}>{n.time}</div>
            {i < 3 && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: "hsl(213,80%,40%)" }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"people" | "posts" | "groups">("people");
  const allPeople = [...contacts, ...recommended.map((r) => ({ ...r, online: false }))];
  const filtered = query
    ? allPeople.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.role.toLowerCase().includes(query.toLowerCase()))
    : allPeople;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      <div className="relative mb-4">
        <Icon name="Search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "hsl(220,15%,55%)" }} />
        <input
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm outline-none focus:border-blue-400 transition-all bg-card"
          style={{ borderColor: "hsl(216,20%,85%)", color: "hsl(220,30%,15%)" }}
          placeholder="Поиск людей, постов, групп..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex gap-2 mb-4">
        {(["people", "posts", "groups"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? "btn-primary text-xs px-4 py-1.5" : "btn-outline text-xs px-4 py-1.5"}>
            {{ people: "Люди", posts: "Посты", groups: "Группы" }[t]}
          </button>
        ))}
      </div>

      {tab === "people" && (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.name} className="post-card flex items-center gap-3">
              <Avatar initials={p.avatar} />
              <div className="flex-1">
                <div className="font-medium text-sm">{p.name}</div>
                <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{p.role}</div>
              </div>
              <button className="btn-primary text-xs px-3 py-1.5">+ Подписаться</button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12" style={{ color: "hsl(220,15%,55%)" }}>
              <Icon name="SearchX" size={32} className="mx-auto mb-3 opacity-40" />
              <div className="text-sm">Ничего не найдено</div>
            </div>
          )}
        </div>
      )}

      {tab === "posts" && (
        <div className="space-y-3">
          {posts.filter((p) => !query || p.text.toLowerCase().includes(query.toLowerCase())).map((post) => (
            <div key={post.id} className="post-card">
              <div className="flex items-center gap-2 mb-2">
                <Avatar initials={post.avatar} size="sm" />
                <div>
                  <div className="font-medium text-sm">{post.author}</div>
                  <div className="text-xs" style={{ color: "hsl(220,15%,55%)" }}>{post.time}</div>
                </div>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "hsl(220,25%,20%)" }}>{post.text}</p>
            </div>
          ))}
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
      <div className="space-y-3">
        {posts.slice(0, 2).map((post) => (
          <div key={post.id} className="post-card">
            <p className="text-sm leading-relaxed mb-3" style={{ color: "hsl(220,25%,20%)" }}>{post.text}</p>
            <div className="flex items-center gap-4 text-xs" style={{ color: "hsl(220,15%,55%)" }}>
              <span className="flex items-center gap-1"><Icon name="Eye" size={12} />{post.views.toLocaleString("ru")}</span>
              <span className="flex items-center gap-1"><Icon name="Heart" size={12} />{post.likes}</span>
              <span className="flex items-center gap-1"><Icon name="MessageCircle" size={12} />{post.comments}</span>
              <span className="ml-auto">{post.time}</span>
            </div>
          </div>
        ))}
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

  useEffect(() => {
    const token = localStorage.getItem("nexus_token");
    const saved = localStorage.getItem("nexus_user");
    if (token && saved) {
      try { setCurrentUser(JSON.parse(saved)); } catch { /* ignore */ }
    }
    setAuthChecked(true);
  }, []);

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
      case "feed": return <FeedPage />;
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
              onClick={() => setActive(item.id)}
              className={`nav-item w-full text-left ${active === item.id ? "active" : ""}`}
            >
              <div className="relative flex-shrink-0">
                <Icon name={item.icon} size={17} />
                {item.badge && active !== item.id && (
                  <span className="notification-dot">{item.badge > 9 ? "9+" : item.badge}</span>
                )}
              </div>
              <span className="flex-1">{item.label}</span>
              {item.badge && active === item.id && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
                  {item.badge}
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
        <header className="h-12 flex-shrink-0 flex items-center justify-between px-6 border-b bg-card" style={{ borderColor: "hsl(216,20%,88%)" }}>
          <h1 className="font-semibold text-sm">{navItems.find((n) => n.id === active)?.label}</h1>
          <div className="flex items-center gap-2">
            <button className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5">
              <Icon name="Plus" size={13} />Создать пост
            </button>
            <button
              className="relative w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              style={{ color: "hsl(220,15%,50%)" }}
              onClick={() => setActive("notifications")}
            >
              <Icon name="Bell" size={16} />
              <span className="notification-dot">7</span>
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