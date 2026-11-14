#!/usr/bin/env bash
# Run one of the staff's validation testbenches (part2/<RTL>/validation/testbenches) locally, with a waveform.
#
#   scripts/rtl/tb.sh pe|buffer|buffer_wb|controller|top      (INST_COUNT=N to override the instruction count)
#
# Same software as the staff validation Makefile: pe -> pe_test.asm, buffer_wb -> buffer_wb_test.asm,
# others -> a random 10x5 INT8 matrix-vector program. These benches check nothing by themselves: they print a few
# lines and leave a waveform for you to read (open it with `make waves`).
set -euo pipefail
. "$(dirname "$0")/common.sh"

TB="${1:-}"
case "$TB" in pe|buffer|buffer_wb|controller|top) ;; *) die "usage: scripts/rtl/tb.sh pe|buffer|buffer_wb|controller|top";; esac
VAL="$RTL_DIR/validation"
[ -f "$VAL/testbenches/tb_$TB.sv" ] || die "no $VAL/testbenches/tb_$TB.sv"

OUT="$BUILD/tb/${RTL_NAME}-${TB}-p${PE_COUNT}-${SIM}"
rm -rf "$OUT"; mkdir -p "$OUT/software"
( cd "$OUT/software"
  case "$TB" in
    pe)        ivd as "$VAL/testbenches/pe_test.asm" --out inst.bits; cp "$VAL/testbenches/pe_test.asm" program.asm ;;
    buffer_wb) ivd as "$VAL/testbenches/buffer_wb_test.asm" --out inst.bits; cp "$VAL/testbenches/buffer_wb_test.asm" program.asm ;;
    *)         ivd mg 10 5 -5 5 --out matrix.npy
               ivd mg 5 1 -5 5 --out vector.npy --seed 12345
               ivd cc matrix.npy vector.npy INT8 --out_mem0 mem0.bits --out_mem1 mem1.bits --out_asm program.asm --pe_count "$PE_COUNT"
               ivd as program.asm --out inst.bits --pe_count "$PE_COUNT" ;;
  esac ) > "$OUT/software.log" 2>&1 || { tail -15 "$OUT/software.log"; die "software generation failed"; }
[ -f "$OUT/software/mem0.bits" ] || { : > "$OUT/software/mem0.bits"; : > "$OUT/software/mem1.bits"; }

ivd gv --out "$OUT/defines.sv" --pe_count "$PE_COUNT"
shim_tb "$VAL/testbenches/tb_$TB.sv" "$OUT/tb_$TB.sv" "tb_$TB" "$(wave_name)"
note "building tb_$TB with $SIM from $LOGICAL"
build_sim "$OUT" "tb_$TB" "$OUT/tb_$TB.sv" "$VAL/testbenches"

LINES=$(grep -c . "$OUT/software/program.asm" || true)
N="${INST_COUNT:-$((LINES + 1))}"   # every program line plus the all-zero padding word, like the equivalence tests
note "running: $LINES program lines, INST_COUNT=$N"
echo "---- program ----"; cat "$OUT/software/program.asm"; echo "-----------------"
# shellcheck disable=SC2086
( cd "$OUT" && $SIM_CMD +INST_COUNT=$N +INST_FILE=software/inst.bits +MEM0_FILE=software/mem0.bits \
    +MEM1_FILE=software/mem1.bits +TIMEOUT="${TIMEOUT:-100000}" ) 2>&1 | tee "$OUT/sim.log" | grep -v -E '^- |^\s*$' || true
if grep -q 'Timeout' "$OUT/sim.log"; then
  echo ">> TIMEOUT: the bench ends when program_counter == INST_COUNT and both pe_inst_valid and buf_inst_valid are low."
  echo "   With an empty or stuck controller that never happens. Look at inst_exec_begins and the FSM in the waveform."
fi
echo ">> waveform: $OUT/$(wave_name)   (open it with: make waves)"
