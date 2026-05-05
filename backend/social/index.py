"""
Социальные функции: подписки, уведомления, поиск людей.
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

    # --- search users ---
    if action == "search_users" or (method == "GET" and qs.get("q")):
        q = body.get("q") or qs.get("q", "")
        limit = int(qs.get("limit", 20))

        conn = get_conn()
        cur = conn.cursor()

        viewer_id = None
        if token:
            u = get_user_by_token(cur, token)
            if u:
                viewer_id = u[0]

        if q:
            cur.execute(
                f"""
                SELECT u.id, u.full_name, u.job_title,
                    CASE WHEN f.follower_id IS NOT NULL THEN true ELSE false END as is_following
                FROM {SCHEMA}.users u
                LEFT JOIN {SCHEMA}.follows f ON f.follower_id = %s AND f.following_id = u.id
                WHERE (u.full_name ILIKE %s OR u.job_title ILIKE %s)
                  AND u.id != COALESCE(%s, -1)
                ORDER BY u.full_name
                LIMIT %s
                """,
                (viewer_id, f"%{q}%", f"%{q}%", viewer_id, limit)
            )
        else:
            cur.execute(
                f"""
                SELECT u.id, u.full_name, u.job_title,
                    CASE WHEN f.follower_id IS NOT NULL THEN true ELSE false END as is_following
                FROM {SCHEMA}.users u
                LEFT JOIN {SCHEMA}.follows f ON f.follower_id = %s AND f.following_id = u.id
                WHERE u.id != COALESCE(%s, -1)
                ORDER BY u.id DESC
                LIMIT %s
                """,
                (viewer_id, viewer_id, limit)
            )

        rows = cur.fetchall()
        conn.close()

        users = []
        for r in rows:
            uid, full_name, job_title, is_following = r
            initials = "".join(w[0] for w in full_name.split() if w)[:2].upper()
            users.append({
                "id": uid,
                "full_name": full_name,
                "job_title": job_title or "",
                "initials": initials,
                "is_following": is_following,
            })
        return ok({"users": users})

    # --- follow / unfollow ---
    if action in ("follow", "unfollow"):
        if not token:
            return err(401, "Не авторизован")

        target_id = body.get("user_id")
        if not target_id:
            return err(400, "Не указан user_id")

        conn = get_conn()
        cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user:
            conn.close()
            return err(401, "Сессия истекла")

        user_id = user[0]
        if user_id == target_id:
            conn.close()
            return err(400, "Нельзя подписаться на себя")

        if action == "follow":
            cur.execute(
                f"INSERT INTO {SCHEMA}.follows (follower_id, following_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (user_id, target_id)
            )
            # уведомление
            cur.execute(
                f"INSERT INTO {SCHEMA}.notifications (user_id, type, actor_id) VALUES (%s, 'follow', %s) ON CONFLICT DO NOTHING",
                (target_id, user_id)
            )
        else:
            cur.execute(
                f"DELETE FROM {SCHEMA}.follows WHERE follower_id = %s AND following_id = %s",
                (user_id, target_id)
            )

        conn.commit()
        conn.close()
        return ok({"following": action == "follow"})

    # --- get notifications ---
    if action == "get_notifications":
        if not token:
            return err(401, "Не авторизован")

        conn = get_conn()
        cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user:
            conn.close()
            return err(401, "Сессия истекла")

        user_id = user[0]
        cur.execute(
            f"""
            SELECT n.id, n.type, n.is_read, n.created_at,
                   a.full_name, a.job_title,
                   p.text, n.post_id, n.comment_id
            FROM {SCHEMA}.notifications n
            LEFT JOIN {SCHEMA}.users a ON a.id = n.actor_id
            LEFT JOIN {SCHEMA}.posts p ON p.id = n.post_id
            WHERE n.user_id = %s
            ORDER BY n.created_at DESC
            LIMIT 50
            """,
            (user_id,)
        )
        rows = cur.fetchall()

        # пометить как прочитанные
        cur.execute(
            f"UPDATE {SCHEMA}.notifications SET is_read = TRUE WHERE user_id = %s AND is_read = FALSE",
            (user_id,)
        )
        conn.commit()
        conn.close()

        type_labels = {
            "like": "оценил(а) ваш пост",
            "comment": "прокомментировал(а) ваш пост",
            "follow": "подписался(ась) на вас",
        }
        type_icons = {
            "like": "Heart",
            "comment": "MessageCircle",
            "follow": "UserPlus",
        }
        type_colors = {
            "like": "hsl(0,72%,51%)",
            "comment": "hsl(213,80%,40%)",
            "follow": "hsl(142,70%,40%)",
        }

        notifs = []
        for r in rows:
            nid, ntype, is_read, created_at, actor_name, actor_title, post_text, post_id, comment_id = r
            notifs.append({
                "id": nid,
                "type": ntype,
                "is_read": is_read,
                "created_at": str(created_at),
                "actor_name": actor_name or "Пользователь",
                "actor_title": actor_title or "",
                "post_preview": (post_text[:80] + "…") if post_text and len(post_text) > 80 else post_text,
                "post_id": post_id,
                "comment_id": comment_id,
                "label": type_labels.get(ntype, ntype),
                "icon": type_icons.get(ntype, "Bell"),
                "color": type_colors.get(ntype, "hsl(220,15%,50%)"),
            })
        return ok({"notifications": notifs})

    # --- unread count ---
    if action == "unread_count":
        if not token:
            return ok({"count": 0})

        conn = get_conn()
        cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user:
            conn.close()
            return ok({"count": 0})

        cur.execute(
            f"SELECT COUNT(*) FROM {SCHEMA}.notifications WHERE user_id = %s AND is_read = FALSE",
            (user[0],)
        )
        count = cur.fetchone()[0]
        conn.close()
        return ok({"count": count})

    return err(400, "Неизвестное действие")
