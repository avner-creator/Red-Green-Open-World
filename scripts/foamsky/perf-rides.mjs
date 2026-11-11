// Render cost during the foam run, the plane contest and the dragon tour. These are views of the
// shared, deterministic report (scripts/perf-report.mjs); this wrapper only picks them.
// Usage: npm run build && RG_PORT=4272 node scripts/foamsky/perf-rides.mjs [low,medium] [--detail]
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const report = fileURLToPath(new URL('../perf-report.mjs', import.meta.url));
const args = process.argv.slice(2);
const r = spawnSync(process.execPath, [report, ...args, '--views=foam-blowers,foam-round,plane-contest,dragon-tour'], { stdio: 'inherit', env: { ...process.env, RG_PORT: process.env.RG_PORT ?? '4272' } });
process.exit(r.status ?? 1);
