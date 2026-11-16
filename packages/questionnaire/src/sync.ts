// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** Optional authenticated, tenant-scoped configuration channel. It never stores bearer tokens. */
import {validateConfiguration} from './index.ts';
export function installConfigurationSync(runtime, {baseUrl, getAccessToken, intervalMs=30000, onStatus=()=>{}}={}) {
  if(!baseUrl||typeof getAccessToken!=='function') return {enabled:false};
  const url=new URL('/v1/crm/configuration',baseUrl);
  if(!/^https:$/.test(url.protocol) && !['localhost','127.0.0.1','10.0.2.2'].includes(url.hostname)) throw new Error('Only HTTPS configuration APIs are allowed outside loopback');
  let recordVersion=null,stopped=false,loading=false,timer=null;
  async function request(method,body){
    const token=await getAccessToken();
    if(typeof token!=='string'||token.length<10)throw new Error('يجب تسجيل الدخول للوصول إلى إعدادات الشركة');
    const headers={'Authorization':`Bearer ${token}`};
    if(method!=='GET'){headers['Content-Type']='application/json';headers['Idempotency-Key']=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
    const response=await fetch(url.href,{method,headers,...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'error'});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error?.error?.message||`API status ${response.status}`);}
    return response.json();
  }
  function apply(payload){
    const errors=validateConfiguration(payload.definition,payload.catalog);
    if(errors.length)throw new Error('بيانات الإعدادات من الخادم غير صالحة: '+errors[0]);
    if(recordVersion===payload.recordVersion)return;
    recordVersion=payload.recordVersion;
    runtime.update((s)=>{s.formConfig=payload.definition;s.catalog=payload.catalog;},'');
    onStatus({connected:true,recordVersion});
  }
  async function refresh(){if(loading||stopped)return;loading=true;try{apply(await request('GET'));}catch(error){onStatus({connected:false,error:String(error.message)});}finally{loading=false;}}
  async function publish({definition,catalog}){
    if(recordVersion===null){const current=await request('GET');apply(current);}
    const res=await request('PUT',{expectedVersion:recordVersion,definition,catalog});apply(res);return res;
  }
  void refresh();
  if(typeof document!=='undefined'){
    timer=setInterval(()=>{if(!document.hidden)void refresh();},Math.max(10000,intervalMs));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  }
  return {enabled:true,refresh,publish,get recordVersion(){return recordVersion;},stop(){stopped=true;if(timer)clearInterval(timer);}};
}
