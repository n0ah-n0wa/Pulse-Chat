import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplication } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';

/**
 * Pins Socket.IO CORS to the same origin as HTTP, so the API cannot be
 * opened as a cross-origin WebSocket host when exposed without nginx.
 */
export class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly corsOrigin: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: Partial<ServerOptions>): unknown {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.corsOrigin,
        credentials: true,
      },
    });
  }
}
