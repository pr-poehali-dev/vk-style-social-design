"""
Авторизация: регистрация, вход, выход, получение профиля текущего пользователя.
Действие передаётся через параметр action в теле запроса или через path.
"""
import json
import os
import hashlib
import secrets
import psycopg2

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

        return ok({
            "token": session_token,
            "user": {"id": user_id, "email": email, "full_name": full_name, "job_title": job_title, "bio": ""}
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
            f"SELECT id, full_name, job_title, bio FROM {SCHEMA}.users WHERE email = %s AND password_hash = %s",
            (email, pw_hash)
        )
        row = cur.fetchone()
        if not row:
            conn.close()
            return err(401, "Неверный email или пароль")

        user_id, full_name, job_title, bio = row
        session_token = secrets.token_hex(32)
        cur.execute(
            f"INSERT INTO {SCHEMA}.sessions (token, user_id) VALUES (%s, %s)",
            (session_token, user_id)
        )
        conn.commit()
        conn.close()

        return ok({
            "token": session_token,
            "user": {"id": user_id, "email": email, "full_name": full_name, "job_title": job_title or "", "bio": bio or ""}
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
            SELECT u.id, u.email, u.full_name, u.job_title, u.bio
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

        user_id, email, full_name, job_title, bio = row
        return ok({"id": user_id, "email": email, "full_name": full_name, "job_title": job_title or "", "bio": bio or ""})

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

    return err(400, "Неизвестное действие")