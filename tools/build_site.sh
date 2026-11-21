#!/bin/zsh
# Build the GitHub Pages site: OIP's editor (pinned checkout, MIT) with the Dual-SCARA cell opening on load.
#   tools/build_site.sh [outDir]        default _build/site; publish it as the gh-pages branch
set -e
P=${0:A:h}/..
OIP=${OIP:-$HOME/code/_vendor/open-industry-project}
OUT=${1:-$P/_build/site}
BASE=/scara-cell-oip/
node $P/tools/scene_file.mjs $P/dist/scara-cell.scene.json
(cd $OIP && npx vite build --base $BASE --outDir $OUT --emptyOutDir --logLevel error)
rm -rf $OUT/{landing,sim-loop*,og-image.jpg,_headers,_redirects}
missing=$(grep -oE 'url:"[^"]+"' $OUT/sw.js | sed 's/url:"//;s/"//' | while read u; do [ -e "$OUT/$u" ] || echo "$u"; done)
[[ -z $missing ]] || { echo "✗ precached but missing: $missing"; exit 1; }
cp $P/site/index.html $OUT/index.html
cp $P/site/base-shim.js $P/site/autoload.js $OUT/app/
perl -0pi -e "s#<head>#<head>\n<script src=\"${BASE}app/base-shim.js\"></script>\n<script src=\"${BASE}app/autoload.js\"></script>#" $OUT/app/index.html
grep -q autoload.js $OUT/app/index.html
cp $P/dist/scara-cell.scene.json $OUT/
cp $OIP/LICENSE $OUT/LICENSE-OIP.txt
touch $OUT/.nojekyll
find $OUT -size +100M | grep . && { echo "✗ a file over 100 MB"; exit 1; }
du -sh $OUT
