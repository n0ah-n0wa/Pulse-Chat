interface FormAlertProps {
  readonly message: string;
}

/** Accessible alert for API and form-level errors. */
export function FormAlert({ message }: FormAlertProps) {
  return (
    <div
      role="alert"
      className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
    >
      {message}
    </div>
  );
}
