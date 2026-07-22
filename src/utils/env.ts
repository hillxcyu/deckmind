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

export const getMainModel = () => getEnv('GEMINI_MAIN_MODEL', 'gemini-3.6-flash');
export const getFlashModel = () => getEnv('GEMINI_FLASH_MODEL', 'gemini-3.5-flash-lite');
export const getImageModel = () => getEnv('GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-image-preview');
