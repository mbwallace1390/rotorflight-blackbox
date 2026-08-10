/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-safe-area-context', () => {
  const safeAreaMock = jest.requireActual(
    'react-native-safe-area-context/jest/mock',
  );

  return safeAreaMock.default;
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
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
