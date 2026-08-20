import { Types } from 'mongoose';

/** Returns true when `value` is a canonical MongoDB ObjectId string. */
export function isValidObjectId(value: string): boolean {
  if (!Types.ObjectId.isValid(value)) {
    return false;
  }

  return new Types.ObjectId(value).toHexString() === value;
}
