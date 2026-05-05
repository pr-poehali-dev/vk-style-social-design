-- Группы
CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  cover_url TEXT DEFAULT '',
  owner_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  members_count INTEGER DEFAULT 1,
  posts_count INTEGER DEFAULT 0,
  is_private BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.group_members (
  group_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.groups(id),
  user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.group_posts (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.groups(id),
  user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  text TEXT DEFAULT '',
  media_url TEXT DEFAULT '',
  media_type TEXT DEFAULT '',
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Кто лайкнул пост
CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.post_like_users (
  post_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.posts(id),
  user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);
