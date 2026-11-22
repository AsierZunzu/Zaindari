#!/bin/sh
# Starts the app as PUID:PGID (default 1000:1000) instead of root.
#
# Started as root (the default), it first hands the writable volumes to that
# user: installs from before this script ran as root, so their volumes are
# root-owned and the app could no longer write to them. Started as non-root
# (`user:` in compose, `--user` on docker run), it runs the command as is and
# the volumes must already be writable by that user.
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}

if [ "$(id -u)" = 0 ]; then
  # /app/data only exists when a volume is mounted there; skip it otherwise.
  for dir in /app/uploads /app/data; do
    [ -d "$dir" ] || continue
    [ "$(stat -c %u:%g "$dir")" = "$PUID:$PGID" ] || chown -R "$PUID:$PGID" "$dir"
  done
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- "$@"
fi

exec "$@"
