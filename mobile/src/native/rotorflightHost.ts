import { NativeModules } from 'react-native';

type NativeMassStorageImportResult =
  | {
      status: 'launched';
      requestId: string;
      expiresAtMs: number;
    }
  | { status: 'configurator-unavailable' }
  | { status: 'host-not-foreground' }
  | { status: 'launch-failed' };

export type MassStorageImportResult =
  | NativeMassStorageImportResult
  | { status: 'host-unavailable' };

type RotorflightHostModule = {
  openViewer(pickImmediately: boolean): Promise<boolean>;
  beginMassStorageImport(): Promise<unknown>;
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

export async function beginMassStorageImport(): Promise<MassStorageImportResult> {
  const host = nativeHost();

  if (!host || typeof host.beginMassStorageImport !== 'function') {
    return { status: 'host-unavailable' };
  }

  let result: unknown;

  try {
    result = await host.beginMassStorageImport();
  } catch {
    return { status: 'launch-failed' };
  }

  if (!isRecord(result) || typeof result.status !== 'string') {
    return { status: 'launch-failed' };
  }

  if (result.status === 'launched') {
    if (
      typeof result.requestId !== 'string' ||
      result.requestId.trim().length === 0 ||
      typeof result.expiresAtMs !== 'number' ||
      !Number.isFinite(result.expiresAtMs) ||
      result.expiresAtMs <= 0
    ) {
      return { status: 'launch-failed' };
    }

    return {
      status: 'launched',
      requestId: result.requestId,
      expiresAtMs: result.expiresAtMs,
    };
  }

  if (
    result.status === 'configurator-unavailable' ||
    result.status === 'host-not-foreground' ||
    result.status === 'launch-failed'
  ) {
    return { status: result.status };
  }

  return { status: 'launch-failed' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
