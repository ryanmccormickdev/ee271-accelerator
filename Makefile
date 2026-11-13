# One-word shortcuts for the EE271 project. Run `make` (or `make help`) to list them.
#
# Everything defaults to part1. For a later part:  make test PART=part2
# These wrap the course's own commands; the handout's commands still work too
# (see docs/tutorial.html, "The official way").

PART ?= part1
PY   := $(CURDIR)/$(PART)/ee271-conda-env/bin/python
N    := $(patsubst part%,%,$(PART))

.PHONY: help setup test test-pe test-buffer test-accel test-ours tour repl submit update-starter walkthrough walkthrough-check _env

help:
	@echo "make setup           build the Python environment for $(PART) (run once per machine)"
	@echo "make test            run ALL of $(PART)'s public tests (keeps going past failures)"
	@echo "make test-pe         just the processing element tests"
	@echo "make test-buffer     just the main buffer tests"
	@echo "make test-accel      just the full-accelerator tests"
	@echo "make test-ours       run our own extra tests ($(PART)/test/test_ours*.py)"
	@echo "make tour            walk through a tiny matrix-vector multiply (playground/tour.py)"
	@echo "make repl            Python prompt with Bits and the instruction classes preloaded"
	@echo "make submit          build $(PART)/assignment$(N).zip for Gradescope"
	@echo "make update-starter  pull any staff fixes to the starter code into $(PART)"
	@echo "make walkthrough     rebuild docs/walkthrough.html (after a starter update)"

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
