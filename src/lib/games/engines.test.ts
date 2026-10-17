import {describe,it,expect} from "vitest";
import {bestHoldem,compareScores,evaluateFive,settleSidePots,type Card} from "./poker";
import {blackjackTotal,dealerMustHit} from "./blackjack";
import {rouletteReturn} from "./roulette";
const c=(rank:number,suit:Card["suit"]):Card=>({rank,suit});
describe("poker evaluator",()=>{
 it("recognizes royal straight flush over four of a kind",()=>{
  const royal=evaluateFive([c(10,"s"),c(11,"s"),c(12,"s"),c(13,"s"),c(14,"s")]);
  const quads=evaluateFive([c(9,"s"),c(9,"c"),c(9,"d"),c(9,"h"),c(2,"c")]);
  expect(royal).toEqual([8,14]);expect(compareScores(royal,quads)).toBeGreaterThan(0);
 });
 it("handles wheel straight and seven-card selection",()=>{
  expect(evaluateFive([c(14,"s"),c(2,"d"),c(3,"h"),c(4,"c"),c(5,"s")])).toEqual([4,5]);
  expect(bestHoldem([c(14,"s"),c(14,"h")],[c(14,"d"),c(2,"s"),c(2,"h"),c(9,"d"),c(3,"c")])).toEqual([6,14,2]);
 });
 it("splits multiway side pots by eligible contenders",()=>{
  const pots=settleSidePots([100,200,300],[true,true,true],[[1,14],[2,10,9,3],[0,14,13,12,11,9]]);
  expect(pots).toEqual([{amount:300,winners:[1]},{amount:200,winners:[1]},{amount:100,winners:[2]}]);
 });
 it("rejects duplicate cards",()=>expect(()=>evaluateFive([c(2,"s"),c(2,"s"),c(3,"h"),c(4,"h"),c(5,"h")])).toThrow());
});
describe("blackjack",()=>{
 it("handles soft aces and naturals",()=>{
  expect(blackjackTotal([{rank:1},{rank:13}])).toEqual({total:21,soft:true,blackjack:true});
  expect(blackjackTotal([{rank:1},{rank:9},{rank:5}]).total).toBe(15);
  expect(dealerMustHit([{rank:1},{rank:6}],true)).toBe(true);
  expect(dealerMustHit([{rank:1},{rank:6}],false)).toBe(false);
 });
});
describe("roulette",()=>{
 it("handles zero, color, straight and dozens",()=>{
  expect(rouletteReturn(0,{kind:"red",stake:10})).toBe(0);
  expect(rouletteReturn(0,{kind:"straight",selection:0,stake:10})).toBe(360);
  expect(rouletteReturn(1,{kind:"red",stake:10})).toBe(20);
  expect(rouletteReturn(12,{kind:"dozen",selection:1,stake:10})).toBe(30);
  expect(rouletteReturn(13,{kind:"dozen",selection:1,stake:10})).toBe(0);
 });
});
