"""
Посты: лента, создание, лайки, комментарии, удаление, просмотры, шары, профиль, админ-панель.
"""
import json, os, hashlib
import psycopg2

SCHEMA = "t_p89645412_vk_style_social_desi"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}


def get_conn(): return psycopg2.connect(os.environ["DATABASE_URL"])
def ok(data): return {"statusCode": 200, "headers": CORS, "body": json.dumps(data, ensure_ascii=False, default=str)}
def err(code, msg): return {"statusCode": code, "headers": CORS, "body": json.dumps({"error": msg})}

def get_user_by_token(cur, token):
    cur.execute(f"""
        SELECT u.id, u.full_name, u.job_title, u.is_admin, u.avatar_url
        FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id
        WHERE s.token = %s AND s.expires_at > NOW()""", (token,))
    return cur.fetchone()

def fmt_post(r, viewer_id=None):
    pid, text, tags, likes, comments, views, shares, created_at, uid, full_name, job_title, avatar_url, liked, media_url, media_type = r
    initials = "".join(w[0] for w in full_name.split() if w)[:2].upper()
    return {
        "id": pid, "text": text or "",
        "tags": [t.strip() for t in tags.split(",") if t.strip()] if tags else [],
        "likes_count": likes, "comments_count": comments, "views_count": views,
        "share_count": shares or 0,
        "created_at": str(created_at),
        "author": {"id": uid, "full_name": full_name, "job_title": job_title or "",
                   "initials": initials, "avatar_url": avatar_url or ""},
        "liked": bool(liked), "is_mine": uid == viewer_id,
        "media_url": media_url or "", "media_type": media_type or "",
    }

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    body = {}
    if event.get("body"):
        try: body = json.loads(event["body"])
        except: pass

    token = (event.get("headers") or {}).get("X-Auth-Token", "")
    qs = event.get("queryStringParameters") or {}
    action = body.get("action") or qs.get("action", "")
    ip = (event.get("requestContext") or {}).get("identity", {}).get("sourceIp", "")

    FEED_SELECT = f"""
        SELECT p.id, p.text, p.tags, p.likes_count, p.comments_count, p.views_count,
               COALESCE(p.share_count,0), p.created_at,
               u.id, u.full_name, u.job_title, u.avatar_url,
               CASE WHEN pl.user_id IS NOT NULL THEN true ELSE false END as liked,
               COALESCE(p.media_url,''), COALESCE(p.media_type,'')
        FROM {SCHEMA}.posts p
        JOIN {SCHEMA}.users u ON u.id = p.user_id
        LEFT JOIN {SCHEMA}.post_likes pl ON pl.post_id = p.id AND pl.user_id = %s
    """

    # --- feed ---
    if method == "GET" or action == "feed":
        limit = int(qs.get("limit", 20))
        offset = int(qs.get("offset", 0))
        conn = get_conn(); cur = conn.cursor()
        viewer_id = None
        if token:
            u = get_user_by_token(cur, token)
            if u: viewer_id = u[0]
        cur.execute(FEED_SELECT + " ORDER BY p.created_at DESC LIMIT %s OFFSET %s", (viewer_id, limit, offset))
        rows = cur.fetchall()
        # Считаем просмотры (уникальные по IP+user)
        if rows:
            ip_hash = hashlib.md5(ip.encode()).hexdigest() if ip else ""
            for r in rows:
                pid = r[0]
                cur.execute(
                    f"SELECT 1 FROM {SCHEMA}.post_views WHERE post_id=%s AND (user_id=%s OR ip_hash=%s) LIMIT 1",
                    (pid, viewer_id, ip_hash))
                if not cur.fetchone():
                    cur.execute(f"INSERT INTO {SCHEMA}.post_views (post_id,user_id,ip_hash) VALUES (%s,%s,%s)",
                        (pid, viewer_id, ip_hash))
                    cur.execute(f"UPDATE {SCHEMA}.posts SET views_count=views_count+1, reach_count=reach_count+1 WHERE id=%s", (pid,))
        conn.commit(); conn.close()
        return ok({"posts": [fmt_post(r, viewer_id) for r in rows]})

    # --- user posts (для профиля) ---
    if action == "user_posts":
        uid_param = body.get("user_id") or qs.get("user_id")
        if not uid_param: return err(400, "user_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        viewer_id = None
        if token:
            u = get_user_by_token(cur, token)
            if u: viewer_id = u[0]
        cur.execute(FEED_SELECT + " WHERE p.user_id=%s ORDER BY p.created_at DESC LIMIT 50", (viewer_id, uid_param))
        rows = cur.fetchall(); conn.close()
        return ok({"posts": [fmt_post(r, viewer_id) for r in rows]})

    # --- create post ---
    if action == "create":
        if not token: return err(401, "Не авторизован")
        text = body.get("text", "").strip()
        tags = body.get("tags", "").strip()
        media_url = body.get("media_url", "")
        media_type = body.get("media_type", "")
        if not text and not media_url: return err(400, "Добавьте текст или медиа")
        if len(text) > 3000: return err(400, "Текст слишком длинный (макс 3000)")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        user_id, full_name, job_title = user[0], user[1], user[2]
        cur.execute(f"""INSERT INTO {SCHEMA}.posts (user_id, text, tags, media_url, media_type)
            VALUES (%s,%s,%s,%s,%s) RETURNING id, created_at""", (user_id, text, tags, media_url, media_type))
        post_id, created_at = cur.fetchone()
        conn.commit(); conn.close()
        initials = "".join(w[0] for w in full_name.split() if w)[:2].upper()
        return ok({"post": {
            "id": post_id, "text": text, "tags": [t.strip() for t in tags.split(",") if t.strip()] if tags else [],
            "likes_count": 0, "comments_count": 0, "views_count": 0, "share_count": 0,
            "created_at": str(created_at),
            "author": {"id": user_id, "full_name": full_name, "job_title": job_title or "", "initials": initials, "avatar_url": user[4] if len(user) > 4 else ""},
            "liked": False, "is_mine": True, "media_url": media_url, "media_type": media_type,
        }})

    # --- delete post ---
    if action == "delete":
        if not token: return err(401, "Не авторизован")
        post_id = body.get("post_id")
        if not post_id: return err(400, "post_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        user_id, is_admin = user[0], user[3]
        cur.execute(f"SELECT user_id FROM {SCHEMA}.posts WHERE id=%s", (post_id,))
        row = cur.fetchone()
        if not row: conn.close(); return err(404, "Пост не найден")
        if row[0] != user_id and not is_admin: conn.close(); return err(403, "Нет прав")
        cur.execute(f"DELETE FROM {SCHEMA}.notifications WHERE post_id=%s", (post_id,))
        cur.execute(f"DELETE FROM {SCHEMA}.comments WHERE post_id=%s", (post_id,))
        cur.execute(f"DELETE FROM {SCHEMA}.post_likes WHERE post_id=%s", (post_id,))
        cur.execute(f"DELETE FROM {SCHEMA}.post_views WHERE post_id=%s", (post_id,))
        cur.execute(f"DELETE FROM {SCHEMA}.post_shares WHERE post_id=%s", (post_id,))
        cur.execute(f"DELETE FROM {SCHEMA}.posts WHERE id=%s", (post_id,))
        conn.commit(); conn.close()
        return ok({"deleted": True})

    # --- share post ---
    if action == "share":
        post_id = body.get("post_id")
        if not post_id: return err(400, "post_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        viewer_id = None
        if token:
            u = get_user_by_token(cur, token)
            if u: viewer_id = u[0]
        cur.execute(f"INSERT INTO {SCHEMA}.post_shares (post_id, user_id) VALUES (%s,%s)", (post_id, viewer_id))
        cur.execute(f"UPDATE {SCHEMA}.posts SET share_count=COALESCE(share_count,0)+1 WHERE id=%s RETURNING share_count", (post_id,))
        row = cur.fetchone()
        conn.commit(); conn.close()
        return ok({"share_count": row[0] if row else 0})

    # --- like ---
    if action == "like":
        if not token: return err(401, "Не авторизован")
        post_id = body.get("post_id")
        if not post_id: return err(400, "post_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        user_id = user[0]
        cur.execute(f"SELECT 1 FROM {SCHEMA}.post_likes WHERE user_id=%s AND post_id=%s", (user_id, post_id))
        already = cur.fetchone() is not None
        if already:
            cur.execute(f"DELETE FROM {SCHEMA}.post_likes WHERE user_id=%s AND post_id=%s", (user_id, post_id))
            cur.execute(f"UPDATE {SCHEMA}.posts SET likes_count=GREATEST(0,likes_count-1) WHERE id=%s RETURNING likes_count", (post_id,))
        else:
            cur.execute(f"INSERT INTO {SCHEMA}.post_likes (user_id,post_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (user_id, post_id))
            cur.execute(f"UPDATE {SCHEMA}.posts SET likes_count=likes_count+1 WHERE id=%s RETURNING likes_count", (post_id,))
            cur.execute(f"SELECT user_id FROM {SCHEMA}.posts WHERE id=%s", (post_id,))
            pr = cur.fetchone()
            if pr and pr[0] != user_id:
                cur.execute(f"INSERT INTO {SCHEMA}.notifications (user_id,type,actor_id,post_id) VALUES (%s,'like',%s,%s)", (pr[0], user_id, post_id))
        row = cur.fetchone()
        conn.commit(); conn.close()
        return ok({"liked": not already, "likes_count": row[0] if row else 0})

    # --- get comments ---
    if action == "get_comments":
        post_id = body.get("post_id") or qs.get("post_id")
        if not post_id: return err(400, "post_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        cur.execute(f"""SELECT c.id, c.text, c.created_at, u.id, u.full_name, u.job_title, u.avatar_url
            FROM {SCHEMA}.comments c JOIN {SCHEMA}.users u ON u.id=c.user_id
            WHERE c.post_id=%s ORDER BY c.created_at ASC""", (post_id,))
        rows = cur.fetchall(); conn.close()
        return ok({"comments": [{"id": r[0], "text": r[1], "created_at": str(r[2]),
            "author": {"id": r[3], "full_name": r[4], "job_title": r[5] or "",
                "initials": "".join(w[0] for w in r[4].split() if w)[:2].upper(), "avatar_url": r[6] or ""}} for r in rows]})

    # --- add comment ---
    if action == "add_comment":
        if not token: return err(401, "Не авторизован")
        post_id = body.get("post_id"); text = body.get("text", "").strip()
        if not post_id or not text: return err(400, "post_id и текст обязательны")
        if len(text) > 1000: return err(400, "Комментарий слишком длинный")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        user_id, full_name = user[0], user[1]
        cur.execute(f"INSERT INTO {SCHEMA}.comments (post_id,user_id,text) VALUES (%s,%s,%s) RETURNING id,created_at", (post_id, user_id, text))
        cid, cat = cur.fetchone()
        cur.execute(f"UPDATE {SCHEMA}.posts SET comments_count=comments_count+1 WHERE id=%s", (post_id,))
        cur.execute(f"SELECT user_id FROM {SCHEMA}.posts WHERE id=%s", (post_id,))
        pr = cur.fetchone()
        if pr and pr[0] != user_id:
            cur.execute(f"INSERT INTO {SCHEMA}.notifications (user_id,type,actor_id,post_id,comment_id) VALUES (%s,'comment',%s,%s,%s)", (pr[0], user_id, post_id, cid))
        conn.commit(); conn.close()
        initials = "".join(w[0] for w in full_name.split() if w)[:2].upper()
        return ok({"comment": {"id": cid, "text": text, "created_at": str(cat),
            "author": {"id": user_id, "full_name": full_name, "job_title": user[2] or "",
                "initials": initials, "avatar_url": user[4] if len(user) > 4 else ""}}})

    # --- admin: list all users & posts ---
    if action == "admin_data":
        if not token: return err(401, "Не авторизован")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user or not user[3]: conn.close(); return err(403, "Нет доступа")
        cur.execute(f"""SELECT u.id, u.email, u.full_name, u.job_title, u.is_admin, u.created_at,
            (SELECT COUNT(*) FROM {SCHEMA}.posts WHERE user_id=u.id),
            (SELECT COUNT(*) FROM {SCHEMA}.follows WHERE following_id=u.id)
            FROM {SCHEMA}.users u ORDER BY u.id""")
        users = [{"id": r[0], "email": r[1], "full_name": r[2], "job_title": r[3] or "",
            "is_admin": r[4], "created_at": str(r[5]), "posts_count": r[6], "followers_count": r[7]} for r in cur.fetchall()]
        cur.execute(f"""SELECT p.id, p.text, p.created_at, u.full_name, p.likes_count, p.views_count, p.media_type
            FROM {SCHEMA}.posts p JOIN {SCHEMA}.users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 100""")
        posts = [{"id": r[0], "text": (r[1] or "")[:80], "created_at": str(r[2]),
            "author": r[3], "likes_count": r[4], "views_count": r[5], "media_type": r[6] or ""} for r in cur.fetchall()]
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.users")
        total_users = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.posts")
        total_posts = cur.fetchone()[0]
        cur.execute(f"SELECT COALESCE(SUM(views_count),0) FROM {SCHEMA}.posts")
        total_views = cur.fetchone()[0]
        conn.close()
        return ok({"users": users, "posts": posts, "stats": {"total_users": total_users, "total_posts": total_posts, "total_views": total_views}})

    # --- admin: toggle admin ---
    if action == "admin_toggle":
        if not token: return err(401, "Не авторизован")
        target_id = body.get("user_id")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user or not user[3]: conn.close(); return err(403, "Нет доступа")
        cur.execute(f"UPDATE {SCHEMA}.users SET is_admin=NOT is_admin WHERE id=%s RETURNING is_admin", (target_id,))
        row = cur.fetchone()
        conn.commit(); conn.close()
        return ok({"is_admin": row[0] if row else False})

    # --- admin: delete user ---
    if action == "admin_delete_user":
        if not token: return err(401, "Не авторизован")
        target_id = body.get("user_id")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user or not user[3]: conn.close(); return err(403, "Нет доступа")
        if user[0] == target_id: conn.close(); return err(400, "Нельзя удалить себя")
        cur.execute(f"DELETE FROM {SCHEMA}.notifications WHERE user_id=%s OR actor_id=%s", (target_id, target_id))
        cur.execute(f"DELETE FROM {SCHEMA}.follows WHERE follower_id=%s OR following_id=%s", (target_id, target_id))
        cur.execute(f"DELETE FROM {SCHEMA}.sessions WHERE user_id=%s", (target_id,))
        cur.execute(f"SELECT id FROM {SCHEMA}.posts WHERE user_id=%s", (target_id,))
        pids = [r[0] for r in cur.fetchall()]
        for pid in pids:
            cur.execute(f"DELETE FROM {SCHEMA}.post_likes WHERE post_id=%s", (pid,))
            cur.execute(f"DELETE FROM {SCHEMA}.post_views WHERE post_id=%s", (pid,))
            cur.execute(f"DELETE FROM {SCHEMA}.post_shares WHERE post_id=%s", (pid,))
            cur.execute(f"DELETE FROM {SCHEMA}.comments WHERE post_id=%s", (pid,))
        cur.execute(f"DELETE FROM {SCHEMA}.post_likes WHERE user_id=%s", (target_id,))
        cur.execute(f"DELETE FROM {SCHEMA}.comments WHERE user_id=%s", (target_id,))
        cur.execute(f"DELETE FROM {SCHEMA}.posts WHERE user_id=%s", (target_id,))
        cur.execute(f"DELETE FROM {SCHEMA}.users WHERE id=%s", (target_id,))
        conn.commit(); conn.close()
        return ok({"deleted": True})

    return err(400, "Неизвестное действие")
