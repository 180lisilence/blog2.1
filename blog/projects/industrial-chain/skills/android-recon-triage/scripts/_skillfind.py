#!/usr/bin/env python3
"""Skill 库自动发现 + 意图路由模块（只读）。

2.0 在 ``_toolfind.py``（外部工具发现）之外，再把本地 skill 库纳入路由：
扫描各 skill 根目录下的 ``SKILL.md`` -> 解析 frontmatter（name / description /
triggers）-> 建索引缓存 -> 按用户意图分词打分，召回最相关的候选 skill，供上层
读取对应 SKILL.md 后再执行。

根目录定位（优先级从高到低）：
    1. 环境变量 ``SKILL_ROOTS``（多个路径用 ``os.pathsep`` 分隔，Windows 为 ``;``）；
    2. 内置默认库根（缺省为空，可在脚本内补充跨平台通用候选）。

换电脑 / 挪库后，只要把新库路径写进 ``SKILL_ROOTS``，脚本即可
自行定位，无需改源码；索引缓存用 ``--reindex`` 重建。索引路径也可用环境变量
``SKILL_INDEX`` 覆盖。

解析失败 / 缺字段不崩溃：条目照常进索引并标记缺口，交人工核对，不编造描述。
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

# 内置默认 skill 库根目录（不存在会在扫描时跳过）。本机专属路径不写死；
# 用环境变量 SKILL_ROOTS 指定库根，或在此处补充跨平台通用候选。
_DEFAULT_ROOTS: list[str] = []
_MAX_DEPTH = 3  # 相对 skill 根目录向下递归的层数


# --------------------------------------------------------------------------- #
# 根目录与缓存定位
# --------------------------------------------------------------------------- #

def _roots() -> list[Path]:
    roots: list[Path] = []
    env = os.environ.get("SKILL_ROOTS")
    if env:
        roots += [Path(x) for x in env.split(os.pathsep) if x.strip()]
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


def _index_path() -> Path:
    env = os.environ.get("SKILL_INDEX")
    if env and env.strip():
        return Path(env)
    return Path(__file__).resolve().parent / "skill_index.json"


# --------------------------------------------------------------------------- #
# frontmatter 解析
# --------------------------------------------------------------------------- #

def _unquote(v: str) -> str:
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
        v = v[1:-1]
    return v.strip()


def _first_h1(body: str) -> str:
    for line in body.splitlines():
        m = re.match(r"^#\s+(.*?)\s*#*\s*$", line)
        if m:
            return m.group(1).strip()
    return ""


def _lead_quotes(body: str) -> str:
    """无 frontmatter 时，跳过开头标题/空行，取连续 ``> `` 引用块作描述兜底。"""
    quotes: list[str] = []
    started = False
    for line in body.splitlines():
        s = line.strip()
        if not started:
            if s == "" or s.startswith("#"):
                continue
            started = True
        if s.startswith(">"):
            quotes.append(s.lstrip(">").strip())
        elif s == "":
            continue
        else:
            break
    return " ".join(q for q in quotes if q)


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """拆分并解析 YAML 风格 frontmatter。容错：非标准写法返回空 fm。"""
    text = text.lstrip(chr(0xfeff))  # 剥 UTF-8 BOM
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text
    fm: dict = {}
    i = 1
    fm_lines: list[str] = []
    while i < len(lines) and lines[i].strip() != "---":
        fm_lines.append(lines[i])
        i += 1
    body = "\n".join(lines[i + 1:])

    j = 0
    while j < len(fm_lines):
        line = fm_lines[j]
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if not m:
            j += 1
            continue
        key, val = m.group(1).lower(), m.group(2).strip()

        if key == "name":
            fm["name"] = _unquote(val)
            j += 1
        elif key == "description":
            if val in ("|", ">"):  # 多行块：并入后续缩进行
                block: list[str] = []
                j += 1
                while j < len(fm_lines) and (
                    fm_lines[j].startswith((" ", "\t")) or fm_lines[j].strip() == ""
                ):
                    if fm_lines[j].strip():
                        block.append(fm_lines[j].strip())
                    j += 1
                fm["description"] = _unquote(" ".join(block))
            else:
                fm["description"] = _unquote(val)
                j += 1
        elif key == "triggers":
            trig: list[str] = []
            if val:
                trig += [x.strip() for x in re.split(r"[,，]", val) if x.strip()]
            j += 1
            while j < len(fm_lines) and fm_lines[j].strip().startswith("- "):
                trig.append(fm_lines[j].strip()[2:].strip())
                j += 1
            fm["triggers"] = [_unquote(t) for t in trig if t]
        else:
            j += 1
    return fm, body


# --------------------------------------------------------------------------- #
# 索引构建
# --------------------------------------------------------------------------- #

def _read_text(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def build_index(roots: list[Path] | None = None) -> list[dict]:
    """扫描根目录下所有 SKILL.md，返回条目列表。"""
    roots = roots or _roots()
    entries: list[dict] = []
    seen_keys: set[str] = set()

    for root in roots:
        if not root.exists():
            continue
        root = root.resolve()
        for md in root.rglob("SKILL.md"):
            rel = md.parent.relative_to(root)
            if len(rel.parts) - 1 > _MAX_DEPTH:
                continue
            text = _read_text(md)
            fm, body = _parse_frontmatter(text)
            key = md.parent.name
            desc = fm.get("description", "") or _lead_quotes(body)
            internal = (
                "internal downstream" in desc.lower()
                or key.startswith("competition-")
            )
            entry = {
                "key": key,
                "name": fm.get("name") or key,
                "title": _first_h1(body),
                "description": desc,
                "triggers": fm.get("triggers", []),
                "internal": internal,
                "path": str(md),
                "root": str(root),
            }
            if key not in seen_keys:
                seen_keys.add(key)
                entries.append(entry)
            else:
                # 同名 key 出现在多个根：补充首个缺失的描述字段
                for e in entries:
                    if e["key"] == key and not e["description"] and entry["description"]:
                        e.update({k: entry[k] for k in ("description", "triggers", "path")})
    return entries


def save_index(entries: list[dict], path: Path | None = None) -> Path:
    path = path or _index_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"skills": entries}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


def load_index(reindex: bool = False) -> list[dict]:
    """读缓存索引；缓存缺失或 reindex 时重建并落盘。"""
    idx = _index_path()
    if not reindex and idx.exists():
        try:
            data = json.loads(idx.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "skills" in data:
                return data["skills"]
        except (OSError, json.JSONDecodeError):
            pass
    entries = build_index()
    save_index(entries, idx)
    return entries


# --------------------------------------------------------------------------- #
# 意图路由打分
# --------------------------------------------------------------------------- #

# 本地中英同义词表（可维护；纯标准库无翻译模型，仅覆盖逆向高频核心域）。
# 查询含中文 key 时，把对应英文词并入查询 token，缓解纯英文描述 skill 召回弱。
_SYNONYMS: dict[str, list[str]] = {
    "协议": ["protocol"],
    "抓包": ["pcap", "packet", "capture"],
    "报文": ["packet", "message", "protobuf"],
    "逆向": ["reverse", "reversing"],
    "反编译": ["decompile", "decompilation"],
    "二进制": ["binary"],
    "外挂": ["cheat", "hack"],
    "内存": ["memory"],
    "注入": ["inject", "injection"],
    "固件": ["firmware"],
    "样本": ["sample", "malware"],
    "木马": ["trojan", "malware"],
    "病毒": ["virus", "malware"],
    "渗透": ["pentest", "exploit"],
    "漏洞": ["vulnerability", "cve"],
    "签名": ["sign", "signature"],
    "加密": ["crypto", "encrypt"],
    "混淆": ["obfuscation"],
    "脱壳": ["unpack", "unpacking"],
    "壳": ["packer", "packed"],
    "卡密": ["license", "key", "activation"],
    "注册机": ["keygen"],
    "授权": ["license", "auth"],
}


def _expand(raw: str, qtok: set[str]) -> set[str]:
    """按同义词表把中文意图扩展出对应英文词。"""
    zh = "".join(re.findall(r"[一-鿿]+", raw.lower()))
    extra: set[str] = set()
    for zh_key, ens in _SYNONYMS.items():
        if zh_key in zh:
            extra.update(ens)
    return qtok | extra


def _tokenize(text: str) -> set[str]:
    """英文/数字按词（连字符/下划线/斜杠均作分隔）；中文按 2-gram 滑窗。纯标准库。"""
    text = text.lower()
    toks: set[str] = set()
    for w in re.findall(r"[a-z0-9][a-z0-9_./+]*", text):
        if len(w) >= 2:
            toks.add(w)
    for seg in re.findall(r"[一-鿿]+", text):
        if len(seg) == 1:
            toks.add(seg)
        else:
            for k in range(len(seg) - 1):
                toks.add(seg[k:k + 2])
    return toks


def _score(entry: dict, qtok: set[str], raw: str) -> int:
    name = entry.get("name") or ""
    desc = (entry.get("description") or "") + " " + (entry.get("title") or "")
    trig = " ".join(entry.get("triggers") or [])
    nt, tt, dt = _tokenize(name), _tokenize(trig), _tokenize(desc)
    score = 0
    for t in qtok:
        if t in nt:
            score += 10
        elif t in tt:
            score += 6
        elif t in dt:
            score += 3
    r = raw.lower().strip()
    if r and len(r) >= 2 and r in name.lower():
        score += 5
    if entry.get("internal"):  # CTF/内部下游 skill 降权，不抢主库通用 skill
        score = int(score * 0.7)
    return score


def query(entries: list[dict], text: str, top_k: int = 8) -> list[tuple[int, dict]]:
    """按意图召回候选 skill，返回 [(score, entry), ...]，仅保留 score>0。"""
    qtok = _expand(text, _tokenize(text))
    ranked = [(_score(e, qtok, text), e) for e in entries]
    ranked = [(s, e) for s, e in ranked if s > 0]
    ranked.sort(key=lambda x: (-x[0], x[1]["name"]))
    return ranked[:top_k]


# --------------------------------------------------------------------------- #
# 自检
# --------------------------------------------------------------------------- #

def diagnostics(entries: list[dict]) -> dict:
    missing_desc = [e["key"] for e in entries if not e["description"]]
    return {
        "roots": [str(r) for r in _roots()],
        "index_path": str(_index_path()),
        "skill_count": len(entries),
        "with_description": len(entries) - len(missing_desc),
        "missing_description": missing_desc,
    }


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def _format_row(score: int, e: dict, show_score: bool = True) -> str:
    desc = (e["description"] or e["title"] or "（缺描述）").replace("\n", " ")
    if len(desc) > 70:
        desc = desc[:70] + "…"
    head = f"[{score:>3}] " if show_score else "      "
    trig = ("  触发词: " + ", ".join(e["triggers"])) if e.get("triggers") else ""
    return f"{head}{e['name']}  ->  {e['path']}\n        {desc}{trig}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="本地 skill 库发现与意图路由（只读）")
    ap.add_argument("--query", "-q", help="用户意图，召回相关 skill")
    ap.add_argument("--top", "-k", type=int, default=8, help="返回候选条数")
    ap.add_argument("--list", action="store_true", help="列出索引内全部 skill")
    ap.add_argument("--reindex", action="store_true", help="强制重建索引缓存")
    ap.add_argument("--diagnostics", action="store_true", help="输出索引自检统计")
    args = ap.parse_args(argv)

    entries = load_index(reindex=args.reindex)

    if args.diagnostics or not (args.query or args.list):
        diag = diagnostics(entries)
        print(json.dumps(diag, ensure_ascii=False, indent=2))
        return 0
    if args.list:
        for e in entries:
            print(_format_row(0, e, show_score=False))
        return 0
    if args.query:
        hits = query(entries, args.query, top_k=args.top)
        if not hits:
            print("（无命中；可放宽关键词，或 --diagnostics 查看已索引 skill）")
            return 0
        for score, e in hits:
            print(_format_row(score, e))
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
