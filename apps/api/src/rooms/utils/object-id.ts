import { Types } from 'mongoose';

export function objectIdToString(value: Types.ObjectId | string): string {
  return typeof value === 'string' ? value : value.toHexString();
}
