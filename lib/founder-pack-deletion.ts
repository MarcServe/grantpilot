import type { getSupabaseAdmin } from "@/lib/supabase";
import { FOUNDER_PACK_DOCUMENT_TYPES, normaliseContent, type FounderPackContent, type FounderPackDocumentType } from "@/lib/founder-pack";
function hasContent(value:unknown):boolean{return typeof value==="string"?!!value.trim():Array.isArray(value)?value.some(hasContent):!!value&&typeof value==="object"?Object.values(value).some(hasContent):false;}
const contentKey=(type:string)=>type.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase()) as keyof FounderPackContent;
export function removePackDocument(rawContent:unknown,rawInputs:unknown,type:FounderPackDocumentType){
 const content=normaliseContent(rawContent);const inputs=rawInputs&&typeof rawInputs==="object"&&!Array.isArray(rawInputs)?rawInputs as Record<string,unknown>:{};
 const types=FOUNDER_PACK_DOCUMENT_TYPES.filter(item=>Array.isArray(inputs.documentTypes)&&inputs.documentTypes.length>0?inputs.documentTypes.includes(item.value):hasContent(content[contentKey(item.value)])).map(item=>item.value);
 if(!types.includes(type))return null;
 const remaining=types.filter(value=>value!==type);const defaults=normaliseContent({});
 const updatedInputs:Record<string,unknown>={...inputs,documentTypes:remaining};
 return {content:{...content,[contentKey(type)]:defaults[contentKey(type)]},inputs:updatedInputs,documentTypes:remaining,deletedPack:remaining.length===0};
}
export async function deleteSavedPack(db:ReturnType<typeof getSupabaseAdmin>,orgId:string,id:string,documentType?:string|null){
 const selected=documentType?FOUNDER_PACK_DOCUMENT_TYPES.find(type=>type.value===documentType):null;
 if(documentType&&!selected)return {status:400,body:{error:"Unknown document type."}};
 const current=await db.from("FounderFundingPack").select("id,content,inputs,updatedAt").eq("id",id).eq("organisationId",orgId).maybeSingle();
 if(current.error)return {status:502,body:{error:"Could not load the saved pack. Please retry."}};
 if(!current.data)return {status:404,body:{error:"Saved pack not found."}};
 const removal=selected?removePackDocument(current.data.content,current.data.inputs,selected.value):null;
 if(selected&&!removal)return {status:404,body:{error:"This document is no longer in the pack. Refresh the page."}};
 const deletedPack=!selected||!!removal?.deletedPack;
 const operation=deletedPack?db.from("FounderFundingPack").delete():db.from("FounderFundingPack").update({content:removal!.content,inputs:removal!.inputs,updatedAt:new Date().toISOString()});
 const saved=await operation.eq("id",id).eq("organisationId",orgId).eq("updatedAt",current.data.updatedAt).select("id").maybeSingle();
 if(saved.error)return {status:502,body:{error:"Could not remove the saved document. Please retry."}};
 if(!saved.data)return {status:409,body:{error:"The pack changed while deleting. Refresh and review it before trying again."}};
 return {status:200,body:deletedPack?{deletedPack:true}:{deletedPack:false,content:removal!.content,documentTypes:removal!.documentTypes}};
}
