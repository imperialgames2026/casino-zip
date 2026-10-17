import {describe,it,expect} from "vitest";
import {shuffleCommittedDeck,verifyPokerDeck} from "./poker-fairness";
import {applyPokerAction,streetComplete,type Table} from "./poker-betting";
const initial=():Table=>({street:"preflop",revision:0,turn:0,currentBet:10,minimumRaise:10,lastFullRaise:1,seats:[
 {id:"a",stack:90,committed:10,streetBet:10,folded:false,allIn:false,acted:false},
 {id:"b",stack:90,committed:10,streetBet:10,folded:false,allIn:false,acted:false},
 {id:"c",stack:5,committed:10,streetBet:10,folded:false,allIn:false,acted:false}
]});
describe("poker fairness",()=>{
 it("commits and reconstructs a unique deterministic 52-card deck",async()=>{
  const {deck,commitment}=await shuffleCommittedDeck("test-secret","hand-1");
  expect(new Set(deck.map(c=>c.rank+c.suit)).size).toBe(52);
  expect(await verifyPokerDeck("test-secret","hand-1",commitment,deck)).toBe(true);
  expect(await verifyPokerDeck("wrong","hand-1",commitment,deck)).toBe(false);
 });
});
describe("poker betting",()=>{
 it("rejects stale turns and illegal checks",()=>{
  expect(()=>applyPokerAction(initial(),"b",{type:"check"},0)).toThrow("Not your turn");
  expect(()=>applyPokerAction(initial(),"a",{type:"call"},1)).toThrow("Stale");
 });
 it("requires action after a full raise",()=>{
  const t=applyPokerAction(initial(),"a",{type:"raise",amount:30},0);
  expect(t.currentBet).toBe(30);expect(t.turn).toBe(1);expect(t.seats[1].acted).toBe(false);
 });
 it("prevents raising after a short all-in that does not reopen betting",()=>{
  let t=applyPokerAction(initial(),"a",{type:"check"},0);
  t=applyPokerAction(t,"b",{type:"check"},1);
  t=applyPokerAction(t,"c",{type:"allin"},2);
  expect(t.currentBet).toBe(15);
  expect(()=>applyPokerAction(t,"a",{type:"raise",amount:30},3)).toThrow("not reopened");
  t=applyPokerAction(t,"a",{type:"call"},3);
  t=applyPokerAction(t,"b",{type:"call"},4);
  expect(streetComplete(t)).toBe(true);
 });
});
