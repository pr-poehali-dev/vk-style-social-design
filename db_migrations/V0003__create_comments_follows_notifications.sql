
CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.posts(id),
  user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.follows (
  follower_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  following_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  type TEXT NOT NULL,
  actor_id INTEGER REFERENCES t_p89645412_vk_style_social_desi.users(id),
  post_id INTEGER REFERENCES t_p89645412_vk_style_social_desi.posts(id),
  comment_id INTEGER REFERENCES t_p89645412_vk_style_social_desi.comments(id),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
