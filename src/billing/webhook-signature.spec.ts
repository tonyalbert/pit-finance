import * as crypto from 'crypto';
import { verifySecret, verifySignature } from './webhook-signature';

describe('webhook-signature', () => {
  afterEach(() => {
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;
    delete process.env.ABACATEPAY_WEBHOOK_PUBLIC_KEY;
  });

  it('aceita HMAC-SHA256 base64 do corpo raw e rejeita corpo alterado', () => {
    process.env.ABACATEPAY_WEBHOOK_PUBLIC_KEY = 'chave-teste';
    const body = Buffer.from('{"id":"log_1","event":"subscription.completed"}');
    const sig = crypto
      .createHmac('sha256', 'chave-teste')
      .update(body)
      .digest('base64');
    expect(verifySignature(body, sig)).toBe(true);
    expect(verifySignature(Buffer.from('{"id":"log_2"}'), sig)).toBe(false);
    expect(verifySignature(body, undefined)).toBe(false);
    expect(verifySignature(body, 'curta')).toBe(false);
  });

  it('secret: exige configurado e igual', () => {
    expect(verifySecret('x')).toBe(false); // sem secret configurado nunca aceita
    process.env.ABACATEPAY_WEBHOOK_SECRET = 's3cr3t';
    expect(verifySecret('s3cr3t')).toBe(true);
    expect(verifySecret('errado')).toBe(false);
    expect(verifySecret(['s3cr3t'])).toBe(false);
  });
});
