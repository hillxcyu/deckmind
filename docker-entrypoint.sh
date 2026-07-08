#!/bin/sh

# Generate env-config.js
echo "window._env_ = {" > /usr/share/nginx/html/env-config.js
if [ -n "$GEMINI_API_KEY" ]; then
  echo "  GEMINI_API_KEY: \"$GEMINI_API_KEY\"," >> /usr/share/nginx/html/env-config.js
fi
if [ -n "$GEMINI_MAIN_MODEL" ]; then
  echo "  GEMINI_MAIN_MODEL: \"$GEMINI_MAIN_MODEL\"," >> /usr/share/nginx/html/env-config.js
fi
if [ -n "$GEMINI_FLASH_MODEL" ]; then
  echo "  GEMINI_FLASH_MODEL: \"$GEMINI_FLASH_MODEL\"," >> /usr/share/nginx/html/env-config.js
fi
if [ -n "$GEMINI_IMAGE_MODEL" ]; then
  echo "  GEMINI_IMAGE_MODEL: \"$GEMINI_IMAGE_MODEL\"," >> /usr/share/nginx/html/env-config.js
fi
echo "};" >> /usr/share/nginx/html/env-config.js

# Execute the passed command (usually nginx)
exec "$@"
