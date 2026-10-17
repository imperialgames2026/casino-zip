import {useState} from "react";
import {supabase} from "../lib/supabase";
type Format="scheduled_mtt"|"sit_and_go"|"ring";
export default function PokerTournamentBuilder(){
 const [format,setFormat]=useState<Format>("sit_and_go");
 const [name,setName]=useState("Imperial Poker Sit & Go");
 const [players,setPlayers]=useState(6);
 const [seats,setSeats]=useState(6);
 const [stack,setStack]=useState(1000);
 const [small,setSmall]=useState(5);
 const [big,setBig]=useState(10);
 const [minutes,setMinutes]=useState(10);
 const [startAt,setStartAt]=useState("");
 const [buyMin,setBuyMin]=useState(200);
 const [buyMax,setBuyMax]=useState(1000);
 const [message,setMessage]=useState("");
 const [working,setWorking]=useState(false);
 const [drafts,setDrafts]=useState<{id:string;name:string;format:string;status:string}[]>([]);
 const rowStyle={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:12} as const;
 const fieldStyle={width:"100%",padding:8,boxSizing:"border-box"} as const;
 const numeric=(label:string,value:number,update:(v:number)=>void,min:number,max:number)=><label>{label}<input style={fieldStyle} type="number" min={min} max={max} step={1} value={value} onChange={e=>update(Number(e.target.value))}/></label>;
 async function create(){
  if(!supabase){setMessage("Supabase is not configured");return;}
  setWorking(true);setMessage("");
  try{
   const count=format==="ring"?Math.min(players,6):format==="sit_and_go"?seats:players;
   const levels=Array.from({length:10},(_,i)=>({level:i+1,smallBlind:small*Math.pow(2,i),bigBlind:big*Math.pow(2,i),ante:0,durationSeconds:minutes*60}));
   const config={maxPlayers:count,seatsPerTable:seats,startingStack:stack,smallBlind:small,bigBlind:big,levels,...(format==="scheduled_mtt"?{startAt:new Date(startAt).toISOString()}:{}),...(format==="ring"?{buyInMin:buyMin,buyInMax:buyMax}:{})};
   const {data,error}=await supabase.functions.invoke("admin-poker-events",{body:{action:"create",requestId:crypto.randomUUID(),name,format,config}});
   if(error)throw error;
   if(!data?.eventId)throw Error(data?.error??"Draft not confirmed");
   setMessage("Created practice-only draft "+data.eventId+". It cannot accept registrations or run payouts yet.");
   await load();
  }catch(e){setMessage(e instanceof Error?e.message:"Draft creation failed");}
  finally{setWorking(false);}
 }
 async function load(){
  if(!supabase)return;
  const {data,error}=await supabase.functions.invoke("admin-poker-events",{body:{action:"list"}});
  if(error||!Array.isArray(data?.events)){setMessage(data?.error??error?.message??"Cannot load drafts");return;}
  setDrafts(data.events);
 }
 return <section style={{background:"#19243b",border:"1px solid #34415a",borderRadius:16,padding:24,marginTop:24}}>
  <h2>Superadmin · Poker Event Builder</h2>
  <p>Draft configuration only — no tournament registration, prizes, real buy-ins or live tables. Server verifies Superadmin role.</p>
  <div style={rowStyle}><label>Format<select style={fieldStyle} value={format} onChange={e=>{const f=e.target.value as Format;setFormat(f);if(f==="sit_and_go")setPlayers(seats);if(f==="ring"){setSeats(6);setPlayers(6);}}}><option value="scheduled_mtt">Scheduled multi-table tournament</option><option value="sit_and_go">Sit & Go</option><option value="ring">Cash-style ring table (practice chips)</option></select></label><label>Event name<input style={fieldStyle} value={name} maxLength={90} onChange={e=>setName(e.target.value)}/></label></div>
  <div style={rowStyle}>
   {numeric("Maximum players",format==="sit_and_go"?seats:players,v=>setPlayers(v),2,format==="ring"?6:10000)}
   {numeric("Seats per table",seats,v=>{setSeats(v);if(format==="sit_and_go")setPlayers(v);},2,format==="ring"?6:10)}
   {numeric("Starting practice stack",stack,setStack,100,1000000)}
   {numeric("Small blind",small,setSmall,1,100000)}
   {numeric("Big blind",big,setBig,2,200000)}
   {numeric("Level duration (minutes)",minutes,setMinutes,1,120)}
  </div>
  {format==="scheduled_mtt"&&<label>Scheduled start (local time)<input style={fieldStyle} type="datetime-local" value={startAt} onChange={e=>setStartAt(e.target.value)}/></label>}
  {format==="ring"&&<div style={rowStyle}>{numeric("Minimum practice buy-in",buyMin,setBuyMin,20*big,1000000)}{numeric("Maximum practice buy-in",buyMax,setBuyMax,buyMin,1000000)}</div>}
  <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:16}}><button disabled={working||!supabase} onClick={()=>void create()}>{working?"Creating…":"Create draft (Superadmin)"}</button><button disabled={working||!supabase} onClick={()=>void load()}>Refresh drafts</button></div>
  {message&&<p role="status">{message}</p>}
  {!!drafts.length&&<div><h3>Saved staging drafts</h3><ul>{drafts.map(d=><li key={d.id}>{d.name} — {d.format} / {d.status} — {d.id}</li>)}</ul></div>}
 </section>;
}
