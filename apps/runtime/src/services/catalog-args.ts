/**
 * Turning MCP registry package definitions into a real command line.
 *
 * Kept apart from the route so the argument logic can be exercised on its own:
 * run `npx tsx apps/runtime/src/services/catalog-args.ts` for the self-check.
 */

/** One entry of packageArguments / runtimeArguments in the MCP registry spec. */
export interface ArgSpec {
  type?: string;
  name?: string;
  value?: string;
  default?: string;
  valueHint?: string;
  description?: string;
  isRequired?: boolean;
}

/**
 * Turn an argument spec list into real argv entries.
 *
 * Only `value` and `default` are real values. `valueHint` is a placeholder the
 * catalog shows the user ("path", "url", "origins") — emitting it produces
 * nonsense like `--url url`, so it is used only to mark a required argument the
 * user still has to fill in. Optional arguments with no value are left out
 * entirely: the result is the smallest command line that runs, and the user
 * edits it from there.
 */
export function buildArgs(specs: ArgSpec[] | undefined): string[] {
  const out: string[] = [];
  for (const spec of specs ?? []) {
    const value = spec.value ?? spec.default;
    if (!value && !spec.isRequired) continue;

    if (spec.type === 'named') {
      if (!spec.name) continue;
      out.push(spec.name);
      const filled = value ?? spec.valueHint;
      if (filled) out.push(filled);
    } else {
      const filled = value ?? spec.valueHint;
      if (filled) out.push(filled);
    }
  }
  return out;
}

/** Local port for MCPs that speak HTTP: the one the catalog suggests, else a free one. */
export function resolveLocalPort(specs: ArgSpec[] | undefined, taken: Set<number>): number {
  for (const spec of specs ?? []) {
    const raw = spec.value ?? spec.default;
    if (!raw) continue;
    const mentionsPort = /port/i.test(`${spec.name ?? ''} ${spec.valueHint ?? ''} ${spec.description ?? ''}`);
    // docker publishes as "3030:3030" — the host side is the one we can reach
    const n = parseInt(String(raw).split(':')[0]!, 10);
    if (mentionsPort && Number.isInteger(n) && n > 0 && n < 65536 && !taken.has(n)) return n;
  }
  let port = 7100;
  while (taken.has(port)) port++;
  return port;
}

// ── self-check: npx tsx apps/runtime/src/services/catalog-args.ts ──
if (process.argv[1]?.endsWith('catalog-args.ts')) {
  const eq = (got: unknown, want: unknown, label: string): void => {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a !== b) throw new Error(`${label}: got ${a}, want ${b}`);
  };

  // real shape taken from ai.com.mcp/hapi-mcp in the catalog
  const runtimeArguments: ArgSpec[] = [
    { type: 'named', name: '-p', default: '3030:3030', valueHint: 'port', description: 'Port mapping for the host to container' },
    { type: 'named', name: '-v', default: '~/.hapi:/app/.hapi', valueHint: 'volume' },
  ];
  const packageArguments: ArgSpec[] = [
    { type: 'positional', name: 'serve', default: 'serve', valueHint: 'serve', isRequired: true },
    { type: 'positional', name: 'projectName', valueHint: 'petstore' },
    { type: 'named', name: '--port', default: '3030', valueHint: 'port', description: 'The port to listen on inside the container' },
    { type: 'named', name: '--cert', valueHint: 'path' },
    { type: 'named', name: '--key', valueHint: 'path' },
  ];

  eq(buildArgs(runtimeArguments), ['-p', '3030:3030', '-v', '~/.hapi:/app/.hapi'], 'docker runtime args');
  eq(buildArgs(packageArguments), ['serve', '--port', '3030'], 'real values kept, placeholders dropped');
  eq(buildArgs(undefined), [], 'no specs');
  // optional flags with no value are left out — `--safe` changes behaviour, we do not guess
  eq(buildArgs([{ type: 'named', name: '--safe' }, { type: 'named', name: '--static-tools' }]), [], 'optional flags dropped');
  // a required flag with no value keeps its hint so the user sees what to fill in
  eq(buildArgs([{ type: 'named', name: '--url', valueHint: 'url', isRequired: true }]), ['--url', 'url'], 'required flag keeps hint');
  eq(buildArgs([{ type: 'named', name: '--headless', isRequired: true }]), ['--headless'], 'required bare flag');
  // a spec with no name and no value contributes nothing
  eq(buildArgs([{ type: 'named' }, { type: 'positional' }]), [], 'empty specs contribute nothing');

  eq(resolveLocalPort([...runtimeArguments, ...packageArguments], new Set()), 3030, 'suggested port wins');
  // suggested port already used -> falls through to the free range
  eq(resolveLocalPort(packageArguments, new Set([3030])), 7100, 'taken port falls through');
  eq(resolveLocalPort(packageArguments, new Set([3030, 7100, 7101])), 7102, 'next free port');
  // a volume mapping must not be mistaken for a port
  eq(resolveLocalPort([{ type: 'named', name: '-v', default: '/data:/data' }], new Set()), 7100, 'volume is not a port');

  console.log('catalog-args: all checks passed');
}
