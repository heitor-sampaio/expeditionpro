import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * SEC-15 — cifra da credencial do gateway. AES-256-GCM: confidencialidade **e**
 * autenticidade, então byte trocado no banco não decifra para outra coisa plausível —
 * falha, que é o comportamento desejado num campo que dá acesso a dinheiro.
 *
 * Formato guardado: `iv.tag.payload`, tudo em base64url. Nonce novo a cada chamada — em
 * GCM, repetir nonce com a mesma chave quebra a cifra, não é detalhe de estilo.
 *
 * A chave vem do ambiente (`PAYMENT_TOKEN_KEY`, 32 bytes em hex). Sem ela, o servidor
 * nem sobe com o gateway ligado: guardar a credencial em claro seria pior.
 */

export interface TokenCipher {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

const ALGORITHM = 'aes-256-gcm';

export function createTokenCipher(hexKey: string): TokenCipher {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) {
    throw new Error('PAYMENT_TOKEN_KEY precisa ter 32 bytes em hex (64 caracteres)');
  }

  return {
    encrypt(plain: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const payload = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return [b64(iv), b64(cipher.getAuthTag()), b64(payload)].join('.');
    },

    decrypt(stored: string): string {
      const [iv, tag, payload] = stored.split('.');
      if (!iv || !tag || !payload) {
        throw new Error('token cifrado em formato inesperado');
      }
      const decipher = createDecipheriv(ALGORITHM, key, unb64(iv));
      decipher.setAuthTag(unb64(tag));
      return Buffer.concat([decipher.update(unb64(payload)), decipher.final()]).toString('utf8');
    },
  };
}

function b64(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function unb64(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
