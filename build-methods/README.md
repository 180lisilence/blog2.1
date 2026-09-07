# 10 种构建应用方法对比实验

同一个功能（待办清单 Todo List），用 10 种不同的构建方式各实现一遍，亲身感受区别。

## 统一功能

每个示例都实现：
- 添加待办事项
- 删除待办事项
- 标记完成/未完成
- 显示待办数量

## 10 种方法速览

| 目录 | 方法 | 核心特点 | 运行方式 |
|---|---|---|---|
| 1 | SSR 服务端渲染 | 服务端生成 HTML，表单提交刷新页面 | `node server.js` |
| 2 | SPA 前后端分离 | 前端单页应用 + 后端 API，fetch 无刷新 | `node server.js` |
| 3 | 全栈框架 Next.js | 前后端一体，支持 SSR/SSG/API 路由 | `npm run dev` |
| 4 | SSG 静态站点 | 构建时生成纯静态 HTML，无后端 | 直接打开 index.html |
| 5 | 桌面应用 Electron | Web 技术打包成桌面 EXE | `npm start` |
| 6 | 移动应用 React Native | 一套代码跑 iOS/Android | `npx expo start` |
| 7 | PWA 渐进式应用 | 可安装到桌面/手机，离线可用 | `node server.js` |
| 8 | 低代码配置驱动 | JSON 配置生成界面，零代码改功能 | 直接打开 index.html |
| 9 | 微前端架构 | 主应用 + 多个独立子应用组合 | `node server.js` |
| 10 | Serverless 云函数 | 后端拆成函数，按需执行 | `node server.js` |

## 快速开始

每个目录下有独立的 README.md，按说明运行即可。

建议按 1→2→3→4→7→8→10→9→5→6 的顺序体验，从简单到复杂。
