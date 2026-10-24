// Prints the golden suite as JSON, computed in Node (V8).
import { goldenSuite } from './golden.ts';

const t0 = performance.now();
const runs = goldenSuite();
process.stdout.write(JSON.stringify({ engine: `node ${process.version}`, ms: performance.now() - t0, runs }) + '\n');
