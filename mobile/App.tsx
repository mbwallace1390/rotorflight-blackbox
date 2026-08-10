import React, { useCallback, useState } from 'react';
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
import { openNativeViewer } from './src/native/rotorflightHost';
import { palette, type } from './src/theme';

function App(): React.JSX.Element {
  const [showLegal, setShowLegal] = useState(false);

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

  return (
    <SafeAreaProvider>
      <StatusBar backgroundColor={palette.ink} barStyle="light-content" />
      {showLegal ? (
        <LegalScreen onClose={() => setShowLegal(false)} />
      ) : (
        <View style={styles.app}>
          <HomeScreen onOpenLog={handleOpenLog} />
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
