export const MOBILE_PROTOCOL_VERSION = 1 as const;

type Envelope<Type extends string, Payload> = {
  v: typeof MOBILE_PROTOCOL_VERSION;
  type: Type;
  requestId?: string;
  payload: Payload;
};

export type ViewerReadyMessage = Envelope<
  'viewerReady',
  { engineVersion?: string }
>;

export type OpenTokenMessage = Envelope<
  'openToken',
  { token: string; displayName: string; sizeBytes: number }
>;

export type MetadataReadyMessage = Envelope<
  'metadataReady',
  {
    token: string;
    firmwareType: string;
    firmwareVersion?: string;
    logCount: number;
    minTime: number;
    maxTime: number;
  }
>;

export type ViewerStateChangedMessage = Envelope<
  'viewerStateChanged',
  {
    token?: string;
    selectedLogIndex?: number;
    cursorTime?: number;
    zoom?: number;
    workspaceId?: string;
  }
>;

export type RequestExportMessage = Envelope<
  'requestExport',
  { format: 'csv' | 'workspace'; suggestedName: string }
>;

export type ViewerErrorMessage = Envelope<
  'error',
  { code: string; message: string; recoverable: boolean }
>;

export type MobileMessage =
  | ViewerReadyMessage
  | OpenTokenMessage
  | MetadataReadyMessage
  | ViewerStateChangedMessage
  | RequestExportMessage
  | ViewerErrorMessage;

const messageTypes = new Set<MobileMessage['type']>([
  'viewerReady',
  'openToken',
  'metadataReady',
  'viewerStateChanged',
  'requestExport',
  'error',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return (
    value === undefined || (typeof value === 'number' && Number.isFinite(value))
  );
}

function hasValidPayload(
  type: MobileMessage['type'],
  payload: Record<string, unknown>,
): boolean {
  switch (type) {
    case 'viewerReady':
      return isOptionalString(payload.engineVersion);
    case 'openToken':
      return (
        typeof payload.token === 'string' &&
        payload.token.length > 0 &&
        typeof payload.displayName === 'string' &&
        typeof payload.sizeBytes === 'number' &&
        Number.isSafeInteger(payload.sizeBytes) &&
        payload.sizeBytes >= 0
      );
    case 'metadataReady':
      return (
        typeof payload.token === 'string' &&
        typeof payload.firmwareType === 'string' &&
        isOptionalString(payload.firmwareVersion) &&
        typeof payload.logCount === 'number' &&
        Number.isSafeInteger(payload.logCount) &&
        payload.logCount >= 0 &&
        typeof payload.minTime === 'number' &&
        Number.isFinite(payload.minTime) &&
        typeof payload.maxTime === 'number' &&
        Number.isFinite(payload.maxTime)
      );
    case 'viewerStateChanged':
      return (
        isOptionalString(payload.token) &&
        isOptionalNumber(payload.selectedLogIndex) &&
        isOptionalNumber(payload.cursorTime) &&
        isOptionalNumber(payload.zoom) &&
        isOptionalString(payload.workspaceId)
      );
    case 'requestExport':
      return (
        (payload.format === 'csv' || payload.format === 'workspace') &&
        typeof payload.suggestedName === 'string'
      );
    case 'error':
      return (
        typeof payload.code === 'string' &&
        typeof payload.message === 'string' &&
        typeof payload.recoverable === 'boolean'
      );
  }
}

export function isMobileMessageEnvelope(
  value: unknown,
): value is MobileMessage {
  if (!isRecord(value) || value.v !== MOBILE_PROTOCOL_VERSION) {
    return false;
  }

  if (
    typeof value.type !== 'string' ||
    !messageTypes.has(value.type as MobileMessage['type'])
  ) {
    return false;
  }

  if (value.requestId !== undefined && typeof value.requestId !== 'string') {
    return false;
  }

  return (
    isRecord(value.payload) &&
    hasValidPayload(value.type as MobileMessage['type'], value.payload)
  );
}
