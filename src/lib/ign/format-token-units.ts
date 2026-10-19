/** Never pass SPL token atomic amounts through JS Number. */
export function atomicToTokenString(amount: bigint | string, decimals = 9): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("Invalid token decimals");
  }
  const value = typeof amount === "bigint" ? amount : BigInt(amount);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const divisor = 10n ** BigInt(decimals);
  const whole = (abs / divisor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (abs % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? "." + fraction : ""}`;
}
export function integerTokenString(amount: bigint): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
