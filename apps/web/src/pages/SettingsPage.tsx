import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';

import { settingsProfileSchema, type SettingsProfileInput } from '@pulse-chat/shared';

import { AccountField } from '../components/account/AccountField';
import { AvatarImage } from '../components/account/AvatarImage';
import { FormAlert } from '../components/auth/FormAlert';
import { ThemeToggle } from '../components/theme/ThemeToggle';
import { useAuth } from '../hooks/useAuth';
import { useLogout } from '../hooks/useLogout';
import {
  useCurrentUserProfileQuery,
  useUpdateProfile,
  useUploadAvatar,
} from '../hooks/useProfileMutations';
import { toDisplayErrorMessage } from '../lib/errors';
import { useZodForm } from '../lib/form';

export function SettingsPage() {
  const { user: sessionUser } = useAuth();
  const meQuery = useCurrentUserProfileQuery();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const logout = useLogout();
  const avatarInputId = useId();
  const [profileSaved, setProfileSaved] = useState(false);

  const profile = meQuery.data ?? sessionUser;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useZodForm<SettingsProfileInput>(settingsProfileSchema, {
    defaultValues: {
      displayName: profile?.displayName ?? '',
      username: profile?.username ?? '',
      bio: profile?.bio ?? '',
    },
  });

  useEffect(() => {
    if (profile === null || profile === undefined) {
      return;
    }

    reset({
      displayName: profile.displayName,
      username: profile.username,
      bio: profile.bio ?? '',
    });
  }, [profile, reset]);

  if (profile === null || profile === undefined) {
    return (
      <section className="w-full rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Sign in to manage your account.
        </p>
      </section>
    );
  }

  const profileBusy = isSubmitting || updateProfile.isPending;
  const profileError =
    updateProfile.error !== null && updateProfile.error !== undefined
      ? toDisplayErrorMessage(updateProfile.error, 'Unable to save profile.')
      : undefined;
  const uploadError =
    uploadAvatar.error !== null && uploadAvatar.error !== undefined
      ? toDisplayErrorMessage(uploadAvatar.error, 'Unable to upload avatar.')
      : undefined;

  return (
    <div className="flex w-full flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage your public profile, appearance, and account.
        </p>
      </header>

      <section
        aria-labelledby="profile-settings-heading"
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 id="profile-settings-heading" className="text-lg font-semibold">
          Profile
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Display name, username, and bio are visible to other members.
        </p>

        <form
          className="mt-6 space-y-4"
          noValidate
          aria-busy={profileBusy}
          onSubmit={(event) => {
            void handleSubmit((values) => {
              setProfileSaved(false);
              updateProfile.mutate(values, {
                onSuccess: () => {
                  setProfileSaved(true);
                },
              });
            })(event);
          }}
        >
          {profileError !== undefined ? <FormAlert message={profileError} /> : null}
          {profileSaved ? (
            <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
              Profile saved.
            </p>
          ) : null}

          <AccountField
            label="Display name"
            name="displayName"
            autoComplete="name"
            register={register}
            error={errors.displayName?.message}
            disabled={profileBusy}
          />

          <AccountField
            label="Username"
            name="username"
            autoComplete="username"
            register={register}
            error={errors.username?.message}
            disabled={profileBusy}
            description="3–32 characters. Letters, numbers, underscores, and hyphens. Must be unique."
          />

          <div className="space-y-2">
            <label
              htmlFor="bio"
              className="block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Bio
            </label>
            <textarea
              id="bio"
              rows={4}
              disabled={profileBusy}
              aria-invalid={errors.bio !== undefined}
              aria-describedby={errors.bio !== undefined ? 'bio-error' : undefined}
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:focus:ring-slate-700"
              {...register('bio')}
            />
            {errors.bio?.message !== undefined ? (
              <p id="bio-error" role="alert" className="text-sm text-rose-700 dark:text-rose-400">
                {errors.bio.message}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={profileBusy}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
          >
            {profileBusy ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      <section
        aria-labelledby="avatar-settings-heading"
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 id="avatar-settings-heading" className="text-lg font-semibold">
          Avatar
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <AvatarImage displayName={profile.displayName} avatarUrl={profile.avatarUrl} size="lg" />
          <div>
            <label
              htmlFor={avatarInputId}
              className="inline-flex cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-700"
            >
              {uploadAvatar.isPending ? 'Uploading…' : 'Upload image'}
            </label>
            <input
              id={avatarInputId}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="sr-only"
              disabled={uploadAvatar.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file === undefined) {
                  return;
                }
                uploadAvatar.mutate(file);
              }}
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              JPEG, PNG, GIF, or WebP. Shown on your public profile.
            </p>
          </div>
        </div>
        {uploadError !== undefined ? (
          <div className="mt-4">
            <FormAlert message={uploadError} />
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="appearance-settings-heading"
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 id="appearance-settings-heading" className="text-lg font-semibold">
          Appearance
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Theme preference is stored on this device.
        </p>
        <div className="mt-4">
          <ThemeToggle />
        </div>
      </section>

      <section
        aria-labelledby="account-settings-heading"
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 id="account-settings-heading" className="text-lg font-semibold">
          Account
        </h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-slate-700 dark:text-slate-200">Email</dt>
            <dd className="mt-1 text-slate-600 dark:text-slate-400">{profile.email}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700 dark:text-slate-200">Public profile</dt>
            <dd className="mt-1">
              <Link
                to={`/profile/${profile.username}`}
                className="font-medium text-slate-900 underline-offset-2 hover:underline dark:text-slate-100"
              >
                View your profile
              </Link>
            </dd>
          </div>
        </dl>
        <button
          type="button"
          disabled={logout.isPending}
          onClick={() => {
            logout.mutate();
          }}
          className="mt-6 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {logout.isPending ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </div>
  );
}
