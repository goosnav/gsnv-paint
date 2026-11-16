#!/bin/sh
# Use on a Mac to access gsnv-paint running on a machine reached by SSH.
# Forwarding the fixed loopback port preserves browser storage and secure-context behavior.
set -eu

port=${GSNV_PAINT_PORT:-24173}
case "$port" in
  ''|*[!0-9]*) printf '%s\n' 'gsnv-paint [REMOTE-PORT]: GSNV_PAINT_PORT must contain digits only.' >&2; exit 2 ;;
esac
if [ "$port" -lt 1024 ] || [ "$port" -gt 65535 ]; then
  printf '%s\n' 'gsnv-paint [REMOTE-PORT]: GSNV_PAINT_PORT must be from 1024 to 65535.' >&2
  exit 2
fi
remote=${1:-${GSNV_PAINT_REMOTE:-}}
case "$remote" in
  ''|-*) printf 'Usage (in Mac Terminal): %s user@server\nStart ./run.sh --no-browser on the server first.\n' "$0" >&2; exit 2 ;;
esac
if [ "$(uname -s)" != Darwin ]; then
  printf '%s\n' 'gsnv-paint [REMOTE-PLATFORM]: Run this helper on the Mac running Safari, not on the remote server.' >&2
  exit 2
fi
for program in ssh curl open; do
  command -v "$program" >/dev/null 2>&1 || { printf 'gsnv-paint [REMOTE-DEPENDENCY]: Missing %s.\n' "$program" >&2; exit 2; }
done

url="http://127.0.0.1:$port/"
printf 'Forwarding %s from %s to this Mac. Press Ctrl+C to disconnect.\n' "$url" "$remote"
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -L "127.0.0.1:$port:127.0.0.1:$port" -- "$remote" &
tunnel_pid=$!
cleanup() { kill "$tunnel_pid" 2>/dev/null || :; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

ready=0
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if ! kill -0 "$tunnel_pid" 2>/dev/null; then
    printf '%s\n' 'gsnv-paint [REMOTE-TUNNEL]: SSH exited. Check the server address, credentials and local port conflicts.' >&2
    wait "$tunnel_pid" || :
    exit 1
  fi
  if curl --noproxy 127.0.0.1 --max-time 2 -fsS "$url" 2>/dev/null | grep -Fq '<meta name="application-name" content="gsnv-paint">'; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  printf 'gsnv-paint [REMOTE-TUNNEL]: No gsnv-paint page at %s. Start the remote launcher first; check its port.\n' "$url" >&2
  exit 1
fi
printf 'gsnv-paint is reachable from this Mac at %s\n' "$url"
open -a Safari "$url" || open "$url" || printf 'Open %s manually in Safari.\n' "$url" >&2
wait "$tunnel_pid"
