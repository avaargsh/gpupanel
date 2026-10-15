#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const required = ['frontend/apps/panel/index.html', 'frontend/package.json', 'NOTICE.md', 'LICENSE', 'docs/gpupanel/PRODUCT.md', 'docs/gpupanel/ROADMAP.md'];
for (const name of required) {
    if (!existsSync(join(root, name))) throw new Error(`Missing ${name}`);
}
for (const name of ['frontend/apps/panel/index.html', 'frontend/package.json', 'NOTICE.md']) {
    if (!readFileSync(join(root, name), 'utf8').includes('GPUPanel')) throw new Error(`Missing GPUPanel brand: ${name}`);
}
if (!readFileSync(join(root, 'NOTICE.md'), 'utf8').includes('1Panel')) throw new Error('Missing upstream attribution');
console.log('React brand and upstream attribution contract: PASS');
