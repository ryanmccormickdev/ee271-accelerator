# Shared helpers for the local RTL flow (sourced by scripts/rtl/*.sh; works with macOS bash 3.2).
#
# Knobs (environment variables, all optional; the Makefile passes them through):
#   RTL=unoptimized_verilog   folder under part2/ that holds logical/ (Part 3: RTL=optimized_verilog), or an absolute path
#   PE_COUNT=16               number of PEs (passed to ivd-gv, ivd-cc, ivd-sim, ivd-as)
#   SIM=icarus                or verilator (faster to run, but see "Why Icarus by default" below)
#   WAVES=1                   dump a waveform (build/.../waves.vcd), open it with `make waves`
#
# Why Icarus by default: the staff's SRAM model (logical/array.sv) updates read_data with a BLOCKING assignment
# inside `always @(posedge clk)` and drives q from a separate latch block, so a flop that samples q (or inst) at the
# same edge races with it. Event-driven simulators (Icarus, and VCS, which grades us) run every posedge block before
# the latch updates q, so q behaves like a normal synchronous SRAM output. Verilator, at its default optimization,
# inlines the instruction memory and makes q an alias of read_data: a controller that latches `inst` at the edge then
# skips the FIRST instruction of every program (the staff's pe_test.asm outputs 0 instead of 0x0800f4f8). The
# official equivalence tests can't see that, because the first instruction is a redundant CLR. `-fno-inline` fixes
# it (checked on every test here), so SIM=verilator uses it, and `make eq-both` runs both simulators and flags any
# disagreement. Verified 2026-11-14 with Verilator 5.052 and Icarus 13.0; see docs/spec-notes.md.

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
P2="$REPO/part2"
BIN="$P2/simulator/bin"
RTL="${RTL:-unoptimized_verilog}"
case "$RTL" in   # a folder under part2/, or an absolute path to any folder that has logical/ (handy for experiments)
  /*) RTL_DIR="$RTL"; RTL_NAME="$(basename "$(dirname "$RTL")")-$(basename "$RTL")" ;;
  *)  RTL_DIR="$P2/$RTL"; RTL_NAME="$RTL" ;;
esac
LOGICAL="$RTL_DIR/logical"
PE_COUNT="${PE_COUNT:-16}"
SIM="${SIM:-icarus}"
WAVES="${WAVES:-0}"
BUILD="${BUILD_DIR:-$REPO/build}"
VERILATOR_OPT="${VERILATOR_OPT:--O2 -fno-inline}"

die()  { echo "ERROR: $*" >&2; exit 1; }
note() { echo ">> $*"; }

[ -d "$LOGICAL" ] || die "no RTL folder $LOGICAL (RTL=$RTL). Part 3 work goes in part2/optimized_verilog/ (see docs/PLAN.md)."

# The staff tools need bitstring < 5 (ivd-as uses Bits.length, which bitstring 5.0 removed).
pick_python() {
  if [ -n "${PYTHON:-}" ]; then PY="$PYTHON"
  elif [ -x "$P2/ee271-conda-env/bin/python" ]; then PY="$P2/ee271-conda-env/bin/python"
  elif [ -x "$REPO/part1/ee271-conda-env/bin/python" ]; then PY="$REPO/part1/ee271-conda-env/bin/python"
  else die "no Python environment. Run: make setup PART=part2"; fi
  if ! "$PY" -c 'import bitstring,sys; sys.exit(0 if int(bitstring.__version__.split(".")[0]) < 5 else 1)' 2>/dev/null; then
    die "$PY has bitstring >= 5, which breaks the staff's ivd-as (AttributeError: 'Bits' object has no attribute 'length').
       Fix: make setup PART=part2   (builds part2/ee271-conda-env with bitstring<5)"
  fi
}
pick_python

# Run a staff tool: ivd gv|cc|as|mg|sim [args...]. They import `src` via simulator/bin/src -> ../src.
ivd() { local t="$1"; shift; "$PY" "$BIN/ivd-$t" "$@"; }

# Smallest instruction-memory depth (power of two, >= 128) that holds N instructions.
# ivd-as silently drops instructions beyond --controller_imem_depth, so we size it to the program.
imem_depth_for() { local d=128; while [ "$d" -lt "$1" ]; do d=$((d * 2)); done; echo "$d"; }

need_tool() { command -v "$1" >/dev/null 2>&1 || die "$1 not found. $2"; }

# Copy a staff testbench, replacing the three VCS-only system tasks (and $fatal's argument order for Icarus).
#   shim_tb <in.sv> <out.sv> <tb module name> <wavefile>
shim_tb() {
  local in="$1" out="$2" top="$3" wave="$4"
  sed -e "s|\\\$vcdpluson;|\$dumpfile(\"$wave\"); \$dumpvars(0, $top);|" \
      -e 's|\$vcdplusmemon;||' \
      -e 's|\$assertkill();||' \
      -e 's|\$fatal(|$fatal(1, |' \
      "$in" > "$out"
}

# The staff testbenches reach into the design by name; say so when that is what failed.
hier_hint() {
  if grep -q -E "Unable to bind|unknown task|Can't find definition|Cannot find|dut\.(u_buffer|pe_inst_valid|buf_inst_valid)" "$1"; then
    echo "   HINT: the testbench refers to names inside your design. top.sv must declare signals named pe_inst_valid and"
    echo "         buf_inst_valid, and instantiate the buffer as u_buffer (whose SRAMs stay u_matrix_mem, u_vector_mem,"
    echo "         u_output_mem) and the instruction memory as u_instruction_memory (it already is)."
  fi
}

# Build a simulator.  build_sim <outdir> <top module> <tb file> [extra -y/-I dirs...]
# Leaves the executable command in SIM_CMD.  Builds into <outdir>/obj_dir (Verilator) or <outdir>/sim.vvp (Icarus).
# The RTL comes from $LOGICAL exactly as it is (including the staff's array.sv).
build_sim() {
  local out="$1" top="$2" tb="$3"; shift 3
  rm -f "$out/array.sv"            # never let a stray copy shadow logical/array.sv
  local d
  if [ "$SIM" = verilator ]; then
    need_tool verilator "Install it with: brew install verilator, or use the default SIM=icarus"
    local incs=""
    for d in "$out" "$LOGICAL" "$@"; do incs="$incs -I$d -y $d"; done
    # -Wno-fatal: the staff files raise many style warnings; real problems still fail the build.
    # shellcheck disable=SC2086
    ( cd "$out" && verilator --binary --timing -j 0 $VERILATOR_OPT -Wno-fatal -Wno-lint -Wno-style -Wno-TIMESCALEMOD \
        --timescale 1ns/1ps --trace --top-module "$top" $incs +libext+.sv "$tb" -o simv ) > "$out/build.log" 2>&1 \
      || { grep -E '%Error' "$out/build.log" | sed "s|$out/||" | head -12; hier_hint "$out/build.log"
           die "Verilator build failed (full log: $out/build.log)"; }
    SIM_CMD="$out/obj_dir/simv"
  elif [ "$SIM" = icarus ]; then
    need_tool iverilog "Install it with: brew install icarus-verilog"
    local yflags=""
    for d in "$out" "$LOGICAL" "$@"; do yflags="$yflags -I$d -y$d"; done
    # shellcheck disable=SC2086
    ( cd "$out" && iverilog -g2012 -o sim.vvp $yflags -Y .sv "$tb" ) > "$out/build.log" 2>&1 \
      || { grep -i -E 'error' "$out/build.log" | grep -v -i -E 'sorry|warning' | sed "s|$out/||" | head -12
           hier_hint "$out/build.log"
           echo "   (Icarus supports most but not all SystemVerilog; if an error is about language support, try SIM=verilator)"
           die "Icarus build failed (full log: $out/build.log)"; }
    SIM_CMD="vvp -n $out/sim.vvp"
  else
    die "SIM must be icarus or verilator (got $SIM)"
  fi
}

wave_name() { echo waves.vcd; }   # VCD: Homebrew Verilator's FST writer needs lz4 headers that may be missing
