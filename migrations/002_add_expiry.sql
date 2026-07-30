-- ==================================================================
-- 002: Add expiry and status fields to user_keys
-- Handles monthly subscription cycle without Outline's native time limits
-- ==================================================================

ALTER TABLE user_keys
  ADD COLUMN expires_at  TIMESTAMP  NULL DEFAULT NULL COMMENT 'When this key expires (NULL = never)',
  ADD COLUMN status      ENUM('active', 'expired', 'suspended') NOT NULL DEFAULT 'active' COMMENT 'Key lifecycle state',
  ADD INDEX idx_expires_at (expires_at),
  ADD INDEX idx_status (status);
