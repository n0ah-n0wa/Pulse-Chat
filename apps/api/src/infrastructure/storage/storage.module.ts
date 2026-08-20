import { Module } from '@nestjs/common';

import { AppConfigModule, AppConfigService } from '../../config/index.js';
import { FileUploadService } from './file-upload.service.js';
import { FILE_STORAGE } from './file-storage.tokens.js';
import type { FileStorage } from './file-storage.interface.js';
import { LocalFileStorage, localFileStorageProviders } from './local/local-file-storage.js';

@Module({
  imports: [AppConfigModule],
  providers: [
    FileUploadService,
    ...localFileStorageProviders,
    {
      provide: FILE_STORAGE,
      inject: [AppConfigService, LocalFileStorage],
      useFactory: (config: AppConfigService, localStorage: LocalFileStorage): FileStorage => {
        if (config.fileStorage.provider === 'local') {
          return localStorage;
        }

        throw new Error(
          `FILE_STORAGE_PROVIDER "${config.fileStorage.provider}" is not implemented yet.`,
        );
      },
    },
  ],
  exports: [FileUploadService, FILE_STORAGE],
})
export class StorageModule {}
