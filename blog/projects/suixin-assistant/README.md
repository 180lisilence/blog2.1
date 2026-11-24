# 随心助手 (Suixin Assistant)

> DeepSeekChat 桌面版一键插件安装器

给 nativefier 打包的 DeepSeekChat 桌面版套上可插拔插件壳，数字菜单 bat 一键安装/卸载/自检，关掉即原版。

## 功能

| 插件 | 说明 |
|---|---|
| **启动动画** (splash) | 打开软件时的 Logo 加载画面，4 种风格 |
| **主题** (theme) | 背景图 / 蒙版 / 面板不透明度 / 强调色 / 圆角 / 欢迎词 |
| **小鲸鱼挂件** (whale) | 余额显示 + 泡泡互动 + 消耗监控（需 API Key） |
| **安全审查** (security) | 骨架占位，待扩展 |
| **动态壁纸** (wallpaper) | 联动 Steam Wallpaper Engine 当前壁纸 |
| **文件面板** (filebrowser) | 右侧文件浏览面板（依赖 whale 入口） |

## 安装

1. 下载 Release 里的 `随心助手.zip`
2. 解压后双击 `随心助手.bat`
3. 数字菜单选择要安装的插件
4. 完全退出 DeepSeekChat 再重新打开

> 目标路径默认 `D:\TOOL\DeepSeekChat_win32_x64`

## 菜单选项

- `[1]` 全部安装（核心 + 6 插件）
- `[2]` 自定义选择插件（输入编号如 1,3,5）
- `[3]` 仅核心（不装插件）
- `[4]` 自检（检查文件完整性）
- `[5]` 卸载 Harness
- `[0]` 退出

## 特性

- **零残留**：卸载后恢复原版，不碰 main.js / preload.js
- **即时开关**：齿轮面板里开关插件，不用重启
- **自动备份**：安装前自动备份现有 inject 目录
- **自检**：一键检查所有文件是否就位

## 目录结构

```
随心助手.bat          主安装器
payload\              插件源文件（部署用）
├── 00-bootstrap.js   引导入口
├── _core\            插件内核
└── plugins\          6 个插件
    ├── splash\
    ├── theme\
    ├── whale\
    ├── security\
    ├── wallpaper\
    └── filebrowser\
```

## License

MIT