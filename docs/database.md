# 数据库设计

## 概述

- **数据库**：MySQL 5.7+ / 8.0
- **字符集**：utf8mb4 / utf8mb4_unicode_ci
- **存储引擎**：InnoDB
- **数据库名**：`myself_blog2`（可通过 `MYSQL_DATABASE` 环境变量修改）
- **自动初始化**：服务启动时自动创建数据库、表结构、内置管理员，无需手动执行 SQL

## 表结构

### 1. users 用户表

存储用户账号信息，密码使用 scrypt 加盐哈希。

```sql
CREATE TABLE users (
  username    VARCHAR(255) NOT NULL COMMENT '用户名（主键）',
  salt        VARCHAR(64)  NOT NULL COMMENT '密码盐值（16字节hex）',
  hash        VARCHAR(128) NOT NULL COMMENT 'scrypt密码哈希（64字节hex）',
  created_at  BIGINT       NOT NULL COMMENT '创建时间戳（毫秒）',
  is_builtin  TINYINT      DEFAULT 0 COMMENT '是否内置管理员（0否1是）',
  PRIMARY KEY (username),
  INDEX idx_builtin (is_builtin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| username | VARCHAR(255) | PK | 用户名，2-20位字母/数字/中文/@._- |
| salt | VARCHAR(64) | NOT NULL | 密码盐值，crypto.randomBytes(16).toString('hex') |
| hash | VARCHAR(128) | NOT NULL | scrypt 哈希，crypto.scryptSync(password, salt, 64).toString('hex') |
| created_at | BIGINT | NOT NULL | 创建时间戳（毫秒） |
| is_builtin | TINYINT | DEFAULT 0 | 是否内置管理员 |

**密码验证流程**：
```
输入密码 → scryptSync(password, salt, 64) → hex 比对 hash
```

### 2. user_data 用户业务数据表

存储用户的业务数据（如个人设置、偏好等），采用 Key-Value 结构，值为 JSON。

```sql
CREATE TABLE user_data (
  username    VARCHAR(255) NOT NULL COMMENT '用户名（联合主键）',
  data_key    VARCHAR(100) NOT NULL COMMENT '数据键（联合主键）',
  data_value  JSON                  COMMENT '数据值（JSON格式）',
  updated_at  BIGINT       NOT NULL COMMENT '更新时间戳（毫秒）',
  PRIMARY KEY (username, data_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| username | VARCHAR(255) | PK 联合 | 用户名，关联 users 表 |
| data_key | VARCHAR(100) | PK 联合 | 数据键，如 'settings'、'preferences' |
| data_value | JSON | | 数据值，任意 JSON 对象 |
| updated_at | BIGINT | NOT NULL | 最后更新时间戳 |

**写入策略**：`INSERT ... ON DUPLICATE KEY UPDATE`，不存在则插入，存在则更新。

## 初始化流程

服务启动时 `db/init.js` 自动执行：

```
1. ensureDatabase()
   └─ 连接 MySQL（不指定 database）
   └─ CREATE DATABASE IF NOT EXISTS myself_blog2
      DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci

2. ensureTables(pool)
   └─ CREATE TABLE IF NOT EXISTS users (...)
   └─ CREATE TABLE IF NOT EXISTS user_data (...)

3. migrateFromJson(pool)
   └─ 读取旧版 users.json（如果存在）
   └─ 逐个 INSERT INTO users（已存在则跳过）

4. ensureBuiltinAdmin(pool)
   └─ 检查 admin 是否存在
   └─ 不存在则创建（密码来自 DEFAULT_ADMIN_PASSWORD）
```

## 数据迁移

从旧版（users.json 文件存储）迁移到 MySQL：

1. 旧版 `qrcode-login/users.json` 格式：
```json
{
  "admin": { "salt": "...", "hash": "...", "createdAt": 1234567890, "builtin": true },
  "user1": { "salt": "...", "hash": "...", "createdAt": 1234567890, "builtin": false }
}
```

2. 启动时自动检测并迁移，迁移后 users.json 不会被删除（保留作为备份），但不再使用。

3. 迁移是幂等的：重复启动不会重复导入。

## 内存缓存

为了减少数据库查询，用户数据在启动时全量加载到内存 `Map`：

```
auth/model.js users: Map<username, {salt, hash, createdAt, builtin}>
```

- **读取**：直接从内存 Map 读取，不查数据库
- **写入**：先写 MySQL，再更新内存 Map
- **一致性**：单实例部署下无并发问题；多实例需额外处理

## ChatRecord 数据存储

ChatRecord 的会话数据**不存储在 MySQL**，而是文件系统：

```
qrcode-login/data/chatrecord/{username}/
├── index.json          # 会话索引（id, title, messageCount, createdAt, updatedAt）
├── {sessionId}.json    # 单个会话详情（messages, metadata）
└── ...
```

原因：会话数据为大 JSON（可能包含数千条消息），文件存储更适合，且按用户目录隔离。

## 备份建议

```bash
# 备份数据库
mysqldump -u root -p myself_blog2 > backup_$(date +%Y%m%d).sql

# 备份 ChatRecord 数据
tar -czf chatrecord_$(date +%Y%m%d).tar.gz qrcode-login/data/
```
