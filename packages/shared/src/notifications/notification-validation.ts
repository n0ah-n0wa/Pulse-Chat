import { z } from 'zod';

export const NOTIFICATION_PAGE_SIZE_DEFAULT = 20;
export const NOTIFICATION_PAGE_SIZE_MAX = 50;

const notificationResourceIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'must be a valid id');

export const listNotificationsQuerySchema = z
  .object({
    limit: z.preprocess((value: unknown) => {
      if (value === undefined || value === '') {
        return undefined;
      }
      if (typeof value === 'number' || typeof value === 'string') {
        return Number(value);
      }
      return value;
    }, z.number().int().min(1).max(NOTIFICATION_PAGE_SIZE_MAX).optional()),
    before: z.preprocess((value: unknown) => {
      if (value === undefined || value === '') {
        return undefined;
      }
      return value;
    }, notificationResourceIdSchema.optional()),
  })
  .strict();

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
