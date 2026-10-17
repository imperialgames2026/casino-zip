import {useCallback,useEffect,useState} from "react";
import {supabase} from "../lib/supabase";
type EventRow={id:string;name:string;format:string;status:string;registered:number;maxPlayers:number;version:number;myEntry:{table_id:string|null;seat_no:number|null}|null;startAt?:string};
type Card={rank:number;suit:"c"|"d"|"h"|"s"};
type Seat={seat_no:number;user_id:string;stack:number;committed:number;street_bet:number;folded:boolean;all_in:boolean;acted:boolean};
type TableSnapshot={table:{id:string;status:string;version:number;street:string;button:number;turnIndex:number|null;board:Card[];currentBet:number;minRaise:number;smallBlind:number;bigBlind:number;deckCommitment:string;handNo:number;ownerId:string;eventId:string|null;turnStartedAt:string|null;turnDeadlineAt:string|null;turnExtensionUsed:boolean};seats:Seat[];holeCards:Card[];serverNow?:string;timebank?:{igd:string|number;ign:string|number|null;paymentEnabled:boolean;practicePreviewEnabled:boolean};revealedSeed?:string;verificationHandId?:string};
const showCards=(cards:Card[])=>cards.map(c=>(c.rank===14?"A":c.rank===13?"K":c.rank===12?"Q":c.rank===11?"J":String(c.rank))+({c:"♣",d:"♦",h:"♥",s:"♠"}[c.suit])).join(" ");
async function invoke(name:string,body:Record<string,unknown>){
 if(!supabase)throw Error("Supabase is not configured");
 const {data,error}=await supabase.functions.invoke(name,{body});
 if(error)throw Error(error.message);
 if(data?.error)throw Error(data.error);
 return data;
}
export default function PokerOnlineLobby({userId}:{userId:string|null}){
 const [events,setEvents]=useState<EventRow[]>([]);
 const [tableId,setTableId]=useState("");
 const [snapshot,setSnapshot]=useState<TableSnapshot|null>(null);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [raiseTo,setRaiseTo]=useState(20);
 const [nowMs,setNowMs]=useState(()=>Date.now());
 const [serverOffsetMs,setServerOffsetMs]=useState(0);
 useEffect(()=>{const handle=setInterval(()=>setNowMs(Date.now()),100);return()=>clearInterval(handle);},[]);
 const loadEvents=useCallback(async()=>{
  if(!userId)return;
  try{const data=await invoke("poker-events-v1",{action:"list"});setEvents(data.events??[]);}
  catch(e){setMessage(e instanceof Error?e.message:"Event list unavailable");}
 },[userId]);
 const loadTable=useCallback(async(id:string)=>{
  if(!id)return;
  try{const data:TableSnapshot=await invoke("poker-table-v1",{action:"snapshot",tableId:id});
   if(data.serverNow){setServerOffsetMs(Date.parse(data.serverNow)-Date.now());}
   setSnapshot(data);}
  catch(e){setMessage(e instanceof Error?e.message:"Table unavailable");}
 },[]);
 useEffect(()=>{if(!userId)return;void loadEvents();const timer=setInterval(()=>{void loadEvents();if(tableId)void loadTable(tableId);},2500);return()=>clearInterval(timer);},[userId,loadEvents,loadTable,tableId]);
 async function run(work:()=>Promise<unknown>){
  setBusy(true);setMessage("");
  try{const response=await work();setMessage("Operation accepted: "+JSON.stringify(response));await loadEvents();if(tableId)await loadTable(tableId);}
  catch(e){setMessage(e instanceof Error?e.message:"Request failed");}
  finally{setBusy(false);}
 }
 const mySeat=snapshot?.seats.find(s=>s.user_id===userId);
 const isMyTurn=!!snapshot&&!!mySeat&&snapshot.table.status==="playing"&&snapshot.table.turnIndex===mySeat.seat_no;
 const toCall=snapshot&&mySeat?Math.max(0,snapshot.table.currentBet-mySeat.street_bet):0;
 const deadlineMs=snapshot?.table.turnDeadlineAt?Date.parse(snapshot.table.turnDeadlineAt):0;
 const remainingMs=deadlineMs?Math.max(0,deadlineMs-(nowMs+serverOffsetMs)):0;
 const remainingSeconds=Math.ceil(remainingMs/1000);
 const turnOpen=isMyTurn&&remainingMs>0;
 const canExtend=turnOpen&&!snapshot?.table.turnExtensionUsed;
 return <section style={{background:"#19243b",border:"1px solid #34415a",borderRadius:16,padding:24,marginTop:24}}>
  <h2>Online Poker · Staging practice tables</h2>
  <p>Use separate signed-in accounts to test multiplayer. No real-value buy-ins, prizes, rake or withdrawals.</p>
  {!userId&&<p>Sign in under Account to register for practice events.</p>}
  {userId&&<><button disabled={busy} onClick={()=>void loadEvents()}>Refresh events</button>
   {events.length===0&&<p>No published events yet. A Superadmin must create and publish a draft.</p>}
   <div style={{display:"grid",gap:10,marginTop:12}}>
    {events.map(e=><article key={e.id} style={{border:"1px solid #62708a",padding:12,borderRadius:10}}>
      <strong>{e.name}</strong> · {e.format} · {e.status} · {e.registered}/{e.maxPlayers} registered
      {e.startAt&&<p>Scheduled: {new Date(e.startAt).toLocaleString()}</p>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
       {!e.myEntry&&e.status==="registration"&&<button disabled={busy} onClick={()=>void run(()=>invoke("poker-events-v1",{action:"register",eventId:e.id}))}>Register for practice</button>}
       {e.myEntry&&<span>Registered {e.myEntry.seat_no!==null?"· Seat "+e.myEntry.seat_no:"· Awaiting seating"}</span>}
       {e.myEntry&&e.status==="running"&&<button disabled={busy} onClick={()=>void run(async()=>{
        const result=await invoke("poker-events-v1",{action:"tables",eventId:e.id});
        if(!result.myTableId)throw Error("Seat not yet assigned");
        setTableId(result.myTableId);const snap=await invoke("poker-table-v1",{action:"snapshot",tableId:result.myTableId});setSnapshot(snap);
        return {tableId:result.myTableId};
       })}>Open my table</button>}
      </div>
     </article>)}
   </div>
  </>}
  {tableId&&snapshot&&<section style={{borderTop:"1px solid #62708a",marginTop:16,paddingTop:12}}>
   <h3>Table {tableId.slice(0,8)} · Hand #{snapshot.table.handNo} · {snapshot.table.street} / {snapshot.table.status}</h3>
   <p>Table revision: {snapshot.table.version}. Dealer button: {snapshot.table.button}. Turn: {snapshot.table.turnIndex??"none"}. Current bet: {snapshot.table.currentBet}.</p>
   {snapshot.table.status==="playing"&&<div role="timer" aria-live="off" style={{padding:12,border:"1px solid #69788b",borderRadius:10,marginBottom:12}}>
    <strong>{isMyTurn?"Your turn":"Current player's turn"} · {remainingSeconds}s remaining</strong>
    <div style={{height:8,borderRadius:6,marginTop:8,background:"#34415a",overflow:"hidden"}}>
     <div style={{height:"100%",width:(Math.min(100,remainingMs/(snapshot.table.turnExtensionUsed?40000:10000)*100))+"%",background:remainingSeconds<=3?"#d97742":"#b7954c",transition:"width 0.1s linear"}}/>
    </div>
    <p style={{marginBottom:0,fontSize:13}}>10 seconds to act. When time expires, the server checks if possible or folds. Time extensions add 30 seconds once per turn.</p>
    {canExtend&&<div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10,alignItems:"center"}}>
      {snapshot.timebank?.practicePreviewEnabled&&<button disabled={busy} onClick={()=>void run(()=>invoke("poker-table-v1",{action:"buyTime",tableId,version:snapshot.table.version,requestId:crypto.randomUUID(),currency:"PRACTICE"}))}>Try +30s (free staging preview)</button>}
      {snapshot.timebank?.paymentEnabled&&<button disabled={busy} onClick={()=>void run(()=>invoke("poker-table-v1",{action:"buyTime",tableId,version:snapshot.table.version,requestId:crypto.randomUUID(),currency:"IGD"}))}>Buy +30s · {snapshot.timebank.igd} IGD</button>}
    </div>}
    <p style={{fontSize:12,marginBottom:0}}>Price specification: {snapshot.timebank?.igd??"0.15"} IGD / 30 seconds. IGN equivalent: {snapshot.timebank?.ign??"not configured"}. {snapshot.table.turnExtensionUsed?"Extension already used this turn.":""}</p>
   </div>}
   <p>Board: {showCards(snapshot.table.board??[])||"not dealt"} · Your cards: {showCards(snapshot.holeCards??[])||"not dealt"}</p>
   <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th>Seat</th><th>Player</th><th>Practice stack</th><th>Committed</th><th>State</th></tr></thead><tbody>
    {snapshot.seats.map(s=><tr key={s.seat_no}><td>{s.seat_no}</td><td>{s.user_id===userId?"You":s.user_id.slice(0,8)}</td><td>{s.stack}</td><td>{s.committed}</td><td>{s.folded?"Folded":s.all_in?"All in":s.acted?"Acted":"Waiting"}</td></tr>)}
   </tbody></table>
   <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
    {(["waiting","complete"].includes(snapshot.table.status))&&snapshot.table.ownerId===userId&&<button disabled={busy} onClick={()=>void run(()=>invoke("poker-table-v1",{action:"start",tableId}))}>Deal next hand (table owner)</button>}
    {turnOpen&&<><button disabled={busy} onClick={()=>void run(()=>invoke("poker-table-v1",{action:"act",tableId,version:snapshot.table.version,actionId:crypto.randomUUID(),move:toCall?"call":"check"}))}>{toCall?"Call "+toCall:"Check"}</button>
    <button disabled={busy} onClick={()=>void run(()=>invoke("poker-table-v1",{action:"act",tableId,version:snapshot.table.version,actionId:crypto.randomUUID(),move:"fold"}))}>Fold</button>
    <button disabled={busy} onClick={()=>void run(()=>invoke("poker-table-v1",{action:"act",tableId,version:snapshot.table.version,actionId:crypto.randomUUID(),move:"allin"}))}>All in</button>
    <label>Raise to <input type="number" min={1} step={1} value={raiseTo} onChange={e=>setRaiseTo(Number(e.target.value))}/></label>
    <button disabled={busy} onClick={()=>void run(()=>invoke("poker-table-v1",{action:"act",tableId,version:snapshot.table.version,actionId:crypto.randomUUID(),move:snapshot.table.currentBet?"raise":"bet",amount:raiseTo}))}>Bet / Raise</button></>}
    {snapshot.table.status==="showdown"&&snapshot.table.street!=="river"&&<button disabled={busy} onClick={()=>void run(()=>invoke("poker-table-v1",{action:"advance",tableId}))}>Deal next street</button>}
    {snapshot.table.status==="showdown"&&snapshot.table.street==="river"&&<button disabled={busy} onClick={()=>void run(()=>invoke("poker-table-v1",{action:"settle",tableId}))}>Settle showdown</button>}
    {snapshot.table.status==="complete"&&snapshot.table.eventId&&<button disabled={busy} onClick={()=>void run(()=>invoke("poker-table-v1",{action:"sync",tableId}))}>Process eliminations / balance seats</button>}
    {snapshot.table.eventId&&<button disabled={busy} onClick={()=>void run(()=>invoke("poker-table-v1",{action:"level",tableId}))}>Check blind level</button>}
    <button onClick={()=>void loadTable(tableId)} disabled={busy}>Reconnect / refresh snapshot</button>
    <button onClick={()=>{setTableId("");setSnapshot(null);}}>Leave view (keep seat)</button>
   </div>
   {snapshot.revealedSeed&&<details><summary>Completed hand fairness seed</summary><p style={{overflowWrap:"anywhere"}}>Commitment: {snapshot.table.deckCommitment}, hand: {snapshot.verificationHandId}, seed: {snapshot.revealedSeed}</p></details>}
  </section>}
  {message&&<p role="status" style={{overflowWrap:"anywhere"}}>{message}</p>}
 </section>;
}
