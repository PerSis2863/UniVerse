/**
 * Generates an Ed25519 key pair for signing impact credentials.
 * Usage:  npm run credentials:keygen
 * Put the printed CREDENTIAL_SIGNING_PRIVATE_KEY value in the API's environment (e.g. Render
 * dashboard → Environment). Keep it secret and back it up: if it is lost, existing credentials
 * can no longer be verified.
 */
import { generateKeyPairSync } from 'crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

console.log('# Add this to the API environment (single line, \\n escaped):');
console.log(`CREDENTIAL_SIGNING_PRIVATE_KEY="${privatePem.trim().replace(/\n/g, '\\n')}"`);
console.log('\n# Public key (safe to share; also served at GET /api/verify/public-key):');
console.log(publicPem);
