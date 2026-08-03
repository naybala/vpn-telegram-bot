-- ==================================================================
-- 003: Referral System Tables
-- users     → stores each user's referral code & credit balance
-- referrals → tracks who referred whom
-- ==================================================================

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  telegram_id   VARCHAR(50)  NOT NULL UNIQUE,
  first_name    VARCHAR(100) NULL,
  referral_code VARCHAR(20)  NOT NULL UNIQUE,
  credits       INT          NOT NULL DEFAULT 0,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_referral_code (referral_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS referrals (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  referrer_id   VARCHAR(50)  NOT NULL,
  referred_id   VARCHAR(50)  NOT NULL,
  referral_code VARCHAR(20)  NOT NULL,
  credited      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_referred (referred_id),
  INDEX idx_referrer (referrer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
