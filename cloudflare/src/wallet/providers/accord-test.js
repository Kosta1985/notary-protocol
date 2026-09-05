import {assetMetadata,atomicFromDb} from '../money.js';

export class AccordTestWalletProvider{
  constructor(env={}){
    if(String(env.WALLET_MODE||'disabled').toLowerCase()!=='testnet')throw new Error('accord_test_provider_requires_testnet_mode');
    this.id='accord_test';
    this.network=String(env.WALLET_NETWORK||'accord:testnet');
    this.chainId=String(env.WALLET_CHAIN_ID||'0');
    this.settlementMode='simulated';
    this.initialUsdcAtomic=atomicFromDb(String(env.TEST_WALLET_INITIAL_USDC_ATOMIC||'10000000'));
  }

  async createWallet({passportId,walletId}){
    const digest=await sha256Hex(`accordtrace.test-wallet.v1:${passportId}:${walletId}`);
    return{walletAddress:`acct_test_${digest.slice(0,40)}`,provider:this.id,network:this.network,chainId:this.chainId,settlementMode:this.settlementMode,onchain:false};
  }

  initialBalance(asset='USDC'){
    const meta=assetMetadata(asset);
    return meta.symbol==='USDC'?this.initialUsdcAtomic:0n;
  }

  async prepareTransaction({paymentIntentId,senderWallet,recipientWallet,amountAtomic,asset}){
    assetMetadata(asset);
    if(senderWallet.id===recipientWallet.id)throw new Error('sender_and_recipient_wallet_must_differ');
    return{
      provider:this.id,
      network:this.network,
      chainId:this.chainId,
      settlementMode:this.settlementMode,
      onchain:false,
      providerTxRef:`simtx_${crypto.randomUUID().replace(/-/g,'')}`,
      paymentIntentId,
      amountAtomic:atomicFromDb(amountAtomic),
      asset:String(asset).toUpperCase(),
      preparedAt:new Date().toISOString()
    };
  }
}

export function createWalletProvider(env={}){
  const mode=String(env.WALLET_MODE||'disabled').toLowerCase();
  const provider=String(env.WALLET_PROVIDER||'accord_test').toLowerCase();
  if(mode==='disabled')throw new Error('wallet_mode_disabled');
  if(mode==='production'&&provider==='accord_test')throw new Error('simulated_wallet_provider_forbidden_in_production');
  if(provider==='accord_test')return new AccordTestWalletProvider(env);
  throw new Error(`unsupported_wallet_provider:${provider}`);
}

async function sha256Hex(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
