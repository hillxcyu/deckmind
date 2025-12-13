export const getGeminiApiKey = (): string | undefined => {
  // Check for runtime injected environment variable (Docker) - Browser only
  if (typeof window !== 'undefined') {
      const runtimeEnv = (window as any)._env_?.GEMINI_API_KEY;
      if (runtimeEnv) return runtimeEnv;
  }

  // Check for environment variable
  return process.env.GEMINI_API_KEY;
};
