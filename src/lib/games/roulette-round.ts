import {rouletteReturn,type RouletteBet} from "./roulette";
export type RouletteTicket={id:string;playerId:string;bet:RouletteBet};
export type RouletteRound={id:string;phase:"betting"|"locked"|"spinning"|"settled";bettingEndsAt:number;revision:number;tickets:RouletteTicket[];commitment:string;outcome?:number;returns?:{id:string;playerId:string;gross:number}[]};
export function newRouletteRound(id:string,now:number,commitment:string):RouletteRound{
 if(!id||!commitment||!Number.isSafeInteger(now))throw Error("Invalid round");
 return {id,phase:"betting",bettingEndsAt:now+15000,revision:0,tickets:[],commitment};
}
export function placeRouletteBet(round:RouletteRound,ticket:RouletteTicket,now:number,expectedRevision:number):RouletteRound{
 if(round.revision!==expectedRevision||round.phase!=="betting"||now>=round.bettingEndsAt)throw Error("Betting closed or stale round");
 if(!ticket.id||!ticket.playerId||round.tickets.some(t=>t.id===ticket.id))throw Error("Invalid or duplicate ticket");
 if(!Number.isSafeInteger(ticket.bet.stake)||ticket.bet.stake<=0)throw Error("Invalid stake");
 // Validate the selection before accepting any ticket, even if it later loses.
 const b=ticket.bet;
 if(b.kind==="straight"&&(!Number.isInteger(b.selection)||b.selection!<0||b.selection!>36))throw Error("Invalid straight");
 if((b.kind==="dozen"||b.kind==="column")&&(!Number.isInteger(b.selection)||b.selection!<1||b.selection!>3))throw Error("Invalid selection");
 if(!["straight","red","black","even","odd","low","high","dozen","column"].includes(b.kind))throw Error("Invalid bet type");
 return {...round,tickets:[...round.tickets,ticket],revision:round.revision+1};
}
export function lockRoulette(round:RouletteRound,now:number):RouletteRound{
 if(round.phase!=="betting"||now<round.bettingEndsAt)throw Error("Cannot lock");
 return {...round,phase:"locked",revision:round.revision+1};
}
export function spinRoulette(round:RouletteRound):RouletteRound{
 if(round.phase!=="locked")throw Error("Cannot spin");
 return {...round,phase:"spinning",revision:round.revision+1};
}
export function settleRoulette(round:RouletteRound,outcome:number):RouletteRound{
 if(round.phase!=="spinning"||!Number.isInteger(outcome)||outcome<0||outcome>36)throw Error("Invalid settlement");
 return {...round,phase:"settled",outcome,returns:round.tickets.map(t=>({id:t.id,playerId:t.playerId,gross:rouletteReturn(outcome,t.bet)})),revision:round.revision+1};
}
