import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { mongooseUserRepositoryProviders } from './infrastructure/mongoose-user.repository.js';
import { UserIndexInitializer } from './infrastructure/user-index.initializer.js';
import { UserDocument, UserSchema } from './infrastructure/user.schema.js';
import { USER_REPOSITORY } from './users.tokens.js';

/** User persistence without HTTP controllers — shared by Users and Auth modules. */
@Module({
  imports: [MongooseModule.forFeature([{ name: UserDocument.name, schema: UserSchema }])],
  providers: [UserIndexInitializer, ...mongooseUserRepositoryProviders],
  exports: [USER_REPOSITORY],
})
export class UsersPersistenceModule {}
