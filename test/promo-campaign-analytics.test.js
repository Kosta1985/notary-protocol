import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleLaunch } from '../cloudflare/src/launch.js';

test('launch capabilities expose bounded campaign attribution without enabling payments',async()=>{
  const response=await handleLaunch(new Request('https://example.test/api/v1/launch/capabilities'),{},new URL('https://example.test/api/v1/launch/capabilities'));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.ok(body.features.includes('campaign_attribution'));
  assert.ok(body.features.includes('aggregate_campaign_stats'));
  assert.equal(body.payments_mode,'prelaunch');
});

test('campaign schema stores aggregate counters and bounded waitlist attribution only',()=>{
  const sql=fs.readFileSync('cloudflare/migrations/0029_promo_campaign_attribution.sql','utf8');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS campaign_daily/);
  assert.match(sql,/landing_view/);
  assert.match(sql,/waitlist_submit/);
  assert.doesNotMatch(sql,/ip_address|user_agent|fingerprint|cookie/i);
});

test('launch implementation rejects free-form attribution and does not expose waitlist email in stats',()=>{
  const source=fs.readFileSync('cloudflare/src/launch.js','utf8');
  assert.match(source,/ATTR_PATTERN/);
  assert.match(source,/campaign_attribution_invalid/);
  assert.match(source,/No IP address or user-agent is stored/);
  const statsSection=source.slice(source.indexOf("url.pathname==='/api/v1/launch/stats'"),source.indexOf("url.pathname==='/api/v1/launch/waitlist'"));
  assert.doesNotMatch(statsSection,/SELECT[^`]*email/i);
});

test('campaign landing promotes free beta and keeps paid checkout fail-closed',()=>{
  const html=fs.readFileSync('web/campaign.html','utf8');
  assert.match(html,/data-track-campaign="true"/);
  assert.match(html,/Run the free evidence test/);
  assert.match(html,/Paid Passport checkout remains fail-closed/);
  assert.match(html,/private AccordTrace membership labels/);
  assert.match(html,/data-campaign-event="developer_click"/);
});

test('browser campaign attribution is bounded and carries campaign source into waitlist',()=>{
  const source=fs.readFileSync('web/launch.js','utf8');
  assert.match(source,/utm_campaign/);
  assert.match(source,/utm_source/);
  assert.match(source,/utm_medium/);
  assert.match(source,/campaign-event/);
  assert.match(source,/\.\.\.attribution/);
});
