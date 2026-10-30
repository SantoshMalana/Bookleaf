import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openApiSpec } from '../src/docs/openapi.js';

/** Walks Express' router stack and lists "METHOD /path" for every registered route. */
function listRoutes(stack: any[], prefix = ''): string[] {
  const out: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) out.push(`${method.toUpperCase()} ${prefix}${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const mount = layer.regexp.source
        .replace('^\\/', '/')
        .replace('\\/?(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace(/\$$/, '');
      out.push(...listRoutes(layer.handle.stack, prefix + (mount === '/' ? '' : mount)));
    }
  }
  return out;
}

describe('API documentation', () => {
  const app = createApp() as any;
  const routes = listRoutes(app._router.stack)
    .filter((r) => r.includes('/api/v1'))
    .map((r) => r.replace('/api/v1', '').replace(/\/$/, '') || '/')
    .map((r) => r.replace(/:(\w+)/g, '{$1}'));

  const documented = new Set(Object.entries(openApiSpec.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`)));

  it('finds the routes we expect (guards against the walker silently returning nothing)', () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toContain('POST /admin/tickets/{ticketId}/draft');
  });

  it('documents every route that exists', () => {
    const missing = routes.filter((r) => !documented.has(r));
    expect(missing).toEqual([]);
  });

  it('does not document routes that do not exist', () => {
    const real = new Set(routes);
    const phantom = [...documented].filter((d) => !real.has(d));
    expect(phantom).toEqual([]);
  });
});
