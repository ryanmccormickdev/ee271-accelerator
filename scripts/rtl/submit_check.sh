#!/usr/bin/env bash
# Before `make submit PART=part2`: is everything the Part 2 grading criteria need actually there?
#   1. the RTL passes int8_test, int16_test and int32_test   2. compile.log exists and has no errors
# The zip (staff target) contains part2/unoptimized_verilog/logical and part2/unoptimized_verilog/synth/compile.log.
set -uo pipefail
cd "$(dirname "$0")/../.."
LOG=part2/unoptimized_verilog/synth/compile.log
OK=1

if [ ! -f "$LOG" ]; then
  latest=$(ls -td runs/*unoptimized_verilog-p16-* 2>/dev/null | head -1)
  if [ -n "$latest" ] && [ -f "$latest/compile.log" ]; then
    echo ">> no $LOG here; using the one from the latest synthesis record $latest"
    cp "$latest/compile.log" "$LOG"
  else
    echo "MISSING: $LOG. Run 'make synth' on caddy (or copy compile.log from a runs/<tag>/ record)."; OK=0
  fi
fi
if [ -f "$LOG" ]; then
  n=$(grep -c -E '^Error|^\s*Error:' "$LOG" || true)
  if [ "$n" != 0 ]; then echo "compile.log has $n error line(s):"; grep -n -E '^Error|^\s*Error:' "$LOG" | head; OK=0
  else echo "ok: compile.log has no error lines ($(grep -c -i warning "$LOG" || true) warning lines; warnings are fine)"; fi
  # the log must come from the RTL being submitted
  if [ -n "$(find part2/unoptimized_verilog/logical -name '*.sv' -newer "$LOG" 2>/dev/null)" ]; then
    echo "WARNING: some logical/*.sv files are newer than compile.log: re-run make synth so the log matches the code you submit."
  fi
fi

python3 - <<'EOF'
import csv, os
OFFICIAL = {("INT8", "1024"), ("INT16", "512"), ("INT32", "256")}
for src, label in (("build/vcs/results.tsv", "VCS (caddy)"), ("build/eq/results.tsv", "local")):
    if not os.path.exists(src):
        continue
    modes = set()
    for r in csv.DictReader(open(src), delimiter="\t"):
        if r.get("rtl") != "unoptimized_verilog" or r.get("pe_count") != "16" or r.get("verdict") != "PASS":
            continue
        if "rows" in r and ((r["mode"].upper(), r["rows"]) not in OFFICIAL or r["seeds"] != "0,12345" or r["values"] != "-5..5"):
            continue
        modes.add(r["mode"].upper())
    print(f"{label}: official tests that have passed at 16 PEs: {' '.join(sorted(modes)) or 'none'}")
EOF
grep -q 'Your Code Here' part2/unoptimized_verilog/logical/*.sv 2>/dev/null && \
  echo "note: 'Your Code Here' markers are still in some files (harmless if the code is written; grep to be sure)"
[ "$OK" = 1 ] && echo ">> submission inputs look complete." || { echo ">> fix the items above first."; exit 1; }
