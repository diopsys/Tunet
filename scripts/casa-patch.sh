#!/bin/sh
# Zweig casa: App baut aus diopsys/Tunet (casa) statt gorbi87/Tunet (main).
# Setzt Dockerfile, App-Konfiguration und Repository auf den Fork und vergibt
# die Version <Tunet-Version>-casa.<n>; n steigt bei gleicher Tunet-Version.
# Aufruf: sh scripts/casa-patch.sh [vorherige casa-Version]
set -eu
cd "$(dirname "$0")/.."

basis=$(sed -n 's/^version: *"\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' hassio-addon/config.yaml | sed 's/-casa\..*//')
vorher=${1:-}
n=1
case "$vorher" in
  "$basis"-casa.*) n=$(( ${vorher##*-casa.} + 1 )) ;;
esac

sed -i 's#codeload.github.com/gorbi87/Tunet/tar.gz/refs/heads/main#codeload.github.com/diopsys/Tunet/tar.gz/refs/heads/casa#' hassio-addon/Dockerfile
sed -i \
  -e "s/^name: .*/name: 'Casa (diopsys)'/" \
  -e "s/^description: .*/description: 'Tunet von gorbi87 plus eigene, noch nicht gemergte Änderungen (Zweig casa)'/" \
  -e "s/^version: .*/version: \"$basis-casa.$n\"/" \
  -e "s/^slug: .*/slug: 'casa'/" \
  -e "s#^url: .*#url: 'https://github.com/diopsys/Tunet/tree/casa'#" \
  hassio-addon/config.yaml
printf 'name: Casa (diopsys)\nurl: https://github.com/diopsys/Tunet\nmaintainer: diopsys\n' > repository.yaml

echo "$basis-casa.$n"
