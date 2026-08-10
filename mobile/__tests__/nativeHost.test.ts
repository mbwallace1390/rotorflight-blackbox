import { NativeModules } from 'react-native';

import { openNativeViewer } from '../src/native/rotorflightHost';

type MutableNativeModules = typeof NativeModules & {
  RotorflightHost?: {
    openViewer(pickImmediately: boolean): Promise<boolean>;
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
});
