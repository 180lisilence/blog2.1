#!/usr/bin/env python3
"""只读 APK 身份识别：解析 aapt2 badging，回填 identity.txt 字段。

用法:
    python recon_identity.py <apk> [--out <file>] [--json]
    python recon_identity.py --list-tools

只读：不修改 APK；--out 缺省结果打印到 stdout。
aapt2 经 _toolfind 自动定位（环境变量 > PATH > 根目录 glob > 兜底候选）；
缺失时回退 androguard；两者都缺则返回缺口报告。
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _toolfind  # noqa: E402


def find_aapt2() -> str | None:
    return _toolfind.resolve("aapt2")


def parse_badging(text: str) -> dict:
    info: dict = {
        "package": None, "versionName": None, "versionCode": None,
        "minSdk": None, "targetSdk": None, "launchable": None,
        "label": None, "permissions": [], "nativeCode": [],
    }
    m = re.search(r"package:\s+name='([^']*)'\s+versionCode='([^']*)'\s+versionName='([^']*)'", text)
    if m:
        info["package"], info["versionCode"], info["versionName"] = m.group(1), m.group(2), m.group(3)
    m = re.search(r"(?:minSdkVersion|sdkVersion):'([^']*)'", text)
    if m:
        info["minSdk"] = m.group(1)
    m = re.search(r"targetSdkVersion:'([^']*)'", text)
    if m:
        info["targetSdk"] = m.group(1)
    m = re.search(r"launchable-activity:\s+name='([^']*)'", text)
    if m:
        info["launchable"] = m.group(1)
    m = re.search(r"application-label:\s*'([^']*)'", text)
    if m:
        info["label"] = m.group(1)
    info["permissions"] = re.findall(r"uses-permission:\s+name='([^']*)'", text)
    info["nativeCode"] = re.findall(r"native-code:\s+(.+)", text)
    return info


def via_aapt2(apk: Path) -> dict:
    aapt2 = find_aapt2()
    if not aapt2:
        raise RuntimeError("aapt2 未找到（环境变量/PATH/根目录 glob/兜底候选均未命中）")
    proc = subprocess.run(
        [aapt2, "dump", "badging", str(apk)],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"aapt2 失败: {proc.stderr.strip()[:300]}")
    return parse_badging(proc.stdout)


def via_androguard(apk: Path) -> dict:
    from androguard.core.apk import APK  # type: ignore
    a = APK(str(apk))
    return {
        "package": a.get_package(),
        "versionName": a.get_androidversion_name(),
        "versionCode": a.get_androidversion_code(),
        "minSdk": a.get_min_sdk_version(),
        "targetSdk": a.get_target_sdk_version(),
        "launchable": a.get_main_activity(),
        "label": a.get_app_name(),
        "permissions": sorted(a.get_permissions()),
        "nativeCode": [],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="只读 APK 身份识别")
    ap.add_argument("apk", nargs="?", help="APK 路径")
    ap.add_argument("--out", help="结果输出文件（缺省 stdout）")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    ap.add_argument("--list-tools", action="store_true", help="自检：输出各外部工具定位结果")
    args = ap.parse_args()

    if args.list_tools:
        for key, path in _toolfind.diagnostics().items():
            print(f"{key}: {path or '[缺口] 未找到'}")
        return 0

    if not args.apk:
        ap.error("缺少 APK 路径（或使用 --list-tools）")
    apk = Path(args.apk)
    if not apk.is_file():
        print(f"[缺口] 文件不存在: {apk}", file=sys.stderr)
        return 2

    info: dict = {"source": str(apk), "size_bytes": apk.stat().st_size, "backend": None}
    try:
        info.update(via_aapt2(apk))
        info["backend"] = "aapt2"
    except Exception as e1:
        try:
            info.update(via_androguard(apk))
            info["backend"] = "androguard"
        except Exception as e2:
            info["backend"] = None
            info["gap"] = f"aapt2: {e1}; androguard: {e2}"

    if args.json:
        body = json.dumps(info, ensure_ascii=False, indent=2)
    else:
        lines = [f"# 身份卡 · {apk.name}", f"source={apk}", f"size_bytes={info['size_bytes']}"]
        for k in ("package", "versionName", "versionCode", "minSdk", "targetSdk", "launchable", "label"):
            lines.append(f"{k}={info.get(k) or '未确认'}")
        if info.get("permissions"):
            lines.append("permissions:")
            lines += [f"  - {p}" for p in info["permissions"]]
        if info.get("nativeCode"):
            lines.append(f"nativeCode={info['nativeCode']}")
        if info.get("gap"):
            lines.append(f"[缺口] {info['gap']}")
        body = "\n".join(lines)

    if args.out:
        Path(args.out).write_text(body, encoding="utf-8")
        print(f"[事实] 身份卡已写入: {args.out}")
    else:
        print(body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
