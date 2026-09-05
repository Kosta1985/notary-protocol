import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web=fileURLToPath(new URL('../web/',import.meta.url));
const origin='https://accordtrace.notary-labs.workers.dev';

test('internal HTML navigation targets exist in the deployed source tree',()=>{
  const broken=[];
  for(const page of fs.readdirSync(web).filter(name=>name.endsWith('.html'))){
    const html=fs.readFileSync(path.join(web,page),'utf8');
    for(const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)){
      const target=new URL(match[1].replaceAll('&amp;','&'),`${origin}/${page}`);
      if(target.origin!==origin||!target.pathname.endsWith('.html'))continue;
      const file=path.join(web,decodeURIComponent(target.pathname));
      if(!fs.existsSync(file)||!fs.statSync(file).isFile())broken.push(`${page} -> ${target.pathname}`);
    }
  }
  assert.deepEqual(broken,[],'Broken HTML links must be fixed before deployment');
});
