#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --coverage <section.csv> <file1.qmd> [file2.qmd ...]" >&2
}

if [[ $# -lt 3 ]]; then
  usage
  exit 1
fi

coverage_csv=""
qmd_files=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --coverage|-c)
      shift
      [[ $# -gt 0 ]] || { usage; exit 1; }
      coverage_csv="$1"
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

if [[ -z "$coverage_csv" || ${#qmd_files[@]} -eq 0 ]]; then
  usage
  exit 1
fi

if [[ ! -f "$coverage_csv" ]]; then
  echo "Coverage CSV not found: $coverage_csv" >&2
  exit 1
fi

for file in "${qmd_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "QMD file not found: $file" >&2
    exit 1
  fi
done

output_csv="${coverage_csv%.csv}.updated.csv"

python3 - "$coverage_csv" "$output_csv" "${qmd_files[@]}" <<'PY'
import csv
import re
import sys
from pathlib import Path

coverage_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
qmd_paths = [Path(p) for p in sys.argv[3:]]

entries = {}
order = []

if coverage_path.exists():
    with coverage_path.open("r", encoding="utf-8", newline="") as fh:
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

def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"\{#[^}]+\}", "", value)
    value = re.sub(r"`([^`]*)`", r"\1", value)
    value = re.sub(r"\[[^\]]+\]\([^)]+\)", "", value)
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "section"

def qmd_to_url(path: Path) -> str:
    rel = path.as_posix().lstrip("./")
    if rel.endswith(".qmd"):
        rel = rel[:-4] + ".html"
    if not rel.startswith("/"):
        rel = "/" + rel
    return rel

def extract_section_ids(path: Path):
    lines = path.read_text(encoding="utf-8").splitlines()
    ids = []
    used = {}
    in_frontmatter = False
    fence = None  # tuple[str, int] => (marker_char, marker_len)
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
            section_id = explicit.group(1).strip()
        else:
            base = slugify(heading)
            count = used.get(base, 0) + 1
            used[base] = count
            section_id = base if count == 1 else f"{base}-{count}"
        ids.append(section_id)
    return ids

for qmd in qmd_paths:
    url = qmd_to_url(qmd)
    for section_id in extract_section_ids(qmd):
        key = (url, section_id)
        if key in entries:
            continue
        entries[key] = [url, section_id, "not-covered"]
        if key not in seen:
            order.append(key)
            seen.add(key)

with output_path.open("w", encoding="utf-8", newline="") as fh:
    writer = csv.writer(fh)
    writer.writerow(["URL", "html-id", "covered"])
    for key in order:
        writer.writerow(entries[key])

print(f"Wrote file: {output_path}")
PY
