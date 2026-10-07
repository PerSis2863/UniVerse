
import {
  JsonRpcProvider,
  Wallet,
  NonceManager,
  concat,
  getBytes,
  hexlify,
  isHexString,
  parseUnits,
  toUtf8Bytes,
} from 'ethers';
import prisma from '@/lib/db';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { logger } from '../logger';

/**
 * Anchors signed credentials on a public blockchain (Polygon).
 *
 * For every issued credential we send one transaction from the platform wallet to itself
 * whose data field contains "UNIVERSE-VC:v1:" followed by the credential's SHA-256 hash.
 * Anyone can look the transaction up on Polygonscan and check that the hash matches the
 * credential, and that it was sent by the UniVerse wallet at that time. No smart contract
 * is needed and each anchor costs a tiny amount of gas (free test POL on the Amoy testnet).
 *
 * Configuration (API environment):
 *   CHAIN_ANCHOR_ENABLED=true
 *   CHAIN_ANCHOR_PRIVATE_KEY=0x...          wallet that pays gas (generate: npm run chain:wallet)
 *   CHAIN_RPC_URL=https://rpc-amoy.polygon.technology
 *   CHAIN_ID=80002                            (137 = Polygon mainnet)
 *   CHAIN_NETWORK_NAME="Polygon Amoy (testnet)"
 *   CHAIN_EXPLORER_TX_URL=https://amoy.polygonscan.com/tx/
 *   CHAIN_ANCHOR_ADDRESS=0x...               optional: verify-only deployments (no private key)
 *   CHAIN_MIN_PRIORITY_GWEI=30               Polygon rejects transactions tipping below ~25 gwei
 */

export const ANCHOR_PREFIX = 'UNIVERSE-VC:v1:';

export type AnchorStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export interface ChainConfig {
  enabled: boolean;
  rpcUrl: string;
  chainId: number;
  networkName: string;
  explorerTxUrl: string;
  privateKey: string | null;
  anchorAddress: string | null;
  minPriorityGwei: string;
}

export function readChainConfig(env: NodeJS.ProcessEnv = process.env): ChainConfig {
  const chainId = Number(env.CHAIN_ID || 80002);
  const isMainnet = chainId === 137;
  const privateKey = env.CHAIN_ANCHOR_PRIVATE_KEY?.trim() || null;
  let anchorAddress = env.CHAIN_ANCHOR_ADDRESS?.trim() || null;
  if (!anchorAddress && privateKey) {
    try {
      anchorAddress = new Wallet(privateKey).address;
    } catch {
      anchorAddress = null;
    }
  }
  return {
    enabled: (env.CHAIN_ANCHOR_ENABLED || '').trim().toLowerCase() === 'true',
    rpcUrl: env.CHAIN_RPC_URL?.trim() || (isMainnet ? 'https://polygon-rpc.com' : 'https://rpc-amoy.polygon.technology'),
    chainId,
    networkName: env.CHAIN_NETWORK_NAME?.trim() || (isMainnet ? 'Polygon' : 'Polygon Amoy (testnet)'),
    explorerTxUrl: env.CHAIN_EXPLORER_TX_URL?.trim() || (isMainnet ? 'https://polygonscan.com/tx/' : 'https://amoy.polygonscan.com/tx/'),
    privateKey,
    anchorAddress,
    minPriorityGwei: env.CHAIN_MIN_PRIORITY_GWEI?.trim() || '30',
  };
}

/** Transaction data for a credential hash ("0x" + 64 hex chars). */
export function encodeAnchorData(credentialHash: string): string {
  if (!isHexString(credentialHash, 32)) throw new Error('Credential hash must be a 32-byte hex string');
  return hexlify(concat([toUtf8Bytes(ANCHOR_PREFIX), getBytes(credentialHash)]));
}

export function decodeAnchorData(data: string): string | null {
  try {
    const bytes = getBytes(data);
    const prefix = toUtf8Bytes(ANCHOR_PREFIX);
    if (bytes.length !== prefix.length + 32) return null;
    for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return null;
    return hexlify(bytes.slice(prefix.length));
  } catch {
    return null;
  }
}

export interface OnChainCheck {
  checked: boolean;          // false when the chain could not be queried
  matches: boolean;          // tx exists, sent by the UniVerse wallet, carries this hash, succeeded
  blockNumber?: number;
  blockTime?: string;
  reason?: string;
}

export class ChainAnchorService {
  private readonly logger = logger;
  private readonly config = readChainConfig();
  private provider: JsonRpcProvider | null = null;
  private signer: NonceManager | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly verifyCache = new Map<string, { at: number; result: OnChainCheck }>();

  constructor() {
    if (this.config.enabled && !this.config.privateKey) {
      this.logger.warn('CHAIN_ANCHOR_ENABLED=true but CHAIN_ANCHOR_PRIVATE_KEY is missing; anchoring is disabled.');
    }
  }

  get publicInfo() {
    return {
      enabled: this.canAnchor(),
      network: this.config.networkName,
      chainId: this.config.chainId,
      anchorAddress: this.config.anchorAddress,
      explorerTxUrl: this.config.explorerTxUrl,
    };
  }

  canAnchor(): boolean {
    return this.config.enabled && !!this.config.privateKey;
  }

  explorerUrl(txHash: string | null | undefined): string | null {
    return txHash ? `${this.config.explorerTxUrl}${txHash}` : null;
  }

  private getProvider(): JsonRpcProvider {
    if (!this.provider) {
      this.provider = new JsonRpcProvider(this.config.rpcUrl, this.config.chainId, { staticNetwork: true });
    }
    return this.provider;
  }

  private getSigner(): NonceManager {
    if (!this.signer) {
      this.signer = new NonceManager(new Wallet(this.config.privateKey!, this.getProvider()));
    }
    return this.signer;
  }

  /**
   * Queue a credential for anchoring. Never throws: failures are stored on the credential
   * (anchorStatus=FAILED, anchorError) and can be retried by an admin.
   */
  anchorCredential(certificateId: string): Promise<void> {
    if (!this.canAnchor()) return Promise.resolve();
    // Transactions from one wallet must be sent one at a time (nonces).
    const job = this.queue.then(() => this.doAnchor(certificateId)).catch(() => undefined);
    this.queue = job;
    // Keep the Worker alive for the send after the response is returned. Confirmation may outlive
    // it; a PENDING anchor is confirmed on the next attempt (anchorOutstanding).
    try {
      getCloudflareContext().ctx.waitUntil(job);
    } catch {
      // not inside a request (scripts)
    }
    return job;
  }

  private async doAnchor(certificateId: string): Promise<void> {
    const cert = await prisma.impactCertificate.findUnique({
      where: { id: certificateId },
      select: { id: true, status: true, signature: true, blockchainHash: true, anchorStatus: true, anchorTxHash: true },
    });
    if (!cert || cert.status !== 'ISSUED' || !cert.signature || !cert.blockchainHash) return;
    if (cert.anchorStatus === 'CONFIRMED') return;

    // A previous attempt already broadcast a transaction: confirm it instead of sending a duplicate.
    if (cert.anchorStatus === 'PENDING' && cert.anchorTxHash) {
      try {
        const receipt = await this.getProvider().getTransactionReceipt(cert.anchorTxHash);
        if (receipt && receipt.status === 1) {
          const block = await this.getProvider().getBlock(receipt.blockNumber);
          await prisma.impactCertificate.update({
            where: { id: cert.id },
            data: { anchorStatus: 'CONFIRMED', anchoredAt: block ? new Date(Number(block.timestamp) * 1000) : new Date(), anchorError: null },
          });
          return;
        }
        const pendingTx = await this.getProvider().getTransaction(cert.anchorTxHash);
        if (pendingTx && !receipt) return; // still in the mempool; check again later
      } catch {
        // fall through and re-send
      }
    }

    try {
      const data = encodeAnchorData(cert.blockchainHash);
      const signer = this.getSigner();
      const address = await signer.getAddress();

      const fee = await this.getProvider().getFeeData();
      const minTip = parseUnits(this.config.minPriorityGwei, 'gwei');
      const tip = fee.maxPriorityFeePerGas && fee.maxPriorityFeePerGas > minTip ? fee.maxPriorityFeePerGas : minTip;
      const base = fee.maxFeePerGas ?? fee.gasPrice ?? minTip;
      const maxFee = base > tip * BigInt(2) ? base + tip : tip * BigInt(3);

      const tx = await signer.sendTransaction({
        to: address,
        value: BigInt(0),
        data,
        maxPriorityFeePerGas: tip,
        maxFeePerGas: maxFee,
      });

      await prisma.impactCertificate.update({
        where: { id: cert.id },
        data: {
          anchorStatus: 'PENDING',
          anchorTxHash: tx.hash,
          anchorChainId: this.config.chainId,
          anchorNetwork: this.config.networkName,
          anchorError: null,
        },
      });

      const receipt = await tx.wait(1, 180_000);
      if (!receipt || receipt.status !== 1) throw new Error('Anchor transaction reverted');
      const block = await this.getProvider().getBlock(receipt.blockNumber);

      await prisma.impactCertificate.update({
        where: { id: cert.id },
        data: {
          anchorStatus: 'CONFIRMED',
          anchoredAt: block ? new Date(Number(block.timestamp) * 1000) : new Date(),
          anchorError: null,
        },
      });
      this.logger.log(`Credential ${cert.id} anchored on ${this.config.networkName}: ${tx.hash}`);
    } catch (e) {
      const message = (e as { shortMessage?: string }).shortMessage || (e as Error).message || 'Unknown error';
      this.logger.error(`Anchoring credential ${certificateId} failed: ${message}`);
      // Reset the nonce manager so a failed send doesn't leave the local nonce ahead of the chain.
      this.signer?.reset();
      await prisma.impactCertificate
        .update({ where: { id: certificateId }, data: { anchorStatus: 'FAILED', anchorError: message.slice(0, 500) } })
        .catch(() => undefined);
    }
  }

  /** Re-queue issued credentials that were never anchored, failed, or are still pending (pending ones are only re-checked). */
  async anchorOutstanding(limit = 25) {
    if (!this.canAnchor()) return { queued: 0, enabled: false };
    const certs = await prisma.impactCertificate.findMany({
      where: {
        status: 'ISSUED',
        signature: { not: null },
        OR: [{ anchorStatus: null }, { anchorStatus: 'FAILED' }, { anchorStatus: 'PENDING' }],
      },
      select: { id: true },
      orderBy: { issuedAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    for (const c of certs) void this.anchorCredential(c.id);
    return { queued: certs.length, enabled: true };
  }

  /**
   * Independently checks the transaction on-chain (cached for 10 minutes).
   * Used by the public verification page, so it never throws.
   */
  async verifyOnChain(txHash: string | null, expectedHash: string | null): Promise<OnChainCheck> {
    if (!txHash || !expectedHash) return { checked: false, matches: false, reason: 'Not anchored' };
    const key = `${txHash}:${expectedHash}`;
    const cached = this.verifyCache.get(key);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.result;

    let result: OnChainCheck;
    try {
      const provider = this.getProvider();
      const withTimeout = <T>(p: Promise<T>) =>
        Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('RPC timeout')), 5000))]);
      const [tx, receipt] = await Promise.all([
        withTimeout(provider.getTransaction(txHash)),
        withTimeout(provider.getTransactionReceipt(txHash)),
      ]);
      if (!tx || !receipt) {
        result = { checked: true, matches: false, reason: 'Transaction not found (yet)' };
      } else {
        const fromOk = !!this.config.anchorAddress && tx.from.toLowerCase() === this.config.anchorAddress.toLowerCase();
        const dataHash = decodeAnchorData(tx.data);
        const hashOk = !!dataHash && dataHash.toLowerCase() === expectedHash.toLowerCase();
        const statusOk = receipt.status === 1;
        const block = await withTimeout(provider.getBlock(receipt.blockNumber)).catch(() => null);
        result = {
          checked: true,
          matches: fromOk && hashOk && statusOk,
          blockNumber: receipt.blockNumber,
          blockTime: block ? new Date(Number(block.timestamp) * 1000).toISOString() : undefined,
          reason: !fromOk ? 'Sent by an unknown wallet' : !hashOk ? 'Hash on chain does not match' : !statusOk ? 'Transaction failed' : undefined,
        };
      }
    } catch {
      result = { checked: false, matches: false, reason: 'Blockchain temporarily unreachable' };
    }
    // Only cache definitive answers.
    if (result.checked) this.verifyCache.set(key, { at: Date.now(), result });
    return result;
  }
}

export const chainAnchorService = new ChainAnchorService();
