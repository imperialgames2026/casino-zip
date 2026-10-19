import {useState} from "react";
import {rouletteReturn,type RouletteBet} from "../lib/games/roulette";
import {beginBlackjack,blackjackAction,settleBlackjack,type BJTable} from "../lib/games/blackjack-table";
import {bestHoldem,type Card} from "../lib/games/poker";
import {shuffleCommittedDeck} from "../lib/games/poker-fairness";
const randomNumber=(max:number)=>{const maxUint=4294967296,limit=Math.floor(maxUint/max)*max;let n=0;do{n=crypto.getRandomValues(new Uint32Array(1))[0]}while(n>=limit);return n%max;};
export default function TableGamesPreview(){
 const [mode,setMode]=useState<"roulette"|"blackjack"|"poker">("roulette");
 const [message,setMessage]=useState("");
 const [blackjack,setBlackjack]=useState<BJTable|null>(null);
 const [poker,setPoker]=useState<{hole:Card[];board:Card[];score:number[];commitment:string}|null>(null);
 const [betKind,setBetKind]=useState<RouletteBet["kind"]>("red");
 const [selection,setSelection]=useState(1);
 const [rouletteNumber,setRouletteNumber]=useState<number|null>(null);
 function rouletteDemo(){const outcome=randomNumber(37);setRouletteNumber(outcome);setMessage("Wheel: "+outcome+" · Gross demo return on 10 chips: "+rouletteReturn(outcome,{kind:betKind,selection,stake:10}));}
 function newBlackjack(){
  const deck=Array.from({length:6},()=>Array.from({length:52},(_,i)=>({rank:i%13+1}))).flat();
  for(let i=deck.length-1;i>0;i--){const j=randomNumber(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
  const table=beginBlackjack([{id:"player",bet:10}],deck);
  setBlackjack(table);setMessage("");
 }
 function act(action:"hit"|"stand"){if(!blackjack)return;try{let t=blackjackAction(blackjack,"player",action,blackjack.revision);if(t.phase==="dealer")t=settleBlackjack(t);setBlackjack(t);}catch(e){setMessage(String(e));}}
 async function newPoker(){
  const seed=crypto.randomUUID();const handId=crypto.randomUUID();
  const {deck,commitment}=await shuffleCommittedDeck(seed,handId);
  const hole=deck.slice(0,2),board=deck.slice(2,7);
  setPoker({hole,board,score:bestHoldem(hole,board),commitment});setMessage("Local hand preview only — no opponents or betting table.");
 }
 const label=(cards:Card[])=>cards.map(c=>(c.rank===14?"A":c.rank===13?"K":c.rank===12?"Q":c.rank===11?"J":c.rank===10?"10":c.rank)+({s:"♠",h:"♥",d:"♦",c:"♣"}[c.suit])).join(" ");
 return <section style={{border:"1px solid #34415a",borderRadius:16,padding:24,marginTop:24,background:"#19243b"}}>
  <h2>Table games — local rules previews</h2><p>No balances, prizes, real opponents, server-authoritative hands, or financial transactions. These screens are not the legacy multiplayer interfaces.</p>
  <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{(["roulette","blackjack","poker"] as const).map(x=><button key={x} aria-pressed={mode===x} onClick={()=>{setMode(x);setMessage("");}}>{x.toUpperCase()}</button>)}</div>
  {mode==="roulette"&&<div><h3>European roulette</h3><label>Bet type <select value={betKind} onChange={e=>setBetKind(e.target.value as RouletteBet["kind"])}>{["red","black","even","odd","low","high","straight","dozen","column"].map(k=><option key={k}>{k}</option>)}</select></label> {["straight","dozen","column"].includes(betKind)&&<label>Selection <input type="number" min={betKind==="straight"?0:1} max={betKind==="straight"?36:3} value={selection} onChange={e=>setSelection(Number(e.target.value))}/></label>} <button onClick={rouletteDemo}>Spin demo</button>{rouletteNumber!==null&&<p>Winning number: {rouletteNumber}</p>}</div>}
  {mode==="blackjack"&&<div><h3>Blackjack</h3><button onClick={newBlackjack}>Deal practice hand</button>{blackjack&&<><p>Dealer: {blackjack.dealer[0].rank} / {blackjack.phase==="settled"?blackjack.dealer.slice(1).map(c=>c.rank).join(", "):"hidden"}</p><p>Your cards: {blackjack.seats[0].cards.map(c=>c.rank).join(", ")}</p><p>Phase: {blackjack.phase}</p>{blackjack.phase==="players"&&<><button onClick={()=>act("hit")}>Hit</button> <button onClick={()=>act("stand")}>Stand</button></>}{blackjack.phase==="dealer"&&<button onClick={()=>setBlackjack(settleBlackjack(blackjack))}>Dealer settles</button>}{blackjack.phase==="settled"&&<p>Gross return: {blackjack.seats[0].payout} practice chips</p>}</>}</div>}
  {mode==="poker"&&<div><h3>Texas Hold'em showdown evaluator</h3><button onClick={()=>void newPoker()}>Deal practice hand</button>{poker&&<><p>Hole: {label(poker.hole)}</p><p>Board: {label(poker.board)}</p><p>Hand score: {poker.score.join(", ")}</p><small>Deck commitment: {poker.commitment}</small></>}</div>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
