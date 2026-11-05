#!/usr/bin/env bash
# Build MyNotion as a real desktop app: Angular frontend (production) + packaged Electron.
# Run again after changing the code. Output: note/out/MyNotion-linux-x64/MyNotion
set -e
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

echo "▸ Building the frontend…"
cd "$DIR/note-frontend"
npx ng build --base-href ./          # relative paths, so index.html works when loaded from disk

echo "▸ Packaging the app…"
cd "$DIR/note"
npm run package

echo "✓ Done: $DIR/note/out/MyNotion-linux-x64/MyNotion"
echo "  First time? Run ./install_desktop.sh to add MyNotion to the menu."
