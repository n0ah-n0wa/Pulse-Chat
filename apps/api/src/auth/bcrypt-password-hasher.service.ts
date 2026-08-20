import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';

import { PASSWORD_HASHER, type PasswordHasher } from './password-hasher.interface.js';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}

export const passwordHasherProviders = [
  BcryptPasswordHasher,
  {
    provide: PASSWORD_HASHER,
    useExisting: BcryptPasswordHasher,
  },
] as const;
