import * as crypto from 'crypto';

// Chave publica (nao secreta) publicada pela AbacatePay para o HMAC dos webhooks:
// https://docs.abacatepay.com/pages/webhooks/security — sobrescrevivel por env se ela rotacionar.
const DEFAULT_PUBLIC_KEY =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

/** HMAC-SHA256 (base64) do corpo RAW com a chave publica da AbacatePay. */
export function verifySignature(
  rawBody: Buffer,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const key = process.env.ABACATEPAY_WEBHOOK_PUBLIC_KEY || DEFAULT_PUBLIC_KEY;
  const expected = crypto
    .createHmac('sha256', key)
    .update(rawBody)
    .digest('base64');
  return safeEqual(expected, signature);
}

/** Secret definido por nos ao cadastrar o webhook; chega em ?webhookSecret=. */
export function verifySecret(received: unknown): boolean {
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (!secret || typeof received !== 'string') return false;
  return safeEqual(secret, received);
}
