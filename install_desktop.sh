#!/usr/bin/env bash
# Adds MyNotion to the Linux Mint menu (no autostart). Undo with: ./install_desktop.sh --remove
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
ENTRY="$HOME/.local/share/applications/mynotion.desktop"

if [ "$1" = "--remove" ]; then
  rm -f "$ENTRY" && echo "Removed the MyNotion menu entry."
  exit 0
fi

BIN="$DIR/note/out/MyNotion-linux-x64/MyNotion"
if [ ! -x "$BIN" ]; then
  echo "MyNotion isn't built yet — run ./build_app.sh first."
  exit 1
fi

mkdir -p "$(dirname "$ENTRY")"
cat > "$ENTRY" <<DESK
[Desktop Entry]
Type=Application
Name=MyNotion
Comment=Notes, lists and calendar
Exec=$BIN %U
Icon=$DIR/note/assets/icon.png
Terminal=false
Categories=Office;Utility;
StartupWMClass=MyNotion
DESK
echo "✓ MyNotion is in the menu ($ENTRY)"
echo "  Data lives in ~/.config/MyNotion/noted.db"
