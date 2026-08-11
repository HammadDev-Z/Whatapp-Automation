#!/bin/sh
set -eu

if [ -d /app/.wwebjs_auth ]; then
  find /app/.wwebjs_auth -name 'SingletonLock' -o -name 'SingletonSocket' -o -name 'SingletonCookie' | while IFS= read -r lock; do
    rm -rf "$lock"
  done
fi

exec "$@"
