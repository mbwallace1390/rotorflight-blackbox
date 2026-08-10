import {
  initialSessionState,
  sessionReducer,
  type RecentLog,
} from '../src/state/session';

function log(token: string, openedAt: number): RecentLog {
  return { token, openedAt, displayName: `${token}.bbl` };
}

describe('mobile session state', () => {
  it('moves a reopened log to the front without duplicating it', () => {
    const once = sessionReducer(initialSessionState, {
      type: 'logReady',
      log: log('a', 1),
    });
    const twice = sessionReducer(once, {
      type: 'logReady',
      log: log('b', 2),
    });
    const reopened = sessionReducer(twice, {
      type: 'logReady',
      log: log('a', 3),
    });

    expect(reopened.recentLogs.map(item => item.token)).toEqual(['a', 'b']);
    expect(reopened.recentLogs[0].openedAt).toBe(3);
  });

  it('keeps the recent-log list bounded', () => {
    const state = Array.from({ length: 15 }, (_, index) => index).reduce(
      (current, index) =>
        sessionReducer(current, {
          type: 'logReady',
          log: log(String(index), index),
        }),
      initialSessionState,
    );

    expect(state.recentLogs).toHaveLength(12);
    expect(state.recentLogs[0].token).toBe('14');
    expect(state.recentLogs[11].token).toBe('3');
  });
});
