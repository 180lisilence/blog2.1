#!/usr/bin/env python3
"""工具自动发现模块（只读）。

定位顺序（优先级从高到低）：
    1. 环境变量显式指定；
    2. PATH 中 shutil.which 查找；
    3. 常见根目录按 glob 版本通配符搜索；
    4. 内置兜底候选（缺省为空，仅最后手段）。

找不到返回 None，由调用方记【缺口】，不崩溃、不编造路径。
换电脑/挪目录后，只要工具在 PATH、常见根目录的版本子目录里，或被环境变量指出，
脚本即可自行定位；无需改脚本源码。
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

# 常见工具根目录（不存在的会在搜索时跳过）。优先用环境变量 TOOL_ROOTS 追加，
# 多个路径用 os.pathsep（Windows 为 ;）分隔；TOOL_ROOT / ANDROID_SDK_ROOT /
# ANDROID_HOME 单值追加。此处仅放跨平台通用候选，不含任何机器专属绝对路径。
_DEFAULT_ROOTS = [
    str(Path.home() / "tools"),
    str(Path.home() / "Android" / "Sdk"),
    str(Path.home() / "Android"),
]


def _roots() -> list[Path]:
    roots: list[Path] = []
    env_roots = os.environ.get("TOOL_ROOTS")
    if env_roots:
        roots += [Path(x) for x in env_roots.split(os.pathsep) if x.strip()]
    for key in ("TOOL_ROOT", "ANDROID_SDK_ROOT", "ANDROID_HOME"):
        v = os.environ.get(key)
        if v and v.strip():
            roots.append(Path(v))
    for r in _DEFAULT_ROOTS:
        roots.append(Path(r))
    seen: set[str] = set()
    out: list[Path] = []
    for r in roots:
        key = str(r)
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def _pick_latest(hits: list[Path]) -> Path | None:
    """多条命中时取路径字典序最靠后者（版本目录通常 35.0.0 > 34.0.0）。"""
    if not hits:
        return None
    return sorted(hits, key=lambda p: str(p))[-1]


def find_tool(
    name: str,
    env_keys: tuple[str, ...] = (),
    glob_patterns: tuple[str, ...] = (),
    fallback: tuple[str, ...] = (),
) -> str | None:
    """按优先级定位可执行文件，返回存在的路径字符串；都找不到返回 None。

    :param name: 可执行文件名（含扩展名），用于 PATH 查找，如 ``aapt2.exe``
    :param env_keys: 环境变量名列表，指向该工具可执行文件
    :param glob_patterns: 相对根目录的 glob 模式，版本号用 ``*`` 通配，
                          如 ``Android/Sdk/build-tools/*/aapt2.exe``
    :param fallback: 固定兜底候选路径（缺省为空；可由环境变量或 glob 模式覆盖）
    """
    # 1. 环境变量显式指定
    for key in env_keys:
        v = os.environ.get(key)
        if v and Path(v).is_file():
            return v

    # 2. PATH 查找
    which = shutil.which(name)
    if which:
        return which

    # 3. 根目录 glob 搜索（有限层级，不做全盘递归）
    roots = _roots()
    for pat in glob_patterns:
        for root in roots:
            if not root.exists():
                continue
            hits = list(root.glob(pat))
            pick = _pick_latest(hits)
            if pick is not None:
                return str(pick)

    # 4. 内置兜底候选
    for c in fallback:
        if Path(c).is_file():
            return c

    return None


# ---- 各工具的定位配置（集中维护；新增工具在此登记） ----

TOOL_SPECS: dict[str, dict] = {
    "aapt2": {
        "name": "aapt2.exe",
        "env_keys": ("AAPT2",),
        "glob_patterns": (
            r"Android/Sdk/build-tools/*/aapt2.exe",
            r"TOOL/Android/Sdk/build-tools/*/aapt2.exe",
            r"Android/Sdk/build-tools/*/aapt2",
        ),
        "fallback": (),
    },
    "rabin2": {
        "name": "rabin2.exe",
        "env_keys": ("RABIN2",),
        "glob_patterns": (
            r"radare2-*/bin/rabin2.exe",
            r"radare2*/bin/rabin2.exe",
        ),
        "fallback": (),
    },
    "diec": {
        "name": "diec.exe",
        "env_keys": ("DIE", "DIEC"),
        "glob_patterns": (
            r"die*/diec.exe",
            r"die_win64*/diec.exe",
        ),
        "fallback": (),
    },
    "upx": {
        "name": "upx.exe",
        "env_keys": ("UPX",),
        "glob_patterns": (
            r"upx-*/**/upx.exe",
            r"upx*/upx.exe",
        ),
        "fallback": (),
    },
}


def resolve(tool_key: str) -> str | None:
    """按 TOOL_SPECS 登记的配置定位工具。"""
    spec = TOOL_SPECS[tool_key]
    return find_tool(
        name=spec["name"],
        env_keys=tuple(spec.get("env_keys", ())),
        glob_patterns=tuple(spec.get("glob_patterns", ())),
        fallback=tuple(spec.get("fallback", ())),
    )


def diagnostics() -> dict[str, str | None]:
    """自检：返回 {工具键: 路径或 None}，供 --list-tools 输出。"""
    return {key: resolve(key) for key in TOOL_SPECS}
