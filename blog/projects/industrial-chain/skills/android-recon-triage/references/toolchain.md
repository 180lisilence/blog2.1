# 工具链基线（P0 只读静态）

> 版本为基线参考；脚本运行时不依赖写死路径：外部工具由 `scripts/_toolfind.py` 自动定位（规则见 §7）。Python 第三方库需随专用解释器一并准备。
> 本表只记录工具、参考版本、定位方式与已知坑；机器专属绝对路径不写进仓库，换环境后按环境变量 / PATH / 版本通配重新定位。

## 1. 运行环境

| 项 | 基线参考版本 | 定位方式 | 备注坑 |
|---|---|---|---|
| Python（逆向专用） | 3.14.x | 环境变量 / PATH | 需含 androguard/pyelftools/LIEF/capstone/pefile 等；Scripts CLI 同环境 |
| JDK（apktool/Maven） | 21.x | JAVA_HOME / PATH | apktool 显式绑定 JDK21 |
| JDK（Ghidra） | 25.x | JAVA_HOME / PATH | Ghidra headless 要求较新 JDK |
| 旧 JDK 兼容 | 17 / 8 | JAVA_HOME / PATH | 老字节码兼容 |
| Git / Node / Maven / Gradle | 2.55 / 22.x / 3.9.x / 8.9 | PATH | Maven 目录可能嵌套版本子目录一层 |
| 7-Zip | 26.x | PATH | 命令行 `7z` |
| adb | 1.0.41 | ANDROID_SDK_ROOT / PATH | 设备桥接；模拟器掉线需 `adb connect` 重连 |

## 2. APK 解包 / 反编译

| 工具 | 版本 | 调用命令模板 | 备注坑 |
|---|---|---|---|
| apktool | 3.0.x | `apktool d <app.apk> -o <out> -f`；`apktool b <dir> -o <unsigned.apk>` | 改完 smali 输出未变先删 `build/` 缓存 |
| jadx | 1.5.x | `jadx -d <jadx_out> <app.apk>`；GUI `jadx-gui` | 未设 JAVA_HOME 回退 PATH java |
| smali 3.x-fat | 3.0.10-fat | `java -jar smali-3.0.10-fat.jar a -o classes.dex <x.smali>` | fat jar 自带 Main-Class，可直接 -jar |
| smali 2.5.2 | 2.5.2 | `java -cp "<smali-lib>/*" org.jf.smali.Main a -o classes.dex <*.smali>` | jar **无 Main-Class**，不能直接 -jar，须挂 smali-lib classpath |
| baksmali 2.5.2 | 2.5.2 | `java -cp "<smali-lib>/*" org.jf.baksmali.Main d classes.dex -o smali_out` | 同上无 Main-Class；依赖 smali-lib 目录 |
| androguard | 4.1.x | `androguard analyze <apk>` / `apkInspector <apk>` | CLI 在 Scripts；Python 库同环境可 import |
| uber-apk-signer | 1.3.0 | 仅校验：`java -jar uber-apk-signer.jar -a <signed.apk> -y` | 签名写回属后续技能；口令不写进台账 |
| 签名库 *.jks | PKCS12 | `keytool -list -keystore <store>.jks` | 口令不转写；storepass/keypass 不进对外摘要 |
| android framework jar | android-13 | 作为 jadx/apktool 框架参照 | 版本按目标 SDK 选 |

## 3. Native / ELF 静态分析

| 工具 | 版本 | 定位方式 | 调用命令 / 备注 |
|---|---|---|---|
| radare2 套件 | 6.2.x | PATH / `RABIN2` 环境变量 | `rabin2 -I/-S/-i/-E/-zz <target>`；`r2 -A -q -c 's entry0;afl;iz;ii;q' -- <target>`；`rahash2 -a sha256 <file>` |
| DIE | 4.0.x | PATH / `DIE`(或 `DIEC`) 环境变量 | `diec <target>` CLI 壳/编译器识别；GUI 另存 |
| Ghidra | 12.2 | 环境变量 / PATH | headless 批处理；强制较新 JDK；GUI 为 ghidraRun |
| IDA Pro | 7.0 便携 | 环境变量 / PATH | idat64 可批处理；Hex-Rays 未加载无伪代码 |
| UPX | 5.3.x | PATH / `UPX` 环境变量 | `upx -l <exe>` 列压缩；`upx -t` 测试；`upx -d` 脱壳（写回，后续技能） |
| 十六进制查看器 | 010 / HxD | PATH | 十六进制查看 |
| pyelftools | 0.33 | Python 库 | `import elftools`；Scripts 有 readelf.py 入口 |
| capstone / LIEF / pefile | 5.0.x / 1.0.x / 2024.8 | Python 库，无独立 CLI | 以 import 方式使用；缺库时脚本回退外部进程工具 |

## 4. 设备与动态（仅登记环境，本技能不执行动态）

- 动态调试目标（模拟器 / 真机）的型号、序列号、frida-server 部署位置等本机信息不在本仓库登记；由后续 dynamic-verify 技能在各自工作区记录。
- 动态组工具：frida + frida-tools、objection、frida-gadget；客户端 / server 必须同版本。调用方式见后续 dynamic-verify 技能。

## 5. 已知缺失件

dnSpy、Il2CppDumper、AssetStudio、arm64-v8a 系统镜像等按需补齐；缺件在台账记【缺口】，不视为可用。

## 6. 环境坑速查

1. lief/capstone/pefile 是库无独立 CLI；frida 17.x 需较新 Python。
2. smali/baksmali 2.5.2 无 Main-Class，必须 `-cp smali-lib/*` 调主类；3.x fat jar 可直接 -jar。
3. Android SDK 可能分平台工具与 build-tools 两套目录，按环境变量定位。
4. Maven 实际目录可能嵌套版本子目录一层。

## 7. 工具自动发现规则（脚本侧，换电脑/挪目录适用）

脚本调用的外部工具不在源码里写死唯一路径，统一走 `scripts/_toolfind.py`，定位顺序（高 → 低）：

1. **环境变量显式指定**：`AAPT2` / `RABIN2` / `DIE`(或 `DIEC`) / `UPX`，值指向可执行文件；
2. **PATH 查找**：`shutil.which(工具名)`；
3. **常见根目录 glob 版本通配搜索**：根目录取自环境变量 `TOOL_ROOTS`（`;` 分隔多个）、`TOOL_ROOT`、`ANDROID_SDK_ROOT` / `ANDROID_HOME`，以及用户主目录下通用候选；模式按版本号 `*` 通配（如 `Android/Sdk/build-tools/*/aapt2.exe`、`radare2-*/bin/rabin2.exe`、`die*/diec.exe`、`upx-*/**/upx.exe`）；
4. **内置兜底候选**：缺省为空。

- 自检：任一脚本加 `--list-tools`，输出每个工具命中的路径或 `[缺口] 未找到`。
- 新增工具：在 `_toolfind.py` 的 `TOOL_SPECS` 登记名称/环境变量/glob 模式/兜底候选即可。
- **换电脑迁移要点**：把工具装进 PATH，或放进环境变量指出的根目录版本子目录；不在默认位置时设对应环境变量指向可执行文件。Python 第三方库（androguard/pyelftools/LIEF/capstone/pefile/frida）需随专用解释器一并迁移，脚本只定位外部 CLI，不负责安装 Python 依赖。
- 工具全部找不到时：脚本回退纯标准库/Python 库路径或记【缺口】，不崩溃、不编造路径与结果。

## 8. Skill 库自动发现与意图路由（2.0，脚本侧，换电脑/挪目录适用）

2.0 在外部工具发现（§7）之外，再把本地 skill 库纳入路由：先识别用户诉求属于哪个领域，召回对口 skill，再读其 SKILL.md 执行。统一走 `scripts/_skillfind.py`（纯标准库，只读）。

**库根定位（高 → 低）**

1. 环境变量 `SKILL_ROOTS`（`;` 分隔多个目录）；
2. 内置默认库根（缺省为空，可在脚本内补充跨平台通用候选）。

索引缓存路径：环境变量 `SKILL_INDEX` 覆盖，缺省写脚本旁 `skill_index.json`。

**索引构建**：递归扫描各根下 `SKILL.md`（限深 3 层），解析 frontmatter 的 `name` / `description`（含 `|`/`>` 多行块）/ `triggers` 列表；无前言时取正文 H1 与开头 `>` 引用块兜底；BOM、缺字段均容错，不崩溃。

**CLI**

| 命令 | 作用 |
|---|---|
| `--query "<意图>" [--top N]` | 分词 + 中英同义词扩展后打分，返回 top N 候选（分数/路径/描述/触发词） |
| `--list` | 列出索引内全部 skill |
| `--reindex` | 强制重建索引缓存 |
| `--diagnostics` | 输出根目录、索引路径、skill 总数、缺描述清单 |

**打分口径**：name 命中 10 分、triggers 命中 6 分、描述/标题命中 3 分；标注 `Internal downstream` / `competition-*` 的内部下游 skill 分数 ×0.7 降权；中文按 2-gram、英文按词（连字符/下划线/斜杠分词）；`_SYNONYMS` 表做中文↔英文高频域扩展。

**迁移要点**：换电脑/挪库后，把新库路径写进 `SKILL_ROOTS`，跑一次 `--reindex` 重建索引即可；索引内存的是绝对路径，换机后必须重建，不沿用旧缓存。

**已知局限**：纯本地、无翻译模型，跨语言覆盖仅靠内置有限同义词表，冷僻词召回可能偏弱；路由只做初筛，候选不足时用 `--list` 浏览或放宽关键词，最终以实际读到的 SKILL.md 为准。
