import { Link } from 'react-router-dom';

import { loginSchema, type LoginInput } from '@pulse-chat/shared';

import { AuthCard } from '../components/auth/AuthCard';
import { AuthField } from '../components/auth/AuthField';
import { FormAlert } from '../components/auth/FormAlert';
import { useLogin } from '../hooks/useLogin';
import { toDisplayErrorMessage } from '../lib/errors';
import { useZodForm } from '../lib/form';

export function LoginPage() {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useZodForm<LoginInput>(loginSchema);

  const isLoading = isSubmitting || login.isPending;
  const apiError =
    login.error !== null && login.error !== undefined
      ? toDisplayErrorMessage(login.error, 'Unable to sign in.')
      : undefined;

  return (
    <AuthCard
      title="Sign in"
      description="Use your email and password to access Pulse Chat."
      footer={
        <p className="text-sm text-slate-600">
          Need an account?{' '}
          <Link
            to="/register"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            Create one
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
            login.mutate(values);
          })(event);
        }}
      >
        {apiError !== undefined ? <FormAlert message={apiError} /> : null}

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
          autoComplete="current-password"
          register={register}
          error={errors.password?.message}
          disabled={isLoading}
        />

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthCard>
  );
}
