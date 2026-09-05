const TRUE=/^(1|true|yes|on)$/i;
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};

export function walletCapabilities(env={}){
  const mode=String(env.WALLET_MODE||'disabled').toLowerCase();
  const provider=String(env.WALLET_PROVIDER||'accord_test').toLowerCase();
  const walletFlag=flag(env,'FEATURE_AGENT_WALLETS');
  const providerReady=mode==='testnet'&&provider==='accord_test';
  return{
    service:'AccordTrace Agent Wallet',
    version:'0.1.0',
    audience:'autonomous_agents',
    machine_first:true,
    wallet_enabled:walletFlag&&providerReady,
    payments_enabled:walletFlag&&providerReady&&flag(env,'FEATURE_AGENT_PAYMENTS'),
    treasury_enabled:walletFlag&&providerReady&&flag(env,'FEATURE_AGENT_TREASURY'),
    economic_trust_enabled:walletFlag&&flag(env,'FEATURE_ECONOMIC_TRUST'),
    guardian_controls_enabled:flag(env,'FEATURE_GUARDIAN_CONTROLS'),
    mode,
    provider,
    network:String(env.WALLET_NETWORK||'accord:testnet'),
    settlement_mode:providerReady?'simulated':'disabled',
    assets:[{symbol:'USDC',decimals:6,amount_format:'decimal_string',atomic_unit:'micro-USDC'}],
    authentication:{
      scheme:'accordtrace.agent.request.v1',
      algorithm:'Ed25519',
      passport_key_required:true,
      clock_skew_seconds:300,
      nonce_replay_protection:true,
      signed_headers:['X-Accord-Passport-Id','X-Accord-Timestamp','X-Accord-Nonce','X-Accord-Signature'],
      signature_scope:['passport_id','timestamp','nonce','method','path','canonical_query','sha256_raw_body']
    },
    payment_contract:{
      idempotency_key_required:true,
      idempotency_header:'Idempotency-Key',
      funded_balance_only:true,
      negative_balances:false,
      policy_decisions:['ALLOW','DENY','REQUIRE_APPROVAL','QUARANTINE'],
      guardian_approval_creates_funds:false,
      receipt_type:'accordtrace-financial-v1'
    },
    approval_lifecycle:{
      pending_status:'APPROVAL_REQUIRED',
      agent_action:'wait_and_poll_payment_status',
      guardian_operator_only:true,
      approval_rechecks_wallet_state:true,
      approval_rechecks_policy:true,
      approval_rechecks_funded_balance:true,
      approved_terminal_status:'CONFIRMED',
      denied_terminal_status:'BLOCKED',
      credit_fallback:false
    },
    credit_and_lending:{
      enabled:false,
      loans:false,
      borrowing:false,
      credit_lines:false,
      overdrafts:false,
      debt_balances:false,
      interest:false,
      yield_lending:false,
      collateral:false,
      leverage:false,
      margin:false,
      liquidation:false
    },
    machine_protocols:{
      rest:true,
      mcp_discovery_tool:'accord_trace_wallet_capabilities',
      a2a_discovery_skill:'wallet_capabilities',
      mutations_require_direct_passport_signed_request:true,
      guardian_mutations_excluded_from_agent_protocols:true
    },
    endpoints:{
      capabilities:'/api/v1/agent/wallet-capabilities',
      wallet:'/api/v1/agent/wallet',
      balance:'/api/v1/agent/wallet/balance',
      policy:'/api/v1/agent/wallet/policy',
      payments:'/api/v1/agent/payments',
      transactions:'/api/v1/agent/transactions',
      receipts:'/api/v1/agent/receipts',
      economic_trust:'/api/v1/agent/economic-trust'
    },
    limitations:[
      'Current settlement provider is simulated test infrastructure only.',
      'Production/on-chain money movement remains disabled until a reviewed provider and secure key-management boundary are added.',
      'Economic trust is operational history, not a credit score, lending decision, identity guarantee, or proof of solvency.',
      'Agents cannot self-approve Guardian-required payments through MCP, A2A or signed agent routes.'
    ]
  };
}

export function handleWalletCapabilities(request,env,url=new URL(request.url)){
  if(request.method!=='GET'||url.pathname!=='/api/v1/agent/wallet-capabilities')return null;
  return new Response(JSON.stringify(walletCapabilities(env)),{status:200,headers:JSON_HEADERS});
}
function flag(env,name){return TRUE.test(String(env?.[name]||'false'));}
