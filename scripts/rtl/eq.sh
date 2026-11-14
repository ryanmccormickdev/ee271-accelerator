#!/usr/bin/env bash
# Local equivalence test: our RTL vs the staff's Python reference, the same recipe as
# part2/equivalence_testing/Makefile (int8_test / int16_test / int32_test) but with Verilator instead of VCS.
#
#   scripts/rtl/eq.sh int8|int16|int32|all       the official tests (1024x1024 / 512x512 / 256x256, seeds 0 and 12345)
#   scripts/rtl/eq.sh stress                     extra seeds, sizes and value ranges the official tests don't cover
#   ROWS=70 COLS=5 scripts/rtl/eq.sh int8        any size; also MSEED, VSEED (seeds), VMIN, VMAX (value range)
#
# Plus the common knobs: RTL, PE_COUNT, SIM, WAVES (see common.sh). Results are appended to build/eq/results.tsv.
# The Python half (matrix generation, compile, assemble, reference simulation) is cached in build/sw/.
set -euo pipefail
. "$(dirname "$0")/common.sh"

STATUS=0

official_size() {  # mode -> "rows cols"
  case "$1" in INT8) echo "1024 1024";; INT16) echo "512 512";; INT32) echo "256 256";; esac
}

# run_one MODE ROWS COLS MSEED VSEED VMIN VMAX LABEL
run_one() {
  local mode="$1" rows="$2" cols="$3" mseed="$4" vseed="$5" vmin="$6" vmax="$7" label="$8"
  local sw="$BUILD/sw/${mode}-${rows}x${cols}-v${vmin}_${vmax}-s${mseed}_${vseed}-p${PE_COUNT}"

  # ---- software + reference result (cached; redone if the staff simulator changes)
  if [ ! -s "$sw/out.bits" ] || [ -n "$(find "$P2/simulator" -type f -newer "$sw/out.bits" 2>/dev/null | head -1)" ]; then
    rm -rf "$sw"; mkdir -p "$sw"
    note "[$label] generating ${rows}x${cols} $mode data and the Python reference result (cached afterwards)"
    ( cd "$sw"
      ivd mg "$rows" "$cols" "$vmin" "$vmax" --out matrix.npy --seed "$mseed"
      ivd mg "$cols" 1 "$vmin" "$vmax" --out vector.npy --seed "$vseed"
      ivd cc matrix.npy vector.npy "$mode" --out_mem0 mem0.bits --out_mem1 mem1.bits --out_asm mat_mul.asm --pe_count "$PE_COUNT"
      local n depth; n=$(( $(wc -l < mat_mul.asm) + 1 )); depth=$(imem_depth_for "$n")
      ivd as mat_mul.asm --out inst.bits --pe_count "$PE_COUNT" --controller_imem_depth "$depth"
      ivd sim --instruction_bits inst.bits --mem0_bits mem0.bits --mem1_bits mem1.bits --out out.bits \
              --pe_count "$PE_COUNT" --controller_imem_depth "$depth"
      echo "$depth" > imem_depth.txt
    ) > "$sw.log" 2>&1 || { tail -15 "$sw.log"; die "software generation failed (log: $sw.log)"; }
  fi
  local depth; depth=$(cat "$sw/imem_depth.txt")

  # ---- hardware build (one per RTL folder / PE count / IMEM depth / simulator)
  local hw="$BUILD/eq/${RTL_NAME}-p${PE_COUNT}-d${depth}-${SIM}"
  if [ "${BUILT_HW:-}" != "$hw" ]; then
    mkdir -p "$hw"
    ivd gv --out "$hw/defines.sv" --pe_count "$PE_COUNT" --controller_imem_depth "$depth"
    shim_tb "$P2/equivalence_testing/testbench/tb_top.sv" "$hw/tb_top.sv" tb_top "$(wave_name)"
    note "building $RTL with $SIM (PE_COUNT=$PE_COUNT, IMEM depth $depth)"
    build_sim "$hw" tb_top "$hw/tb_top.sv" "$P2/equivalence_testing/testbench"
    BUILT_HW="$hw"
  fi

  # ---- run
  local run="$hw/${mode}-${rows}x${cols}-v${vmin}_${vmax}-s${mseed}_${vseed}"
  rm -rf "$run"; mkdir -p "$run"
  local n dump="+NODUMP"; n=$(( $(wc -l < "$sw/mat_mul.asm") + 1 ))   # same INST_COUNT rule as the staff Makefile
  [ "$WAVES" = 1 ] && dump=""
  local t0 t1; t0=$(date +%s)
  # shellcheck disable=SC2086
  ( cd "$run" && $SIM_CMD $dump +INST_COUNT=$n +INST_FILE="$sw/inst.bits" +MEM0_FILE="$sw/mem0.bits" \
      +MEM1_FILE="$sw/mem1.bits" +TIMEOUT=10000000 +OUTPUT_FILE=result.bits ) > "$run/sim.log" 2>&1 || true
  t1=$(date +%s)
  local cycles; cycles=$(grep -o 'took [0-9]* clock cycles' "$run/sim.log" | awk '{print $2}' | tail -1)
  local verdict
  if grep -q 'Timeout' "$run/sim.log"; then
    verdict=TIMEOUT
  elif [ -s "$run/result.bits" ] && cmp -s "$run/result.bits" "$sw/out.bits"; then
    verdict=PASS
  else
    verdict=FAIL
  fi
  printf '%-7s %-6s %-5s %9sx%-5s cycles=%-7s (%ss)  [%s]\n' "$verdict" "$label" "$mode" "$rows" "$cols" "${cycles:-?}" "$((t1 - t0))" "$run"
  mkdir -p "$BUILD/eq"
  [ -s "$BUILD/eq/results.tsv" ] || printf 'date\trtl\tpe_count\tsim\tmode\trows\tcols\tvalues\tseeds\tcycles\tverdict\n' > "$BUILD/eq/results.tsv"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s..%s\t%s,%s\t%s\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$RTL_NAME" "$PE_COUNT" "$SIM" \
    "$mode" "$rows" "$cols" "$vmin" "$vmax" "$mseed" "$vseed" "${cycles:-}" "$verdict" >> "$BUILD/eq/results.tsv"
  if [ "$verdict" != PASS ]; then
    STATUS=1
    [ "$verdict" = TIMEOUT ] && echo "   The testbench timed out: the design never reached 'PC == INST_COUNT with both valids low'. Check the controller FSM and inst_exec_begins."
    grep -E 'ERROR|Error|FATAL|fatal' "$run/sim.log" | head -5 | sed 's/^/   /' || true
    if [ -s "$run/result.bits" ]; then
      "$PY" "$REPO/scripts/rtl/mem2diff.py" "$run/result.bits" "$sw/out.bits" --mode "$mode" --pe "$PE_COUNT" \
        --matrix "$sw/matrix.npy" --vector "$sw/vector.npy" | sed 's/^/   /'
    fi
    echo "   Re-run with waves: make eq MODE=$(echo "$mode" | tr 'A-Z' 'a-z') WAVES=1 ... then: make waves"
  fi
}

WHAT="${1:-all}"
case "$WHAT" in
  int8|int16|int32|INT8|INT16|INT32)
    MODE=$(echo "$WHAT" | tr 'a-z' 'A-Z'); read -r R C <<< "$(official_size "$MODE")"
    run_one "$MODE" "${ROWS:-$R}" "${COLS:-$C}" "${MSEED:-0}" "${VSEED:-12345}" "${VMIN:--5}" "${VMAX:-5}" official ;;
  all)
    for MODE in INT8 INT16 INT32; do
      read -r R C <<< "$(official_size "$MODE")"
      run_one "$MODE" "$R" "$C" "${MSEED:-0}" "${VSEED:-12345}" "${VMIN:--5}" "${VMAX:-5}" official
    done ;;
  stress)
    # Each line: MODE ROWS COLS MSEED VSEED VMIN VMAX  -- why it's here
    while read -r MODE R C MS VS LO HI _; do
      [ -z "$MODE" ] && continue; case "$MODE" in \#*) continue;; esac
      run_one "$MODE" "$R" "$C" "$MS" "$VS" "$LO" "$HI" stress
    done <<'LIST'
INT8  1024 1024 3 7 -5 5           other seeds: the official INT16/INT32 vectors end in 0 / -1, hiding last-operand bugs
INT16  512  512 3 7 -5 5
INT32  256  256 3 7 -5 5
INT16  512  512 5 9 -1000 1000     INT16 outputs that clamp (the official int16_test never clamps)
INT32  256  256 5 9 -1048576 1048576   INT32 outputs that clamp (the official int32_test never clamps)
INT8   100    1 1 2 -5 5           one column: every MAC instruction runs exactly once (count field 0)
INT16   70    3 2 3 -5 5           rows not a multiple of the tile; cols not a multiple of the lanes
INT32   33    5 4 5 -5 5           a partial last tile
INT8  1000  777 6 7 -5 5           both at once, large
LIST
    ;;
  both)
    # Same tests in both simulators. A disagreement points at a simulation race (see common.sh), not at the math.
    SEL="${2:-all}"
    A=$(SIM=icarus "$0" "$SEL" 2>&1 | tee /dev/stderr | grep -E '^(PASS|FAIL|TIMEOUT)' || true)
    B=$(SIM=verilator "$0" "$SEL" 2>&1 | tee /dev/stderr | grep -E '^(PASS|FAIL|TIMEOUT)' || true)
    echo; echo "== Icarus vs Verilator =="
    paste -d'|' <(echo "$A") <(echo "$B") | while IFS='|' read -r a b; do
      va=$(echo "$a" | awk '{print $1}'); vb=$(echo "$b" | awk '{print $1}')
      ca=$(echo "$a" | grep -o 'cycles=[0-9?]*'); cb=$(echo "$b" | grep -o 'cycles=[0-9?]*')
      what=$(echo "$a" | awk '{print $2, $3, $4}')
      if [ "$va" = "$vb" ] && [ "$ca" = "$cb" ]; then
        echo "agree     $what: $va, $ca"
      else
        echo "DISAGREE  $what: icarus $va $ca / verilator $vb $cb   <- simulator race: trust Icarus/VCS, and find out what samples an SRAM output racily"
        STATUS=1
      fi
    done ;;
  *) die "usage: scripts/rtl/eq.sh int8|int16|int32|all|stress|both [int8|int16|int32|all|stress]" ;;
esac
exit $STATUS
