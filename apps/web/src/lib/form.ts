import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldValues, type UseFormProps } from 'react-hook-form';
import type { ZodType } from 'zod';

/** Shared React Hook Form setup for Zod schemas from `@pulse-chat/shared`. */
export function useZodForm<TFieldValues extends FieldValues>(
  schema: ZodType<TFieldValues>,
  options?: Omit<UseFormProps<TFieldValues>, 'resolver'>,
) {
  return useForm<TFieldValues>({
    ...options,
    resolver: zodResolver(schema),
  });
}
