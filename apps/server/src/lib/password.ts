import crypto from 'node:crypto';
import argon2 from 'argon2';

const OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const hashPassword = (pw: string) => argon2.hash(pw, OPTS);
export async function verifyPassword(hash: string, pw: string) {
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
}
// Hash used to equalise timing when the username does not exist (prevents user enumeration).
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(crypto.randomBytes(16).toString('hex')));
