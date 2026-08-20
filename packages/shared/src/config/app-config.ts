/** Application runtime environment. */
export type NodeEnv = 'development' | 'test' | 'production';

/** Supported file storage backends (specification section 18). */
export type FileStorageProvider = 'local' | 's3';

/** Strongly typed configuration produced once at startup. */
export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly mongodbUri: string;
  readonly redisUrl: string;
  readonly corsOrigin: string;
  readonly jwt: {
    readonly accessSecret: string;
    readonly refreshSecret: string;
    readonly accessExpiresIn: string;
    readonly refreshExpiresIn: string;
  };
  readonly fileStorage: {
    readonly provider: FileStorageProvider;
    readonly path: string | undefined;
  };
  readonly rateLimit: {
    /** Maximum messages a user may send within the rate-limit window. */
    readonly messages: number;
    /** Maximum login attempts per IP within {@link authWindowSeconds}. */
    readonly login: number;
    /** Maximum registration attempts per IP within {@link authWindowSeconds}. */
    readonly register: number;
    /** Window length in seconds for login and registration limits. */
    readonly authWindowSeconds: number;
  };
}
