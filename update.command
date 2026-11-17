#!/bin/sh
# macOS: update a clean official main checkout, then start the current local app.
exec "$(dirname "$0")/run.sh" --update "$@"
