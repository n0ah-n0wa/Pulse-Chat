import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { useOpenDirectRoom } from '../hooks/useRoomMutations';
import { usePublicProfileByUsername } from '../hooks/usePublicProfileQuery';
import { formatLastSeen } from '../lib/presence-display';
import { toDisplayErrorMessage } from '../lib/errors';
import { AvatarImage } from '../components/account/AvatarImage';

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user: currentUser } = useAuth();
  const profileQuery = usePublicProfileByUsername(username);
  const openDirectRoom = useOpenDirectRoom();

  if (profileQuery.isPending) {
    return (
      <section
        aria-busy="true"
        className="w-full rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900"
      >
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading profile…</p>
      </section>
    );
  }

  if (profileQuery.isError || profileQuery.data === undefined) {
    return (
      <section className="w-full rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold tracking-tight">Profile unavailable</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {toDisplayErrorMessage(profileQuery.error, 'This profile could not be found.')}
        </p>
        <button
          type="button"
          className="mt-4 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-700"
          onClick={() => {
            void profileQuery.refetch();
          }}
        >
          Retry
        </button>
      </section>
    );
  }

  const profile = profileQuery.data;
  const isOwnProfile = currentUser?.id === profile.id;

  return (
    <article className="w-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start gap-6">
        <AvatarImage displayName={profile.displayName} avatarUrl={profile.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {profile.displayName}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">@{profile.username}</p>
          {profile.bio !== undefined && profile.bio.length > 0 ? (
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {profile.bio}
            </p>
          ) : (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No bio yet.</p>
          )}
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            {formatLastSeen(profile.lastSeenAt)}
          </p>
          {isOwnProfile ? (
            <Link
              to="/settings"
              className="mt-6 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            >
              Edit profile
            </Link>
          ) : currentUser !== null ? (
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={openDirectRoom.isPending}
                onClick={() => {
                  openDirectRoom.mutate(profile.id);
                }}
                className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
              >
                {openDirectRoom.isPending ? 'Opening…' : 'Message'}
              </button>
              {openDirectRoom.error !== null && openDirectRoom.error !== undefined ? (
                <p role="alert" className="w-full text-sm text-rose-700 dark:text-rose-400">
                  {toDisplayErrorMessage(openDirectRoom.error, 'Unable to start a conversation.')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
