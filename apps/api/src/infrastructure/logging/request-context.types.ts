export interface RequestContextStore {
  readonly requestId: string;
  readonly userId?: string;
  readonly roomId?: string;
  readonly messageId?: string;
}

export type RequestContextAssignment = Partial<
  Pick<RequestContextStore, 'userId' | 'roomId' | 'messageId'>
>;
