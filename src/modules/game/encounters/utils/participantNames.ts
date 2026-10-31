/** Number duplicate display names within the caller's already-authorized roster only. */
export function participantNames(participants:any[]) {
  const counts=new Map<string,number>(),seen=new Map<string,number>();
  for(const p of participants)counts.set(p.snapshot.name,(counts.get(p.snapshot.name)??0)+1);
  return new Map(participants.map(p=>{const name=p.snapshot.name,index=(seen.get(name)??0)+1;seen.set(name,index);return [p.id,counts.get(name)!>1?`${name} ${index}`:name];}));
}
