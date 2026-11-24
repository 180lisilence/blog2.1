#!/usr/bin/env python3
"""只读字符串提取 + 关键词分组扫描。

用法:
    python strings_scan.py <file-or-dir> [--min 4] [--max-size 52428800] [--out <file>]

纯标准库；扫描 ASCII 可打印串并按内置关键词分组。只读，不写样本目录。
"""
import argparse
import re
import sys
from pathlib import Path

GROUPS: dict[str, list[str]] = {
    "auth": [r"token", r"secret", r"password", r"passwd", r"license", r"licen[cs]e",
             r"vip", r"activat", r"verify", r"expir", r"card[_-]?key", r"redeem",
             r"卡密", r"授权", r"激活", r"会员", r"过期", r"签到"],
    "url": [r"https?://", r"wss?://", r"ftp://", r"[a-z0-9.-]+\.(com|cn|net|org|io|app|dev)/"],
    "security": [r"ptrace", r"tracerpid", r"magisk", r"superuser", r"\bsu\b", r"emulator",
                 r"qemu", r"genymotion", r"frida", r"xposed", r"substrate", r"\bhook\b",
                 r"root", r"debugg", r"anti[-_ ]?debug"],
    "sdk": [r"umeng", r"bugly", r"alibaba", r"tencent", r"wechat", r"qq", r"jpush",
            r"getui", r"baidu", r"bytedance", r"huawei", r"xiaomi", r"oppo", r"vivo",
            r"shumei", r"cubehawk", r"secsdk"],
    "storage": [r"sharedpreferences", r"sqlite", r"\.db\b", r"mmkv", r"datastore"],
}

SKIP_DIRS = {"build", "node_modules", ".git", "extracted_jadx", ".idea", "gradle"}
PRINTABLE = re.compile(rb"[\x20-\x7e]+")


def extract_ascii(buf: bytes, min_len: int):
    for m in PRINTABLE.finditer(buf):
        if len(m.group()) >= min_len:
            yield m.start(), m.group().decode("ascii", errors="replace")


def classify(s: str) -> list[str]:
    low = s.lower()
    hits = []
    for group, patterns in GROUPS.items():
        for p in patterns:
            if re.search(p, low):
                hits.append(group)
                break
    return hits


def scan_file(path: Path, min_len: int, max_size: int) -> tuple[dict, list[str]]:
    findings: dict[str, list[str]] = {g: [] for g in GROUPS}
    skipped: list[str] = []
    try:
        if path.stat().st_size > max_size:
            skipped.append(f"[跳过 超大] {path}")
            return findings, skipped
        buf = path.read_bytes()
    except Exception as e:
        skipped.append(f"[读取失败] {path}: {e}")
        return findings, skipped
    seen: set[tuple[str, str]] = set()
    for off, s in extract_ascii(buf, min_len):
        for g in classify(s):
            key = (g, s)
            if key in seen:
                continue
            seen.add(key)
            findings[g].append(f"{path}:0x{off:x}: {s[:160]}")
    return findings, skipped


def collect_targets(root: Path, walk: bool) -> list[Path]:
    if root.is_file():
        return [root]
    targets: list[Path] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts) and not walk:
            continue
        targets.append(p)
    return targets


def main() -> int:
    ap = argparse.ArgumentParser(description="只读字符串分组扫描")
    ap.add_argument("path", help="文件或目录")
    ap.add_argument("--min", type=int, default=4, help="最短串长（默认 4）")
    ap.add_argument("--max-size", type=int, default=50 * 1024 * 1024, help="单文件跳过阈值字节")
    ap.add_argument("--out", help="结果输出文件（缺省 stdout）")
    ap.add_argument("--all", action="store_true", help="不跳过 build/node_modules 等产物目录")
    args = ap.parse_args()

    root = Path(args.path)
    if not root.exists():
        print(f"[缺口] 路径不存在: {root}", file=sys.stderr)
        return 2

    agg: dict[str, list[str]] = {g: [] for g in GROUPS}
    skipped: list[str] = []
    for f in collect_targets(root, args.all):
        found, skip = scan_file(f, args.min, args.max_size)
        skipped += skip
        for g, items in found.items():
            agg[g] += items

    lines = [f"# 字符串分组扫描 · {root}", ""]
    total = 0
    for g, items in agg.items():
        lines.append(f"## {g} ({len(items)})")
        total += len(items)
        lines += [f"- {x}" for x in items[:200]]
        if len(items) > 200:
            lines.append(f"- … 其余 {len(items) - 200} 条略")
        lines.append("")
    if skipped:
        lines.append("## 跳过/失败")
        lines += [f"- {x}" for x in skipped]
    lines.insert(2, f"命中合计: {total} 条")
    body = "\n".join(lines)

    if args.out:
        Path(args.out).write_text(body, encoding="utf-8")
        print(f"[事实] 扫描清单已写入: {args.out}（命中 {total}）")
    else:
        print(body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
