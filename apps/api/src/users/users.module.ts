import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../infrastructure/storage/storage.module.js';
import { UsersPersistenceModule } from './users-persistence.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [UsersPersistenceModule, AuthModule, StorageModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
