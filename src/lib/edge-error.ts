import { FunctionsHttpError } from '@supabase/supabase-js';
export async function edgeError(error:unknown,fallback:string){
  if(error instanceof FunctionsHttpError){const body=await error.context.json().catch(()=>null);if(typeof body?.error==='string')return body.error;}
  return fallback;
}
