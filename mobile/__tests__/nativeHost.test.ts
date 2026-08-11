import { NativeModules } from 'react-native';

import {
  beginMassStorageImport,
  openNativeViewer,
} from '../src/native/rotorflightHost';

type MutableNativeModules = typeof NativeModules & {
  RotorflightHost?: {
    beginMassStorageImport?(): Promise<unknown>;
    openViewer?(pickImmediately: boolean): Promise<boolean>;
  };
};

const modules = NativeModules as MutableNativeModules;

describe('Rotorflight native host adapter', () => {
  afterEach(() => {
    delete modules.RotorflightHost;
  });

  it('reports an unavailable platform host without throwing', async () => {
    await expect(openNativeViewer(true)).resolves.toBe(false);
  });

  it('passes the picker preference to the native host', async () => {
    const openViewer = jest.fn().mockResolvedValue(true);
    modules.RotorflightHost = { openViewer };

    await expect(openNativeViewer(true)).resolves.toBe(true);
    expect(openViewer).toHaveBeenCalledWith(true);
  });

  it('reports a missing mass-storage bridge without throwing', async () => {
    modules.RotorflightHost = {};

    await expect(beginMassStorageImport()).resolves.toEqual({
      status: 'host-unavailable',
    });
  });

  it('returns validated launch metadata from the native bridge', async () => {
    const launched = {
      status: 'launched',
      requestId: 'request-42',
      expiresAtMs: 1_800_000_000_000,
      ignoredNativeField: true,
    };
    const begin = jest.fn().mockResolvedValue(launched);
    modules.RotorflightHost = { beginMassStorageImport: begin };

    await expect(beginMassStorageImport()).resolves.toEqual({
      status: 'launched',
      requestId: 'request-42',
      expiresAtMs: 1_800_000_000_000,
    });
    expect(begin).toHaveBeenCalledTimes(1);
  });

  it.each([
    'configurator-unavailable',
    'host-not-foreground',
    'launch-failed',
  ] as const)('passes through the %s status', async status => {
    modules.RotorflightHost = {
      beginMassStorageImport: jest.fn().mockResolvedValue({ status }),
    };

    await expect(beginMassStorageImport()).resolves.toEqual({ status });
  });

  it.each([
    null,
    {},
    { status: 'unexpected' },
    { status: 'launched', requestId: '', expiresAtMs: 1_800_000_000_000 },
    { status: 'launched', requestId: 'request-42', expiresAtMs: NaN },
    { status: 'launched', requestId: 'request-42', expiresAtMs: 0 },
  ])('fails closed for malformed native result %#', async result => {
    modules.RotorflightHost = {
      beginMassStorageImport: jest.fn().mockResolvedValue(result),
    };

    await expect(beginMassStorageImport()).resolves.toEqual({
      status: 'launch-failed',
    });
  });

  it('converts a rejected native launch into a safe failure status', async () => {
    modules.RotorflightHost = {
      beginMassStorageImport: jest
        .fn()
        .mockRejectedValue(new Error('native launch failed')),
    };

    await expect(beginMassStorageImport()).resolves.toEqual({
      status: 'launch-failed',
    });
  });
});
