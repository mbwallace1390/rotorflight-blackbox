export type RecentLog = {
  token: string;
  displayName: string;
  firmware?: string;
  openedAt: number;
};

export type SessionState = {
  importPhase: 'idle' | 'picking' | 'opening' | 'ready' | 'error';
  activeToken?: string;
  error?: string;
  recentLogs: RecentLog[];
};

export type SessionAction =
  | { type: 'pickerRequested' }
  | { type: 'tokenOpening'; token: string }
  | { type: 'logReady'; log: RecentLog }
  | { type: 'failed'; message: string }
  | { type: 'resetError' };

export const initialSessionState: SessionState = {
  importPhase: 'idle',
  recentLogs: [],
};

const MAX_RECENT_LOGS = 12;

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case 'pickerRequested':
      return { ...state, importPhase: 'picking', error: undefined };
    case 'tokenOpening':
      return {
        ...state,
        activeToken: action.token,
        importPhase: 'opening',
        error: undefined,
      };
    case 'logReady':
      return {
        ...state,
        activeToken: action.log.token,
        importPhase: 'ready',
        error: undefined,
        recentLogs: [
          action.log,
          ...state.recentLogs.filter(log => log.token !== action.log.token),
        ].slice(0, MAX_RECENT_LOGS),
      };
    case 'failed':
      return { ...state, importPhase: 'error', error: action.message };
    case 'resetError':
      return { ...state, importPhase: 'idle', error: undefined };
  }
}
