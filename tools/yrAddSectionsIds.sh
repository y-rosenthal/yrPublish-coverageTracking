#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <input.qmd> [output.qmd]" >&2
  exit 1
fi

input_file="$1"
output_file="${2:-${input_file%.qmd}.with-ids.qmd}"

if [[ ! -f "$input_file" ]]; then
  echo "Input file not found: $input_file" >&2
  exit 1
fi

python3 - "$input_file" "$output_file" <<'PY'
import re
import sys
from pathlib import Path

in_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])

lines = in_path.read_text(encoding="utf-8").splitlines(keepends=True)
used_ids = {}
fence = None  # tuple[str, int] => (marker_char, marker_len)
in_frontmatter = False
frontmatter_seen = False

def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"\{#[^}]+\}", "", value)
    value = re.sub(r"`([^`]*)`", r"\1", value)
    value = re.sub(r"\[[^\]]+\]\([^)]+\)", "", value)
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "section"

def unique_id(base: str) -> str:
    count = used_ids.get(base, 0) + 1
    used_ids[base] = count
    return base if count == 1 else f"{base}-{count}"

out = []
for idx, line in enumerate(lines):
    stripped = line.lstrip()
    line_no_nl = line.rstrip("\n")

    if idx == 0 and stripped.startswith("---"):
        in_frontmatter = True
        frontmatter_seen = True
        out.append(line)
        continue
    if in_frontmatter:
        if stripped.startswith("---") or stripped.startswith("..."):
            in_frontmatter = False
        out.append(line)
        continue

    fence_match = re.match(r"^(\s*)(`{3,}|~{3,})", line_no_nl)
    if fence_match:
        marker = fence_match.group(2)
        marker_char = marker[0]
        marker_len = len(marker)
        if fence is None:
            fence = (marker_char, marker_len)
        elif marker_char == fence[0] and marker_len >= fence[1]:
            fence = None
        out.append(line)
        continue

    if fence is not None:
        out.append(line)
        continue

    m = re.match(r"^(#{1,6})\s+(.+)$", line_no_nl)
    if not m:
        out.append(line)
        continue

    heading_text = m.group(2).rstrip()
    if re.search(r"\{#[^}]+\}\s*$", heading_text):
        out.append(line)
        continue

    base = slugify(heading_text)
    new_id = unique_id(base)
    new_line = f"{m.group(1)} {heading_text} {{#{new_id}}}"
    if line.endswith("\n"):
        new_line += "\n"
    out.append(new_line)

out_path.write_text("".join(out), encoding="utf-8")
print(f"Wrote file: {out_path}")
PY
