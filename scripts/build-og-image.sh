#!/usr/bin/env bash
# Renders scripts/og-image.svg into public/og-image.jpg (1200x630), the card
# Telegram/WhatsApp/Facebook/X show when someone shares a writeready.uz link.
#
# macOS only: it uses Quick Look (qlmanage) + sips, so nothing has to be
# installed. Quick Look always writes a square thumbnail and pads the bottom,
# so the SVG is first padded into a 1200x1200 canvas with the card centred,
# and sips then crops the middle 630 rows back out.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/scripts/og-image.svg"
out="$root/public/og-image.jpg"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# card centred in a square canvas: 285 = (1200 - 630) / 2
{
  echo '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">'
  echo '<rect width="1200" height="1200" fill="#181542"/><g transform="translate(0,285)">'
  sed -e '1,/<svg /d' -e '$d' "$src"
  echo '</g></svg>'
} > "$tmp/square.svg"

qlmanage -t -s 1200 -o "$tmp" "$tmp/square.svg" >/dev/null 2>&1
sips -c 630 1200 "$tmp/square.svg.png" --out "$tmp/card.png" >/dev/null
sips -s format jpeg -s formatOptions 94 "$tmp/card.png" --out "$out" >/dev/null

echo "wrote $out ($(sips -g pixelWidth -g pixelHeight "$out" | tail -2 | tr -d ' \n' | sed 's/pixelWidth:/ /;s/pixelHeight:/x/'), $(( $(wc -c < "$out") / 1024 )) KB)"
