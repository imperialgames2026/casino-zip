import {bestHoldem,compareScores,settleSidePots,type Card} from "./poker";
import type {Seat,Table} from "./poker-betting";
export type Player=Seat & {hole?:Card[];connected:boolean};
export type HoldemHand={id:string;button:number;smallBlind:number;bigBlind:number;table:Table;board:Card[];phase:"betting"|"showdown"|"complete";deckCommitment:string;revision:number};
const next=(players:Seat[],from:number)=>{for(let i=1;i<=players.length;i++){const p=(from+i)%players.length;if(players[p].stack>0)return p;}throw Error("No eligible seat");};
const requireChips=(n:number)=>{if(!Number.isSafeInteger(n)||n<0)throw Error("Invalid chip amount");};
export function beginHand(id:string,previousButton:number,players:Player[],smallBlind:number,bigBlind:number,commitment:string):HoldemHand{
 if(players.length<2||players.length>10||new Set(players.map(p=>p.id)).size!==players.length)throw Error("Invalid seats");
 requireChips(smallBlind);requireChips(bigBlind);
 if(!smallBlind||bigBlind<smallBlind||!commitment)throw Error("Invalid blind or commitment");
 const seats=players.map(p=>({...p,committed:0,streetBet:0,folded:p.stack===0,allIn:false,acted:false}));
 const button=next(seats,previousButton);
 const active=seats.filter(s=>s.stack>0).length;
 const sb=active===2?button:next(seats,button),bb=next(seats,sb);
 for(const [index,amount] of [[sb,smallBlind],[bb,bigBlind]]){
  const s=seats[index];const paid=Math.min(s.stack,amount);s.stack-=paid;s.committed+=paid;s.streetBet+=paid;s.allIn=s.stack===0;
 }
 const turn=next(seats,bb);
 const table:Table={seats,turn,currentBet:Math.max(seats[sb].streetBet,seats[bb].streetBet),minimumRaise:bigBlind,lastFullRaise:bb,street:"preflop",revision:0};
 return {id,button,smallBlind,bigBlind,table,board:[],phase:"betting",deckCommitment:commitment,revision:0};
}
export type PotAward={amount:number;winners:number[];shares:{seat:number;chips:number}[]};
export function awardPots(contributions:number[],eligible:boolean[],scores:number[][],button:number):PotAward[]{
 if(!Number.isInteger(button)||button<0||button>=contributions.length)throw Error("Invalid button");
 const pots=settleSidePots(contributions,eligible,scores);
 return pots.map(p=>{
  const base=Math.floor(p.amount/p.winners.length),remainder=p.amount%p.winners.length;
  const ordered=[...p.winners].sort((a,b)=>((a-button-1+contributions.length)%contributions.length)-((b-button-1+contributions.length)%contributions.length));
  return {...p,shares:ordered.map((seat,i)=>({seat,chips:base+(i<remainder?1:0)}))};
 });
}
export function settleHand(hand:HoldemHand,holes:Card[][]):{hand:HoldemHand;awards:PotAward[];refunds:{seat:number;chips:number}[]}{
 if(hand.phase==="complete")throw Error("Already settled");
 const seats=hand.table.seats.map(s=>({...s}));
 if(holes.length!==seats.length)throw Error("Missing seat cards");
 const alive=seats.map((s,i)=>!s.folded?i:-1).filter(i=>i>=0);
 if(alive.length===0)throw Error("No remaining players");
 if(alive.length>1&&hand.board.length!==5)throw Error("Five board cards required");
 const allCards=[...hand.board,...holes.filter((_,i)=>alive.includes(i)).flat()];
 if(new Set(allCards.map(c=>c.rank+c.suit)).size!==allCards.length)throw Error("Duplicate cards");
 const contributions=seats.map(s=>s.committed);
 const refunds:{seat:number;chips:number}[]=[];
 // Return any uncontested excess contribution above the second-largest contribution.
 const ordered=[...contributions].sort((a,b)=>b-a);
 const leader=contributions.indexOf(ordered[0]);
 const excess=ordered[0]-(ordered[1]??0);
 if(excess>0){contributions[leader]-=excess;seats[leader].stack+=excess;refunds.push({seat:leader,chips:excess});}
 const scores=seats.map((_,i)=>alive.length===1?[]:alive.includes(i)?bestHoldem(holes[i],hand.board):[]);
 const eligible=seats.map(s=>!s.folded);
 const awards=awardPots(contributions,eligible,scores,hand.button);
 for(const pot of awards)for(const share of pot.shares)seats[share.seat].stack+=share.chips;
 return {hand:{...hand,phase:"complete",revision:hand.revision+1,table:{...hand.table,seats,revision:hand.table.revision+1}},awards,refunds};
}
export function reconnectSnapshot(hand:HoldemHand,requestingPlayerId:string,holes:Record<string,Card[]>){
 const seats=hand.table.seats.map(s=>({...s}));
 if(!seats.some(s=>s.id===requestingPlayerId))throw Error("Not seated");
 return {id:hand.id,button:hand.button,board:[...hand.board],phase:hand.phase,deckCommitment:hand.deckCommitment,revision:hand.revision,table:{...hand.table,seats},yourHoleCards:holes[requestingPlayerId]??[]};
}
export function markConnection(hand:HoldemHand,playerId:string,connected:boolean):HoldemHand{
 if(!hand.table.seats.some(s=>s.id===playerId))throw Error("Unknown seat");
 // Connection state must not change the betting turn or cause an implicit fold.
 return {...hand,revision:hand.revision+1};
}
