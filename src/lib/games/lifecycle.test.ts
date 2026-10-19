import {describe,it,expect} from "vitest";
import {beginHand,awardPots,reconnectSnapshot,settleHand,type Player} from "./poker-lifecycle";
import {beginBlackjack,blackjackAction,settleBlackjack,blackjackSnapshot} from "./blackjack-table";
import {newRouletteRound,placeRouletteBet,lockRoulette,spinRoulette,settleRoulette} from "./roulette-round";
import type {Card} from "./poker";
const c=(rank:number,suit:Card["suit"]):Card=>({rank,suit});
const players=():Player[]=>["a","b","c"].map(id=>({id,stack:100,committed:0,streetBet:0,folded:false,allIn:false,acted:false,connected:true}));
describe("Holdem table lifecycle",()=>{
 it("rotates button and posts correct blinds",()=>{
  const a=beginHand("h1",0,players(),5,10,"commit");
  expect(a.button).toBe(1);expect(a.table.seats.map(s=>s.streetBet)).toEqual([10,0,5]);
  expect(a.table.turn).toBe(1);
  const b=beginHand("h2",a.button,players(),5,10,"commit");
  expect(b.button).toBe(2);
 });
 it("allocates odd chips clockwise from the button",()=>{
  const awards=awardPots([5,5,5],[true,true,true],[[1,14],[1,14],[0,14]],2);
  expect(awards[0].shares).toEqual([{seat:0,chips:8},{seat:1,chips:7}]);
 });
 it("does not expose opponents hole cards on reconnect",()=>{
  const h=beginHand("h1",0,players(),5,10,"commit");
  const snapshot=reconnectSnapshot(h,"a",{a:[c(14,"s"),c(14,"h")],b:[c(2,"s"),c(2,"h")]});
  expect(snapshot.yourHoleCards).toEqual([c(14,"s"),c(14,"h")]);
  expect(JSON.stringify(snapshot)).not.toContain('"rank":2');
 });
 it("settles uncontested pot and refunds unmatched excess",()=>{
  const h=beginHand("h1",0,players(),5,10,"commit");
  h.table.seats[0].committed=50;h.table.seats[1].committed=20;h.table.seats[2].committed=10;
  h.table.seats[1].folded=true;h.table.seats[2].folded=true;
  const result=settleHand(h,[[],[],[]]);
  expect(result.refunds).toEqual([{seat:0,chips:30}]);
  expect(result.awards.reduce((sum,p)=>sum+p.amount,0)).toBe(50);
 });
});
describe("Blackjack lifecycle",()=>{
 it("hides dealer hole card before settlement",()=>{
  const shoe=[{rank:10},{rank:9},{rank:10},{rank:7},{rank:2},{rank:10}];
  const table=beginBlackjack([{id:"p",bet:10}],shoe);
  expect(blackjackSnapshot(table,"p").dealer[1]).toEqual({hidden:true});
  const stood=blackjackAction(table,"p","stand",table.revision);
  const settled=settleBlackjack(stood);
  expect(settled.phase).toBe("settled");
  expect(settled.seats[0].payout).toBe(20);
 });
 it("rejects stale action",()=>{
  const table=beginBlackjack([{id:"p",bet:10}],[{rank:9},{rank:10},{rank:8},{rank:7}]);
  expect(()=>blackjackAction(table,"p","stand",9)).toThrow();
 });
});
describe("Roulette lifecycle",()=>{
 it("closes at exact deadline and settles only once",()=>{
  let r=newRouletteRound("r1",1000,"commit");
  r=placeRouletteBet(r,{id:"t1",playerId:"p",bet:{kind:"red",stake:10}},2000,0);
  expect(()=>placeRouletteBet(r,{id:"t2",playerId:"p",bet:{kind:"red",stake:10}},16000,1)).toThrow();
  r=lockRoulette(r,16000);r=spinRoulette(r);r=settleRoulette(r,1);
  expect(r.returns?.[0].gross).toBe(20);
  expect(()=>settleRoulette(r,1)).toThrow();
 });
});
