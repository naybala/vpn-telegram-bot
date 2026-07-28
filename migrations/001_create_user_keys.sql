-- ==================================================================
-- 001: Create user_keys table
-- Stores all generated VPN keys linked to Telegram users
-- ==================================================================

CREATE TABLE IF NOT EXISTS user_keys (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  telegram_id         VARCHAR(50)   NOT NULL,           -- Telegram user ID
  server_index        INT           NOT NULL DEFAULT 0, -- Index in SERVERS array
  outline_api_url     VARCHAR(500)  NOT NULL,           -- Outline server API URL
  generated_user_name VARCHAR(100)  NOT NULL,           -- Unique name assigned to the key
  key_id              VARCHAR(100)  NOT NULL,           -- Outline access key ID
  access_url          TEXT          NOT NULL,           -- Full VPN access URL (ss://...)
  photo_url           TEXT          NULL,               -- Payment screenshot file_id
  created_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_telegram_id (telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
