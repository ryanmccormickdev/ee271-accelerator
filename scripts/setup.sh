#!/usr/bin/env bash
# Build (or refresh) the Python environment for one project part.
#
#   scripts/setup.sh          # part1 (default)
#   scripts/setup.sh part2    # a later part, once it's been imported
#
# It runs the exact command from the handout (conda env create -p ee271-conda-env
# -f requirements.yml) inside the part's folder, so everyone gets the same Python
# and library versions the staff use. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

PART="${1:-part1}"
ENV="$PART/ee271-conda-env"
[ -f "$PART/requirements.yml" ] || { echo "No $PART/requirements.yml. Is $PART imported yet?"; exit 1; }

# Find conda, even when this runs from a shell where `conda` isn't on PATH.
CONDA="${CONDA_EXE:-$(command -v conda || true)}"
if [ -z "$CONDA" ]; then
  for c in "$HOME"/miniforge3/bin/conda "$HOME"/miniconda3/bin/conda "$HOME"/anaconda3/bin/conda \
           /opt/homebrew/anaconda3/bin/conda /opt/homebrew/Caskroom/miniforge/base/bin/conda \
           /opt/miniconda3/bin/conda; do
    [ -x "$c" ] && CONDA="$c" && break
  done
fi
if [ -z "$CONDA" ]; then
  cat <<'MSG'
conda isn't installed. Install Miniforge (a small, free conda), then re-run this script:
  macOS:  brew install --cask miniforge && conda init "$(basename "$SHELL")"
  Linux:  see the "Installing on Linux" link in handouts/Project_Part_1.pdf (section 2.2)
Then open a NEW terminal and run: make setup
MSG
  exit 1
fi

if [ -x "$ENV/bin/python" ]; then
  echo ">> Updating existing environment $ENV"
  "$CONDA" env update -p "$ENV" -f "$PART/requirements.yml" --prune
else
  echo ">> Creating environment $ENV (first time takes a few minutes)"
  "$CONDA" env create -p "$ENV" -f "$PART/requirements.yml"
fi

echo ">> Checking the environment"
"$ENV/bin/python" - <<'PY'
import sys
import bitstring, numpy, terminaltables
print(f"OK: Python {sys.version.split()[0]}, bitstring {bitstring.__version__}, numpy {numpy.__version__}")
PY
echo ">> Done. Next: make test"
