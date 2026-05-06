CREATE TABLE t_p89645412_vk_style_social_desi.typing_indicators (
  user_id INTEGER NOT NULL,
  conv_id INTEGER NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, conv_id)
);