import { NativeModules } from 'react-native';

type RotorflightHostModule = {
  openViewer(pickImmediately: boolean): Promise<boolean>;
};

function nativeHost(): RotorflightHostModule | undefined {
  return NativeModules.RotorflightHost as RotorflightHostModule | undefined;
}

export async function openNativeViewer(
  pickImmediately: boolean,
): Promise<boolean> {
  const host = nativeHost();

  if (!host || typeof host.openViewer !== 'function') {
    return false;
  }

  const opened = await host.openViewer(pickImmediately);
  return opened === true;
}
