export const ASSET_METADATA=Object.freeze({USDC:Object.freeze({symbol:'USDC',decimals:6,settlement:true})});

export class MoneyError extends Error{constructor(code,message=code){super(message);this.code=code;}}

export function assetMetadata(asset){const key=String(asset||'').toUpperCase();const meta=ASSET_METADATA[key];if(!meta)throw new MoneyError('ASSET_NOT_SUPPORTED',`Unsupported settlement asset: ${key||'empty'}`);return meta;}

export function parseAssetAmount(value,asset='USDC'){
  const meta=assetMetadata(asset);
  if(typeof value!=='string')throw new MoneyError('INVALID_AMOUNT','Money amounts must be decimal strings, never JavaScript floating-point numbers.');
  const text=value.trim();
  if(!/^(0|[1-9]\d*)(?:\.\d+)?$/.test(text))throw new MoneyError('INVALID_AMOUNT','Amount must be a non-negative decimal string.');
  const [whole,fraction='']=text.split('.');
  if(fraction.length>meta.decimals)throw new MoneyError('INVALID_AMOUNT_PRECISION',`${meta.symbol} supports at most ${meta.decimals} decimal places.`);
  const atomic=BigInt(whole)*(10n**BigInt(meta.decimals))+BigInt((fraction+'0'.repeat(meta.decimals)).slice(0,meta.decimals)||'0');
  return atomic;
}

export function atomicFromDb(value){
  if(typeof value==='bigint')return value;
  if(typeof value==='number'){
    if(!Number.isSafeInteger(value))throw new MoneyError('UNSAFE_DB_AMOUNT','Database monetary integer exceeded JavaScript safe-integer transport bounds.');
    return BigInt(value);
  }
  const text=String(value??'').trim();
  if(!/^-?\d+$/.test(text))throw new MoneyError('INVALID_DB_AMOUNT','Database monetary value is not an integer.');
  return BigInt(text);
}

export function toDbInteger(value){
  const atomic=typeof value==='bigint'?value:atomicFromDb(value);
  if(atomic<0n)throw new MoneyError('NEGATIVE_AMOUNT','Negative monetary values are not permitted here.');
  if(atomic>BigInt(Number.MAX_SAFE_INTEGER))throw new MoneyError('AMOUNT_TOO_LARGE','Atomic amount exceeds safe database binding bounds.');
  return Number(atomic);
}

export function formatAssetAmount(value,asset='USDC'){
  const meta=assetMetadata(asset);const atomic=atomicFromDb(value);const negative=atomic<0n;const n=negative?-atomic:atomic;const base=10n**BigInt(meta.decimals);const whole=n/base;const fraction=(n%base).toString().padStart(meta.decimals,'0').replace(/0+$/,'');
  return `${negative?'-':''}${whole}${fraction?'.'+fraction:''}`;
}
