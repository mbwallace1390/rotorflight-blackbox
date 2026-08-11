import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { HomeScreen } from './src/screens/HomeScreen';
import { LegalScreen } from './src/screens/LegalScreen';
import {
  beginMassStorageImport,
  openNativeViewer,
  type MassStorageImportResult,
} from './src/native/rotorflightHost';
import { palette, type } from './src/theme';

function App(): React.JSX.Element {
  const [showLegal, setShowLegal] = useState(false);
  const [massStorageLaunching, setMassStorageLaunching] = useState(false);
  const massStorageLaunchInFlight = useRef(false);

  const handleOpenLog = useCallback(async () => {
    try {
      if (await openNativeViewer(true)) {
        return;
      }

      Alert.alert(
        'Viewer host unavailable',
        Platform.OS === 'ios'
          ? 'The iOS project is ready for its Mac-backed WebKit host build.'
          : 'This build does not include the native Blackbox viewer host.',
      );
    } catch {
      Alert.alert(
        'Unable to open the viewer',
        'Close this message and try opening the log again.',
      );
    }
  }, []);

  const showMassStorageFallback = useCallback(
    (result: Exclude<MassStorageImportResult, { status: 'launched' }>) => {
      const failure = massStorageFailureCopy(result.status);

      Alert.alert(failure.title, failure.message, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Browse files', onPress: handleOpenLog },
      ]);
    },
    [handleOpenLog],
  );

  const handleMassStorageImport = useCallback(async () => {
    if (massStorageLaunchInFlight.current) {
      return;
    }

    massStorageLaunchInFlight.current = true;
    setMassStorageLaunching(true);

    try {
      const result = await beginMassStorageImport();

      if (result.status !== 'launched') {
        showMassStorageFallback(result);
      }
    } finally {
      massStorageLaunchInFlight.current = false;
      setMassStorageLaunching(false);
    }
  }, [showMassStorageFallback]);

  return (
    <SafeAreaProvider>
      <StatusBar backgroundColor={palette.ink} barStyle="light-content" />
      {showLegal ? (
        <LegalScreen onClose={() => setShowLegal(false)} />
      ) : (
        <View style={styles.app}>
          <HomeScreen
            isMassStorageLaunching={massStorageLaunching}
            onGetLogsFromFlightController={
              Platform.OS === 'android' ? handleMassStorageImport : undefined
            }
            onOpenLog={handleOpenLog}
          />
          <SafeAreaView
            edges={['bottom', 'left', 'right']}
            style={styles.legalBar}
          >
            <Pressable
              accessibilityHint="View source, license, attribution, and warranty information"
              accessibilityRole="button"
              onPress={() => setShowLegal(true)}
              style={({ pressed }) => [
                styles.legalButton,
                pressed && styles.legalButtonPressed,
              ]}
            >
              <Text style={styles.legalButtonText}>ABOUT & LEGAL</Text>
              <Text accessibilityElementsHidden style={styles.legalButtonArrow}>
                →
              </Text>
            </Pressable>
          </SafeAreaView>
        </View>
      )}
    </SafeAreaProvider>
  );
}

function massStorageFailureCopy(
  status: Exclude<MassStorageImportResult['status'], 'launched'>,
): { title: string; message: string } {
  switch (status) {
    case 'configurator-unavailable':
      return {
        title: 'Rotorflight Configurator unavailable',
        message:
          "Rotorflight Configurator is not installed or can't be opened. You can still browse Files for a log already in storage.",
      };
    case 'host-not-foreground':
      return {
        title: 'RotorLens is not ready',
        message:
          'Keep RotorLens visible and try again, or browse Files for a log already in storage.',
      };
    case 'host-unavailable':
      return {
        title: 'Mass-storage handoff unavailable',
        message:
          'This build does not include the Android mass-storage handoff. You can still browse Files for a log.',
      };
    case 'launch-failed':
      return {
        title: 'Unable to open Rotorflight Configurator',
        message: 'Try again, or browse Files for a log already in storage.',
      };
  }
}

const styles = StyleSheet.create({
  app: {
    backgroundColor: palette.ink,
    flex: 1,
  },
  legalBar: {
    backgroundColor: palette.ink,
    borderTopColor: palette.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legalButton: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    maxWidth: 760,
    minHeight: 44,
    paddingHorizontal: 22,
    width: '100%',
  },
  legalButtonPressed: {
    backgroundColor: palette.panel,
  },
  legalButtonText: {
    color: palette.muted,
    fontFamily: type.data,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.05,
  },
  legalButtonArrow: {
    color: palette.amber,
    fontFamily: type.data,
    fontSize: 14,
    marginLeft: 9,
  },
});

export default App;
