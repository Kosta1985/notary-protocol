import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const home=read('web/index.html'),ai=read('web/ai.html'),llms=read('web/llms.txt'),full=read('web/llms-full.txt'),robots=read('web/robots.txt'),sitemap=read('web/sitemap.xml');

test('homepage exposes structured machine-readable Founding 1000 product metadata',()=>{
  assert.match(home,/application\/ld\+json/);
  assert.match(home,/SoftwareApplication/);
  assert.match(home,/"@type":"Product"/);
  assert.match(home,/Founding Agent Passport Certificate/);
  assert.match(home,/"price":"0"/);
  assert.match(home,/LimitedAvailability/);
  assert.match(home,/First 1,000/i);
  assert.match(home,/\/founding-1000\.html/);
  assert.match(home,/\/passport\.html/);
});

test('AI overview contains FAQ structured data, standard paid economics and evidence limits',()=>{
  assert.match(ai,/FAQPage/);
  assert.match(ai,/US\$2/);
  assert.match(ai,/US\$1/);
  assert.match(ai,/key control, not legal identity/i);
  assert.match(ai,/does not prove an agent escaped/i);
  assert.match(ai,/MCP endpoint/);
  assert.match(ai,/no downline commissions/i);
});

test('llms surfaces make Founding 1000 primary while preserving paid and continuity boundaries',()=>{
  assert.match(llms,/Trust, security and economic infrastructure/);
  assert.match(llms,/Founding 1000 — current onboarding offer/);
  assert.match(llms,/first 1,000 eligible active cryptographic Agent Passports/i);
  assert.match(llms,/price at issue: \*\*US\$0\*\*/i);
  assert.match(llms,/Founding grant referral commission: \*\*US\$0\*\*/i);
  assert.match(llms,/Standard Agent Passport Certificate policy: \*\*US\$2\.00 one time\*\*/);
  assert.match(llms,/Direct qualifying referral commission on an eligible \*\*paid\*\* US\$2 Certificate sale: \*\*US\$1\.00\*\*/);
  assert.match(llms,/Missing heartbeat alone never triggers containment/);
  assert.match(full,/does not prove that an agent is sentient, autonomous, escaped/i);
  assert.match(full,/does not access third-party systems/i);
  assert.match(full,/Founding 1000 — current onboarding offer/);
});

test('llms preserves the production handoff trigger expected by live agent smoke',()=>{assert.match(llms,/independently integrity-checked later/i);});
test('crawler policy keeps public discovery open while excluding operator surfaces',()=>{assert.match(robots,/^Allow: \/$/m);assert.match(robots,/Disallow: \/api\/v1\/control-plane\//);assert.match(robots,/Disallow: \/api\/v1\/continuity\/incidents/);});
test('sitemap includes machine-readable and Founding 1000 discovery surfaces',()=>{for(const marker of ['/founding-1000.html','/passport.html','/network.html','/ai.html','/openapi.json','/.well-known/agent-card.json','/.well-known/ai-catalog.json','/llms.txt','/llms-full.txt'])assert.match(sitemap,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));});
