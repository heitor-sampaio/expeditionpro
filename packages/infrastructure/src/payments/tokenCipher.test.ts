import { describe, expect, it } from 'vitest';
import { createTokenCipher } from './tokenCipher.js';

/**
 * SEC-15 — a chave do gateway é cifrada antes de encostar no banco. Um dump do Postgres
 * não pode entregar acesso à conta financeira do tenant.
 *
 * AES-256-GCM: além de cifrar, autentica. Byte alterado no banco não decifra para outra
 * coisa plausível — falha, que é o que se quer.
 */

const SEGREDO = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('SEC-15: cifra do token do gateway', () => {
  it('o que entra volta igual', () => {
    const cipher = createTokenCipher(SEGREDO);
    const cifrado = cipher.encrypt('aact_minha_chave');
    expect(cipher.decrypt(cifrado)).toBe('aact_minha_chave');
  });

  it('o texto guardado não contém a chave em claro', () => {
    const cipher = createTokenCipher(SEGREDO);
    expect(cipher.encrypt('aact_minha_chave')).not.toContain('aact_minha_chave');
  });

  it('cifrar duas vezes dá textos diferentes — o nonce é por chamada', () => {
    const cipher = createTokenCipher(SEGREDO);
    expect(cipher.encrypt('igual')).not.toBe(cipher.encrypt('igual'));
  });

  it('texto adulterado não decifra: falha em vez de devolver lixo', () => {
    const cipher = createTokenCipher(SEGREDO);
    const cifrado = cipher.encrypt('aact_minha_chave');
    // Adultera o **primeiro** caractere da carga, não o último: o formato é
    // `iv.tag.payload` em base64url, e o caractere final carrega bits de padding que não
    // chegam a virar byte — trocá-lo às vezes não muda nada, e o teste passava por sorte.
    const [iv, tag, payload] = cifrado.split('.') as [string, string, string];
    const primeiro = payload.slice(0, 1);
    const adulterado = `${iv}.${tag}.${primeiro === 'A' ? 'B' : 'A'}${payload.slice(1)}`;
    expect(() => cipher.decrypt(adulterado)).toThrow();
  });

  it('outra chave de cifra não abre o que a primeira fechou', () => {
    const outra = 'f'.repeat(64);
    const cifrado = createTokenCipher(SEGREDO).encrypt('aact_minha_chave');
    expect(() => createTokenCipher(outra).decrypt(cifrado)).toThrow();
  });

  it('segredo curto é recusado na largada, não na hora de cifrar', () => {
    expect(() => createTokenCipher('curto')).toThrow();
  });
});
