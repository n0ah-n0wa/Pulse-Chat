import { Link } from 'react-router-dom';

import { registerSchema, type RegisterInput } from '@pulse-chat/shared';

import { AuthCard } from '../components/auth/AuthCard';
import { AuthField } from '../components/auth/AuthField';
import { FormAlert } from '../components/auth/FormAlert';
import { useRegister } from '../hooks/useRegister';
import { toDisplayErrorMessage } from '../lib/errors';
import { useZodForm } from '../lib/form';

export function RegisterPage() {
  const registerMutation = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useZodForm<RegisterInput>(registerSchema);

  const apiError =
    registerMutation.error !== null && registerMutation.error !== undefined
      ? toDisplayErrorMessage(registerMutation.error, 'Unable to create your account.')
      : undefined;

  const isLoading = isSubmitting || registerMutation.isPending;

  return (
    <AuthCard
      title="Create account"
      description="Register to join rooms, send messages, and receive realtime updates."
      footer={
        <p className="text-sm text-slate-600">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form
        className="space-y-4"
        noValidate
        aria-busy={isLoading}
        onSubmit={(event) => {
          void handleSubmit((values) => {
            registerMutation.mutate(values);
          })(event);
        }}
      >
        {apiError !== undefined ? <FormAlert message={apiError} /> : null}

        <AuthField
          label="Username"
          name="username"
          autoComplete="username"
          register={register}
          error={errors.username?.message}
          disabled={isLoading}
        />

        <AuthField
          label="Display name"
          name="displayName"
          autoComplete="name"
          register={register}
          error={errors.displayName?.message}
          disabled={isLoading}
        />

        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          register={register}
          error={errors.email?.message}
          disabled={isLoading}
        />

        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          register={register}
          error={errors.password?.message}
          disabled={isLoading}
        />

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  );
}
