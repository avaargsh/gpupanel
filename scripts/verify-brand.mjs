#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
 'frontend/src/assets/images/gpupanel-logo.svg',
 'frontend/src/assets/images/gpupanel-menu-logo.svg',
 'frontend/src/assets/images/gpupanel-favicon.svg',
 'frontend/src/assets/images/gpupanel-login.svg',
 'frontend/src/assets/images/gpupanel-login-bg.svg',
 'frontend/public/gpupanel-favicon.svg',
 'docs/gpupanel/ARCHITECTURE.md',
 'docs/gpupanel/PRODUCT.md',
 'docs/gpupanel/ROADMAP.md',
 'NOTICE.md'
];
const errors=[];
for (const path of required) {
 const absolute=join(root,path);
 if (!existsSync(absolute)) {errors.push('Missing '+path);continue}
 if (path.endsWith('.svg')) {
  const data=readFileSync(absolute,'utf8');
  if (!data.startsWith('<svg') || !data.includes('</svg>')) errors.push('Invalid SVG shell '+path);
 }
}
const check=(path,needle)=>{
 const data=readFileSync(join(root,path),'utf8');
 if (!data.includes(needle))errors.push(path+' lacks '+needle);
};
check('frontend/src/layout/components/Sidebar/components/Logo.vue','gpupanel-logo.svg?component');
check('frontend/src/layout/components/Sidebar/components/Logo.vue','gpupanel-menu-logo.svg?component');
check('frontend/src/global/use-logo.ts',"/gpupanel-favicon.svg");
check('frontend/index.html','GPUPanel');
check('frontend/src/views/login/index.vue','gpupanel-login.svg');
check('frontend/package.json','gpupanel-frontend');
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('GPUPanel brand static contract: PASS ('+required.length+' assets/docs)');
