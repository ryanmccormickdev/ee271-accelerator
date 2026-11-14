#!/usr/bin/env bash
# Design Compiler synthesis (ON CADDY): the staff flow in part2/<RTL>/synth, with our PE count and clock period,
# then a copy of what matters into runs/<tag>/ so results survive the next run and can be committed.
#
#   scripts/rtl/synth.sh                       PERIOD=2.0 PE_COUNT=16 RTL=unoptimized_verilog (the Part 2 defaults)
#   PERIOD=1.6 PE_COUNT=32 RTL=optimized_verilog TAG=p32-mulshare scripts/rtl/synth.sh
#   DRY=1 scripts/rtl/synth.sh                 print what would run (works anywhere)
#
# Needs: tcsh-free is fine, but dc_shell-t must be on PATH (on caddy: `source part2/load_modules.sh` in tcsh, or
# `module load dc_shell/S-2021.06-SP5-4` in bash). The staff Makefile appends to results.txt, so we clear it first;
# compile.log is kept in place (the Part 2 submission zip needs it) and also copied into the run record.
set -euo pipefail
. "$(dirname "$0")/common.sh"

PERIOD="${PERIOD:-2.0}"
AREA="${TARGET_AREA:-150000}"
SYN="$RTL_DIR/synth"
[ -f "$SYN/dc_synth.tcl" ] || die "no $SYN/dc_synth.tcl"
TAG="${TAG:-$(date +%Y%m%d-%H%M)-${RTL_NAME}-p${PE_COUNT}-t${PERIOD}}"
RUN="$REPO/runs/$TAG"

# ivd-gv must generate defines.sv for OUR PE count (the staff Makefile calls it with defaults = 16 PEs).
VG="$PY $BIN/ivd-gv --pe_count $PE_COUNT"
CMD=(make -C "$SYN" synthesize "VG=$VG" "CLK_PERIOD=$PERIOD" "TARGET_AREA=$AREA")
if [ "${DRY:-0}" = 1 ]; then
  echo "would run: rm -f $SYN/results.txt; ${CMD[*]}"; echo "then copy reports to: $RUN"; exit 0
fi
need_tool dc_shell-t "Design Compiler is only on caddy. There: tcsh, then: source part2/load_modules.sh"

note "synthesizing $RTL with $PE_COUNT PEs at a ${PERIOD} ns clock (log: $SYN/compile.log). This can take a while."
rm -f "$SYN/results.txt"
t0=$(date +%s)
"${CMD[@]}" > /dev/null 2>&1 || true          # the staff Makefile tees everything into compile.log
t1=$(date +%s)
mkdir -p "$RUN"
cp "$SYN/compile.log" "$RUN/" 2>/dev/null || true
[ -f "$SYN/results.txt" ] && cp "$SYN/results.txt" "$RUN/"
for r in area_report area_report_hier power_report timing_report_maxsm qor_report design_check error_checking_report; do
  [ -f "$SYN/reports/$r" ] && cp "$SYN/reports/$r" "$RUN/"
done
cat > "$RUN/run.txt" <<EOF
rtl=$RTL
pe_count=$PE_COUNT
clock_period_ns=$PERIOD
target_area=$AREA
git_commit=$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo ?)$(git -C "$REPO" diff --quiet -- "$LOGICAL" 2>/dev/null || echo "+uncommitted")
host=$(hostname)
runtime_s=$((t1 - t0))
EOF
ERRS=$(grep -c -E '^Error|^\s*Error:' "$SYN/compile.log" 2>/dev/null || true)
echo ">> done in $(( (t1 - t0) / 60 )) min. compile.log has $ERRS error line(s) (warnings are fine; errors are not)."
[ "$ERRS" = 0 ] || grep -n -E '^Error|^\s*Error:' "$SYN/compile.log" | head -10
echo ">> run record: $RUN  (commit it if it's a result you'll cite)"
"$PY" "$REPO/scripts/fom.py" --run "$RUN" || true
