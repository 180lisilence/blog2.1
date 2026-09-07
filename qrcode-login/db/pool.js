/**
 * MySQL 连接池
 */
const mysql = require("mysql2/promise");
const config = require("../config");
const logger = require("../core/logger");

const pool = mysql.createPool(config.db);

// 测试连接
pool.getConnection()
  .then(conn => {
    logger.info("db", `MySQL 连接成功 ${config.db.host}:${config.db.port}/${config.db.database}`);
    conn.release();
  })
  .catch(err => {
    logger.error("db", "MySQL 连接失败", err.message);
  });

module.exports = pool;
