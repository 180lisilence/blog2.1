# 贡献指南

感谢你对本项目的关注！以下是参与贡献的方式。

## 提交 Issue

提交 Issue 前请先搜索是否已有类似问题。Issue 应包含：

- **问题描述**：清晰说明遇到的问题或功能需求
- **复现步骤**：如果是 Bug，提供可复现的步骤
- **预期行为**：你期望的结果
- **实际行为**：实际发生的结果
- **环境信息**：操作系统、Node.js 版本、MySQL 版本、浏览器

## 提交 Pull Request

### 开发流程

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交代码：`git commit -m "feat: 描述你的改动"`
4. 推送分支：`git push origin feature/your-feature`
5. 提交 Pull Request

### 提交信息规范

采用 Conventional Commits 格式：

```
feat: 新功能
fix: 修复 Bug
docs: 文档更新
style: 代码格式（不影响功能）
refactor: 重构（既不修复 Bug 也不添加功能）
test: 添加测试
chore: 构建过程或辅助工具的变动
```

### 代码规范

- 后端代码通过 ESLint 检查：`npm run lint`
- 代码格式通过 Prettier：`npm run format`
- 单元测试全部通过：`npm test`
- 新增功能需补充对应单元测试
- 遵循现有模块化架构（config / core / db / middleware / modules）

### 代码结构约定

- 新增业务模块放在 `qrcode-login/modules/{模块名}/` 下
- 每个模块包含 `service.js`（业务逻辑）和 `routes.js`（路由）
- 路由层只做参数提取和响应，业务逻辑放在 service 层
- 错误使用 `core/errors.js` 的 `AppError` 或错误工厂函数
- 日志使用 `core/logger.js`，不直接用 `console.log`

## 开发环境搭建

```bash
# 克隆项目
git clone https://github.com/180lisilence/blog2.0.git
cd blog2.0

# 安装依赖
cd qrcode-login
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 修改 MySQL 密码等

# 启动服务
npm start

# 运行测试
npm test
```

## 安全问题

如果你发现安全漏洞，请**不要**公开提交 Issue，而是通过以下方式联系：

- 提交私密 Issue
- 邮件联系维护者

我们会尽快处理并在修复后公开致谢。

## 行为准则

参与本项目即表示你同意：

- 尊重他人，友善交流
- 接受建设性批评
- 关注项目整体利益
- 对新手友好

## 许可证

提交代码即表示你同意你的贡献在 [MIT 许可证](./LICENSE) 下发布。
