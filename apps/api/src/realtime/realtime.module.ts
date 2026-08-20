import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { MessagesModule } from '../messages/messages.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { RealtimeAuthenticationService } from './realtime-authentication.service.js';
import { RealtimeBroadcastModule } from './realtime-broadcast.module.js';
import { RealtimeConnectionStateService } from './realtime-connection-state.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeMessagesService } from './realtime-messages.service.js';
import { RealtimeRoomSubscriptionsService } from './realtime-room-subscriptions.service.js';

@Module({
  imports: [AuthModule, RoomsModule, MessagesModule, RealtimeBroadcastModule, PresenceModule],
  providers: [
    RealtimeGateway,
    RealtimeAuthenticationService,
    RealtimeConnectionStateService,
    RealtimeRoomSubscriptionsService,
    RealtimeMessagesService,
  ],
  exports: [RealtimeConnectionStateService, RealtimeBroadcastModule],
})
export class RealtimeModule {}
