# Industrial-chain-doubao-skill

安卓 APK / DEX / SO 样本**只读**静态建档与初步 triage 的 Doubao Skill 方法库：从 badging、Manifest、解包产物、native so、字符串线索中提取身份与技术栈，按固定台账模板落盘，产出分级可修改点骨架。

## 在线预览

GitHub Pages 站点：https://180lisilence.github.io/Industrial-chain-doubao-skill/

## 仓库结构

| 路径 | 说明 |
|---|---|
| `skills/android-recon-triage/SKILL.md` | 技能入口：适用范围、工作流、脚本挂载、证据口径与红线 |
| `skills/android-recon-triage/references/` | SOP 细则、台账字段与分级口径、防护/壳类型地图、工具链定位方式 |
| `skills/android-recon-triage/scripts/` | 只读脚本：身份识别、字符串扫描、ELF 初筛、壳判定、工具与技能库自动发现 |
| `skills/android-recon-triage/assets/ledger-templates/` | 7 套空白台账模板 |
| `台账模板/` | 同上 7 套模板的独立副本，便于直接取用 |

## 能力边界

**覆盖**：样本身份识别（包名/版本/SDK/ABI/入口/权限/体积）、解包与规模统计、静态线索扫描（字符串分组、ELF 符号、壳/加固特征、签名证书线索）、可修改点 A/B/C/D 分级台账。

**不做**：补丁写回、DEX 校验和重算、重打包/对齐/重签、frida 动态 hook、运行时脱壳 dump、native 函数级反汇编；不探测样本后端域名/IP/卡密端点。

## 工具定位

外部工具（aapt2 / rabin2 / diec / upx）由 `scripts/_toolfind.py` 自动定位，顺序：环境变量 > PATH > 常见根目录版本通配搜索；脚本不写死机器专属绝对路径。定位方式、参考版本与已知坑见 `references/toolchain.md`。

## 证据口径

- **【事实】** 文件/命令实读；**【推断】** 交叉推断待确认；**【缺口】** 未取得证据。包内统一一套标签，不混用。
- 版本/包名/计数/体积/路径/哈希/偏移必须来自实读；读不到写"未确认"，禁止编造。
- 未装机 / 未运行 / 未脱壳 / 未 patch 的结论如实标注"未动态验证"。

## 红线

- 不探测/扫描/请求任何样本后端域名、IP、卡密端点；被标记为受限的后端域名及其子域禁止任何扫描探测动作。
- 被标记为红线的样本仅做结构归档，不排还原/绕过/联调。
- 凭证（token、私钥、签名库口令）只登记存在，不读取、不转写、不进对外摘要。
- 原始 APK / 样本 / 历史产物只读；补丁与重打包只在副本或工作区进行。

## 运行环境

Python 3.10+（推荐 3.14）；核心脚本纯标准库，可选第三方依赖 androguard / pyelftools / LIEF / capstone / pefile，缺库时脚本回退外部进程工具或记【缺口】，不崩溃。
