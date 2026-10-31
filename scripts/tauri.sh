#!/bin/sh
# Dev runs carry a distinct name so the dev app is never mistaken for the
# installed one. Everything else passes through untouched.
if [ "$1" = "dev" ]; then
  shift
  exec tauri dev --config src-tauri/tauri.dev.conf.json "$@"
fi
exec tauri "$@"
