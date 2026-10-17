/** Read-only IGN Devnet registry. Never reuse this mint for Mainnet. */
export const IGN_DEVNET = Object.freeze({
  symbol: "IGN",
  name: "Imperial Games Network",
  network: "devnet",
  mint: "CQpbojFzQJfcEjXJYRHSg4bnTheGKDJtEgPxQZLdivvz",
  tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  decimals: 9,
  metadataPda: "AwunVJkw7XnhGXtKWjHCBD9vJE2wJcRuBSNjZ7a6GQSF",
  metadataUri: "https://gateway.pinata.cloud/ipfs/bafkreihf7evpmwrr6khqw6u5nobws7ekveivmyjirqd65rrct6r7uz6fle",
  logoUri: "https://gateway.pinata.cloud/ipfs/bafybeieqxbi5xoca3mubw4al5hsavsfdco3xxspu2363rkrneyr6ofp6ga",
  rpcUrl: "https://api.devnet.solana.com",
  explorer: "https://explorer.solana.com/address/CQpbojFzQJfcEjXJYRHSg4bnTheGKDJtEgPxQZLdivvz?cluster=devnet",
  nominalSupply: 10_000_000_000n,
});
export const IGN_ATOMIC_SUPPLY = 10_000_000_000_000_000_000n;

/** Working design budget; these are NOT on-chain allocations, circulating balances or claims. */
export const IGN_ALLOCATION = [
  { key: "COMMUNITY", label: "Community & education", percent: 25, amount: 2_500_000_000n, color: "#F54EAC" },
  { key: "LIQUIDITY", label: "Liquidity reserve", percent: 20, amount: 2_000_000_000n, color: "#D9B35B" },
  { key: "BUILD_SECURITY", label: "Development & security", percent: 20, amount: 2_000_000_000n, color: "#A987FF" },
  { key: "TREASURY", label: "Company treasury", percent: 15, amount: 1_500_000_000n, color: "#5BC8C5" },
  { key: "TEAM", label: "Founders & team", percent: 10, amount: 1_000_000_000n, color: "#F38C73" },
  { key: "PARTNERS", label: "Partners", percent: 5, amount: 500_000_000n, color: "#9FB9FB" },
  { key: "EMERGENCY", label: "Emergency reserve", percent: 5, amount: 500_000_000n, color: "#89C7A0" },
] as const;
