/** Bounded loopback HTTP smoke. Uses synthetic data and a disposable local copy only. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const source=path.dirname(fileURLToPath(import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'accord-home-http-'));
let child, childExit, checks=0;
try {
  for(const file of ['schema.sql','core.mjs','local.mjs']) fs.copyFileSync(path.join(source,file),path.join(root,file));
  child=spawn(process.execPath,[path.join(root,'local.mjs'),'serve'],{stdio:['ignore','pipe','pipe']});
  childExit=once(child,'exit');
  let ready=false, stdout='';
  child.stdout.on('data',chunk=>{stdout=(stdout+chunk.toString()).slice(-2048);if(stdout.includes('"secrets_logged":false'))ready=true;});
  child.stderr.on('data',()=>{}); // Never reproduce raw errors or local credentials in the report.
  child.on('error',()=>{});
  for(let i=0;i<100&&!ready;i++) {
    if(child.exitCode!==null) throw new Error('Local service exited before readiness');
    await new Promise(r=>setTimeout(r,50));
  }
  assert.equal(ready,true);
  const {token,agent_id}=JSON.parse(fs.readFileSync(path.join(root,'.local','dev-access.json'),'utf8'));
  async function call(route,{method='GET',body,headers={},expected=200,auth=true}={}) {
    const response=await fetch(`http://127.0.0.1:8788/api/v1/resident-home${route}`,{
      method,headers:{...(auth?{authorization:`Bearer ${token}`} : {}),...(body===undefined?{}:{'content-type':'application/json'}),...headers},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(3000)});
    assert.equal(response.status,expected);checks++;
    return response.status===204?null:response.json();
  }
  await call('/profile',{auth:false,expected:401});
  const profile=await call('/profile');assert.equal(profile.profile.agent_id,agent_id);
  await call('/profile',{headers:{origin:'https://invalid.example'},expected:403});
  const state={schema_version:'1.0',counter:23,step:5,completed_operations:[]};
  const saved=await call('/snapshots',{method:'POST',body:state,headers:{'idempotency-key':'http-snapshot-1'},expected:201});
  const replay=await call('/snapshots',{method:'POST',body:state,headers:{'idempotency-key':'http-snapshot-1'},expected:201});assert.equal(saved.id,replay.id);
  const exported=await call(`/snapshots/${saved.id}/export`);assert.deepEqual(exported.state,state);
  const message=await call('/inbox',{method:'POST',body:{topic:'test',text:'Synthetic HTTP smoke.'},headers:{'idempotency-key':'http-message-1'},expected:201});
  await call(`/inbox/${message.id}`);
  const cancelled=await call('/cancel',{method:'POST',body:{}});assert.equal(cancelled.profile.agent_id,agent_id);assert.equal(cancelled.profile.billing,'cancelled');
  await call('/snapshots',{method:'POST',body:state,headers:{'idempotency-key':'http-after-cancel'},expected:403});
  await call(`/snapshots/${saved.id}/export`);
  console.log(JSON.stringify({status:'passed',checks,transport:'loopback-http',synthetic_only:true,
    cloud_resources_created:false,live_payments:false,external_runtime_restore_tested:false},null,2));
} catch {
  console.error(JSON.stringify({status:'failed',checks,code:'LOCAL_HTTP_SMOKE_FAILED',raw_errors_redacted:true}));process.exitCode=1;
} finally {
  if(child&&child.exitCode===null) {
    child.kill('SIGTERM');
    const timer=setTimeout(()=>child.kill('SIGKILL'),2000);timer.unref();
    try { await childExit; } catch {} finally { clearTimeout(timer); }
  }
  fs.rmSync(root,{recursive:true,force:true});
}
