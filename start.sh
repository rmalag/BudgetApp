#!/bin/sh
if [ -z "$FIREBASE_PROJECT_ID" ]; then
  echo "ERROR: FIREBASE_PROJECT_ID environment variable is not set"
  exit 1
fi

exec node dev-server.js
