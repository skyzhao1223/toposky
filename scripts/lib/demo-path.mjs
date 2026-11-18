/** Shared, browser-safe build-time subpath rules. No filesystem or private instance-data imports. */
export function normalizeBasePath(value = '') {
  if (value === '' || value === '/') return ''
  if (typeof value !== 'string' || !/^\/(?:[A-Za-z0-9_~.-]+\/)*[A-Za-z0-9_~.-]+\/?$/.test(value)) {
    throw new Error('Invalid demo base path')
  }
  const normalized = value.replace(/\/$/, '')
  if (normalized.split('/').some((segment) => segment === '.' || segment === '..')) throw new Error('Invalid demo base path')
  return normalized
}

export function pagesBasePath(repository) {
  const [owner, name, ...extra] = (repository || '').split('/')
  if (!owner || !name || extra.length) throw new Error('Expected owner/repository')
  return name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '' : normalizeBasePath(`/${name}`)
}

export function normalizeRoutePath(pathname, basePath = '') {
  const prefix = normalizeBasePath(basePath)
  let route = pathname || '/'
  if (prefix && (route === prefix || route.startsWith(`${prefix}/`))) route = route.slice(prefix.length) || '/'
  return route.replace(/\/+$/, '') || '/'
}
