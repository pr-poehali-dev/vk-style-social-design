CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.blacklist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  blocked_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, blocked_id)
);