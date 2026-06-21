import { hmacSha256, verifyHmacSha256, encryptAes256, decryptAes256 } from './crypto';

describe('Crypto Utils', () => {
  describe('hmacSha256', () => {
    it('should produce consistent hex output for same input', () => {
      const secret = 'test-secret';
      const data = 'test-data';
      const result1 = hmacSha256(secret, data);
      const result2 = hmacSha256(secret, data);

      expect(result1).toBe(result2);
      expect(typeof result1).toBe('string');
      expect(result1).toMatch(/^[a-f0-9]+$/);
    });

    it('should produce different output for different secrets', () => {
      const data = 'test-data';
      const result1 = hmacSha256('secret1', data);
      const result2 = hmacSha256('secret2', data);

      expect(result1).not.toBe(result2);
    });

    it('should produce different output for different data', () => {
      const secret = 'test-secret';
      const result1 = hmacSha256(secret, 'data1');
      const result2 = hmacSha256(secret, 'data2');

      expect(result1).not.toBe(result2);
    });
  });

  describe('verifyHmacSha256', () => {
    it('should return true for matching signature', () => {
      const secret = 'test-secret';
      const data = 'test-data';
      const signature = hmacSha256(secret, data);

      const result = verifyHmacSha256(secret, data, signature);

      expect(result).toBe(true);
    });

    it('should return false for non-matching signature', () => {
      const secret = 'test-secret';
      const data = 'test-data';

      const result = verifyHmacSha256(secret, data, 'invalid-signature');

      expect(result).toBe(false);
    });

    it('should return false for wrong secret', () => {
      const data = 'test-data';
      const signature = hmacSha256('secret1', data);

      const result = verifyHmacSha256('secret2', data, signature);

      expect(result).toBe(false);
    });

    it('should return false for wrong data', () => {
      const secret = 'test-secret';
      const signature = hmacSha256(secret, 'original-data');

      const result = verifyHmacSha256(secret, 'modified-data', signature);

      expect(result).toBe(false);
    });
  });

  describe('encryptAes256 and decryptAes256', () => {
    it('should round-trip encryption and decryption correctly', () => {
      const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64-char hex for 256-bit key
      const plaintext = 'sensitive data';

      const encrypted = encryptAes256(key, plaintext);
      const decrypted = decryptAes256(key, encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const plaintext = 'sensitive data';

      const encrypted1 = encryptAes256(key, plaintext);
      const encrypted2 = encryptAes256(key, plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decryptAes256(key, encrypted1)).toBe(plaintext);
      expect(decryptAes256(key, encrypted2)).toBe(plaintext);
    });

    it('should handle empty string encryption', () => {
      const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const plaintext = '';

      const encrypted = encryptAes256(key, plaintext);
      const decrypted = decryptAes256(key, encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long text encryption', () => {
      const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const plaintext = 'a'.repeat(10000);

      const encrypted = encryptAes256(key, plaintext);
      const decrypted = decryptAes256(key, encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should fail decryption with wrong key', () => {
      const key1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const key2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
      const plaintext = 'sensitive data';

      const encrypted = encryptAes256(key1, plaintext);

      expect(() => {
        decryptAes256(key2, encrypted);
      }).toThrow();
    });

    it('should fail decryption with corrupted ciphertext', () => {
      const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const plaintext = 'sensitive data';

      const encrypted = encryptAes256(key, plaintext);
      const corrupted = encrypted.substring(0, encrypted.length - 10) + 'corrupted!';

      expect(() => {
        decryptAes256(key, corrupted);
      }).toThrow();
    });
  });
});
