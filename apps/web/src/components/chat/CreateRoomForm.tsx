import { useState, type FormEvent } from 'react';

import { ROOM_TYPES } from '@pulse-chat/shared';

import { useCreateRoom } from '../../hooks/useRoomMutations';
import { toDisplayErrorMessage } from '../../lib/errors';

export function CreateRoomForm() {
  const createRoom = useCreateRoom();
  const [name, setName] = useState('');
  const [type, setType] = useState<typeof ROOM_TYPES.PUBLIC | typeof ROOM_TYPES.PRIVATE>(
    ROOM_TYPES.PUBLIC,
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || createRoom.isPending) {
      return;
    }

    createRoom.mutate(
      { type, name: trimmed },
      {
        onSuccess: () => {
          setName('');
          setType(ROOM_TYPES.PUBLIC);
        },
      },
    );
  };

  const errorMessage =
    createRoom.error !== null && createRoom.error !== undefined
      ? toDisplayErrorMessage(createRoom.error, 'Unable to create the room.')
      : undefined;

  return (
    <form
      className="mb-4 space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-800"
      aria-label="Create a room"
      onSubmit={handleSubmit}
    >
      <label
        className="block text-xs font-medium text-slate-600 dark:text-slate-300"
        htmlFor="create-room-name"
      >
        Room name
      </label>
      <input
        id="create-room-name"
        name="name"
        value={name}
        disabled={createRoom.isPending}
        onChange={(event) => {
          setName(event.target.value);
        }}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
      />
      <label
        className="block text-xs font-medium text-slate-600 dark:text-slate-300"
        htmlFor="create-room-type"
      >
        Room type
      </label>
      <select
        id="create-room-type"
        name="type"
        aria-label="Room type"
        value={type}
        disabled={createRoom.isPending}
        onChange={(event) => {
          const next = event.target.value;
          if (next === ROOM_TYPES.PUBLIC || next === ROOM_TYPES.PRIVATE) {
            setType(next);
          }
        }}
        className="block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
      >
        <option value={ROOM_TYPES.PUBLIC}>Public</option>
        <option value={ROOM_TYPES.PRIVATE}>Private</option>
      </select>
      {errorMessage !== undefined ? (
        <p role="alert" className="text-xs text-rose-700 dark:text-rose-400">
          {errorMessage}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={createRoom.isPending}
        className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
      >
        {createRoom.isPending ? 'Creating…' : 'Create room'}
      </button>
    </form>
  );
}
