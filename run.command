#!/bin/sh
# macOS: double-click this file in Finder. It runs run.sh from the same folder.
exec /bin/sh "$(dirname "$0")/run.sh" "$@"
