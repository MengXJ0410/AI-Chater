-- Run this file with a local MySQL administrator account.
-- Replace REPLACE_WITH_A_URL_SAFE_PASSWORD before executing.

CREATE DATABASE IF NOT EXISTS `ai_chater`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'ai_chater_app'@'127.0.0.1'
  IDENTIFIED BY 'REPLACE_WITH_A_URL_SAFE_PASSWORD';
ALTER USER 'ai_chater_app'@'127.0.0.1'
  IDENTIFIED BY 'REPLACE_WITH_A_URL_SAFE_PASSWORD';

CREATE USER IF NOT EXISTS 'ai_chater_app'@'localhost'
  IDENTIFIED BY 'REPLACE_WITH_A_URL_SAFE_PASSWORD';
ALTER USER 'ai_chater_app'@'localhost'
  IDENTIFIED BY 'REPLACE_WITH_A_URL_SAFE_PASSWORD';

GRANT ALL PRIVILEGES ON `ai_chater`.* TO 'ai_chater_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON `ai_chater`.* TO 'ai_chater_app'@'localhost';
FLUSH PRIVILEGES;
