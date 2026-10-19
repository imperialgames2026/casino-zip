/** European roulette settlement; returns gross winnings in integer chips. */
export type RouletteBet={kind:"straight"|"red"|"black"|"even"|"odd"|"low"|"high"|"dozen"|"column";selection?:number;stake:number};
const RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export function rouletteReturn(outcome:number,bet:RouletteBet):number{
 if(!Number.isInteger(outcome)||outcome<0||outcome>36||!Number.isSafeInteger(bet.stake)||bet.stake<0)throw new Error("Invalid roulette input");
 const n=bet.selection;
 const won=bet.kind==="straight"?Number.isInteger(n)&&n===outcome:
 outcome===0?false:
 bet.kind==="red"?RED.has(outcome):
 bet.kind==="black"?!RED.has(outcome):
 bet.kind==="even"?outcome%2===0:
 bet.kind==="odd"?outcome%2===1:
 bet.kind==="low"?outcome<=18:
 bet.kind==="high"?outcome>=19:
 bet.kind==="dozen"?Number.isInteger(n)&&n!>=1&&n!<=3&&Math.ceil(outcome/12)===n:
 bet.kind==="column"?Number.isInteger(n)&&n!>=1&&n!<=3&&((outcome-1)%3)+1===n:false;
 const odds=bet.kind==="straight"?36:bet.kind==="dozen"||bet.kind==="column"?3:2;
 return won?bet.stake*odds:0;
}
