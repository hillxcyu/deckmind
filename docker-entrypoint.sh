#!/bin/sh

# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


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
