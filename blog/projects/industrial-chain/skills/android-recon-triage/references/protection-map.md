# 已见防护 / 壳类型地图

> 来自 21 个主线样本静态复盘；识别要点为字符串/符号/配置层线索，不等于已脱壳或已绕过。未反汇编的实现细节标【缺口】。

## 一、Java 层 / DEX 壳与混淆

| 类型 | 样本线索 | 静态识别要点 | 典型阻塞 |
|---|---|---|---|
| 内存壳 / 抽 dex | APKGuard 内存壳、InMemoryDexClassLoader 加载；assets 下加密 dex 载荷 | 主 dex 仅壳 stub；jadx 产出极少；assets 有加密载荷；类名/方法体不在磁盘 dex | 需内存解密后 dump（阶段 4/5）；本轮只登记桩类与载荷位置 |
| 代码混淆 | StringFog 字符串加密；ProGuard/R8 短名 | 字符串表高熵/不可读；类名短包名；解密调用桩 | 字符串需运行时解密；静态只记加密桩名 |
| 容器 / 双开沙箱 | VirtualApp 自研宿主；AndVM gVisor runsc + AOSP GSI；proot Ubuntu 根文件系统 | 独立 Guest 安装/运行链；assets 内含镜像/rootfs；客户机 dex/镜像需单独枚举 | 业务在 Guest 内，宿主侧只读看不到方法体 |
| 自研封包改写 | 自研封包改写 so 引擎；engine.lkp NTRP1/gzip 条目表 | 资产被封包改写；so 内规则/脚本；条目表可离线对照 | 解包规则未还原前，assets 内容不可直接编辑 |

## 二、Native / 加固 so

| 类型 | 样本线索 | 静态识别要点 | 典型阻塞 |
|---|---|---|---|
| 加固 / VMP | 娜迦 Naga + VMP；业务 dex 抽 native 执行 | 保护 so 体积异常；无业务符号；VMP 桩；反调试/反 Hook 串 | 函数体需反汇编/动态附加；D 级 |
| 完整性 / 签名校验 | 配置/公告 native 验签；so 区间哈希清单；Manifest 节点校验 | rsa.pub/rsa.sig/manifest.mf 线索；哈希清单；校验 native 实现 | 改动重打包是否触发拒绝加载，未反汇编处写"未确认" |
| 反调试 / 反 Hook / root / 模拟器检测 | 保护 so 特征串；ptrace；检测 root/模拟器/调试器 API | 字符串关键词：ptrace、TracerPid、su、magisk、emulator、qemu 等 | 绕过属动态阶段；静态只登记检测点 |
| 上报 SDK 混淆名 | 数美、腾讯 cubehawk/gsdk、阿里 Guard、乐变、subao 等 | 按包名/so 名/串标识归类；区分安全 SDK 与业务逻辑 | 上报链路协议需动态观察；本地不伪造回执 |

## 三、引擎 / 运行时形态

| 引擎形态 | 样本线索 | 静态识别要点 | 备注 |
|---|---|---|---|
| Unity IL2CPP + HybridCLR | libil2cpp.so + global-metadata.dat；HotUpdate 程序集 | Data 目录 Managed/Metadata；MonoScript；非标准 metadata 头 | 需 Il2CppDumper（缺失，记缺口）；metadata 加密先判头 |
| Cocos2d-x | libcocos2dcpp.so；JET/VISPACK 自定义容器；CMPH 哈希索引 | 无后缀大文件；自定义 magic；明文目录名样例；配置类清单 | 容器格式还原在阶段 4 |
| libGDX | assets 资源包；native 渲染库 | 工程结构与资源包命名 | 偏离线游戏逻辑 |
| Flutter | libflutter.so；Dart 快照 | 引擎 so + 快照文件 | 本轮样本未深入 |
| WebView 壳 | 主 Activity 为 WebView；payload.bin 加密载荷；离线 URL 门 | 壳代码薄；业务在远程页或加密载荷；AES 密钥派生线索 | 离线载荷先判加密算法与密钥来源；在线内容属 C 级 |
| Go 内核 | libclash 类大体积 Go so | Go buildinfo、mihomo/clash 标识、协议栈关键词 | 符号表处理与 C++ 不同 |
| 原生 Android / Kotlin | 普通 dex + 标准 SDK | 包结构常规 | 静态可读度最高 |

## 四、授权 / 网络保护形态

| 形态 | 识别要点 | 分级 |
|---|---|---|
| 服务端授权 / 卡密核验 | 本地无硬编码校验规则；verify/激活/有效期由后端返回；远程公告/门控 JSON | C 级：本地改 URL/UI 不能伪造授权 |
| 服务端下发内容 | 皮肤/规则/配置远程下发；本地仅缓存 | C 级；本地缓存可展示但不可信任 |
| 远程更新 / 后门加载 | 远程 URL 拉取 dex/jar/so/公告；签名校验链 | C/D 级；记录下载链路与验签位置，不联调 |
| 在线对战 / 结算 | 数值、匹配、付费、结算服务端校验 | 本地改动只影响客户端表现/本地 PVE/界面 |

## 五、识别顺序建议

1. 先看主 dex 可读度与 jadx 产出量 → 判是否内存壳/抽 dex。
2. 列 `lib/<abi>/` so 体积与符号 → 判加固/VMP/业务 native 归属。
3. 扫 assets 容器 magic 与大文件 → 判引擎形态与自定义封包。
4. 关键词分组扫串 → 归类授权/网络/反调试/SDK 线索。
5. 所有"校验/验签/完整性"点先记证据位置，是否触发拒绝加载标【未确认】，留待动态阶段核对。
