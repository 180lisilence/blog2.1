/**
 * 单元测试运行器
 * 用法：node tests/run.js
 * 不依赖外部测试框架，使用 Node 内置 assert
 */
const fs = require("fs");
const path = require("path");

const testsDir = __dirname;
const testFiles = fs.readdirSync(testsDir)
  .filter(f => f.endsWith(".test.js") && f !== "integration.test.js") // 集成测试独立运行
  .sort();

console.log("========================================");
console.log("  项目中心服务 - 单元测试");
console.log(`  共 ${testFiles.length} 个测试文件`);
console.log("========================================");

let totalPassed = 0;
let totalFailed = 0;
const results = [];

for (const file of testFiles) {
  const filePath = path.join(testsDir, file);
  try {
    // 清除 require 缓存，确保独立运行
    delete require.cache[require.resolve(filePath)];
    const result = require(filePath);
    totalPassed += result.passed || 0;
    totalFailed += result.failed || 0;
    results.push({ file, passed: result.passed || 0, failed: result.failed || 0 });
  } catch (e) {
    console.log(`\n❌ ${file} 运行失败: ${e.message}`);
    totalFailed++;
    results.push({ file, passed: 0, failed: 1, error: e.message });
  }
}

console.log("\n========================================");
console.log("  测试汇总");
console.log("========================================");
for (const r of results) {
  const status = r.failed === 0 ? "✅" : "❌";
  console.log(`  ${status} ${r.file}: ${r.passed} 通过, ${r.failed} 失败`);
}
console.log("----------------------------------------");
console.log(`  总计: ${totalPassed} 通过, ${totalFailed} 失败`);
console.log("========================================");

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log("\n🎉 全部测试通过！");
  process.exit(0);
}
