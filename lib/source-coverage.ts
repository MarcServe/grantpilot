import { grantSourceEndpointKey } from "@/lib/grant-source-endpoint";
export interface CoverageSource { endpoint:string; enabled?:boolean; country?:string|null; type?:string; crawl_frequency?:string; last_crawled_at?:string|null; last_crawl_status?:string|null; last_crawl_result?:Record<string,unknown>|null; }
export function sourceCoverage(rows:CoverageSource[],now=Date.now()) {
  const valid=rows.flatMap(row=>{try{const u=new URL(row.endpoint);if(!["https:","http:"].includes(u.protocol)||u.username||u.password)return [];return [{...row,key:grantSourceEndpointKey(row.endpoint),host:u.hostname.replace(/^www\./,"")}];}catch{return [];}});
  const unique=[...new Map(valid.map(row=>[row.key,row])).values()];
  const enabled=valid.filter(row=>row.enabled===true);
  const recent=(row:CoverageSource)=>{const time=Date.parse(row.last_crawled_at??"");return Number.isFinite(time)&&time<=now&&time>=now-7*86400000;};
  const intervals:Record<string,number>={"6h":6,"24h":24,"72h":72,"168h":168};
  const latestResults=enabled.filter(r=>r.last_crawl_status==="success"&&recent(r));
  const resultTotal=(key:string)=>latestResults.reduce((sum,r)=>{const n=r.last_crawl_result?.[key];return sum+(typeof n==="number"&&Number.isFinite(n)&&n>=0?n:0);},0);
  return { latestRecordedNew7Days:resultTotal("created"), latestRecordedUpserts7Days:resultTotal("updated"), latestRecordedSkipped7Days:resultTotal("skipped"), rows:rows.length, distinctPages:unique.length, distinctDomains:new Set(unique.map(r=>r.host)).size, duplicateRows:valid.length-unique.length, invalidRows:rows.length-valid.length,
    enabledRows:enabled.length,enabledPages:new Set(enabled.map(r=>r.key)).size,
    latestSuccessWithin7Days:enabled.filter(r=>r.last_crawl_status==="success"&&recent(r)).length,
    latestFailureWithin7Days:enabled.filter(r=>["blocked","missing","timeout","internal","failed"].includes(r.last_crawl_status??"")&&recent(r)).length,
    claimedRows:enabled.filter(r=>r.last_crawl_status==="claimed").length,
    neverAttempted:enabled.filter(r=>!r.last_crawled_at).length,
    missingOutcome:enabled.filter(r=>!r.last_crawl_status).length,
    overdue:enabled.filter(r=>{const time=Date.parse(r.last_crawled_at??"");return !Number.isFinite(time)||time+(intervals[r.crawl_frequency??""]??24)*3600000<=now;}).length,
    countries:[...new Set(unique.map(r=>r.country).filter((v):v is string=>Boolean(v)))].sort(),
    types:[...new Set(unique.map(r=>r.type).filter((v):v is string=>Boolean(v)))].sort(),
  };
}
export type SourceCoverage=ReturnType<typeof sourceCoverage>;
