#!/bin/zsh
# Negative test: the project tests must FAIL on a copy of the program with a protection removed.
#   1. the escapement interlock (BladeUp opens regardless of SCARA 1 position)
#   2. the restart lock after an E-stop (R1Enable follows EStopOk instead of Running)
# Exits 0 only if every mutant is caught by at least one failing test.
set -u
P=${0:A:h}/..
OIP=${OIP:-$HOME/code/_vendor/open-industry-project}
T=$(mktemp -d)
trap 'rm -rf $T' EXIT
caught=0
mutant() {
  rm -rf $T/p; cp -R $P $T/p; rm -rf $T/p/_build $T/p/.git
  python3 - $T/p/plc/program.st "$2" "$3" <<'PY' || { echo "✗ $1: target text not found in program.st"; exit 2; }
import sys
f, old, new = sys.argv[1:]
s = open(f).read()
assert old in s
open(f, "w").write(s.replace(old, new))
PY
  out=$(cd $OIP && npm run -s test-project -- $T/p --context 0 2>&1)
  if print -r -- "$out" | grep -q "^✗"; then
    echo "✓ $1: caught by $(print -r -- "$out" | grep '^✗ .*\.test\.json' | sed -E 's/^✗ ([^ ]+).*/\1/' | tr '\n' ' ')"
    caught=$((caught + 1))
  else
    echo "✗ $1: every test still passes"
  fi
}
mutant "no escapement interlock" " AND S1Empty AND R1Clear AND EyeHead" " AND S1Empty AND EyeHead"
mutant "no restart lock after E-stop" "R1Enable := Running;" "R1Enable := EStopOk;"
[[ $caught -eq 2 ]]
