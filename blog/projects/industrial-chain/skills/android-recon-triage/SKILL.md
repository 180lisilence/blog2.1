---
name: industrial-chain
description: 安卓 APK/DEX/SO 样本只读静态建档与初步 triage：身份识别（aapt2 badging/Manifest）、解包计数、组件与权限枚举、字符串与授权/URL 关键词扫描、ELF/so 初筛、壳与加固特征判定、签名证书提取、可修改点 A/B/C/D 分级台账建档。当用户拿到新安卓样本需要逆向分析、建档、出静态报告、枚举可修改点，或提到 apktool、jadx、aapt2、baksmali、壳识别、加固、权限组件梳理、授权/卡密/URL 线索、so 导出符号、证书指纹时使用。本技能仅覆盖只读静态阶段；补丁写回、重打包签名、frida 动态 hook、脱壳 dump 不在范围内。
---

# Android Recon & Static Triage

## Overview

对安卓样本做**只读**静态建档：从 badging、Manifest、解包产物、native so、字符串线索中提取身份与技术栈，按固定台账模板落盘，产出分级可修改点骨架。每条结论带证据标签；不联网请求后端，不修改原始样本。

## 适用范围

**能做**
- 样本身份识别：包名/版本/SDK/ABI/入口 Activity/权限/体积
- 解包与规模统计：dex/smali/Java/so/assets 计数
- 静态线索扫描：字符串与关键词分组、ELF 符号初筛、壳/加固特征、签名证书指纹
- 台账建档：7 套模板落位，可修改点按 A/B/C/D 分级登记

**不做（留给后续技能）**
- 补丁写回、DEX 校验和重算、重打包、对齐、重签（repack-sign）
- frida spawn/attach、运行时脱壳 dump、真机观测（dynamic-verify）
- native 函数级反汇编与伪代码还原（native-unpack）
- 探测/请求样本后端域名、IP、卡密端点；红线样本还原

## 前置环境检查

开始前先读 `references/toolchain.md`，核对工具版本与路径；缺失项在台账中记为缺口，不臆造命令结果。

- 逆向专用 Python（装 androguard/pyelftools/LIEF/capstone 等库）：依赖清单见 toolchain.md；调用脚本时优先用 PATH 中可用的 `python`，缺库再按环境变量指定解释器。
- 解包/反编译工具（apktool/jadx/smali/baksmali 等）安装在 PATH 或由环境变量指向；native 工具定位方式见 toolchain.md。
- 脚本调用的外部工具（aapt2/rabin2/diec/upx）由 `scripts/_toolfind.py` 自动定位，不依赖写死路径；定位顺序：环境变量 > PATH > 常见根目录版本通配搜索 > 内置兜底候选。自检：任一脚本加 `--list-tools` 输出各工具在位/缺失。
- **Skill 库路由（2.0）**：本技能只覆盖安卓静态 triage；遇到其他领域诉求（native/JS/Web/固件/游戏内存/协议/dotnet/样本分析等），先用 `scripts/_skillfind.py --query "<用户意图>"` 在本地 skill 库召回候选 skill，再读对应 SKILL.md 执行。库根由环境变量 `SKILL_ROOTS`（`;` 分隔）指定，未设置时不扫描本机默认根；索引缓存 `skill_index.json`，`--reindex` 重建、`--diagnostics` 自检、`--list` 全量浏览。路由只做初筛，最终以读到的 SKILL.md 为准。
- 本技能脚本只读，不写样本目录；产物落在样本工作区（`work/` 或用户指定目录）。

## 工作流总览

**前置 · 意图路由（2.0）**：接到任务先判断是否落在本技能范围；跨领域诉求先跑 `_skillfind.py --query "<意图>"` 召回对口 skill，读其 SKILL.md 后再执行，不在本技能内强行承接。

单样本生命周期四阶段（完整七阶段见 `references/sop.md`，阶段 4–7 属后续技能）：

1. **阶段 0 立项与红线登记** — 建档、登记红线、原始样本只读基线
2. **阶段 1 解包与身份识别** — apktool/jadx 解包，补全身份区
3. **阶段 2 静态穷举** — 串扫描、ELF 初筛、壳判定、规则/配置归集
4. **阶段 3 分级清单** — 可修改点按 A/B/C/D 登记入台账

### 阶段 0 · 立项与红线

- 建样本工作目录；从 `assets/ledger-templates/` 拷贝 `identity.txt`、`方向.txt` 建档。
- 记录原始 APK 大小/mtime/哈希（`rahash2` 或 certutil）；原始 APK 与既有解包目录只读。
- 运行 `scripts/recon_identity.py <apk>` 取 badging 字段，回填 identity.txt（字段口径见 `references/ledger-conventions.md`）。
- 登记红线：后端域名/IP 不探测；指定红线样本只做结构归档；凭证只登记存在不转写。

### 阶段 1 · 解包与身份识别

- `apktool d` 解资源/smali；`jadx -d` 反编译 Java；统计反编译规模（类/方法/dex/so/assets）。
- 补 `analysis.md` 头部身份区：versionCode、体积、minSdk/targetSdk、ABI、主 Activity、Application。
- 坑：jadx 输出文件数极少时，先怀疑内存壳/抽 dex（见 `references/protection-map.md`）；改完 smali 输出未变先删 `build/` 增量缓存再重建。

### 阶段 2 · 静态穷举

- `scripts/strings_scan.py` 遍历解包目录/so，提取可打印串并按关键词分组（授权/卡密/URL/签名/反调试/SDK 标识）。
- `scripts/elf_triage.py` 对每个 so 做架构/类型/导出/导入/JNI 符号初筛。
- `scripts/packer_detect.py` 调 DIE CLI + UPX 测试 + 关键词特征，判定壳/编译器。
- 网络线索只登记静态可见的 scheme/域名/SDK，**不主动请求**；逐条证据落 `work/`。
- 产物目录（extracted/jadx/build/node_modules）不全量递归；扫描片段复用前通读全文。

### 阶段 3 · 分级清单

- 把静态可落地改动点逐条登记到 `可修改点清单.md`，按 A/B/C/D 分级（定义见 `references/ledger-conventions.md`）。
- 每条记：定位（文件:行/类/so 符号/资产路径）、现状（实读）、可改法或阻塞原因、影响面与风险。
- C/D 级只记阻塞原因与前置条件，不编造改法；未反汇编的 native 条目进 D 级。

## 挂载脚本

均为只读；缺省结果打到 stdout，`--out` 指定时写文件。外部工具由 `_toolfind.py` 自动定位；任一脚本带 `--list-tools` 可自检工具在位情况。

| 脚本 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `scripts/_toolfind.py` | （模块） | 工具路径或 None | 共享工具发现：环境变量 > PATH > 根目录 glob > 兜底候选；`diagnostics()` 供自检 |
| `scripts/_skillfind.py` | 意图文本 | 候选 skill（分数/路径/描述/触发词） | 2.0 skill 库发现与路由：扫 SKILL.md 建索引、分词+中英同义词打分召回；`--list/--query/--reindex/--diagnostics` |
| `scripts/recon_identity.py` | APK 路径 | identity 字段（package/versionName/versionCode/SDK/ABI/入口/权限） | 封装 aapt2 badging 解析；aapt2 缺失时回退 androguard |
| `scripts/strings_scan.py` | 文件或目录 | 命中串清单（文件/偏移/关键词分组） | 纯标准库 ASCII/UTF-8 串提取 + 分组正则 |
| `scripts/elf_triage.py` | ELF(so/exe) 路径 | 架构/类型/NEEDED/导出/导入/JNI 线索 | pyelftools 可选；缺库回退 `rabin2` |
| `scripts/packer_detect.py` | 文件路径 | 壳/编译器判定 + 证据 | DIE CLI + `upx -t` + 特征关键词；证据标签随结果 |

## 台账模板落点

`assets/ledger-templates/` 七套空白模板，字段与真实台账对齐：

`identity.txt`、`方向.txt`、`analysis.md`、`待办进度.md`、`可修改点清单.md`、`项目记忆.md`、`交接.md`。

模板字段、两套骨架变体、证据标签口径、四种 A/B/C/D 语义辨析，见 `references/ledger-conventions.md`。

## 证据口径与红线

- 证据标签包内统一一套：**【事实】** 文件/命令实读；**【推断】** 交叉推断待确认；**【缺口】** 未取得证据。不得两套混用。
- 版本/包名/计数/体积/路径/哈希/偏移必须来自实读；读不到写"未确认"，禁止编造。
- 不探测/扫描/请求任何样本后端域名/IP/卡密端点；被标记为受限的后端域名及其子域禁止任何扫描探测动作。
- 被标记为红线的样本仅做结构归档，不排还原/绕过/联调。
- 凭证（token、私钥、签名库口令）只登记存在，不读取、不转写、不进对外摘要。
- 原始 APK/样本/历史产物只读；未装机/未运行/未脱壳/未 patch 的结论如实标注"未动态验证"。

## 失败与缺口处理

- 工具或第三方库缺失：脚本返回缺口报告（缺什么、前置条件、可复现命令），不崩溃、不跳过编造结果。
- 静态层只见桩类/加密容器：业务方法体记【缺口】，阻塞原因与前置条件写入待办 ③。
- 静态通过 ≠ 运行通过；编译/签名/反编译成功不代表功能生效。

## References

- `references/toolchain.md` — 工具版本/路径/调用命令/已知坑
- `references/sop.md` — 七阶段 SOP 细则与各阶段台账落点
- `references/protection-map.md` — 已见防护/壳类型地图与识别要点
- `references/ledger-conventions.md` — 台账字段、分级口径、变体兼容、红线纪律
