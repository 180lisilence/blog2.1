#!/usr/bin/env python3
"""只读壳/加固特征初判：DIE CLI + UPX 测试 + 特征关键词。

用法:
    python packer_detect.py <file>
    python packer_detect.py --list-tools

DIE/UPX 经 _toolfind 自动定位（环境变量 > PATH > 根目录 glob > 兜底候选）。
只读；判定结果附证据来源，未命中标"未确认"，不编造脱壳结论。
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _toolfind  # noqa: E402

# 特征关键词（小写子串）-> 判定标签
KEYWORDS: list[tuple[str, str]] = [
    (r"upx!", "UPX 压缩"),
    (r"\$mpress", "MPRESS 压缩"),
    (r"aspack", "ASPack 压缩"),
    (r"themida", "Themida 保护"),
    (r"vmprotect|vmp\d", "VMProtect 保护"),
    (r"naga|娜迦", "娜迦 Naga 加固"),
    (r"apkguard", "APKGuard 壳线索"),
    (r"jinji|腾讯|tencent.*legu|legu", "腾讯乐固/系加固线索"),
    (r"bangcle|梆梆", "梆梆加固线索"),
    (r"ali.*guard|alibaba.*protect", "阿里 Guard 线索"),
    (r"shumei|数美", "数美 SDK 线索"),
    (r"cubehawk", "腾讯 cubehawk 线索"),
]


def find_die() -> str | None:
    return _toolfind.resolve("diec")


def find_upx() -> str | None:
    return _toolfind.resolve("upx")


def run_die(target: Path) -> str | None:
    die = find_die()
    if not die:
        return None
    try:
        p = subprocess.run([die, str(target)], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=60)
        return (p.stdout or p.stderr).strip()
    except Exception as e:
        return f"[DIE 调用失败] {e}"


def run_upx_test(target: Path) -> str | None:
    upx = find_upx()
    if not upx:
        return None
    try:
        p = subprocess.run([upx, "-t", str(target)], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=60)
        out = (p.stdout + p.stderr).strip()
        return out
    except Exception as e:
        return f"[UPX 调用失败] {e}"


def keyword_scan(target: Path) -> list[str]:
    hits: list[str] = []
    try:
        buf = target.read_bytes()
    except Exception as e:
        return [f"[读取失败] {e}"]
    low = buf.lower()
    for pattern, label in KEYWORDS:
        if re.search(pattern.encode(), low):
            hits.append(label)
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description="只读壳/加固初判")
    ap.add_argument("target", nargs="?", help="待判定文件（APK/so/exe/dex）")
    ap.add_argument("--list-tools", action="store_true", help="自检：输出各外部工具定位结果")
    args = ap.parse_args()

    if args.list_tools:
        for key, path in _toolfind.diagnostics().items():
            print(f"{key}: {path or '[缺口] 未找到'}")
        return 0

    if not args.target:
        ap.error("缺少目标文件（或使用 --list-tools）")
    target = Path(args.target)
    if not target.is_file():
        print(f"[缺口] 文件不存在: {target}", file=sys.stderr)
        return 2

    print(f"# 壳/加固初判 · {target.name} ({target.stat().st_size} B)")

    die_out = run_die(target)
    if die_out:
        print("## DIE 输出")
        print(die_out)
    else:
        print("[缺口] DIE CLI 未找到，跳过")

    upx_out = run_upx_test(target)
    if upx_out:
        print("## UPX 测试")
        print(upx_out)
    else:
        print("[缺口] UPX 未找到，跳过")

    kw = keyword_scan(target)
    print("## 关键词特征")
    if kw:
        for k in kw:
            print(f"- {k}")
    else:
        print("- 未命中内置特征（不排除已知壳变体；结论【缺口】）")

    print("## 结论口径")
    print("以上为静态字符串/工具层线索；是否真实加固、校验链与脱壳可行性未确认，不代表已绕过。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
