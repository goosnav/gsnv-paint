#!/bin/sh
# gsnv-paint launcher for macOS and Linux.
# Uses the installed Node.js/npm when usable; otherwise downloads the pinned,
# checksum-verified copy listed in launcher/node-runtime.sha256 into the user's
# application-data folder. Then runs launcher/start.mjs, which opens the browser.
set -eu
cd "$(dirname "$0")"

fail() { printf '\ngsnv-paint [%s]: %s\n' "$1" "$2" >&2; exit 1; }
usable() { "$1" launcher/start.mjs --check >/dev/null 2>&1; }
npm_usable() { "$1" --version >/dev/null 2>&1; }
check_only=0
for argument in "$@"; do
  [ "$argument" != --check ] || check_only=1
done

[ -f launcher/start.mjs ] || fail LAUNCH-ROOT "launcher/start.mjs is missing. Keep run.sh inside the complete gsnv-paint folder."

if command -v node >/dev/null 2>&1 && usable node && { [ "$check_only" = 1 ] || npm_usable npm; }; then
  exec node launcher/start.mjs "$@"
fi

case "$(uname -s)" in
  Darwin) os=darwin; data="$HOME/Library/Application Support/gsnv-paint" ;;
  Linux) os=linux; data="${XDG_DATA_HOME:-$HOME/.local/share}/gsnv-paint" ;;
  *) fail LAUNCH-PLATFORM "$(uname -s) is not supported by this launcher. Install Node.js 22.12 or newer, then start again." ;;
esac
case "$(uname -m)" in
  x86_64|amd64) arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) fail LAUNCH-PLATFORM "$(uname -m) processors are not supported by this launcher. Install Node.js 22.12 or newer, then start again." ;;
esac

line=$(grep -- "-$os-$arch\.tar\.gz\$" launcher/node-runtime.sha256) || fail BOOT-INTEGRITY "launcher/node-runtime.sha256 has no entry for $os-$arch."
sum=${line%% *}
archive=${line##* }
name=${archive%.tar.gz}
version=${name#node-}; version=${version%%-*}
runtime="$data/runtime"
node_home="$runtime/$name"
runtime_usable() {
  usable "$node_home/bin/node" && { [ "$check_only" = 1 ] || PATH="$node_home/bin:$PATH" npm_usable "$node_home/bin/npm"; }
}

if ! runtime_usable; then
  echo "Downloading Node.js $version for gsnv-paint. This happens once and needs a network connection…"
  partial="$runtime/partial"
  mkdir -p "$runtime" && rm -rf "$partial" && mkdir "$partial" || fail BOOT-PERMISSION "Cannot write to $runtime."
  source_url="https://nodejs.org/dist/$version/$archive"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --proto '=https' --retry 3 -o "$partial/$archive" "$source_url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$partial/$archive" "$source_url"
  else
    fail BOOT-NETWORK "Neither curl nor wget is installed, so Node.js cannot be downloaded."
  fi || fail BOOT-NETWORK "Could not download $source_url. Check the network connection, then start again."
  if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$partial/$archive"); else actual=$(shasum -a 256 "$partial/$archive"); fi
  if [ "${actual%% *}" != "$sum" ]; then
    rm -rf "$partial"
    fail BOOT-INTEGRITY "The downloaded Node.js archive does not match its pinned checksum and was deleted. Start again; if this repeats, stop and report it."
  fi
  tar -xzf "$partial/$archive" -C "$partial" || fail BOOT-DISK "Could not unpack Node.js into $runtime. Check free disk space."
  rm -rf "$node_home"
  mv "$partial/$name" "$node_home"
  rm -rf "$partial"
  runtime_usable || fail LAUNCH-PLATFORM "The downloaded Node.js and npm do not run on this system. Install Node.js 22.12 or newer with npm, then start again."
fi

PATH="$node_home/bin:$PATH"
export PATH
exec node launcher/start.mjs "$@"
