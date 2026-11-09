#!/usr/bin/env bash
# Adds MyNotion to the Linux Mint menu and puts an icon on the desktop (no autostart).
# Undo with: ./install_desktop.sh --remove
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
ENTRY="$HOME/.local/share/applications/mynotion.desktop"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
SHORTCUT="$DESKTOP_DIR/mynotion.desktop"

if [ "$1" = "--remove" ]; then
  rm -f "$ENTRY" "$SHORTCUT" && echo "Removed the MyNotion menu entry and desktop icon."
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
Categories=Office;
StartupWMClass=MyNotion
DESK
chmod +x "$ENTRY"
update-desktop-database "$(dirname "$ENTRY")" 2>/dev/null || true

# the icon on the desktop: a copy of the menu entry, marked as trusted so a double-click starts it
if [ -d "$DESKTOP_DIR" ]; then
  cp "$ENTRY" "$SHORTCUT"
  chmod +x "$SHORTCUT"
  gio set "$SHORTCUT" metadata::trusted true 2>/dev/null || true
  echo "✓ MyNotion icon on the desktop ($SHORTCUT)"
fi
echo "✓ MyNotion is in the menu ($ENTRY)"
echo "  Data lives in ~/.config/MyNotion/noted.db"
