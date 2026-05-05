UPDATE t_p89645412_vk_style_social_desi.posts SET text='' WHERE text IS NULL;
ALTER TABLE t_p89645412_vk_style_social_desi.posts ALTER COLUMN text SET DEFAULT '';
