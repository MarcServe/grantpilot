export function addCalendarMonths(iso: string, months: number): string {
  const d=new Date(iso+'T00:00:00Z');
  const target=new Date(0);target.setUTCFullYear(d.getUTCFullYear(),d.getUTCMonth()+months,1);
  const last=new Date(target);last.setUTCMonth(last.getUTCMonth()+1,0);const lastDay=last.getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(),lastDay));return target.toISOString().slice(0,10);
}
export function visaRepaymentWindow(start:string,expiry:string,months:number){
  const latestEnd=addCalendarMonths(expiry,-6);
  let maximumMonths=0;
  for(let m=1;m<=60;m++){if(addCalendarMonths(start,m)<=latestEnd)maximumMonths=m;else break;}
  const proposedEnd=addCalendarMonths(start,months);
  return {latestEnd,maximumMonths,proposedEnd,fits:proposedEnd<=latestEnd};
}
export function estimateLoanRepayment(amount:number,months:number){
  if(!Number.isFinite(amount)||amount<500||amount>25000||!Number.isInteger(months)||months<12||months>60)return null;
  const monthlyRate=0.075/12;
  const monthly=amount*monthlyRate/(1-Math.pow(1+monthlyRate,-months));
  return {monthly,total:monthly*months,interest:monthly*months-amount,annualRate:7.5};
}
