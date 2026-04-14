#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --section <SECTION-ID> [--book-root <dir>] [--data-dir <path>] <file1.qmd> [file2.qmd ...]" >&2
  echo "  Run from your Quarto book root (or pass --book-root). QMD paths resolve to HTML URLs from that root." >&2
  echo "  Per-page CSV files:" >&2
  echo "    <data-dir>/<SECTION-ID>/yr-coverage--<page-slug>.csv" >&2
  echo "  For each .qmd, adds missing (URL, html-id) rows as not-covered." >&2
  echo "  Writes yr-coverage--<page-slug>.updated.csv next to the target CSV." >&2
}

section_id=""
book_root="."
data_dir="assets/coverage-tracking/coverage-data"
qmd_files=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --section|-s)
      shift
      [[ $# -gt 0 ]] || { usage; exit 1; }
      section_id="$1"
      ;;
    --book-root|-b)
      shift
      [[ $# -gt 0 ]] || { usage; exit 1; }
      book_root="$1"
      ;;
    --data-dir|-d)
      shift
      [[ $# -gt 0 ]] || { usage; exit 1; }
      data_dir="${1%/}"
      ;;
    -*)
      echo "Unknown flag: $1" >&2
      usage
      exit 1
      ;;
    *)
      qmd_files+=("$1")
      ;;
  esac
  shift
done

if [[ -z "$section_id" || ${#qmd_files[@]} -eq 0 ]]; then
  usage
  exit 1
fi

for file in "${qmd_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "QMD file not found: $file" >&2
    exit 1
  fi
done

section_dir="${data_dir}/${section_id}"
mkdir -p "$section_dir"

python3 - "$section_id" "$book_root" "$section_dir" "${qmd_files[@]}" <<'PY'
import csv
import re
import sys
from pathlib import Path

section_id = sys.argv[1]
book_root = Path(sys.argv[2]).resolve()
section_dir = Path(sys.argv[3])
qmd_paths = [Path(p) for p in sys.argv[4:]]


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"\{#[^}]+\}", "", value)
    value = re.sub(r"`([^`]*)`", r"\1", value)
    value = re.sub(r"\[[^\]]+\]\([^)]+\)", "", value)
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "section"


def qmd_to_url(path: Path, root: Path) -> str:
    path = path.resolve()
    try:
        rel = path.relative_to(root)
    except ValueError:
        rel = Path(path.name)
    s = rel.as_posix()
    if s.endswith(".qmd"):
        s = s[:-4] + ".html"
    if not s.startswith("/"):
        s = "/" + s
    return s


def page_url_to_file_slug(page_url: str) -> str:
    p = page_url.lstrip("/")
    return p.replace("/", "--")


def extract_section_ids(path: Path):
    lines = path.read_text(encoding="utf-8").splitlines()
    ids = []
    used = {}
    in_frontmatter = False
    fence = None
    for idx, line in enumerate(lines):
        stripped = line.lstrip()
        if idx == 0 and stripped.startswith("---"):
            in_frontmatter = True
            continue
        if in_frontmatter:
            if stripped.startswith("---") or stripped.startswith("..."):
                in_frontmatter = False
            continue

        fence_match = re.match(r"^(\s*)(`{3,}|~{3,})", line)
        if fence_match:
            marker = fence_match.group(2)
            marker_char = marker[0]
            marker_len = len(marker)
            if fence is None:
                fence = (marker_char, marker_len)
            elif marker_char == fence[0] and marker_len >= fence[1]:
                fence = None
            continue
        if fence is not None:
            continue

        m = re.match(r"^(#{1,6})\s+(.+)$", line)
        if not m:
            continue
        heading = m.group(2).strip()
        explicit = re.search(r"\{#([^}]+)\}\s*$", heading)
        if explicit:
            section_id_heading = explicit.group(1).strip()
        else:
            base = slugify(heading)
            count = used.get(base, 0) + 1
            used[base] = count
            section_id_heading = base if count == 1 else f"{base}-{count}"
        ids.append(section_id_heading)
    return ids


for qmd in qmd_paths:
    url = qmd_to_url(qmd, book_root)
    slug = page_url_to_file_slug(url)
    target = section_dir / f"yr-coverage--{slug}.csv"
    output = section_dir / f"yr-coverage--{slug}.updated.csv"

    entries = {}
    order = []

    if target.exists():
        with target.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.reader(fh)
            for row in reader:
                if not row:
                    continue
                if row[0].strip().lower() == "url" and len(row) > 1 and row[1].strip().lower() == "html-id":
                    continue
                while len(row) < 3:
                    row.append("")
                key = (row[0].strip(), row[1].strip())
                if not key[0] or not key[1]:
                    continue
                entries[key] = [key[0], key[1], row[2].strip()]
                order.append(key)

    seen = set(order)
    for hid in extract_section_ids(qmd):
        key = (url, hid)
        if key in entries:
            continue
        entries[key] = [url, hid, "not-covered"]
        if key not in seen:
            order.append(key)
            seen.add(key)

    with output.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["URL", "html-id", "covered"])
        for key in order:
            writer.writerow(entries[key])

    print(f"Wrote file: {output}")
PY
