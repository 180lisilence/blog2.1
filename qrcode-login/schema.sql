-- myself-blog2.0 后端数据库结构
-- 执行方式: mysql -uroot -p < schema.sql
CREATE DATABASE IF NOT EXISTS myself_blog2
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE myself_blog2;

-- 用户账号表（替代 users.json）
CREATE TABLE IF NOT EXISTS users (
  username   VARCHAR(64)  NOT NULL,
  salt       VARCHAR(64)  NOT NULL,
  hash       VARCHAR(128) NOT NULL,
  created_at BIGINT       NOT NULL,
  is_builtin TINYINT      NOT NULL DEFAULT 0,
  PRIMARY KEY (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 用户业务数据表（工作台/项目数据，按用户隔离）
CREATE TABLE IF NOT EXISTS user_data (
  username   VARCHAR(64)  NOT NULL,
  data_key   VARCHAR(128) NOT NULL,
  data_value MEDIUMTEXT,
  updated_at BIGINT       NOT NULL,
  PRIMARY KEY (username, data_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
