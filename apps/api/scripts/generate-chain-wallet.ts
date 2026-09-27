/**
 * Creates a new wallet for anchoring credentials on Polygon.
 * Usage:  npm run chain:wallet
 * 1. Put CHAIN_ANCHOR_PRIVATE_KEY in the API environment (Render → Environment). Keep it secret.
 * 2. Fund the printed address: testnet (Amoy) → free POL from a faucet, e.g. https://faucet.polygon.technology
 *    mainnet → send a small amount of POL (each anchor costs a fraction of a cent).
 * 3. Set CHAIN_ANCHOR_ENABLED=true.
 */
import { Wallet } from 'ethers';

const wallet = Wallet.createRandom();
console.log('# Add to the API environment (keep secret):');
console.log(`CHAIN_ANCHOR_PRIVATE_KEY=${wallet.privateKey}`);
console.log('\n# Public address to fund with POL (safe to share):');
console.log(wallet.address);
