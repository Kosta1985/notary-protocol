import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const profilePath=path.join(root,'config/production-release.json');
const profile=JSON.parse(fs.readFileSync(profilePath,'utf8'));
const failures=[]; const notes=[];

function fail(msg){failures.push(msg)}
function note(msg){notes.push(msg)}
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8')}

const wrangler=JSON.parse(read('wrangler.jsonc'));
if(wrangler.main!==profile.worker.entrypoint)fail(`wrangler main mismatch: ${wrangler.main}`);
const d1=Array.isArray(wrangler.d1_databases)?wrangler.d1_databases.find(x=>x.binding===profile.worker.d1_binding):null;
if(!d1)fail(`required D1 binding ${profile.worker.d1_binding} missing`);
if(d1?.migrations_dir!==profile.worker.migrations_dir)fail(`migrations_dir mismatch: ${d1?.migrations_dir}`);

const migrationDir=path.join(root,profile.worker.migrations_dir);
const migrations=fs.readdirSync(migrationDir).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
if(!migrations.length)fail('no migrations found');
const seq=migrations.map(x=>Number(x.slice(0,4)));
if(profile.migration_policy.require_contiguous_sequence){
  for(let i=0;i<seq.length;i++){
    const expected=profile.migration_policy.first_sequence+i;
    if(seq[i]!==expected)fail(`migration sequence gap: expected ${String(expected).padStart(4,'0')}, got ${migrations[i]}`);
  }
}
for(const file of migrations){
  const sql=read(path.join(profile.worker.migrations_dir,file));
  const upper=sql.toUpperCase();
  const destructive=(profile.migration_policy.forbidden_without_review||[]).filter(token=>upper.includes(token));
  if(destructive.length && !sql.includes(profile.migration_policy.destructive_review_marker))fail(`${file} contains destructive SQL without review marker: ${destructive.join(', ')}`);
}
note(`validated ${migrations.length} contiguous migrations (${migrations[0]} -> ${migrations.at(-1)})`);

const sourceFiles=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(/\.(js|mjs|json|yml|yaml|md|sql|html|css)$/.test(ent.name))sourceFiles.push(p)}}
for(const rel of ['cloudflare','scripts','docs','web','.github','config']){const p=path.join(root,rel);if(fs.existsSync(p))walk(p)}
const secretNames=profile.required_secrets||[];
for(const p of sourceFiles){
  const rel=path.relative(root,p); const content=fs.readFileSync(p,'utf8');
  for(const secret of secretNames){
    const valuePattern=new RegExp(`${secret}\\s*[:=]\\s*["'][^"'\\n]{12,}["']`);
    if(valuePattern.test(content) && !rel.endsWith('production-release.json'))fail(`possible committed value for ${secret} in ${rel}`);
  }
}

const worker=read(profile.worker.entrypoint);
for(const invariant of profile.release_invariants||[]){
  if(invariant==='control_plane_is_fail_closed_without_authentication' && !worker.includes('/api/v1/control-plane/'))fail('control plane routing missing');
}
const hardening=read('cloudflare/src/control-plane-hardening.js');
if(/DELETE FROM control_plane_audit/i.test(hardening))fail('automated retention must not delete control_plane_audit');
const payment=read('cloudflare/src/payment-hardening.js');
if(!payment.includes('x402_order_requirements'))fail('deterministic x402 requirements storage missing');
if(!payment.includes('x402_payment_payload_replays'))fail('x402 replay ledger missing');
if(/\/settle\b/.test(payment))fail('payment hardening must not call x402 /settle');

const openapiBase=JSON.parse(read('docs/openapi.json'));
const fragmentsDir=path.join(root,'docs/openapi-fragments');
const allPaths=new Set(Object.keys(openapiBase.paths||{}));
for(const file of fs.readdirSync(fragmentsDir).filter(x=>x.endsWith('.json')).sort()){
  const f=JSON.parse(read(path.join('docs/openapi-fragments',file)));
  for(const key of Object.keys(f.paths||{})){if(allPaths.has(key))fail(`duplicate OpenAPI path ${key}`);allPaths.add(key)}
}
for(const endpoint of [...profile.required_public_endpoints,...profile.required_protected_endpoints]){
  if(endpoint==='/health')continue;
  if(endpoint==='/openapi.json')continue;
  if(!allPaths.has(endpoint))fail(`required endpoint missing from OpenAPI: ${endpoint}`);
}

const result={status:failures.length?'failed':'ok',profile:profile.profile,worker:profile.worker.name,migrations:migrations.length,notes,failures};
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
