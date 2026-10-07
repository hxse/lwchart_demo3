import { legacyTarget } from './crypto/config';
try { console.log(await legacyTarget(process.argv[2] || 'config.toml')); }
catch (error) { console.error((error as Error).message); process.exit(2); }
