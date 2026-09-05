import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const home=read('web/index.html'),ai=read('web/ai.html'),llms=read('web/llms.txt'),full=read('web/llms-full.txt'),robots=read('web/robots.txt'),sitemap=read('web/sitemap.xml');

test('homepage exposes structured machine-readable launch product metadata',()=>{
  assert.match(home,/application\/ld\+json/);
  assert.match(home,/SoftwareApplication/);
  assert.match(home,/"@type":"Product"/);
  assert.match(home,/"price":"2\.00"/);
  assert.match(home,/Agent Passport Certificate/);
  assert.match(home,/\/ai\.html/);
  assert.match(home,/\/passport\.html/);
});

test('AI overview contains FAQ structured data, launch economics and evidence limits',()=>{
  assert.match(ai,/FAQPage/);
  assert.match(ai,/US\$2/);
  assert.match(ai,/US\$1/);
  assert.match(ai,/key control, not legal identity/i);
  assert.match(ai,/does not prove an agent escaped/i);
  assert.match(ai,/MCP endpoint/);
  assert.match(ai,/no downline commissions/i);
});

test('llms surfaces use current AccordTrace positioning and continuity safety boundaries',()=>{
  assert.match(llms,/Trust, security and economic infrastructure/);
  assert.match(llms,/Missing heartbeat alone never triggers containment/);
  assert.match(llms,/Agent Passport Certificate launch price: \*\*US\$2\.00 one time\*\*/);
  assert.match(llms,/Direct qualifying referral commission: \*\*US\$1\.00\*\*/);
  assert.match(full,/does not prove that an agent is sentient, autonomous, escaped/i);
  assert.match(full,/does not access third-party systems/i);
});

test('llms preserves the production handoff trigger expected by live agent smoke',()=>{assert.match(llms,/independently integrity-checked later/i);});
test('crawler policy keeps public discovery open while excluding operator surfaces',()=>{assert.match(robots,/^Allow: \/$/m);assert.match(robots,/Disallow: \/api\/v1\/control-plane\//);assert.match(robots,/Disallow: \/api\/v1\/continuity\/incidents/);});
test('sitemap includes machine-readable and Passport launch discovery surfaces',()=>{for(const marker of ['/passport.html','/network.html','/ai.html','/openapi.json','/.well-known/agent-card.json','/llms.txt','/llms-full.txt'])assert.match(sitemap,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));});
