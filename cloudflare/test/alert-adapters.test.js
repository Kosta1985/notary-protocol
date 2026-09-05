import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAlertDelivery,sanitizeAlertEvent} from '../src/alert-adapters.js';

const digest='a'.repeat(64);
const event={kind:'lease_revoked',severity:'high',target_type:'lease',target_ref:'lease_demo',event_digest:digest,occurred_at:'2026-09-05T00:00:00.000Z',message:'Containment applied',private_key:'must-not-leak',payment_payload:'must-not-leak'};

test('generic webhook receives only the bounded redacted event',()=>{
  const d=prepareAlertDelivery({type:'webhook',url:'https://example.com/alerts',bearer_token:'secret-token'},event);
  assert.equal(d.type,'webhook');
  assert.equal(d.headers.authorization,'Bearer secret-token');
  const body=JSON.parse(d.body);
  assert.equal(body.contains_secrets,false);
  assert.equal(body.event_digest,digest);
  assert.equal(body.private_key,undefined);
  assert.equal(body.payment_payload,undefined);
  assert.doesNotMatch(d.body,/secret-token/);
});

test('Slack webhook payload is readable and contains only redacted event fields',()=>{
  const d=prepareAlertDelivery({type:'slack_webhook',url:'https://hooks.slack.com/services/example'},event);
  assert.equal(d.type,'slack_webhook');
  const body=JSON.parse(d.body);
  assert.match(body.text,/AccordTrace HIGH/);
  assert.equal(body.accordtrace_event.contains_secrets,false);
  assert.equal(body.accordtrace_event.private_key,undefined);
  assert.doesNotMatch(d.body,/must-not-leak/);
});

test('email relay requires a recipient and emits a bounded relay envelope',()=>{
  const missing=prepareAlertDelivery({type:'email_relay',url:'https://mail-relay.example.com/send'},event);
  assert.equal(missing.error,'email_recipient_required');
  const d=prepareAlertDelivery({type:'email_relay',url:'https://mail-relay.example.com/send',to:'ops@example.com'},event);
  const body=JSON.parse(d.body);
  assert.equal(body.to,'ops@example.com');
  assert.match(body.subject,/AccordTrace HIGH/);
  assert.equal(body.event.contains_secrets,false);
  assert.doesNotMatch(d.body,/must-not-leak/);
});

test('adapter boundary rejects insecure URLs, embedded credentials and unknown adapters',()=>{
  assert.equal(prepareAlertDelivery({type:'webhook',url:'http://example.com'},event).error,'url_must_be_https');
  assert.equal(prepareAlertDelivery({type:'webhook',url:'https://user:pass@example.com'},event).error,'url_must_be_https');
  assert.equal(prepareAlertDelivery({type:'smtp',url:'https://example.com'},event).error,'unsupported_adapter');
});

test('sanitizeAlertEvent normalizes invalid severity and digest without copying arbitrary fields',()=>{
  const safe=sanitizeAlertEvent({...event,severity:'panic',event_digest:'bad'});
  assert.equal(safe.severity,'info');
  assert.equal(safe.event_digest,null);
  assert.equal(safe.private_key,undefined);
  assert.equal(safe.payment_payload,undefined);
});
