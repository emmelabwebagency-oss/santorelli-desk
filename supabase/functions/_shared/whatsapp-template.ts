export type AdministrativeTemplate={id:string;name:string;language:string;preview:string;fingerprint:string};
export async function administrativeTemplate(value:unknown):Promise<AdministrativeTemplate|null>{
  if(!value||typeof value!=='object')return null;
  const t=value as Record<string,unknown>;
  if(t.status!=='APPROVED'||t.category!=='UTILITY'||typeof t.id!=='string'||!/^\d{1,40}$/.test(t.id)||typeof t.name!=='string'||!/^[a-z0-9_]{1,512}$/.test(t.name)||typeof t.language!=='string'||!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(t.language)||!Array.isArray(t.components))return null;
  const parts:{type:string;text:string}[]=[];const types=new Set<string>();
  for(const raw of t.components){
    if(!raw||typeof raw!=='object')return null;const c=raw as Record<string,unknown>;
    if(typeof c.type!=='string'||!['HEADER','BODY','FOOTER'].includes(c.type)||types.has(c.type)||typeof c.text!=='string'||!c.text.trim()||c.text.length>3000||/[{}]/.test(c.text)||(c.type==='HEADER'&&c.format!=='TEXT'))return null;
    types.add(c.type);parts.push({type:c.type,text:c.text});
  }
  if(!types.has('BODY'))return null;
  parts.sort((a,b)=>['HEADER','BODY','FOOTER'].indexOf(a.type)-['HEADER','BODY','FOOTER'].indexOf(b.type));
  const preview=parts.map(p=>p.text).join('\n\n');if(preview.length>5000)return null;
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({name:t.name,language:t.language,parts}))))).map(x=>x.toString(16).padStart(2,'0')).join('');
  return {id:t.id,name:t.name,language:t.language,preview,fingerprint};
}
