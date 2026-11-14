# One-word shortcuts for the EE271 project. Run `make` (or `make help`) to list them.
#
# Part 1 targets default to part1 (make test PART=part2 is NOT a thing: Part 2/3 have their own targets below).
# These wrap the course's own commands; the handouts' commands still work too.

PART ?= part1
PY   := $(CURDIR)/$(PART)/ee271-conda-env/bin/python
N    := $(patsubst part%,%,$(PART))

# ---- Part 2/3 knobs (override on the command line, e.g. make eq MODE=int8 PE_COUNT=32 RTL=optimized_verilog)
RTL      ?= unoptimized_verilog
PE_COUNT ?= 16
SIM      ?= icarus
MODE     ?= all
TB       ?= pe
export RTL PE_COUNT SIM

.PHONY: help help-rtl setup test test-pe test-buffer test-accel test-ours tour repl submit update-starter \
        walkthrough walkthrough-check docs _env \
        eq eq-stress eq-both tb waves lint pe-unit ctl-check buf-unit check vcs-eq vcs-tb synth fom submit-check clean-build

help:
	@echo "Part 1 (Python):"
	@echo "  make setup           build the Python environment for $(PART) (run once per machine; PART=part2 for the RTL tools)"
	@echo "  make test            run ALL of $(PART)'s public tests (keeps going past failures)"
	@echo "  make test-pe | test-buffer | test-accel | test-ours"
	@echo "  make tour            walk through a tiny matrix-vector multiply (playground/tour.py)"
	@echo "  make repl            Python prompt with Bits and the instruction classes preloaded"
	@echo "  make submit          build $(PART)/assignment$(N).zip for Gradescope (PART=part2 for Part 2)"
	@echo "  make update-starter  pull any staff fixes to the starter code into $(PART)"
	@echo "  make walkthrough     rebuild docs/walkthrough.html;  make docs  rebuild every explainer"
	@echo
	@$(MAKE) --no-print-directory help-rtl

help-rtl:
	@echo "Part 2/3 (RTL). Local = your laptop (Icarus by default, SIM=verilator for speed); caddy = Synopsys tools."
	@echo "  make check           everything local below, in order: lint, pe-unit, ctl-check, buf-unit, eq  (run before you push)"
	@echo "  make eq              the three official equivalence tests, locally   (MODE=int8|int16|int32, WAVES=1)"
	@echo "  make eq-stress       extra seeds, sizes and value ranges the official tests miss"
	@echo "  make eq-both         run Icarus AND Verilator and flag any disagreement"
	@echo "  make pe-unit         processing_element.sv alone vs the staff Python PE   (ACC=<acc signal> also checks it)"
	@echo "  make ctl-check       controller.sv alone (with the given instruction memory) vs the program, cycle by cycle"
	@echo "  make buf-unit        buffer.sv alone vs the staff Python main buffer (read data + MEM2 writes)"
	@echo "  make tb TB=pe        a staff validation testbench (pe|buffer|buffer_wb|controller|top) with a waveform"
	@echo "  make waves           open the newest waveform in Surfer"
	@echo "  make lint            Verilator lint of our RTL (widths, latches, undriven signals, ...)"
	@echo "  -- on caddy (tcsh; source part2/load_modules.sh) --"
	@echo "  make vcs-eq          the official VCS equivalence tests (MODE=..., PE_COUNT=..., RTL=...)"
	@echo "  make vcs-tb TB=pe    a staff validation testbench in VCS (then: make -C part2/$(RTL)/validation debug)"
	@echo "  make synth           Design Compiler (PERIOD=2.0, PE_COUNT, RTL, TAG); keeps a record in runs/<tag>/"
	@echo "  make fom RUN=runs/<tag> [BASE=runs/<other>]   Part 3 figure of merit (+ % vs a baseline)"
	@echo "  make submit-check    sanity-check the Part 2 submission (compile.log, tests) before make submit PART=part2"
	@echo "Knobs: RTL=$(RTL) PE_COUNT=$(PE_COUNT) SIM=$(SIM) MODE=$(MODE)"

setup:
	@scripts/setup.sh $(PART)

_env:
	@test -x "$(PY)" || { echo "No environment yet for $(PART). Run: make setup"; exit 1; }

# -k = keep going, so one failing test file doesn't hide the others' results.
test: _env
	-@$(MAKE) --no-print-directory -k -C $(PART)/test run_tests PYTHON="$(PY)"

test-pe: _env
	-@$(MAKE) --no-print-directory -C $(PART)/test run_processing_element_test PYTHON="$(PY)"

test-buffer: _env
	-@$(MAKE) --no-print-directory -C $(PART)/test run_main_buffer_test PYTHON="$(PY)"

test-accel: _env
	-@$(MAKE) --no-print-directory -C $(PART)/test run_accelerator_test PYTHON="$(PY)"

test-ours: _env
	-@cd $(PART)/test && for f in test_ours*.py; do echo ">> $$f"; "$(PY)" "$$f"; done

tour: _env
	@"$(PY)" playground/tour.py $(ARGS) || true

repl: _env
	@cd $(PART) && "$(PY)" -i -c "from bitstring import Bits; from src.instruction import *; from src.assembler import Assembler; print('Loaded: Bits, the instruction classes (PEI, MI, Mode, ...), Assembler. Quit with Ctrl-D.')"

# Delete the old zip first: `zip -r` adds to an existing archive, so stale files would
# survive. Also drop __pycache__, which the course Makefile's exclude pattern misses.
submit:
	@if [ "$(PART)" = part2 ]; then scripts/rtl/submit_check.sh || exit 1; fi
	@rm -rf $(PART)/src/__pycache__ $(PART)/assignment$(N).zip
	@$(MAKE) --no-print-directory -C $(PART) generate_submission
	@echo; unzip -l $(PART)/assignment$(N).zip
	@echo; echo "Upload $(PART)/assignment$(N).zip to Gradescope (add your partner to the submission)."

update-starter:
	@scripts/pull-starter.sh $(PART)

# The animated walkthrough (docs/walkthrough.html) is built from docs/walkthrough-src/.
walkthrough:
	@if [ -x "$(PY)" ]; then "$(PY)" docs/walkthrough-src/trace_values.py part1 docs/walkthrough-src/values.json; \
	 else echo "(no conda env: reusing docs/walkthrough-src/values.json)"; fi
	@python3 docs/walkthrough-src/build.py

walkthrough-check: _env
	@"$(PY)" docs/walkthrough-src/dump_fixtures.py part1 docs/walkthrough-src/fixtures.json
	@node docs/walkthrough-src/test_model.js

# Every explainer that has a docs/<page>-src/build.py (they use the recorded data checked in next to them).
docs:
	@for b in docs/*-src/build.py; do echo ">> $$b"; python3 "$$b" || exit 1; done

# ------------------------------------------------------------------ Part 2/3: local simulation (laptop)
eq:
	@scripts/rtl/eq.sh $(MODE)

eq-stress:
	@scripts/rtl/eq.sh stress

eq-both:
	@scripts/rtl/eq.sh both $(MODE)

tb:
	@scripts/rtl/tb.sh $(TB)

pe-unit:
	@scripts/rtl/pe_unit.sh

ctl-check:
	@scripts/rtl/ctl_check.sh

buf-unit:
	@scripts/rtl/buf_unit.sh

lint:
	@scripts/rtl/lint.sh

# Stops at the first failing step; each step says what to look at.
check:
	@scripts/rtl/lint.sh && scripts/rtl/pe_unit.sh && scripts/rtl/ctl_check.sh && scripts/rtl/buf_unit.sh && scripts/rtl/eq.sh all \
	  && echo && echo "ALL LOCAL CHECKS PASS for $(RTL) ($(PE_COUNT) PEs, $(SIM)). Before submitting also run: make eq-stress, and on caddy: make vcs-eq"

waves:
	@files=$$(find build -name 'waves.vcd' -type f 2>/dev/null); f=""; \
	 if [ -n "$$files" ]; then f=$$(ls -t $$files | head -1); fi; \
	 if [ -z "$$f" ]; then echo "No waveform yet. Run e.g. make tb TB=pe, or make eq MODE=int32 WAVES=1"; exit 1; fi; \
	 echo ">> $$f"; \
	 if command -v surfer >/dev/null; then (surfer "$$f" >/dev/null 2>&1 &); \
	 else echo "Install a viewer: brew install surfer (or the Surfer / WaveTrace extension in VS Code), then open that file."; fi

clean-build:
	rm -rf build

# ------------------------------------------------------------------ Part 2/3: Synopsys tools (caddy)
vcs-eq:
	@scripts/rtl/vcs.sh eq $(MODE)

vcs-tb:
	@scripts/rtl/vcs.sh tb $(TB)

synth:
	@scripts/rtl/synth.sh

fom:
	@python3 scripts/fom.py $(if $(RUN),--run $(RUN)) $(if $(BASE),--baseline $(BASE)) $(FOM_ARGS)

submit-check:
	@scripts/rtl/submit_check.sh
