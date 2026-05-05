-- Лайки для групповых постов
CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.group_post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.group_posts(id),
    user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

-- Комментарии для групповых постов
CREATE TABLE IF NOT EXISTS t_p89645412_vk_style_social_desi.group_post_comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.group_posts(id),
    user_id INTEGER NOT NULL REFERENCES t_p89645412_vk_style_social_desi.users(id),
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Добавляем comments_count в group_posts
ALTER TABLE t_p89645412_vk_style_social_desi.group_posts
    ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;
