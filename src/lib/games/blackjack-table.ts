import {blackjackTotal,dealerMustHit,type BlackjackCard} from "./blackjack";
export type BJSeat={id:string;cards:BlackjackCard[];bet:number;status:"playing"|"stood"|"bust"|"blackjack"|"done";payout?:number};
export type BJTable={phase:"betting"|"players"|"dealer"|"settled";shoe:BlackjackCard[];cursor:number;dealer:BlackjackCard[];seats:BJSeat[];turn:number;revision:number;hitSoft17:boolean};
const draw=(t:BJTable)=>{if(t.cursor>=t.shoe.length)throw Error("Shoe exhausted");return t.shoe[t.cursor++];};
export function beginBlackjack(seats:{id:string;bet:number}[],shoe:BlackjackCard[],hitSoft17=false):BJTable{
 if(!seats.length||seats.length>7||seats.some(s=>!Number.isSafeInteger(s.bet)||s.bet<=0)||new Set(seats.map(s=>s.id)).size!==seats.length)throw Error("Invalid seats");
 if(shoe.some(c=>!Number.isInteger(c.rank)||c.rank<1||c.rank>13))throw Error("Invalid shoe");
 const t:BJTable={phase:"players",shoe:[...shoe],cursor:0,dealer:[],seats:seats.map(s=>({...s,cards:[],status:"playing"})),turn:0,revision:0,hitSoft17};
 for(let pass=0;pass<2;pass++){for(const seat of t.seats)seat.cards.push(draw(t));t.dealer.push(draw(t));}
 for(const seat of t.seats)if(blackjackTotal(seat.cards).blackjack)seat.status="blackjack";
 advance(t);
 return t;
}
function advance(t:BJTable){
 const next=t.seats.findIndex((s,i)=>i>=t.turn&&s.status==="playing");
 if(next>=0){t.turn=next;return;}
 t.phase="dealer";
}
export function blackjackAction(t:BJTable,playerId:string,action:"hit"|"stand",revision:number):BJTable{
 if(t.phase!=="players"||t.revision!==revision||t.seats[t.turn]?.id!==playerId)throw Error("Invalid turn or revision");
 const n:BJTable={...t,seats:t.seats.map(s=>({...s,cards:[...s.cards]})),dealer:[...t.dealer]};
 const seat=n.seats[n.turn];
 if(action==="hit"){seat.cards.push(draw(n));const score=blackjackTotal(seat.cards);if(score.total>21)seat.status="bust";else if(score.total===21)seat.status="stood";}
 else if(action==="stand")seat.status="stood";
 else throw Error("Unknown action");
 if(seat.status!=="playing")n.turn++;
 advance(n);n.revision++;
 return n;
}
export function settleBlackjack(t:BJTable):BJTable{
 if(t.phase!=="dealer")throw Error("Dealer not ready");
 const n:BJTable={...t,dealer:[...t.dealer],seats:t.seats.map(s=>({...s,cards:[...s.cards]}))};
 const live=n.seats.some(s=>s.status!=="bust"&&s.status!=="blackjack");
 if(live)while(dealerMustHit(n.dealer,n.hitSoft17))n.dealer.push(draw(n));
 const dealer=blackjackTotal(n.dealer);
 for(const s of n.seats){
  const player=blackjackTotal(s.cards);
  const payout=s.status==="bust"?0:
   player.blackjack?dealer.blackjack?s.bet:Math.floor(s.bet*5/2):
   dealer.blackjack?0:dealer.total>21||player.total>dealer.total?s.bet*2:player.total===dealer.total?s.bet:0;
  s.payout=payout;s.status="done";
 }
 n.phase="settled";n.revision++;
 return n;
}
export function blackjackSnapshot(t:BJTable,playerId:string){
 if(!t.seats.some(s=>s.id===playerId))throw Error("Not seated");
 return {...t,shoe:undefined,cursor:undefined,dealer:t.phase==="settled"?t.dealer:[t.dealer[0],{hidden:true}],seats:t.seats.map(s=>({...s}))};
}
