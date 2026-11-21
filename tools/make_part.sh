#!/bin/zsh
# Rebuild the SCARA part: procedural model -> weld + Draco -> manifest (model embedded) -> OIP check-part.
set -e
here=${0:A:h}/..
OIP=${OIP:-$HOME/code/_vendor/open-industry-project}
node $here/tools/model.mjs
(cd $OIP && npx gltf-transform weld $here/_build/scara.glb $here/_build/scara_weld.glb && npx gltf-transform draco $here/_build/scara_weld.glb $here/_build/scara_draco.glb) >/dev/null
node $here/tools/build_part.mjs
(cd $OIP && npm run -s check-part -- $here/parts/scara.transfer-robot)
