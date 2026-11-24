#!/usr/bin/env python3
"""只读 ELF 初筛：架构/类型/NEEDED/导出导入/JNI 线索。

用法:
    python elf_triage.py <so-or-exe>
    python elf_triage.py --list-tools

pyelftools 可用时优先解析；缺库回退 rabin2（经 _toolfind 自动定位）。只读，不修改目标。
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _toolfind  # noqa: E402


def find_rabin2() -> str | None:
    return _toolfind.resolve("rabin2")


def via_pyelftools(path: Path) -> dict:
    from elftools.elf.elffile import ELFFile  # type: ignore
    out: dict = {"backend": "pyelftools"}
    with path.open("rb") as f:
        elf = ELFFile(f)
        out["class"] = elf.header.e_ident.EI_CLASS
        out["machine"] = elf.header.e_machine
        out["type"] = elf.header.e_type
        out["entry"] = hex(elf.header.e_entry)
        needed: list[str] = []
        jni: list[str] = []
        exports: list[str] = []
        imports: list[str] = []
        dynsym = elf.get_section_by_name(".dynsym")
        if dynsym is not None:
            for sym in dynsym.iter_symbols():
                name = sym.name or ""
                if not name:
                    continue
                if sym.entry.st_shndx == "SHN_UNDEF":
                    imports.append(name)
                else:
                    exports.append(name)
                if name.startswith("Java_") or name == "JNI_OnLoad":
                    jni.append(name)
        for seg in elf.iter_segments():
            if seg.header.p_type != "PT_DYNAMIC":
                continue
            for tag in seg.iter_tags():
                if tag.entry.d_tag == "DT_NEEDED":
                    needed.append(tag.needed)
        out["needed"] = sorted(set(needed))
        out["exports"] = sorted(set(exports))
        out["imports"] = sorted(set(imports))
        out["jni"] = sorted(set(jni))
        return out


def via_rabin2(path: Path) -> dict:
    out: dict = {"backend": "rabin2"}
    rabin2 = find_rabin2()
    if not rabin2:
        raise RuntimeError("pyelftools 缺失且 rabin2 未找到（环境变量/PATH/根目录 glob/兜底候选均未命中）")
    info = subprocess.run([rabin2, "-I", str(path)], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=60).stdout
    imp = subprocess.run([rabin2, "-i", str(path)], capture_output=True, text=True,
                         encoding="utf-8", errors="replace", timeout=60).stdout
    exp = subprocess.run([rabin2, "-E", str(path)], capture_output=True, text=True,
                         encoding="utf-8", errors="replace", timeout=60).stdout
    def kv(line: str):
        parts = line.split(":", 1)
        return (parts[0].strip(), parts[1].strip()) if len(parts) == 2 else (line.strip(), "")
    for line in info.splitlines():
        k, v = kv(line)
        if k in ("class", "arch", "type", "entrypoint"):
            out[k] = v
    out["imports"] = [l for l in imp.splitlines() if l and not l.startswith("[")][:200]
    out["exports"] = [l for l in exp.splitlines() if l and not l.startswith("[")][:200]
    out["jni"] = [s for s in out["imports"] + out["exports"]
                  if s.startswith("Java_") or "JNI_OnLoad" in s]
    out["needed"] = []
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="只读 ELF 初筛")
    ap.add_argument("target", nargs="?", help="ELF(so/exe) 路径")
    ap.add_argument("--list-tools", action="store_true", help="自检：输出各外部工具定位结果")
    args = ap.parse_args()

    if args.list_tools:
        for key, path in _toolfind.diagnostics().items():
            print(f"{key}: {path or '[缺口] 未找到'}")
        return 0

    if not args.target:
        ap.error("缺少目标路径（或使用 --list-tools）")
    path = Path(args.target)
    if not path.is_file():
        print(f"[缺口] 文件不存在: {path}", file=sys.stderr)
        return 2

    try:
        info = via_pyelftools(path)
    except Exception as e1:
        try:
            info = via_rabin2(path)
            info["pyelftools_gap"] = str(e1)
        except Exception as e2:
            print(f"[缺口] 两种解析路径均失败: pyelftools={e1}; rabin2={e2}", file=sys.stderr)
            return 3

    print(f"# ELF 初筛 · {path.name}")
    print(f"backend={info['backend']}")
    for k in ("class", "machine", "arch", "type", "entry", "entrypoint"):
        if info.get(k):
            print(f"{k}={info[k]}")
    print("needed=" + (", ".join(info.get("needed", [])) or "未确认"))
    jni = info.get("jni", [])
    print(f"jni_symbols ({len(jni)}):")
    for s in jni[:50]:
        print(f"  - {s}")
    print(f"exports={len(info.get('exports', []))} imports={len(info.get('imports', []))}")
    if info.get("pyelftools_gap"):
        print(f"[缺口] pyelftools: {info['pyelftools_gap']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
