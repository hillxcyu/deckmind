/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export const getGeminiApiKey = (): string | undefined => {
  // Check for runtime injected environment variable (Docker) - Browser only
  if (typeof window !== 'undefined') {
      const runtimeEnv = (window as any)._env_?.GEMINI_API_KEY;
      if (runtimeEnv) return runtimeEnv;
  }

  // Check for environment variable
  return process.env.GEMINI_API_KEY;
};

const getEnv = (key: string, defaultValue: string): string => {
  if (typeof window !== 'undefined') {
    const runtimeEnv = (window as any)._env_?.[key];
    if (runtimeEnv) return runtimeEnv;
  }
  return process.env[key] || defaultValue;
};

export const getMainModel = () => getEnv('GEMINI_MAIN_MODEL', 'gemini-3.7-flash');
export const getFlashModel = () => getEnv('GEMINI_FLASH_MODEL', 'gemini-3.7-flash');
export const getImageModel = () => getEnv('GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-image-preview');
