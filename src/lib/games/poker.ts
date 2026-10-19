/** Deterministic Texas Hold'em showdown evaluator. No betting or financial settlement. */
export type Card = { rank: number; suit: "c"|"d"|"h"|"s" };
export function evaluateFive(cards: Card[]): number[] {
 if(cards.length!==5 || new Set(cards.map(c=>c.rank+c.suit)).size!==5 || cards.some(c=>!Number.isInteger(c.rank)||c.rank<2||c.rank>14||!["c","d","h","s"].includes(c.suit))) throw new Error("Invalid five-card hand");
 const ranks=cards.map(c=>c.rank).sort((a,b)=>b-a);
 const counts=new Map<number,number>(); for(const r of ranks)counts.set(r,(counts.get(r)??0)+1);
 const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
 const flush=cards.every(c=>c.suit===cards[0].suit);
 const unique=[...new Set(ranks)]; if(unique.includes(14))unique.push(1);
 let straight=0; for(let i=0;i<=unique.length-5;i++)if(unique[i]-unique[i+4]===4){straight=unique[i];break;}
 if(flush&&straight)return [8,straight];
 if(groups[0][1]===4)return [7,groups[0][0],groups[1][0]];
 if(groups[0][1]===3&&groups[1][1]===2)return [6,groups[0][0],groups[1][0]];
 if(flush)return [5,...ranks];
 if(straight)return [4,straight];
 if(groups[0][1]===3)return [3,groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)];
 if(groups[0][1]===2&&groups[1][1]===2)return [2,Math.max(groups[0][0],groups[1][0]),Math.min(groups[0][0],groups[1][0]),groups[2][0]];
 if(groups[0][1]===2)return [1,groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)];
 return [0,...ranks];
}
export function compareScores(a:number[],b:number[]):number {
 for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]??0)-(b[i]??0);if(d)return Math.sign(d);}return 0;
}
export function bestHoldem(hole:Card[],board:Card[]):number[]{
 if(hole.length!==2||board.length!==5)throw new Error("Showdown requires two hole cards and five board cards");
 const cards=[...hole,...board];
 if(new Set(cards.map(c=>c.rank+c.suit)).size!==7)throw new Error("Duplicate cards");
 let best:number[]|null=null;
 for(let a=0;a<7;a++)for(let b=a+1;b<7;b++){
  const score=evaluateFive(cards.filter((_,i)=>i!==a&&i!==b));
  if(!best||compareScores(score,best)>0)best=score;
 }
 return best!;
}
export function settleSidePots(contributions:number[],eligible:boolean[],scores:number[][]):{amount:number;winners:number[]}[]{
 if(contributions.length!==eligible.length||scores.length!==eligible.length||contributions.some(x=>!Number.isSafeInteger(x)||x<0))throw new Error("Invalid pot");
 const levels=[...new Set(contributions.filter(x=>x>0))].sort((a,b)=>a-b);
 let prev=0;
 return levels.map(level=>{
  const participants=contributions.map((x,i)=>x>=level?i:-1).filter(i=>i>=0);
  const amount=(level-prev)*participants.length;prev=level;
  const contenders=participants.filter(i=>eligible[i]);
  if(!contenders.length)throw new Error("Unclaimed side pot");
  let best=scores[contenders[0]];
  for(const i of contenders)if(compareScores(scores[i],best)>0)best=scores[i];
  return {amount,winners:contenders.filter(i=>compareScores(scores[i],best)===0)};
 });
}
