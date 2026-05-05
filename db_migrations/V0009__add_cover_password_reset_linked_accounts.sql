-- Обложка профиля
ALTER TABLE t_p89645412_vk_style_social_desi.users
  ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT '';

-- Сброс пароля (по коду на email)
CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pw_resets_code ON t_p89645412_vk_style_social_desi.password_resets(code);

-- Несколько аккаунтов (связанные аккаунты одного браузера)
CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.linked_accounts (
  id SERIAL PRIMARY KEY,
  primary_user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  linked_user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  linked_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(primary_user_id, linked_user_id)
);
