
CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  text TEXT NOT NULL,
  tags TEXT DEFAULT '',
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.post_likes (
  user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  post_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.posts(id),
  PRIMARY KEY (user_id, post_id)
);
