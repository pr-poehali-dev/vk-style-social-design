"""
Социальные функции: подписки, уведомления, поиск людей, чат, медиа, аватар. v3
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

def get_user_stats(cur, uid):
    cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.follows WHERE following_id=%s", (uid,))
    followers = cur.fetchone()[0]
    cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.follows WHERE follower_id=%s", (uid,))
    following = cur.fetchone()[0]
    cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.posts WHERE user_id=%s", (uid,))
    posts = cur.fetchone()[0]
    # Уникальные просмотры из post_views (по user_id или ip_hash)
    cur.execute(f"""
        SELECT COUNT(DISTINCT COALESCE(pv.user_id::text, pv.ip_hash))
        FROM {SCHEMA}.post_views pv
        JOIN {SCHEMA}.posts p ON p.id = pv.post_id
        WHERE p.user_id = %s
    """, (uid,))
    views = cur.fetchone()[0]
    # Охват = уникальные пользователи, видевшие посты (без учёта автора)
    cur.execute(f"""
        SELECT COUNT(DISTINCT COALESCE(pv.user_id::text, pv.ip_hash))
        FROM {SCHEMA}.post_views pv
        JOIN {SCHEMA}.posts p ON p.id = pv.post_id
        WHERE p.user_id = %s AND (pv.user_id IS NULL OR pv.user_id != %s)
    """, (uid, uid))
    reach = cur.fetchone()[0]
    return {"followers": int(followers), "following": int(following), "posts": int(posts), "views": int(views), "reach": int(reach)}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    body = {}
    if event.get("body"):
        try: body = json.loads(event["body"])
        except Exception: pass

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

        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.follows WHERE following_id=%s", (target_id,))
        new_count = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return ok({"following": action == "follow", "followers_count": int(new_count)})

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
                   p.text, n.post_id, n.comment_id, n.actor_id
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
            nid, ntype, is_read, created_at, actor_name, actor_title, post_text, post_id, comment_id, actor_id = r
            notifs.append({
                "id": nid,
                "type": ntype,
                "is_read": is_read,
                "created_at": str(created_at),
                "actor_id": actor_id,
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

    # --- typing indicator: set ---
    if action == "typing_set":
        if not token: return err(401, "Не авторизован")
        conv_id = body.get("conv_id")
        if not conv_id: return err(400, "conv_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid, _, _ = user
        cur.execute(f"""INSERT INTO {SCHEMA}.typing_indicators (user_id, conv_id, updated_at)
            VALUES (%s,%s,NOW()) ON CONFLICT (user_id, conv_id) DO UPDATE SET updated_at=NOW()""", (uid, int(conv_id)))
        conn.commit(); conn.close()
        return ok({})

    # --- typing indicator: get ---
    if action == "typing_get":
        if not token: return err(401, "Не авторизован")
        conv_id = body.get("conv_id")
        if not conv_id: return err(400, "conv_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid, _, _ = user
        cur.execute(f"""SELECT user_id FROM {SCHEMA}.typing_indicators
            WHERE conv_id=%s AND user_id != %s AND updated_at > NOW() - INTERVAL '5 seconds'""", (int(conv_id), uid))
        row = cur.fetchone()
        conn.close()
        return ok({"typing": row is not None})

    # --- delete conversation ---
    if action == "chat_delete":
        if not token: return err(401, "Не авторизован")
        conv_id = body.get("conv_id")
        if not conv_id: return err(400, "conv_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        cur.execute(f"SELECT 1 FROM {SCHEMA}.conversations WHERE id=%s AND (user1_id=%s OR user2_id=%s)", (conv_id, uid, uid))
        if not cur.fetchone(): conn.close(); return err(403, "Нет доступа")
        cur.execute(f"UPDATE {SCHEMA}.messages SET text='', media_url='', media_type='' WHERE conversation_id=%s", (conv_id,))
        cur.execute(f"UPDATE {SCHEMA}.conversations SET last_message_at=NOW() WHERE id=%s", (conv_id,))
        conn.commit(); conn.close()
        return ok({"ok": True})

    # --- start conversation ---
    if action == "chat_start":
        if not token: return err(401, "Не авторизован")
        partner_id = body.get("partner_id")
        if not partner_id: return err(400, "partner_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        # Проверяем черный список (в обе стороны)
        cur.execute(f"SELECT 1 FROM {SCHEMA}.blacklist WHERE (user_id=%s AND blocked_id=%s) OR (user_id=%s AND blocked_id=%s)", (uid, int(partner_id), int(partner_id), uid))
        if cur.fetchone(): conn.close(); return err(403, "Переписка с этим пользователем недоступна")
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
        except Exception: return err(400, "Ошибка декодирования")
        if len(data_bytes) > 200 * 1024 * 1024: return err(400, "Файл слишком большой (макс 200 МБ)")
        ext = mimetypes.guess_extension(file_type) or ".bin"
        if ext == ".jpe": ext = ".jpg"
        if ext == ".mpga": ext = ".mp3"
        if not ext or ext == ".None": ext = ".bin"
        key = f"nexus/media/{uuid.uuid4().hex}{ext}"
        s3 = get_s3()
        s3.put_object(Bucket=BUCKET, Key=key, Body=data_bytes, ContentType=file_type)
        if file_type.startswith("video/"):
            media_kind = "video"
        elif file_type.startswith("image/"):
            media_kind = "image"
        else:
            media_kind = "document"
        return ok({"url": f"{cdn_base}/{key}", "media_type": media_kind})

    # --- upload cover ---
    if action == "upload_cover":
        if not token: return err(401, "Не авторизован")
        file_data = body.get("file_data", "")
        file_type = body.get("file_type", "image/jpeg")
        if not file_data: return err(400, "Файл не передан")
        if "," in file_data: file_data = file_data.split(",", 1)[1]
        try: data_bytes = base64.b64decode(file_data)
        except Exception: return err(400, "Ошибка декодирования")
        if len(data_bytes) > 10 * 1024 * 1024: return err(400, "Обложка не более 10 МБ")
        ext = mimetypes.guess_extension(file_type) or ".jpg"
        if ext == ".jpe": ext = ".jpg"
        key = f"nexus/covers/{uuid.uuid4().hex}{ext}"
        s3 = get_s3()
        s3.put_object(Bucket=BUCKET, Key=key, Body=data_bytes, ContentType=file_type)
        url = f"{cdn_base}/{key}"
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        cur.execute(f"UPDATE {SCHEMA}.users SET cover_url=%s WHERE id=%s", (url, user[0]))
        conn.commit(); conn.close()
        return ok({"cover_url": url})

    # --- get profile by user id (чужой профиль) ---
    if action == "get_profile_by_id":
        uid = body.get("user_id") or qs.get("user_id")
        if not uid: return err(400, "user_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        viewer_id = None
        if token:
            u = get_user_by_token(cur, token)
            if u: viewer_id = u[0]
        cur.execute(f"""SELECT u.id, u.full_name, u.job_title, u.bio, u.avatar_url,
            u.social_vk, u.social_tg, u.social_linkedin, u.social_instagram, u.cover_url
            FROM {SCHEMA}.users u WHERE u.id=%s""", (int(uid),))
        row = cur.fetchone()
        if not row: conn.close(); return err(404, "Пользователь не найден")
        stats = get_user_stats(cur, int(uid))
        is_following = False
        if viewer_id and viewer_id != int(uid):
            cur.execute(f"SELECT 1 FROM {SCHEMA}.follows WHERE follower_id=%s AND following_id=%s", (viewer_id, int(uid)))
            is_following = cur.fetchone() is not None
        conn.close()
        return ok({"id": row[0], "full_name": row[1], "job_title": row[2] or "",
            "bio": row[3] or "", "avatar_url": row[4] or "", "cover_url": row[9] or "",
            "social_vk": row[5] or "", "social_tg": row[6] or "",
            "social_linkedin": row[7] or "", "social_instagram": row[8] or "",
            "stats": stats, "is_following": is_following, "is_me": viewer_id == int(uid)})

    # --- update avatar ---
    if action == "update_avatar":
        if not token: return err(401, "Не авторизован")
        file_data = body.get("file_data", "")
        file_type = body.get("file_type", "image/jpeg")
        if not file_data: return err(400, "Файл не передан")
        if "," in file_data: file_data = file_data.split(",", 1)[1]
        try: data_bytes = base64.b64decode(file_data)
        except Exception: return err(400, "Ошибка декодирования")
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
            u.social_vk, u.social_tg, u.social_linkedin, u.social_instagram, u.cover_url
            FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id=s.user_id
            WHERE s.token=%s AND s.expires_at>NOW()""", (token,))
        row = cur.fetchone()
        if not row: conn.close(); return err(401, "Сессия истекла")
        stats = get_user_stats(cur, row[0])
        conn.close()
        return ok({"id": row[0], "email": row[1], "full_name": row[2], "job_title": row[3] or "",
            "bio": row[4] or "", "avatar_url": row[5] or "", "cover_url": row[10] or "",
            "social_vk": row[6] or "", "social_tg": row[7] or "",
            "social_linkedin": row[8] or "", "social_instagram": row[9] or "",
            "stats": stats})

    # --- get stats for any user ---
    if action == "get_stats":
        uid = body.get("user_id") or qs.get("user_id")
        if not uid:
            if not token: return err(401, "Не авторизован")
            conn = get_conn(); cur = conn.cursor()
            u = get_user_by_token(cur, token)
            if not u: conn.close(); return err(401, "Сессия истекла")
            uid = u[0]
        conn = get_conn(); cur = conn.cursor()
        stats = get_user_stats(cur, int(uid))
        # is_following
        viewer_id = None
        if token:
            u2 = get_user_by_token(cur, token)
            if u2: viewer_id = u2[0]
        is_following = False
        if viewer_id and viewer_id != int(uid):
            cur.execute(f"SELECT 1 FROM {SCHEMA}.follows WHERE follower_id=%s AND following_id=%s", (viewer_id, int(uid)))
            is_following = cur.fetchone() is not None
        conn.close()
        return ok({**stats, "is_following": is_following})

    # ==================== GROUPS ====================

    # --- list groups ---
    if action == "groups_list":
        conn = get_conn(); cur = conn.cursor()
        viewer_id = None
        if token:
            u = get_user_by_token(cur, token)
            if u: viewer_id = u[0]
        q = body.get("q", "") or qs.get("q", "")
        if q:
            cur.execute(f"""SELECT g.id, g.name, g.description, g.avatar_url, g.members_count, g.owner_id,
                EXISTS(SELECT 1 FROM {SCHEMA}.group_members WHERE group_id=g.id AND user_id=%s) as is_member
                FROM {SCHEMA}.groups g WHERE g.name ILIKE %s ORDER BY g.members_count DESC LIMIT 50""",
                (viewer_id, f"%{q}%"))
        else:
            cur.execute(f"""SELECT g.id, g.name, g.description, g.avatar_url, g.members_count, g.owner_id,
                EXISTS(SELECT 1 FROM {SCHEMA}.group_members WHERE group_id=g.id AND user_id=%s) as is_member
                FROM {SCHEMA}.groups g ORDER BY g.members_count DESC LIMIT 50""", (viewer_id,))
        rows = cur.fetchall(); conn.close()
        return ok({"groups": [{"id": r[0], "name": r[1], "description": r[2] or "",
            "avatar_url": r[3] or "", "members_count": r[4], "owner_id": r[5],
            "is_member": bool(r[6]), "initials": r[1][:2].upper()} for r in rows]})

    # --- create group ---
    if action == "group_create":
        if not token: return err(401, "Не авторизован")
        name = body.get("name", "").strip()
        desc = body.get("description", "").strip()
        if not name: return err(400, "Название группы обязательно")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        cur.execute(f"INSERT INTO {SCHEMA}.groups (name, description, owner_id) VALUES (%s,%s,%s) RETURNING id", (name, desc, uid))
        gid = cur.fetchone()[0]
        cur.execute(f"INSERT INTO {SCHEMA}.group_members (group_id, user_id, role) VALUES (%s,%s,'owner')", (gid, uid))
        conn.commit(); conn.close()
        return ok({"group": {"id": gid, "name": name, "description": desc, "avatar_url": "", "members_count": 1, "is_member": True, "owner_id": uid, "initials": name[:2].upper()}})

    # --- join / leave group ---
    if action in ("group_join", "group_leave"):
        if not token: return err(401, "Не авторизован")
        gid = body.get("group_id")
        if not gid: return err(400, "group_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        if action == "group_join":
            cur.execute(f"INSERT INTO {SCHEMA}.group_members (group_id, user_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (gid, uid))
            cur.execute(f"UPDATE {SCHEMA}.groups SET members_count=members_count+1 WHERE id=%s RETURNING members_count", (gid,))
        else:
            cur.execute(f"DELETE FROM {SCHEMA}.group_members WHERE group_id=%s AND user_id=%s AND role!='owner'", (gid, uid))
            cur.execute(f"UPDATE {SCHEMA}.groups SET members_count=GREATEST(1,members_count-1) WHERE id=%s RETURNING members_count", (gid,))
        row = cur.fetchone()
        conn.commit(); conn.close()
        return ok({"is_member": action == "group_join", "members_count": row[0] if row else 0})

    # --- group posts ---
    if action == "group_posts":
        gid = body.get("group_id") or qs.get("group_id")
        if not gid: return err(400, "group_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        cur.execute(f"""SELECT gp.id, gp.text, gp.media_url, gp.media_type, gp.likes_count, gp.created_at,
            u.id, u.full_name, u.job_title, u.avatar_url
            FROM {SCHEMA}.group_posts gp JOIN {SCHEMA}.users u ON u.id=gp.user_id
            WHERE gp.group_id=%s ORDER BY gp.created_at DESC LIMIT 50""", (gid,))
        rows = cur.fetchall(); conn.close()
        return ok({"posts": [{"id": r[0], "text": r[1] or "", "media_url": r[2] or "", "media_type": r[3] or "",
            "likes_count": r[4], "created_at": str(r[5]),
            "author": {"id": r[6], "full_name": r[7], "job_title": r[8] or "",
                "avatar_url": r[9] or "", "initials": "".join(w[0] for w in r[7].split() if w)[:2].upper()}} for r in rows]})

    # --- group post create ---
    if action == "group_post_create":
        if not token: return err(401, "Не авторизован")
        gid = body.get("group_id")
        text = body.get("text", "").strip()
        media_url = body.get("media_url", "")
        media_type = body.get("media_type", "")
        if not gid: return err(400, "group_id обязателен")
        if not text and not media_url: return err(400, "Добавьте текст или медиа")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        cur.execute(f"SELECT 1 FROM {SCHEMA}.group_members WHERE group_id=%s AND user_id=%s", (gid, uid))
        if not cur.fetchone(): conn.close(); return err(403, "Вы не состоите в группе")
        cur.execute(f"INSERT INTO {SCHEMA}.group_posts (group_id,user_id,text,media_url,media_type) VALUES (%s,%s,%s,%s,%s) RETURNING id, created_at",
            (gid, uid, text, media_url, media_type))
        pid, cat = cur.fetchone()
        cur.execute(f"UPDATE {SCHEMA}.groups SET posts_count=posts_count+1 WHERE id=%s", (gid,))
        conn.commit(); conn.close()
        return ok({"post": {"id": pid, "text": text, "media_url": media_url, "media_type": media_type,
            "likes_count": 0, "created_at": str(cat),
            "author": {"id": uid, "full_name": user[1], "job_title": user[2] or "",
                "avatar_url": user[4] if len(user) > 4 else "", "initials": "".join(w[0] for w in user[1].split() if w)[:2].upper()}}})

    # --- group members ---
    if action == "group_members":
        gid = body.get("group_id") or qs.get("group_id")
        if not gid: return err(400, "group_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        cur.execute(f"""SELECT u.id, u.full_name, u.job_title, u.avatar_url, gm.role, gm.joined_at
            FROM {SCHEMA}.group_members gm JOIN {SCHEMA}.users u ON u.id=gm.user_id
            WHERE gm.group_id=%s ORDER BY gm.role DESC, gm.joined_at ASC LIMIT 100""", (gid,))
        rows = cur.fetchall(); conn.close()
        return ok({"members": [{"id": r[0], "full_name": r[1], "job_title": r[2] or "",
            "avatar_url": r[3] or "", "role": r[4], "joined_at": str(r[5]),
            "initials": "".join(w[0] for w in r[1].split() if w)[:2].upper()} for r in rows]})

    # --- group posts с liked ---
    if action == "group_posts_v2":
        gid = body.get("group_id") or qs.get("group_id")
        if not gid: return err(400, "group_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token) if token else None
        uid = user[0] if user else None
        cur.execute(f"""SELECT gp.id, gp.text, gp.media_url, gp.media_type, gp.likes_count,
            COALESCE(gp.comments_count,0), gp.created_at,
            u.id, u.full_name, u.job_title, u.avatar_url,
            CASE WHEN %s IS NOT NULL THEN
                EXISTS(SELECT 1 FROM {SCHEMA}.group_post_likes WHERE post_id=gp.id AND user_id=%s)
            ELSE FALSE END as liked,
            gp.user_id
            FROM {SCHEMA}.group_posts gp JOIN {SCHEMA}.users u ON u.id=gp.user_id
            WHERE gp.group_id=%s ORDER BY gp.created_at DESC LIMIT 50""", (uid, uid, gid))
        rows = cur.fetchall(); conn.close()
        return ok({"posts": [{"id": r[0], "text": r[1] or "", "media_url": r[2] or "", "media_type": r[3] or "",
            "likes_count": r[4], "comments_count": r[5], "created_at": str(r[6]),
            "liked": bool(r[11]), "is_mine": uid == r[12],
            "author": {"id": r[7], "full_name": r[8], "job_title": r[9] or "",
                "avatar_url": r[10] or "", "initials": "".join(w[0] for w in r[8].split() if w)[:2].upper()}} for r in rows]})

    # --- group like ---
    if action == "group_like":
        if not token: return err(401, "Не авторизован")
        pid = body.get("post_id")
        if not pid: return err(400, "post_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        cur.execute(f"SELECT 1 FROM {SCHEMA}.group_post_likes WHERE post_id=%s AND user_id=%s", (pid, uid))
        already = cur.fetchone()
        if already:
            cur.execute(f"UPDATE {SCHEMA}.group_posts SET likes_count=GREATEST(0,likes_count-1) WHERE id=%s RETURNING likes_count", (pid,))
            likes = cur.fetchone()[0]
            cur.execute(f"DELETE FROM {SCHEMA}.group_post_likes WHERE post_id=%s AND user_id=%s", (pid, uid))
            liked = False
        else:
            cur.execute(f"INSERT INTO {SCHEMA}.group_post_likes (post_id,user_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (pid, uid))
            cur.execute(f"UPDATE {SCHEMA}.group_posts SET likes_count=likes_count+1 WHERE id=%s RETURNING likes_count", (pid,))
            row = cur.fetchone()
            likes = row[0] if row else 0
            liked = True
        conn.commit(); conn.close()
        return ok({"liked": liked, "likes_count": likes})

    # --- group comment create ---
    if action == "group_comment":
        if not token: return err(401, "Не авторизован")
        pid = body.get("post_id")
        text = body.get("text", "").strip()
        if not pid or not text: return err(400, "post_id и text обязательны")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        cur.execute(f"INSERT INTO {SCHEMA}.group_post_comments (post_id,user_id,text) VALUES (%s,%s,%s) RETURNING id, created_at", (pid, uid, text))
        cid, cat = cur.fetchone()
        cur.execute(f"UPDATE {SCHEMA}.group_posts SET comments_count=COALESCE(comments_count,0)+1 WHERE id=%s", (pid,))
        conn.commit(); conn.close()
        initials = "".join(w[0] for w in user[1].split() if w)[:2].upper()
        return ok({"comment": {"id": cid, "text": text, "created_at": str(cat),
            "author": {"id": uid, "full_name": user[1], "job_title": user[2] or "", "initials": initials, "avatar_url": ""}}})

    # --- group comments list ---
    if action == "group_comments":
        pid = body.get("post_id") or qs.get("post_id")
        if not pid: return err(400, "post_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        cur.execute(f"""SELECT gc.id, gc.text, gc.created_at, u.id, u.full_name, u.job_title, u.avatar_url
            FROM {SCHEMA}.group_post_comments gc JOIN {SCHEMA}.users u ON u.id=gc.user_id
            WHERE gc.post_id=%s ORDER BY gc.created_at ASC LIMIT 100""", (pid,))
        rows = cur.fetchall(); conn.close()
        return ok({"comments": [{"id": r[0], "text": r[1], "created_at": str(r[2]),
            "author": {"id": r[3], "full_name": r[4], "job_title": r[5] or "",
                "avatar_url": r[6] or "", "initials": "".join(w[0] for w in r[4].split() if w)[:2].upper()}} for r in rows]})

    # --- group post delete ---
    if action == "group_post_delete":
        if not token: return err(401, "Не авторизован")
        pid = body.get("post_id")
        if not pid: return err(400, "post_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        cur.execute(f"SELECT user_id, group_id FROM {SCHEMA}.group_posts WHERE id=%s", (pid,))
        row = cur.fetchone()
        if not row: conn.close(); return err(404, "Пост не найден")
        post_uid, gid = row
        # Разрешаем удалять автору поста или владельцу группы
        cur.execute(f"SELECT 1 FROM {SCHEMA}.group_members WHERE group_id=%s AND user_id=%s AND role='owner'", (gid, uid))
        is_owner = cur.fetchone()
        if post_uid != uid and not is_owner: conn.close(); return err(403, "Нет прав на удаление")
        cur.execute(f"UPDATE {SCHEMA}.groups SET posts_count=GREATEST(0,posts_count-1) WHERE id=%s", (gid,))
        cur.execute(f"UPDATE {SCHEMA}.group_posts SET text='', media_url='', media_type='' WHERE id=%s", (pid,))
        # Помечаем как удалённый через обнуление (мягкое удаление)
        cur.execute(f"UPDATE {SCHEMA}.group_posts SET user_id=(SELECT id FROM {SCHEMA}.users ORDER BY id LIMIT 1) WHERE id=%s AND FALSE", (pid,))
        conn.commit()
        # Физически удаляем
        try:
            cur.execute(f"DELETE FROM {SCHEMA}.group_post_comments WHERE post_id=%s", (pid,))
            cur.execute(f"DELETE FROM {SCHEMA}.group_post_likes WHERE post_id=%s", (pid,))
            cur.execute(f"DELETE FROM {SCHEMA}.group_posts WHERE id=%s", (pid,))
            conn.commit()
        except Exception:
            pass
        conn.close()
        return ok({"ok": True})

    # --- blacklist ---
    if action == "blacklist_add":
        if not token: return err(401, "Не авторизован")
        target_id = body.get("user_id")
        if not target_id: return err(400, "user_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        if uid == int(target_id): conn.close(); return err(400, "Нельзя добавить себя")
        cur.execute(f"INSERT INTO {SCHEMA}.blacklist (user_id, blocked_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (uid, int(target_id)))
        cur.execute(f"DELETE FROM {SCHEMA}.follows WHERE (follower_id=%s AND following_id=%s) OR (follower_id=%s AND following_id=%s)", (uid, int(target_id), int(target_id), uid))
        conn.commit(); conn.close()
        return ok({"blocked": True})

    if action == "blacklist_remove":
        if not token: return err(401, "Не авторизован")
        target_id = body.get("user_id")
        if not target_id: return err(400, "user_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        cur.execute(f"DELETE FROM {SCHEMA}.blacklist WHERE user_id=%s AND blocked_id=%s", (uid, int(target_id)))
        conn.commit(); conn.close()
        return ok({"blocked": False})

    if action == "blacklist_list":
        if not token: return err(401, "Не авторизован")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        cur.execute(f"""SELECT u.id, u.full_name, u.job_title, u.avatar_url, b.created_at
            FROM {SCHEMA}.blacklist b JOIN {SCHEMA}.users u ON u.id=b.blocked_id
            WHERE b.user_id=%s ORDER BY b.created_at DESC""", (uid,))
        rows = cur.fetchall(); conn.close()
        return ok({"users": [{"id": r[0], "full_name": r[1], "job_title": r[2] or "",
            "avatar_url": r[3] or "", "blocked_at": str(r[4]),
            "initials": "".join(w[0] for w in r[1].split() if w)[:2].upper()} for r in rows]})

    if action == "blacklist_check":
        if not token: return err(401, "Не авторизован")
        target_id = body.get("user_id")
        if not target_id: return err(400, "user_id обязателен")
        conn = get_conn(); cur = conn.cursor()
        user = get_user_by_token(cur, token)
        if not user: conn.close(); return err(401, "Сессия истекла")
        uid = user[0]
        cur.execute(f"SELECT 1 FROM {SCHEMA}.blacklist WHERE user_id=%s AND blocked_id=%s", (uid, int(target_id)))
        blocked = cur.fetchone() is not None
        conn.close()
        return ok({"blocked": blocked})

    return err(400, "Неизвестное действие")