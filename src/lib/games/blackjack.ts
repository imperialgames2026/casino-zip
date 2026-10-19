/** Blackjack scoring only; server must own shoe and actions. */
export type BlackjackCard={rank:number};
export function blackjackTotal(cards:BlackjackCard[]):{total:number;soft:boolean;blackjack:boolean}{
 if(!cards.length||cards.some(c=>!Number.isInteger(c.rank)||c.rank<1||c.rank>13))throw new Error("Invalid cards");
 let total=0,aces=0;for(const c of cards){if(c.rank===1){aces++;total+=1;}else total+=Math.min(c.rank,10);}
 let soft=false;if(aces&&total+10<=21){total+=10;soft=true;}
 return {total,soft,blackjack:cards.length===2&&total===21};
}
export function dealerMustHit(cards:BlackjackCard[],hitSoft17:boolean):boolean{
 const hand=blackjackTotal(cards);
 return hand.total<17||(hand.total===17&&hand.soft&&hitSoft17);
}
