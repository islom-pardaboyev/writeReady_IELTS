#!/usr/bin/env bash
# Renders the WriteReady mark into the PNG icons a phone needs once the site is
# installed to a home screen. Run `npm run pwa:icons` after changing
# public/logo.svg, and keep the three sources in sync by hand: this script, that
# file, and the inline <svg> in index.html.
#
# macOS only: like scripts/build-og-image.sh it uses Quick Look (qlmanage) +
# sips, so nothing has to be installed.
#
# Three shapes, because the platforms mask icons differently:
#   pwa-*.png           rounded card, shown as-is where no mask is applied
#   pwa-maskable-*.png  full bleed, mark shrunk into the centre so Android can
#                       crop it to a circle/squircle without clipping the mark
#   apple-touch-icon    full bleed, mark at normal size; iOS rounds it itself,
#                       and would paint transparent corners black
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/public"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mark='<polyline points="104,176 180,368 256,216 332,368" fill="none" stroke="#ffffff" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/><polyline points="332,368 416,120" fill="none" stroke="#f59e0b" stroke-width="56" stroke-linecap="round"/>'

# $1 name  $2 corner radius  $3 scale of the mark about the canvas centre.
# 260,244 is the centre of the mark's bounding box, so scaling about it keeps
# the mark centred rather than drifting towards the origin.
write_svg() {
  cat > "$tmp/$1.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" rx="$2" fill="#4f46e5"/>
<g transform="translate(256,256) scale($3) translate(-260,-244)">$mark</g>
</svg>
SVG
}

# $1 name  $2 output pixel size  $3 output file
render() {
  qlmanage -t -s 512 -o "$tmp" "$tmp/$1.svg" >/dev/null 2>&1
  sips -z "$2" "$2" "$tmp/$1.svg.png" --out "$out/$3" >/dev/null
  echo "wrote public/$3 (${2}x${2}, $(( $(wc -c < "$out/$3") / 1024 )) KB)"
}

write_svg rounded 112 1
render rounded 192 pwa-192x192.png
render rounded 512 pwa-512x512.png

# 0.72 keeps the mark inside the maskable safe zone — the centre circle of 80%
# diameter that every launcher shape is guaranteed to leave visible.
write_svg maskable 0 0.72
render maskable 512 pwa-maskable-512x512.png

write_svg square 0 1
render square 180 apple-touch-icon.png
