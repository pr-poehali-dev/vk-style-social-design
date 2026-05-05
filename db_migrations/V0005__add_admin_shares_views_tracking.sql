ALTER TABLE t_p89645412_vk_style_social_desi.users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

UPDATE t_p89645412_vk_style_social_desi.users
  SET is_admin = TRUE
  WHERE email IN ('den8spb@gmail.com', 'den9spb@gmail.com');

ALTER TABLE t_p89645412_vk_style_social_desi.posts
  ADD COLUMN IF NOT EXISTS share_count INTEGER DEFAULT 0;

ALTER TABLE t_p89645412_vk_style_social_desi.posts
  ADD COLUMN IF NOT EXISTS reach_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.post_shares (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.posts(id),
  user_id INTEGER REFERENCES t_p89645412_vk_style_social_desi.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.post_views (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.posts(id),
  user_id INTEGER REFERENCES t_p89645412_vk_style_social_desi.users(id),
  ip_hash TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_views_post ON t_p89645412_vk_style_social_desi.post_views(post_id);
