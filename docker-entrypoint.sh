#!/bin/sh

# Generate env-config.js
echo "window._env_ = {" > /usr/share/nginx/html/env-config.js
if [ -n "$GEMINI_API_KEY" ]; then
  echo "  GEMINI_API_KEY: \"$GEMINI_API_KEY\"," >> /usr/share/nginx/html/env-config.js
fi
echo "};" >> /usr/share/nginx/html/env-config.js

# Execute the passed command (usually nginx)
exec "$@"
