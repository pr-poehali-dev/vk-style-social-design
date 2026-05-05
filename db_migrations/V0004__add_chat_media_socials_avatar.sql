
ALTER TABLE t_p89645412_vk_style_social_desi.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_vk TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_tg TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_linkedin TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_instagram TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.conversations (
  id SERIAL PRIMARY KEY,
  user1_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  user2_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (user1_id < user2_id),
  UNIQUE (user1_id, user2_id)
);

CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.conversations(id),
  sender_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  text TEXT DEFAULT '',
  media_url TEXT DEFAULT '',
  media_type TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON t_p89645412_vk_style_social_desi.messages(conversation_id, created_at);

ALTER TABLE t_p89645412_vk_style_social_desi.posts
  ADD COLUMN IF NOT EXISTS media_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT '';
