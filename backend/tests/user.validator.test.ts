import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  registerUserSchema,
  STELLAR_PUBLIC_KEY_ERROR,
} from '../src/validators/user.validator.js';
import { errorHandler } from '../src/middleware/error.middleware.js';

vi.mock('../src/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const VALID_KEY = 'GD2XP6FNWL6IWULVMPNA2RV2T7GLCJHK3RH75GBCY7TSVIWDITJN4FXJ';

describe('User Validator', () => {
  describe('registerUserSchema', () => {
    it('should accept a well-formed Stellar public key', () => {
      const result = registerUserSchema.safeParse({ publicKey: VALID_KEY });
      expect(result.success).toBe(true);
    });

    it('should reject a malformed public key', () => {
      const result = registerUserSchema.safeParse({ publicKey: 'not-a-stellar-key' });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['publicKey']);
      expect(result.error?.issues[0]?.message).toBe(STELLAR_PUBLIC_KEY_ERROR);
    });

    it.each([
      ['too short', 'GD2XP6FNWL6IWULV'],
      ['too long', `${VALID_KEY}AAAA`],
      ['wrong version prefix', `S${VALID_KEY.slice(1)}`],
      ['lowercase characters', VALID_KEY.toLowerCase()],
      ['character outside the base32 alphabet', `${VALID_KEY.slice(0, 55)}1`],
      ['empty string', ''],
      ['whitespace padded', ` ${VALID_KEY} `],
    ])('should reject a key that is %s', (_label, publicKey) => {
      const result = registerUserSchema.safeParse({ publicKey });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(STELLAR_PUBLIC_KEY_ERROR);
    });

    it.each([
      ['missing', undefined],
      ['a number', 12345],
      ['null', null],
    ])('should reject a publicKey that is %s', (_label, publicKey) => {
      const result = registerUserSchema.safeParse({ publicKey });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'publicKey is required and must be a string',
      );
    });
  });

  describe('error response', () => {
    it('should surface a malformed key as a 400 with a descriptive message', () => {
      const error = registerUserSchema.safeParse({ publicKey: 'not-a-stellar-key' }).error;
      expect(error).toBeInstanceOf(ZodError);

      const res = {
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      errorHandler(error, {} as Request, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation Error',
        details: [{ path: 'publicKey', message: STELLAR_PUBLIC_KEY_ERROR }],
      });
    });
  });
});
