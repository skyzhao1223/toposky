module.exports = async () => {
  const { normalizeBasePath } = await import('./scripts/lib/demo-path.mjs')
  const staticExport = process.env.NEXT_STATIC_EXPORT === '1'
  const basePath = staticExport ? normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH || '') : ''

  /** @type {import('next').NextConfig} */
  const nextConfig = {
    // Subpaths are inlined at build time. Normal local/server deployments keep the root path.
    basePath,
    env: { NEXT_PUBLIC_BASE_PATH: basePath },
    output: staticExport ? 'export' : 'standalone',
    ...(staticExport ? { trailingSlash: true, images: { unoptimized: true } } : {
      // Dynamic filesystem paths must never cause private instance data to enter a release bundle.
      outputFileTracingExcludes: {
        '/*': [
          './data/**/*', './internal/**/*', './src/data/**/*', './.env', './.env.*',
          './.git/**/*', './test-results/**/*', './.playwright-mcp/**/*',
        ],
      },
    }),
  }
  return nextConfig
}
