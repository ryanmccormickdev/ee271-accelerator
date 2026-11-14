#!/usr/bin/env bash
# The OFFICIAL flows with VCS (ON CADDY), unchanged except for the tool paths and PE count we pass in.
#
#   scripts/rtl/vcs.sh eq int8|int16|int32|all     staff equivalence_testing Makefile (the graded tests)
#   scripts/rtl/vcs.sh tb pe|buffer|...            staff validation Makefile: make compile TB_NAME=..; make run_sim
#   DRY=1 scripts/rtl/vcs.sh eq all                print what would run (works anywhere)
#
# On caddy first: tcsh; source part2/load_modules.sh (puts vcs and dc_shell on PATH). Our Python env must have
# bitstring<5 (make setup PART=part2 does that). Cycle counts go to build/vcs/results.tsv for `make fom`.
set -euo pipefail
. "$(dirname "$0")/common.sh"

WHAT="${1:-}"; ARG="${2:-}"
lanes_for() { case "$1" in int8) echo 4;; int16) echo 2;; int32) echo 1;; esac; }
size_for()  { case "$1" in int8) echo 1024;; int16) echo 512;; int32) echo 256;; esac; }

tools_for() {   # $1 = mode: sets CC AS VG SIM_T with our PE count and an IMEM deep enough for the program
  local n tiles insts depth
  n=$(size_for "$1"); tiles=$(( (n + PE_COUNT * $(lanes_for "$1") - 1) / (PE_COUNT * $(lanes_for "$1")) ))
  insts=$(( 4 * tiles + 1 )); depth=$(imem_depth_for "$insts")
  CC="$PY $BIN/ivd-cc --pe_count $PE_COUNT"
  AS="$PY $BIN/ivd-as --pe_count $PE_COUNT --controller_imem_depth $depth"
  VG="$PY $BIN/ivd-gv --pe_count $PE_COUNT --controller_imem_depth $depth"
  SIM_T="$PY $BIN/ivd-sim --pe_count $PE_COUNT --controller_imem_depth $depth"
  MG="$PY $BIN/ivd-mg"
}

run() { if [ "${DRY:-0}" = 1 ]; then echo "would run: $*"; else "$@"; fi; }

case "$WHAT" in
  eq)
    [ "${DRY:-0}" = 1 ] || need_tool vcs "VCS is only on caddy. There: tcsh, then: source part2/load_modules.sh"
    MODES="$ARG"; [ "$ARG" = all ] || [ -z "$ARG" ] && MODES="int8 int16 int32"
    mkdir -p "$BUILD/vcs"
    [ -s "$BUILD/vcs/results.tsv" ] || printf 'date\trtl\tpe_count\tmode\tcycles\tverdict\n' > "$BUILD/vcs/results.tsv"
    for m in $MODES; do
      tools_for "$m"
      log="$BUILD/vcs/${RTL_NAME}-p${PE_COUNT}-${m}.log"
      note "VCS ${m}_test on $RTL with $PE_COUNT PEs (log: $log)"
      if [ "${DRY:-0}" = 1 ]; then
        echo "would run: make -C $P2/equivalence_testing ${m}_test VERILOG_DIR=$RTL CC=\"$CC\" AS=\"$AS\" VG=\"$VG\" SIM=\"$SIM_T\" MG=\"$MG\""
        continue
      fi
      make -C "$P2/equivalence_testing" "${m}_test" "VERILOG_DIR=$RTL" "CC=$CC" "AS=$AS" "VG=$VG" "SIM=$SIM_T" "MG=$MG" \
        > "$log" 2>&1 || true
      cyc=$(grep -o 'took [0-9]* clock cycles' "$log" | awk '{print $2}' | tail -1)
      if grep -q 'Test PASSED' "$log"; then v=PASS; else v=FAIL; fi
      printf '%-5s %-6s cycles=%s   (%s)\n' "$v" "$m" "${cyc:-?}" "$log"
      printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$RTL_NAME" "$PE_COUNT" "$m" "${cyc:-}" "$v" >> "$BUILD/vcs/results.tsv"
    done ;;
  tb)
    [ -n "$ARG" ] || die "usage: scripts/rtl/vcs.sh tb pe|buffer|buffer_wb|controller|top"
    [ "${DRY:-0}" = 1 ] || need_tool vcs "VCS is only on caddy. There: tcsh, then: source part2/load_modules.sh"
    tools_for int8
    V="$RTL_DIR/validation"
    run make -C "$V" compile "TB_NAME=$ARG" "CC=$CC" "AS=$AS" "VG=$PY $BIN/ivd-gv --pe_count $PE_COUNT" "MG=$MG"
    # every program line plus the all-zero padding word (the staff default of 3 only suits pe_test.asm)
    case "$ARG" in pe) n=3;; buffer_wb) n=2;; *) n=5;; esac
    run make -C "$V" run_sim "INST_COUNT=${INST_COUNT:-$n}"
    echo ">> waveform: $V/vcdplus.vpd   (view it with: make -C $V debug   # DVE)" ;;
  *) die "usage: scripts/rtl/vcs.sh eq int8|int16|int32|all  |  scripts/rtl/vcs.sh tb <name>" ;;
esac
