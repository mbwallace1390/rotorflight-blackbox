/**
 * @format
 */

import React from 'react';
import { Alert, Platform, type AlertButton } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import {
  beginMassStorageImport,
  openNativeViewer,
  type MassStorageImportResult,
} from '../src/native/rotorflightHost';

jest.mock('../src/native/rotorflightHost', () => ({
  beginMassStorageImport: jest.fn(),
  openNativeViewer: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const safeAreaMock = jest.requireActual(
    'react-native-safe-area-context/jest/mock',
  );

  return safeAreaMock.default;
});

const mockBeginMassStorageImport =
  beginMassStorageImport as jest.MockedFunction<typeof beginMassStorageImport>;
const mockOpenNativeViewer = openNativeViewer as jest.MockedFunction<
  typeof openNativeViewer
>;
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
  Platform,
  'OS',
);

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'android',
  });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockBeginMassStorageImport.mockResolvedValue({
    status: 'launched',
    requestId: 'request-1',
    expiresAtMs: 1_800_000_000_000,
  });
  mockOpenNativeViewer.mockResolvedValue(true);
});

afterEach(() => {
  alertSpy.mockRestore();
  jest.clearAllMocks();
});

afterAll(() => {
  if (originalPlatformDescriptor) {
    Object.defineProperty(Platform, 'OS', originalPlatformDescriptor);
  }
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

test('renders separate file and Android flight-controller actions', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(
    renderer!.root.findByProps({ children: 'Open flight log' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({
      accessibilityLabel: 'Get logs from flight controller',
    }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({
      children:
        'Opens Rotorflight Configurator. Tap Mass Storage, then return to RotorLens; Files opens automatically.',
    }),
  ).toBeTruthy();
});

test('keeps the normal file picker independent of the Configurator flow', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const openLogButton = renderer!.root.findByProps({
    accessibilityHint: 'Choose a Rotorflight or Betaflight log file',
  });

  await ReactTestRenderer.act(async () => {
    await openLogButton.props.onPress();
  });

  expect(mockOpenNativeViewer).toHaveBeenCalledWith(true);
  expect(mockBeginMassStorageImport).not.toHaveBeenCalled();
});

test('does not promise the Android handoff on iOS', async () => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'ios',
  });

  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(
    renderer!.root.findAllByProps({
      accessibilityLabel: 'Get logs from flight controller',
    }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findByProps({ children: 'Open flight log' }),
  ).toBeTruthy();
});

test('blocks repeat taps while the Configurator launch is pending', async () => {
  let resolveLaunch!: (result: MassStorageImportResult) => void;
  mockBeginMassStorageImport.mockImplementation(
    () =>
      new Promise(resolve => {
        resolveLaunch = resolve;
      }),
  );

  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const startButton = renderer!.root.findByProps({
    accessibilityLabel: 'Get logs from flight controller',
  });

  ReactTestRenderer.act(() => {
    startButton.props.onPress();
    startButton.props.onPress();
  });

  expect(mockBeginMassStorageImport).toHaveBeenCalledTimes(1);
  expect(
    renderer!.root.findByProps({
      accessibilityLabel: 'Get logs from flight controller',
    }).props.accessibilityState,
  ).toEqual({ busy: true, disabled: true });
  expect(
    renderer!.root.findByProps({
      children: 'Opening Rotorflight Configurator…',
    }),
  ).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    resolveLaunch({
      status: 'launched',
      requestId: 'request-1',
      expiresAtMs: 1_800_000_000_000,
    });
    await Promise.resolve();
  });

  expect(
    renderer!.root.findByProps({
      accessibilityLabel: 'Get logs from flight controller',
    }).props.accessibilityState,
  ).toEqual({ busy: false, disabled: false });
});

test.each([
  'configurator-unavailable',
  'host-not-foreground',
  'launch-failed',
  'host-unavailable',
] as const)('offers Browse files after %s', async status => {
  mockBeginMassStorageImport.mockResolvedValue({ status });

  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const startButton = renderer!.root.findByProps({
    accessibilityLabel: 'Get logs from flight controller',
  });

  await ReactTestRenderer.act(async () => {
    await startButton.props.onPress();
  });

  const buttons = alertSpy.mock.calls[0]?.[2] as AlertButton[] | undefined;
  const browseButton = buttons?.find(button => button.text === 'Browse files');

  expect(browseButton).toBeDefined();

  await ReactTestRenderer.act(async () => {
    await browseButton?.onPress?.();
  });

  expect(mockOpenNativeViewer).toHaveBeenCalledWith(true);
});

test('opens and closes the About and legal screen', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const legalEntry = renderer!.root.findByProps({
    accessibilityHint:
      'View source, license, attribution, and warranty information',
  });

  await ReactTestRenderer.act(() => {
    legalEntry.props.onPress();
  });

  expect(
    renderer!.root.findByProps({ children: 'About & legal' }),
  ).toBeTruthy();
  expect(
    renderer!.root.findByProps({
      children: 'https://github.com/mbwallace1390/rotorflight-blackbox',
    }),
  ).toBeTruthy();

  const closeButton = renderer!.root.findByProps({
    accessibilityLabel: 'Close About and legal',
  });

  await ReactTestRenderer.act(() => {
    closeButton.props.onPress();
  });

  expect(
    renderer!.root.findByProps({ children: 'ABOUT & LEGAL' }),
  ).toBeTruthy();
});
