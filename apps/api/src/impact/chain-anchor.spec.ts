import { createHash } from 'crypto';
import { decodeAnchorData, encodeAnchorData, readChainConfig, ANCHOR_PREFIX } from './chain-anchor.service';

const hash = '0x' + createHash('sha256').update('x').digest('hex');

describe('anchor data encoding', () => {
  it('round-trips a credential hash', () => {
    const data = encodeAnchorData(hash);
    expect(data.startsWith('0x')).toBe(true);
    expect(decodeAnchorData(data)).toBe(hash);
  });
  it('rejects malformed hashes and foreign data', () => {
    expect(() => encodeAnchorData('0x1234')).toThrow();
    expect(decodeAnchorData('0x')).toBeNull();
    expect(decodeAnchorData('0x' + Buffer.from('OTHER-PREFIX:v1:').toString('hex') + hash.slice(2))).toBeNull();
    expect(ANCHOR_PREFIX).toBe('UNIVERSE-VC:v1:');
  });
});

describe('readChainConfig', () => {
  it('defaults to the Amoy testnet and stays disabled until configured', () => {
    const c = readChainConfig({} as any);
    expect(c).toMatchObject({ enabled: false, chainId: 80002, networkName: 'Polygon Amoy (testnet)', privateKey: null });
    expect(c.explorerTxUrl).toBe('https://amoy.polygonscan.com/tx/');
  });
  it('derives the anchor address from the private key and supports mainnet', () => {
    const c = readChainConfig({
      CHAIN_ANCHOR_ENABLED: 'true',
      CHAIN_ID: '137',
      CHAIN_ANCHOR_PRIVATE_KEY: '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d',
    } as any);
    expect(c.enabled).toBe(true);
    expect(c.networkName).toBe('Polygon');
    expect(c.explorerTxUrl).toBe('https://polygonscan.com/tx/');
    expect(c.anchorAddress?.toLowerCase()).toBe('0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1');
  });
});
