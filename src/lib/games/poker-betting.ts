/** Server-side No-Limit Hold'em betting rules. Pure functions; no wallet effects. */
export type Seat={id:string;stack:number;committed:number;streetBet:number;folded:boolean;allIn:boolean;acted:boolean};
export type Table={seats:Seat[];turn:number;currentBet:number;minimumRaise:number;lastFullRaise:number;street:"preflop"|"flop"|"turn"|"river";revision:number};
export type Action={type:"fold"|"check"|"call"|"bet"|"raise"|"allin";amount?:number};
const valid=(n:number)=>Number.isSafeInteger(n)&&n>=0;
export function applyPokerAction(table:Table,seatId:string,action:Action,expectedRevision:number):Table{
 if(expectedRevision!==table.revision)throw Error("Stale table revision");
 const t:Table={...table,seats:table.seats.map(s=>({...s}))};
 if(!Number.isInteger(t.turn)||t.turn<0||t.turn>=t.seats.length)throw Error("Invalid turn");
 const seat=t.seats[t.turn];
 if(seat.id!==seatId||seat.folded||seat.allIn)throw Error("Not your turn");
 if(!valid(seat.stack)||!valid(seat.streetBet)||!valid(seat.committed)||!valid(t.currentBet)||!valid(t.minimumRaise)||t.minimumRaise<1)throw Error("Invalid table amounts");
 const toCall=Math.max(0,t.currentBet-seat.streetBet);
 let contribution=0;
 if(action.type==="fold")seat.folded=true;
 else if(action.type==="check"){if(toCall!==0)throw Error("Cannot check facing a bet");}
 else if(action.type==="call")contribution=Math.min(toCall,seat.stack);
 else if(action.type==="bet"||action.type==="raise"){
  if(!raiseAllowed)throw Error("Betting not reopened by short all-in");
  const target=action.amount;
  if(!valid(target!)||target!<=t.currentBet)throw Error("Invalid bet target");
  if(action.type==="bet"&&t.currentBet!==0)throw Error("Bet requires unopened street");
  if(action.type==="raise"&&t.currentBet===0)throw Error("Raise requires existing bet");
  contribution=target!-seat.streetBet;
  if(contribution>seat.stack)throw Error("Insufficient chips");
  const raiseSize=target!-t.currentBet;
  if(raiseSize<t.minimumRaise)throw Error("Raise below minimum");
 }else if(action.type==="allin")contribution=seat.stack;
 else throw Error("Unknown action");
 if(action.type!=="fold"&&action.type!=="check"&&action.type!=="call"&&action.type!=="allin"&&contribution===0)throw Error("Zero bet");
 const newTotal=seat.streetBet+contribution;
 if(newTotal>t.currentBet){
  const raiseSize=newTotal-t.currentBet;
  if(raiseSize>=t.minimumRaise){
   t.minimumRaise=raiseSize;t.lastFullRaise=t.turn;
   t.seats.forEach((s,i)=>{if(i!==t.turn&&!s.folded&&!s.allIn)s.acted=false;});
  }
  t.currentBet=newTotal;
 }
 seat.stack-=contribution;seat.committed+=contribution;seat.streetBet=newTotal;
 seat.allIn=seat.stack===0;seat.acted=true;
 const remaining=t.seats.filter(s=>!s.folded);
 if(remaining.length<=1)return {...t,revision:t.revision+1};
 const pending=t.seats.map((s,i)=>({s,i})).filter(({s})=>!s.folded&&!s.allIn&&(!s.acted||s.streetBet<t.currentBet));
 if(pending.length){
  for(let offset=1;offset<=t.seats.length;offset++){
   const i=(t.turn+offset)%t.seats.length;
   if(pending.some(p=>p.i===i)){t.turn=i;break;}
  }
 }
 return {...t,revision:t.revision+1};
}
export function streetComplete(t:Table):boolean{
 const active=t.seats.filter(s=>!s.folded&&!s.allIn);
 return active.every(s=>s.acted&&s.streetBet===t.currentBet);
}
export function nextStreet(t:Table,firstActor:number):Table{
 if(!streetComplete(t))throw Error("Street not complete");
 const next={preflop:"flop",flop:"turn",turn:"river",river:null}[t.street];
 if(!next)throw Error("Showdown required");
 if(!Number.isInteger(firstActor)||firstActor<0||firstActor>=t.seats.length)throw Error("Invalid actor");
 const seats=t.seats.map(s=>({...s,streetBet:0,acted:false}));
 const first=seats.findIndex((s,i)=>i>=firstActor&&!s.folded&&!s.allIn);
 const fallback=seats.findIndex(s=>!s.folded&&!s.allIn);
 return {...t,seats,street:next,currentBet:0,minimumRaise:Math.max(1,t.minimumRaise),turn:first>=0?first:fallback,revision:t.revision+1};
}
