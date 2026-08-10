import {
  isMobileMessageEnvelope,
  MOBILE_PROTOCOL_VERSION,
} from '../src/bridge/protocol';

describe('mobile bridge protocol', () => {
  it('accepts a known versioned message envelope', () => {
    expect(
      isMobileMessageEnvelope({
        v: MOBILE_PROTOCOL_VERSION,
        type: 'viewerReady',
        payload: { engineVersion: '0.1.0' },
      }),
    ).toBe(true);
  });

  it.each([
    null,
    { v: 2, type: 'viewerReady', payload: {} },
    { v: 1, type: 'unknown', payload: {} },
    { v: 1, type: 'viewerReady', payload: [] },
    { v: 1, type: 'viewerReady', requestId: 17, payload: {} },
    {
      v: 1,
      type: 'openToken',
      payload: { token: '', displayName: 'flight.bbl', sizeBytes: -1 },
    },
  ])('rejects an invalid envelope: %p', value => {
    expect(isMobileMessageEnvelope(value)).toBe(false);
  });
});
