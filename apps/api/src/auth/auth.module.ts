import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { UsersPersistenceModule } from '../users/users-persistence.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { passwordHasherProviders } from './bcrypt-password-hasher.service.js';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard.js';
import { AuthGuard } from './guards/auth.guard.js';
import { mongooseRefreshTokenRepositoryProviders } from './infrastructure/mongoose-refresh-token.repository.js';
import { RefreshTokenIndexInitializer } from './infrastructure/refresh-token-index.initializer.js';
import { RefreshTokenDocument, RefreshTokenSchema } from './infrastructure/refresh-token.schema.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [
    UsersPersistenceModule,
    JwtModule.register({}),
    MongooseModule.forFeature([{ name: RefreshTokenDocument.name, schema: RefreshTokenSchema }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    AuthGuard,
    AuthRateLimitGuard,
    RefreshTokenIndexInitializer,
    ...passwordHasherProviders,
    ...mongooseRefreshTokenRepositoryProviders,
  ],
  exports: [AuthGuard, TokenService, AuthService],
})
export class AuthModule {}
