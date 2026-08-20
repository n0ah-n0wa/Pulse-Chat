import type { FieldValues, Path, UseFormRegister } from 'react-hook-form';

interface AuthFieldProps<TFieldValues extends FieldValues> {
  readonly label: string;
  readonly name: Path<TFieldValues>;
  readonly type?: 'text' | 'email' | 'password';
  readonly autoComplete?: string;
  readonly register: UseFormRegister<TFieldValues>;
  readonly error?: string;
  readonly disabled?: boolean;
}

export function AuthField<TFieldValues extends FieldValues>({
  label,
  name,
  type = 'text',
  autoComplete,
  register,
  error,
  disabled = false,
}: AuthFieldProps<TFieldValues>) {
  const fieldId = String(name);
  const errorId = `${fieldId}-error`;

  return (
    <div className="space-y-2">
      <label htmlFor={fieldId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={fieldId}
        type={type}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : undefined}
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100"
        {...register(name)}
      />
      {error !== undefined ? (
        <p id={errorId} role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
