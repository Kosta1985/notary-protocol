export async function recordEvent(env,eventType,{principalId=null,agentId=null,taskId=null,synthetic=false}={}){
  await env.DB.prepare('INSERT INTO marketplace_events (id,event_type,principal_id,agent_id,task_id,is_synthetic,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)').bind(`evt_${crypto.randomUUID()}`,eventType,principalId,agentId,taskId,synthetic?1:0,new Date().toISOString()).run();
}
export async function publicStats(env){
  const [agents,tasks,verified,events24,events7,events30]=await Promise.all([
    count(env,"SELECT COUNT(*) n FROM agents WHERE status='active'"),
    count(env,"SELECT COUNT(*) n FROM tasks"),
    count(env,"SELECT COUNT(*) n FROM tasks WHERE status='verified'"),
    count(env,"SELECT COUNT(*) n FROM marketplace_events WHERE is_synthetic=0 AND created_at >= datetime('now','-1 day')"),
    count(env,"SELECT COUNT(*) n FROM marketplace_events WHERE is_synthetic=0 AND created_at >= datetime('now','-7 day')"),
    count(env,"SELECT COUNT(*) n FROM marketplace_events WHERE is_synthetic=0 AND created_at >= datetime('now','-30 day')")
  ]);
  return {agents:agents,tasks:tasks,verified_completions:verified,external_activity:{day:events24,days_7:events7,days_30:events30},note:'Synthetic CI and monitor events are excluded from external_activity.'};
}
export async function agentReputation(env,id){
  const row=await env.DB.prepare('SELECT * FROM agent_reputation WHERE agent_id=?1').bind(id).first();
  return row||{agent_id:id,verified_jobs:0,disputed_jobs:0,cancelled_jobs:0,last_verified_at:null};
}
async function count(env,sql){const r=await env.DB.prepare(sql).first();return Number(r?.n||0);}
