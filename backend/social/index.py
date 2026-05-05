"""
Социальные функции: подписки, уведомления, поиск людей, чат, медиа, аватар.
"""
import json, os, base64, uuid, mimetypes
import psycopg2
import boto3

BUCKET = "files"

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
    if method == "GET" and not action:
        action = "search_users"

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

    # ==================== CHAT ====================

    def initials(name): return "".join(w[0] for w in name.split() if w)[:2].upper()

    def get_or_create_conv(cur, uid1, uid2):
        a, b = min(uid1, uid2), max(uid1, uid2)
        cur.execute(f"SELECT id FROM {SCHEMA}.conversations WHERE user1_id=%s AND user2_id=%s", (a, b))
        row = cur.fetchone()
        if row: return row[0]
        cur.execute(f"INSERT INTO {SCHEMA}.conversations (user1_id, user2_id) VALUES (%s,%s) RETURNING id", (a, b))
        return cur.fetchone()[0]

    # --- list conversations ---
    if action == "chat_list":
        if not token: return err(401, "Не авторизован")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        cur.execute(f"""
            SELECT c.id,
                CASE WHEN c.user1_id=%s THEN u2.id ELSE u1.id END,
                CASE WHEN c.user1_id=%s THEN u2.full_name ELSE u1.full_name END,
                CASE WHEN c.user1_id=%s THEN u2.job_title ELSE u1.job_title END,
                CASE WHEN c.user1_id=%s THEN u2.avatar_url ELSE u1.avatar_url END,
                c.last_message_at,
                (SELECT text FROM {SCHEMA}.messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1),
                (SELECT media_type FROM {SCHEMA}.messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1)
            FROM {SCHEMA}.conversations c
            JOIN {SCHEMA}.users u1 ON u1.id=c.user1_id
            JOIN {SCHEMA}.users u2 ON u2.id=c.user2_id
            WHERE c.user1_id=%s OR c.user2_id=%s
            ORDER BY c.last_message_at DESC""", (uid,uid,uid,uid,uid,uid))
        rows = cur.fetchall(); conn.close()
        convs = []
        for r in rows:
            cid, pid, pname, ptitle, pavatar, last_at, last_text, last_media = r
            preview = last_text or ("📎 Медиафайл" if last_media else "Начните диалог")
            convs.append({"id": cid, "partner": {"id": pid, "full_name": pname, "job_title": ptitle or "",
                "initials": initials(pname), "avatar_url": pavatar or ""},
                "last_message": preview, "last_at": str(last_at)})
        return ok({"conversations": convs})

    # --- get messages ---
    if action == "chat_messages":
        if not token: return err(401, "Не авторизован")
        conv_id = body.get("conv_id")
        if not conv_id: return err(400, "conv_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        cur.execute(f"SELECT 1 FROM {SCHEMA}.conversations WHERE id=%s AND (user1_id=%s OR user2_id=%s)", (conv_id, uid, uid))
        if not cur.fetchone(): conn.close(); return err(403, "Нет доступа")
        cur.execute(f"""
            SELECT m.id, m.sender_id, m.text, m.media_url, m.media_type, m.created_at, u.full_name, u.avatar_url
            FROM {SCHEMA}.messages m JOIN {SCHEMA}.users u ON u.id=m.sender_id
            WHERE m.conversation_id=%s ORDER BY m.created_at ASC LIMIT 100""", (conv_id,))
        rows = cur.fetchall(); conn.close()
        msgs = [{"id": r[0], "sender_id": r[1], "text": r[2] or "", "media_url": r[3] or "",
                 "media_type": r[4] or "", "created_at": str(r[5]),
                 "sender_name": r[6], "sender_initials": initials(r[6]),
                 "sender_avatar": r[7] or "", "is_me": r[1] == uid} for r in rows]
        return ok({"messages": msgs})

    # --- send message ---
    if action == "chat_send":
        if not token: return err(401, "Не авторизован")
        partner_id = body.get("partner_id")
        text = body.get("text", "").strip()
        media_url = body.get("media_url", "")
        media_type = body.get("media_type", "")
        if not partner_id: return err(400, "partner_id обязателен")
        if not text and not media_url: return err(400, "Пустое сообщение")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid, uname, _ = user
        conv_id = get_or_create_conv(cur, uid, int(partner_id))
        cur.execute(f"""INSERT INTO {SCHEMA}.messages (conversation_id, sender_id, text, media_url, media_type)
            VALUES (%s,%s,%s,%s,%s) RETURNING id, created_at""", (conv_id, uid, text, media_url, media_type))
        mid, cat = cur.fetchone()
        cur.execute(f"UPDATE {SCHEMA}.conversations SET last_message_at=NOW() WHERE id=%s", (conv_id,))
        conn.commit(); conn.close()
        return ok({"message": {"id": mid, "text": text, "media_url": media_url, "media_type": media_type,
            "created_at": str(cat), "is_me": True, "sender_id": uid,
            "sender_name": uname, "sender_initials": initials(uname), "conv_id": conv_id}})

    # --- start conversation ---
    if action == "chat_start":
        if not token: return err(401, "Не авторизован")
        partner_id = body.get("partner_id")
        if not partner_id: return err(400, "partner_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        conv_id = get_or_create_conv(cur, uid, int(partner_id))
        cur.execute(f"SELECT full_name, job_title, avatar_url FROM {SCHEMA}.users WHERE id=%s", (partner_id,))
        p = cur.fetchone()
        conn.commit(); conn.close()
        if not p: return err(404, "Пользователь не найден")
        return ok({"conv_id": conv_id, "partner": {"id": partner_id, "full_name": p[0],
            "job_title": p[1] or "", "initials": initials(p[0]), "avatar_url": p[2] or ""}})

    # ==================== MEDIA ====================

    def get_s3():
        return boto3.client("s3", endpoint_url="https://bucket.poehali.dev",
            aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"])

    cdn_base = f"https://cdn.poehali.dev/projects/{os.environ.get('AWS_ACCESS_KEY_ID','')}/bucket"

    # --- upload media ---
    if action == "upload_media":
        if not token: return err(401, "Не авторизован")
        file_data = body.get("file_data", "")
        file_type = body.get("file_type", "image/jpeg")
        if not file_data: return err(400, "Файл не передан")
        if "," in file_data: file_data = file_data.split(",", 1)[1]
        try: data_bytes = base64.b64decode(file_data)
        except: return err(400, "Ошибка декодирования")
        if len(data_bytes) > 50 * 1024 * 1024: return err(400, "Файл слишком большой (макс 50 МБ)")
        ext = mimetypes.guess_extension(file_type) or ".bin"
        if ext == ".jpe": ext = ".jpg"
        key = f"nexus/media/{uuid.uuid4().hex}{ext}"
        s3 = get_s3()
        s3.put_object(Bucket=BUCKET, Key=key, Body=data_bytes, ContentType=file_type)
        media_kind = "video" if file_type.startswith("video/") else "image"
        return ok({"url": f"{cdn_base}/{key}", "media_type": media_kind})

    # --- update avatar ---
    if action == "update_avatar":
        if not token: return err(401, "Не авторизован")
        file_data = body.get("file_data", "")
        file_type = body.get("file_type", "image/jpeg")
        if not file_data: return err(400, "Файл не передан")
        if "," in file_data: file_data = file_data.split(",", 1)[1]
        try: data_bytes = base64.b64decode(file_data)
        except: return err(400, "Ошибка декодирования")
        if len(data_bytes) > 5 * 1024 * 1024: return err(400, "Аватар не более 5 МБ")
        ext = mimetypes.guess_extension(file_type) or ".jpg"
        if ext == ".jpe": ext = ".jpg"
        key = f"nexus/avatars/{uuid.uuid4().hex}{ext}"
        s3 = get_s3()
        s3.put_object(Bucket=BUCKET, Key=key, Body=data_bytes, ContentType=file_type)
        url = f"{cdn_base}/{key}"
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        cur.execute(f"UPDATE {SCHEMA}.users SET avatar_url=%s WHERE id=%s", (url, user[0]))
        conn.commit(); conn.close()
        return ok({"avatar_url": url})

    # --- update socials ---
    if action == "update_socials":
        if not token: return err(401, "Не авторизован")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        cur.execute(f"""UPDATE {SCHEMA}.users SET social_vk=%s, social_tg=%s, social_linkedin=%s, social_instagram=%s
            WHERE id=%s""", (body.get("social_vk","").strip(), body.get("social_tg","").strip(),
            body.get("social_linkedin","").strip(), body.get("social_instagram","").strip(), user[0]))
        conn.commit(); conn.close()
        return ok({"ok": True})

    # --- get full profile ---
    if action == "get_profile":
        if not token: return err(401, "Не авторизован")
        conn = get_conn(); cur = conn.cursor()
        cur.execute(f"""SELECT u.id, u.email, u.full_name, u.job_title, u.bio, u.avatar_url,
            u.social_vk, u.social_tg, u.social_linkedin, u.social_instagram
            FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id=s.user_id
            WHERE s.token=%s AND s.expires_at>NOW()""", (token,))
        row = cur.fetchone(); conn.close()
        if not row: return err(401, "Сессия истекла")
        return ok({"id": row[0], "email": row[1], "full_name": row[2], "job_title": row[3] or "",
            "bio": row[4] or "", "avatar_url": row[5] or "",
            "social_vk": row[6] or "", "social_tg": row[7] or "",
            "social_linkedin": row[8] or "", "social_instagram": row[9] or ""})

    return err(400, "Неизвестное действие")