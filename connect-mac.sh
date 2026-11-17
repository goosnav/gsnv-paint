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
launch_url=''
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if ! kill -0 "$tunnel_pid" 2>/dev/null; then
    printf '%s\n' 'gsnv-paint [REMOTE-TUNNEL]: SSH exited. Check the server address, credentials and local port conflicts.' >&2
    wait "$tunnel_pid" || :
    exit 1
  fi
  # Root navigation can be intercepted by a previous browser offline worker.
  # The launcher publishes its build header without requiring Node/Python here.
  status_headers=$(curl --noproxy 127.0.0.1 --max-time 2 -fsSI "${url}__gsnv-local__/status" 2>/dev/null) || status_headers=''
  build_id=$(printf '%s\n' "$status_headers" | tr -d '\r' | awk 'tolower($1) == "x-gsnv-local-build:" { print $2 }')
  valid_build=0
  case "$build_id" in
    ''|*[!a-f0-9]*) ;;
    *) if [ "${#build_id}" -eq 64 ]; then valid_build=1; fi ;;
  esac
  if [ "$valid_build" -eq 1 ]; then
    launch_url="${url}__gsnv-local__/start/$build_id"
    entry=$(curl --noproxy 127.0.0.1 --max-time 2 -fsS "$launch_url" 2>/dev/null) || entry=''
    if printf '%s\n' "$entry" | grep -Fq '<meta name="application-name" content="gsnv-paint">'; then
      if ! printf '%s\n' "$entry" | grep -Fq "name=\"gsnv-build-id\" content=\"$build_id\""; then
        printf '%s\n' 'gsnv-paint [REMOTE-VERSION]: The remote page does not match its launcher build. Save your work, stop the remote launcher and start it again.' >&2
        exit 1
      fi
      ready=1
      break
    fi
  elif curl --noproxy 127.0.0.1 --max-time 2 -fsS "$url" 2>/dev/null | grep -Fq '<meta name="application-name" content="gsnv-paint">'; then
    printf '%s\n' 'gsnv-paint [REMOTE-VERSION]: An older launcher is running. Save your work, stop it, update the server copy and start ./run.sh --no-browser again. This helper will not reopen the old cached app.' >&2
    exit 1
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  printf 'gsnv-paint [REMOTE-TUNNEL]: No verified local gsnv-paint build at %s. Start the remote launcher first; check its port.\n' "$url" >&2
  exit 1
fi
printf 'gsnv-paint is reachable from this Mac at %s\n' "$launch_url"
open -a Safari "$launch_url" || open "$launch_url" || printf 'Open %s manually in Safari.\n' "$launch_url" >&2
wait "$tunnel_pid"
