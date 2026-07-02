#!/bin/bash
# Make a branded Stand With Meg card for a new State Partner — PNG + PDF.
#
# Usage:
#   ./make-partner-card.sh "Full Name" "State" "Phone" "Email"
#
# Example:
#   ./make-partner-card.sh "Jane Partner" "Oklahoma" "555-010-0100" "partner@example.com"
#
# Output lands in:  partner-cards/<name>.png  and  <name>.pdf
set -euo pipefail

NAME="${1:-}"; STATE="${2:-}"; PHONE="${3:-}"; EMAIL="${4:-}"
if [ -z "$NAME" ] || [ -z "$STATE" ] || [ -z "$PHONE" ] || [ -z "$EMAIL" ]; then
  echo 'Usage: ./make-partner-card.sh "Full Name" "State" "Phone" "Email"'
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
TPL="$DIR/partner-card-template.html"
OUT="$DIR/partner-cards"
mkdir -p "$OUT"

# Split name into first word + the rest (two lines on the card)
FIRST="$(echo "$NAME" | awk '{print toupper($1)}')"
LAST="$(echo "$NAME" | awk '{$1=""; sub(/^ /,""); print toupper($0)}')"

# Filesystem-safe slug
SLUG="$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')"
TMP="$OUT/_$SLUG.html"

sed -e "s|{{FIRST}}|$FIRST|g" \
    -e "s|{{LAST}}|$LAST|g" \
    -e "s|{{STATE}}|$STATE|g" \
    -e "s|{{PHONE}}|$PHONE|g" \
    -e "s|{{EMAIL}}|$EMAIL|g" \
    "$TPL" > "$TMP"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1080,1620 --default-background-color=00000000 --virtual-time-budget=4000 \
  --screenshot="$OUT/$SLUG.png" "$TMP" 2>/dev/null
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=4000 \
  --print-to-pdf="$OUT/$SLUG.pdf" "$TMP" 2>/dev/null

rm -f "$TMP"
echo "✅ Created:"
echo "   $OUT/$SLUG.png"
echo "   $OUT/$SLUG.pdf"
