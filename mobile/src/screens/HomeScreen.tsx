import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RotorMark } from '../components/RotorMark';
import { palette, type } from '../theme';

type HomeScreenProps = {
  isMassStorageLaunching?: boolean;
  onGetLogsFromFlightController?: () => void;
  onOpenLog: () => void;
  onOpenLegal?: () => void;
};

export function HomeScreen({
  isMassStorageLaunching = false,
  onGetLogsFromFlightController,
  onOpenLog,
  onOpenLegal,
}: HomeScreenProps): React.JSX.Element {
  const { width } = useWindowDimensions();
  const compact = width < 560;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.page}>
          <View style={styles.brandRow}>
            <View style={styles.brandLockup}>
              <RotorMark />
              <View>
                <Text style={styles.brand}>ROTORLENS</Text>
                <Text style={styles.brandSubline}>FLIGHT LOG INSTRUMENTS</Text>
              </View>
            </View>
            <View style={styles.localStatus}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>ON-DEVICE</Text>
            </View>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroIndexRow}>
              <Text style={styles.eyebrow}>01 / FLIGHT REVIEW</Text>
              <View style={styles.heroRule} />
            </View>
            <Text style={[styles.title, compact && styles.titleCompact]}>
              See what the rotor is saying.
            </Text>
            <Text style={styles.subtitle}>
              Open a Blackbox log to inspect control response, vibration, and
              governor behavior—privately, on your phone.
            </Text>
          </View>

          <Pressable
            accessibilityHint="Choose a Rotorflight or Betaflight log file"
            accessibilityRole="button"
            onPress={onOpenLog}
            style={({ pressed }) => [
              styles.openButton,
              pressed && styles.openButtonPressed,
            ]}
          >
            <View style={styles.openIcon}>
              <Text style={styles.openArrow}>↗</Text>
            </View>
            <View style={styles.openCopy}>
              <Text
                style={[styles.openTitle, compact && styles.openTitleCompact]}
              >
                Open flight log
              </Text>
              <Text style={styles.openFormats}>
                BBL · BFL · CFL · LOG · TXT
              </Text>
            </View>
            <Text style={styles.openAction}>CHOOSE</Text>
          </Pressable>

          {onGetLogsFromFlightController ? (
            <Pressable
              accessibilityHint="Opens Rotorflight Configurator. Tap Mass Storage there, then return to RotorLens and Files opens automatically"
              accessibilityLabel="Get logs from flight controller"
              accessibilityRole="button"
              accessibilityState={{
                busy: isMassStorageLaunching,
                disabled: isMassStorageLaunching,
              }}
              disabled={isMassStorageLaunching}
              onPress={onGetLogsFromFlightController}
              style={({ pressed }) => [
                styles.massStorageButton,
                pressed && styles.massStorageButtonPressed,
                isMassStorageLaunching && styles.massStorageButtonDisabled,
              ]}
            >
              <View style={styles.massStorageIcon}>
                <Text style={styles.massStorageArrow}>⇄</Text>
              </View>
              <View style={styles.massStorageCopy}>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[
                    styles.massStorageTitle,
                    compact && styles.massStorageTitleCompact,
                  ]}
                >
                  {isMassStorageLaunching
                    ? 'Opening Rotorflight Configurator…'
                    : 'Get logs from flight controller'}
                </Text>
                <Text style={styles.massStorageInstructions}>
                  Opens Rotorflight Configurator. Tap Mass Storage, then return
                  to RotorLens; Files opens automatically.
                </Text>
              </View>
              <Text
                accessibilityElementsHidden
                style={styles.massStorageAction}
              >
                {isMassStorageLaunching ? 'WAIT' : 'START'}
              </Text>
            </Pressable>
          ) : null}

          <View
            style={[
              styles.instrumentStrip,
              compact && styles.instrumentStripCompact,
            ]}
          >
            <View style={styles.instrumentCell}>
              <Text style={styles.instrumentLabel}>COMPATIBILITY</Text>
              <Text style={styles.instrumentValue}>
                Rotorflight · Betaflight
              </Text>
            </View>
            <View
              style={[
                styles.instrumentCell,
                !compact && styles.instrumentCellBorder,
              ]}
            >
              <Text style={styles.instrumentLabel}>TARGETS</Text>
              <Text style={styles.instrumentValue}>Android · iOS</Text>
            </View>
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>From flight to signal</Text>
            <Text style={styles.sectionMeta}>ON DEVICE</Text>
          </View>

          <View style={styles.emptyState}>
            <View style={styles.traceLine}>
              <View style={styles.tracePulse} />
            </View>
            <Text style={styles.emptyTitle}>Pick → decode → inspect</Text>
            <Text style={styles.emptyCopy}>
              RotorLens opens the proven GPL Rotorflight viewer locally. Your
              log is not uploaded to a server.
            </Text>
          </View>

          <View style={styles.footer}>
            <View>
              <Text style={styles.footerText}>UNOFFICIAL MOBILE VIEWER</Text>
              <Text style={styles.footerSubtext}>
                Compatible with Rotorflight · not affiliated or endorsed
              </Text>
            </View>
            {onOpenLegal ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={12}
                onPress={onOpenLegal}
              >
                <Text style={styles.legalLink}>ABOUT + LICENSES</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: palette.ink,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  page: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 760,
    paddingBottom: 28,
    paddingHorizontal: 22,
    width: '100%',
  },
  brandRow: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 78,
  },
  brandLockup: {
    alignItems: 'center',
    flexDirection: 'row',
    marginLeft: -4,
  },
  brand: {
    color: palette.mist,
    fontFamily: type.display,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.2,
    lineHeight: 19,
  },
  brandSubline: {
    color: palette.muted,
    fontFamily: type.data,
    fontSize: 9,
    letterSpacing: 1.35,
    marginTop: 3,
  },
  localStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  statusDot: {
    backgroundColor: palette.sky,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  statusText: {
    color: palette.muted,
    fontFamily: type.data,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  hero: {
    paddingBottom: 34,
    paddingTop: 52,
  },
  heroIndexRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 14,
  },
  heroRule: {
    backgroundColor: palette.line,
    flex: 1,
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
    maxWidth: 110,
  },
  eyebrow: {
    color: palette.amber,
    fontFamily: type.data,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: palette.mist,
    fontFamily: type.display,
    fontSize: 54,
    fontWeight: '800',
    letterSpacing: -1.25,
    lineHeight: 57,
    maxWidth: 620,
  },
  titleCompact: {
    fontSize: 43,
    letterSpacing: -0.7,
    lineHeight: 47,
  },
  subtitle: {
    color: palette.muted,
    fontFamily: type.body,
    fontSize: 17,
    lineHeight: 26,
    marginTop: 17,
    maxWidth: 590,
  },
  openButton: {
    alignItems: 'center',
    backgroundColor: palette.amber,
    borderRadius: 7,
    flexDirection: 'row',
    minHeight: 92,
    paddingHorizontal: 17,
  },
  openButtonPressed: {
    backgroundColor: palette.amberPressed,
    transform: [{ scale: 0.995 }],
  },
  openIcon: {
    alignItems: 'center',
    borderColor: palette.ink,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  openArrow: {
    color: palette.ink,
    fontFamily: type.data,
    fontSize: 23,
    lineHeight: 25,
  },
  openCopy: {
    flex: 1,
    marginHorizontal: 15,
  },
  openTitle: {
    color: palette.ink,
    fontFamily: type.display,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.15,
  },
  openTitleCompact: {
    fontSize: 20,
  },
  openFormats: {
    color: palette.ink,
    fontFamily: type.data,
    fontSize: 9,
    letterSpacing: 0.75,
    marginTop: 6,
    opacity: 0.72,
  },
  openAction: {
    color: palette.ink,
    fontFamily: type.data,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  massStorageButton: {
    alignItems: 'center',
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    marginTop: 12,
    minHeight: 108,
    paddingHorizontal: 17,
    paddingVertical: 14,
  },
  massStorageButtonPressed: {
    backgroundColor: palette.panelRaised,
    borderColor: palette.sky,
  },
  massStorageButtonDisabled: {
    opacity: 0.65,
  },
  massStorageIcon: {
    alignItems: 'center',
    borderColor: palette.sky,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  massStorageArrow: {
    color: palette.sky,
    fontFamily: type.data,
    fontSize: 21,
    lineHeight: 24,
  },
  massStorageCopy: {
    flex: 1,
    flexShrink: 1,
    marginHorizontal: 15,
  },
  massStorageTitle: {
    color: palette.mist,
    fontFamily: type.display,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.1,
    lineHeight: 22,
  },
  massStorageTitleCompact: {
    fontSize: 17,
    lineHeight: 20,
  },
  massStorageInstructions: {
    color: palette.muted,
    fontFamily: type.body,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  massStorageAction: {
    color: palette.sky,
    flexShrink: 0,
    fontFamily: type.data,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  instrumentStrip: {
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    borderLeftColor: palette.line,
    borderLeftWidth: 1,
    borderRightColor: palette.line,
    borderRightWidth: 1,
    flexDirection: 'row',
    marginBottom: 45,
  },
  instrumentStripCompact: {
    flexDirection: 'column',
  },
  instrumentCell: {
    flex: 1,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  instrumentCellBorder: {
    borderLeftColor: palette.line,
    borderLeftWidth: 1,
  },
  instrumentLabel: {
    color: palette.sky,
    fontFamily: type.data,
    fontSize: 9,
    letterSpacing: 1.35,
  },
  instrumentValue: {
    color: palette.mist,
    fontFamily: type.body,
    fontSize: 14,
    marginTop: 8,
  },
  sectionHeading: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  sectionTitle: {
    color: palette.mist,
    fontFamily: type.display,
    fontSize: 24,
    fontWeight: '700',
  },
  sectionMeta: {
    color: palette.muted,
    fontFamily: type.data,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  emptyState: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 190,
    padding: 22,
  },
  traceLine: {
    backgroundColor: palette.line,
    height: 1,
    marginBottom: 31,
    marginTop: 8,
    width: '100%',
  },
  tracePulse: {
    alignSelf: 'center',
    backgroundColor: palette.sky,
    height: 1,
    transform: [{ rotate: '-28deg' }],
    width: 30,
  },
  emptyTitle: {
    color: palette.mist,
    fontFamily: type.display,
    fontSize: 20,
    fontWeight: '700',
  },
  emptyCopy: {
    color: palette.muted,
    fontFamily: type.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 460,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 28,
  },
  footerText: {
    color: palette.muted,
    fontFamily: type.data,
    fontSize: 8,
    letterSpacing: 0.9,
  },
  footerSubtext: {
    color: palette.muted,
    fontFamily: type.body,
    fontSize: 10,
    marginTop: 5,
  },
  legalLink: {
    color: palette.amber,
    fontFamily: type.data,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.75,
  },
});
