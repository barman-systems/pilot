const isVercelFunctionRuntime = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.AWS_EXECUTION_ENV ||
  process.env.VERCEL_REGION
);

if (isVercelFunctionRuntime) {
  await import('./_sentry-runtime.js');
}

export const sentryPreloadActive = isVercelFunctionRuntime;
