import { MongoMemoryServer } from 'mongodb-memory-server';

let memoryServer: MongoMemoryServer | undefined;
let startPromise: Promise<string> | undefined;
let refCount = 0;

/** Shared in-memory MongoDB for integration tests (reference-counted). */
export async function startMongoMemoryServer(): Promise<string> {
  refCount += 1;

  startPromise ??= MongoMemoryServer.create({
    instance: { launchTimeout: 60_000 },
  }).then((server) => {
    memoryServer = server;
    return server.getUri();
  });

  return startPromise;
}

export async function stopMongoMemoryServer(): Promise<void> {
  refCount -= 1;

  if (refCount > 0 || memoryServer === undefined) {
    return;
  }

  await memoryServer.stop();
  memoryServer = undefined;
  startPromise = undefined;
  refCount = 0;
}
