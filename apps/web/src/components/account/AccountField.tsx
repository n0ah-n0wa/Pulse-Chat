import type { FieldValues, Path, UseFormRegister } from 'react-hook-form';

interface AccountFieldProps<TFieldValues extends FieldValues> {
  readonly label: string;
  readonly name: Path<TFieldValues>;
  readonly type?: 'text' | 'email';
  readonly autoComplete?: string;
  readonly register: UseFormRegister<TFieldValues>;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly description?: string;
  readonly readOnly?: boolean;
}

export function AccountField<TFieldValues extends FieldValues>({
  label,
  name,
  type = 'text',
  autoComplete,
  register,
  error,
  disabled = false,
  description,
  readOnly = false,
}: AccountFieldProps<TFieldValues>) {
  const fieldId = String(name);
  const errorId = `${fieldId}-error`;
  const descriptionId = `${fieldId}-description`;
  const describedBy = [
    description !== undefined ? descriptionId : undefined,
    error !== undefined ? errorId : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join(' ');

  return (
    <div className="space-y-2">
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-slate-700 dark:text-slate-200"
      >
        {label}
      </label>
      <input
        id={fieldId}
        type={type}
        autoComplete={autoComplete}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy.length > 0 ? describedBy : undefined}
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:focus:ring-slate-700 dark:disabled:bg-slate-900"
        {...register(name)}
      />
      {description !== undefined ? (
        <p id={descriptionId} className="text-xs text-slate-500 dark:text-slate-400">
          {description}
        </p>
      ) : null}
      {error !== undefined ? (
        <p id={errorId} role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
