"""
Авторизация: регистрация, вход, выход, получение профиля текущего пользователя. v3
"""
import json
import os
import hashlib
import secrets
import psycopg2
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SCHEMA = "t_p89645412_vk_style_social_desi"

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def ok(data: dict) -> dict:
    return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps(data)}


def err(code: int, message: str) -> dict:
    return {"statusCode": code, "headers": CORS_HEADERS, "body": json.dumps({"error": message})}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    token = (event.get("headers") or {}).get("X-Auth-Token", "")

    action = body.get("action", "")
    if "/register" in path:
        action = "register"
    elif "/login" in path:
        action = "login"
    elif "/logout" in path:
        action = "logout"
    elif "/me" in path or (method == "GET" and not action):
        action = "me"

    # --- register ---
    if action == "register":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        full_name = body.get("full_name", "").strip()
        job_title = body.get("job_title", "").strip()

        if not email or not password or not full_name:
            return err(400, "Заполните все обязательные поля")
        if len(password) < 6:
            return err(400, "Пароль должен быть не менее 6 символов")

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE email = %s", (email,))
        if cur.fetchone():
            conn.close()
            return err(409, "Пользователь с таким email уже существует")

        pw_hash = hash_password(password)
        cur.execute(
            f"INSERT INTO {SCHEMA}.users (email, password_hash, full_name, job_title) VALUES (%s, %s, %s, %s) RETURNING id",
            (email, pw_hash, full_name, job_title)
        )
        user_id = cur.fetchone()[0]
        session_token = secrets.token_hex(32)
        cur.execute(
            f"INSERT INTO {SCHEMA}.sessions (token, user_id) VALUES (%s, %s)",
            (session_token, user_id)
        )
        conn.commit()
        conn.close()

        # is_admin по умолчанию false для новых пользователей
        return ok({
            "token": session_token,
            "user": {"id": user_id, "email": email, "full_name": full_name, "job_title": job_title, "bio": "", "is_admin": False, "avatar_url": ""}
        })

    # --- login ---
    if action == "login":
        email = body.get("email", "").strip().lower()
        password = body.get("password", "")
        if not email or not password:
            return err(400, "Введите email и пароль")

        conn = get_conn()
        cur = conn.cursor()
        pw_hash = hash_password(password)
        cur.execute(
            f"SELECT id, full_name, job_title, bio, is_admin, avatar_url FROM {SCHEMA}.users WHERE email = %s AND password_hash = %s",
            (email, pw_hash)
        )
        row = cur.fetchone()
        if not row:
            conn.close()
            return err(401, "Неверный email или пароль")

        user_id, full_name, job_title, bio, is_admin, avatar_url = row
        session_token = secrets.token_hex(32)
        cur.execute(
            f"INSERT INTO {SCHEMA}.sessions (token, user_id) VALUES (%s, %s)",
            (session_token, user_id)
        )
        conn.commit()
        conn.close()

        return ok({
            "token": session_token,
            "user": {"id": user_id, "email": email, "full_name": full_name, "job_title": job_title or "",
                     "bio": bio or "", "is_admin": bool(is_admin), "avatar_url": avatar_url or ""}
        })

    # --- logout ---
    if action == "logout":
        if token:
            conn = get_conn()
            cur = conn.cursor()
            cur.execute(f"UPDATE {SCHEMA}.sessions SET expires_at = NOW() WHERE token = %s", (token,))
            conn.commit()
            conn.close()
        return ok({"ok": True})

    # --- me ---
    if action == "me":
        if not token:
            return err(401, "Не авторизован")

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT u.id, u.email, u.full_name, u.job_title, u.bio, u.is_admin, u.avatar_url
            FROM {SCHEMA}.sessions s
            JOIN {SCHEMA}.users u ON u.id = s.user_id
            WHERE s.token = %s AND s.expires_at > NOW()
            """,
            (token,)
        )
        row = cur.fetchone()
        conn.close()
        if not row:
            return err(401, "Сессия истекла или недействительна")

        user_id, email, full_name, job_title, bio, is_admin, avatar_url = row
        return ok({"id": user_id, "email": email, "full_name": full_name, "job_title": job_title or "",
                   "bio": bio or "", "is_admin": bool(is_admin), "avatar_url": avatar_url or ""})

    # --- update_profile ---
    if action == "update_profile":
        if not token:
            return err(401, "Не авторизован")

        full_name = body.get("full_name", "").strip()
        job_title = body.get("job_title", "").strip()
        bio = body.get("bio", "").strip()

        if not full_name:
            return err(400, "Имя не может быть пустым")

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE {SCHEMA}.users u
            SET full_name = %s, job_title = %s, bio = %s
            FROM {SCHEMA}.sessions s
            WHERE s.token = %s AND s.expires_at > NOW() AND u.id = s.user_id
            RETURNING u.id, u.email, u.full_name, u.job_title, u.bio
            """,
            (full_name, job_title, bio, token)
        )
        row = cur.fetchone()
        conn.commit()
        conn.close()

        if not row:
            return err(401, "Сессия истекла или недействительна")

        user_id, email, fn, jt, b = row
        return ok({"id": user_id, "email": email, "full_name": fn, "job_title": jt or "", "bio": b or ""})

    # --- reset_password_request (запрос кода) ---
    if action == "reset_password_request":
        email = body.get("email", "").strip().lower()
        if not email: return err(400, "Введите email")
        conn = get_conn(); cur = conn.cursor()
        cur.execute(f"SELECT id, full_name FROM {SCHEMA}.users WHERE email=%s", (email,))
        row = cur.fetchone()
        if not row: conn.close(); return err(404, "Пользователь с таким email не найден")
        user_id, full_name = row
        code = secrets.token_hex(3).upper()  # 6-значный hex код
        cur.execute(f"INSERT INTO {SCHEMA}.password_resets (user_id, code) VALUES (%s,%s)", (user_id, code))
        conn.commit(); conn.close()
        # Отправка email с кодом
        smtp_email = os.environ.get("SMTP_EMAIL", "")
        smtp_password = os.environ.get("SMTP_PASSWORD", "")
        email_sent = False
        if smtp_email and smtp_password:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = "Восстановление пароля CLANSE"
                msg["From"] = smtp_email
                msg["To"] = email
                html = f"""
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                  <h2 style="color:#1a6abf">CLANSE</h2>
                  <p>Здравствуйте, <b>{full_name}</b>!</p>
                  <p>Ваш код для сброса пароля:</p>
                  <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1a6abf;background:#f0f5ff;padding:16px;border-radius:8px;text-align:center;margin:16px 0">{code}</div>
                  <p style="color:#666">Код действителен 30 минут. Если вы не запрашивали сброс — просто проигнорируйте это письмо.</p>
                </div>"""
                msg.attach(MIMEText(html, "html"))
                with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                    server.login(smtp_email, smtp_password)
                    server.sendmail(smtp_email, email, msg.as_string())
                email_sent = True
            except Exception:
                pass
        if email_sent:
            return ok({"ok": True, "message": f"Код отправлен на {email}"})
        else:
            # Если email не настроен — показываем код в ответе (демо-режим)
            return ok({"ok": True, "code": code, "message": f"Код для сброса пароля: {code}", "full_name": full_name})

    # --- reset_password_confirm (применение кода) ---
    if action == "reset_password_confirm":
        email = body.get("email", "").strip().lower()
        code = body.get("code", "").strip().upper()
        new_password = body.get("new_password", "")
        if not email or not code or not new_password: return err(400, "Заполните все поля")
        if len(new_password) < 6: return err(400, "Пароль должен быть не менее 6 символов")
        conn = get_conn(); cur = conn.cursor()
        cur.execute(f"SELECT u.id FROM {SCHEMA}.users u JOIN {SCHEMA}.password_resets pr ON pr.user_id=u.id WHERE u.email=%s AND pr.code=%s AND pr.used=FALSE AND pr.expires_at>NOW() ORDER BY pr.created_at DESC LIMIT 1", (email, code))
        row = cur.fetchone()
        if not row: conn.close(); return err(400, "Неверный или истёкший код")
        user_id = row[0]
        pw_hash = hash_password(new_password)
        cur.execute(f"UPDATE {SCHEMA}.users SET password_hash=%s WHERE id=%s", (pw_hash, user_id))
        cur.execute(f"UPDATE {SCHEMA}.password_resets SET used=TRUE WHERE user_id=%s AND code=%s", (user_id, code))
        # Создаём новую сессию
        session_token = secrets.token_hex(32)
        cur.execute(f"INSERT INTO {SCHEMA}.sessions (token, user_id) VALUES (%s,%s)", (session_token, user_id))
        cur.execute(f"SELECT email, full_name, job_title, bio FROM {SCHEMA}.users WHERE id=%s", (user_id,))
        u = cur.fetchone()
        conn.commit(); conn.close()
        return ok({"token": session_token, "user": {"id": user_id, "email": u[0], "full_name": u[1], "job_title": u[2] or "", "bio": u[3] or ""}})

    return err(400, "Неизвестное действие")