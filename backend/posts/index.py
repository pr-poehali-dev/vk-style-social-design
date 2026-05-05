"""
Посты: создание, получение ленты, лайк/анлайк, инкремент просмотров.
"""
import json
import os
import psycopg2

SCHEMA = "t_p89645412_vk_style_social_desi"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def ok(data):
    return {"statusCode": 200, "headers": CORS, "body": json.dumps(data, ensure_ascii=False, default=str)}


def err(code, message):
    return {"statusCode": code, "headers": CORS, "body": json.dumps({"error": message})}


def get_user_by_token(cur, token):
    cur.execute(
        f"""
        SELECT u.id, u.full_name, u.job_title
        FROM {SCHEMA}.sessions s
        JOIN {SCHEMA}.users u ON u.id = s.user_id
        WHERE s.token = %s AND s.expires_at > NOW()
        """,
        (token,)
    )
    return cur.fetchone()


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    token = (event.get("headers") or {}).get("X-Auth-Token", "")
    qs = event.get("queryStringParameters") or {}
    action = body.get("action") or qs.get("action", "")

    # --- feed: GET / или action=feed ---
    if method == "GET" or action == "feed":
        limit = int(qs.get("limit", 20))
        offset = int(qs.get("offset", 0))

        conn = get_conn()
        cur = conn.cursor()

        # Определяем ID текущего пользователя для проверки лайков
        viewer_id = None
        if token:
            row = get_user_by_token(cur, token)
            if row:
                viewer_id = row[0]

        cur.execute(
            f"""
            SELECT
                p.id, p.text, p.tags, p.likes_count, p.comments_count, p.views_count,
                p.created_at, u.id, u.full_name, u.job_title,
                CASE WHEN pl.user_id IS NOT NULL THEN true ELSE false END as liked
            FROM {SCHEMA}.posts p
            JOIN {SCHEMA}.users u ON u.id = p.user_id
            LEFT JOIN {SCHEMA}.post_likes pl
                ON pl.post_id = p.id AND pl.user_id = %s
            ORDER BY p.created_at DESC
            LIMIT %s OFFSET %s
            """,
            (viewer_id, limit, offset)
        )
        rows = cur.fetchall()

        # Инкремент просмотров для первых постов
        if rows and viewer_id:
            ids = [r[0] for r in rows]
            cur.execute(
                f"UPDATE {SCHEMA}.posts SET views_count = views_count + 1 WHERE id = ANY(%s)",
                (ids,)
            )
            conn.commit()

        conn.close()

        posts = []
        for r in rows:
            pid, text, tags, likes, comments, views, created_at, uid, full_name, job_title, liked = r
            initials = "".join(w[0] for w in full_name.split() if w)[:2].upper()
            posts.append({
                "id": pid,
                "text": text,
                "tags": [t.strip() for t in tags.split(",") if t.strip()] if tags else [],
                "likes_count": likes,
                "comments_count": comments,
                "views_count": views,
                "created_at": str(created_at),
                "author": {"id": uid, "full_name": full_name, "job_title": job_title or "", "initials": initials},
                "liked": liked,
            })

        return ok({"posts": posts})

    # --- create post ---
    if action == "create":
        if not token:
            return err(401, "Не авторизован")

        text = body.get("text", "").strip()
        tags = body.get("tags", "").strip()

        if not text:
            return err(400, "Текст поста не может быть пустым")
        if len(text) > 3000:
            return err(400, "Текст поста слишком длинный (максимум 3000 символов)")

        conn = get_conn()
        cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user:
            conn.close()
            return err(401, "Сессия истекла")

        user_id, full_name, job_title = user
        cur.execute(
            f"INSERT INTO {SCHEMA}.posts (user_id, text, tags) VALUES (%s, %s, %s) RETURNING id, created_at",
            (user_id, text, tags)
        )
        post_id, created_at = cur.fetchone()
        conn.commit()
        conn.close()

        initials = "".join(w[0] for w in full_name.split() if w)[:2].upper()
        return ok({
            "post": {
                "id": post_id,
                "text": text,
                "tags": [t.strip() for t in tags.split(",") if t.strip()] if tags else [],
                "likes_count": 0,
                "comments_count": 0,
                "views_count": 0,
                "created_at": str(created_at),
                "author": {"id": user_id, "full_name": full_name, "job_title": job_title or "", "initials": initials},
                "liked": False,
            }
        })

    # --- toggle like ---
    if action == "like":
        if not token:
            return err(401, "Не авторизован")

        post_id = body.get("post_id")
        if not post_id:
            return err(400, "Не указан post_id")

        conn = get_conn()
        cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user:
            conn.close()
            return err(401, "Сессия истекла")

        user_id = user[0]
        cur.execute(
            f"SELECT 1 FROM {SCHEMA}.post_likes WHERE user_id = %s AND post_id = %s",
            (user_id, post_id)
        )
        already_liked = cur.fetchone() is not None

        if already_liked:
            cur.execute(
                f"DELETE FROM {SCHEMA}.post_likes WHERE user_id = %s AND post_id = %s",
                (user_id, post_id)
            )
            cur.execute(
                f"UPDATE {SCHEMA}.posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = %s RETURNING likes_count",
                (post_id,)
            )
        else:
            cur.execute(
                f"INSERT INTO {SCHEMA}.post_likes (user_id, post_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (user_id, post_id)
            )
            cur.execute(
                f"UPDATE {SCHEMA}.posts SET likes_count = likes_count + 1 WHERE id = %s RETURNING likes_count",
                (post_id,)
            )

        row = cur.fetchone()
        conn.commit()
        conn.close()
        return ok({"liked": not already_liked, "likes_count": row[0] if row else 0})

    return err(400, "Неизвестное действие")
