import { Platform } from 'react-native';

export const palette = {
  ink: '#101820',
  panel: '#17242C',
  panelRaised: '#20313A',
  line: '#3B4A52',
  mist: '#F4F0E6',
  muted: '#AAB4B8',
  sky: '#2CB5A0',
  amber: '#F2A900',
  amberPressed: '#D99100',
  danger: '#D9544D',
} as const;

export const type = {
  display: Platform.select({
    ios: 'Avenir Next Condensed',
    android: 'sans-serif-condensed',
    default: 'sans-serif',
  }),
  body: Platform.select({
    ios: 'Avenir Next',
    android: 'sans-serif',
    default: 'sans-serif',
  }),
  data: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
} as const;
