import React, { useCallback } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, type } from '../theme';

export const UPSTREAM_SOURCE_URL =
  'https://github.com/rotorflight/rotorflight-blackbox';
export const DISTRIBUTION_SOURCE_URL =
  'https://github.com/mbwallace1390/rotorflight-blackbox';

type LegalScreenProps = {
  onClose: () => void;
};

type SourceLinkProps = {
  label: string;
  url: string;
};

function SourceLink({ label, url }: SourceLinkProps): React.JSX.Element {
  const handleOpen = useCallback(async () => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Unable to open link',
        'The address is shown below so you can open it another way.',
      );
    }
  }, [url]);

  return (
    <Pressable
      accessibilityHint={`Open ${url} in your browser`}
      accessibilityRole="link"
      onPress={handleOpen}
      style={({ pressed }) => [styles.linkCard, pressed && styles.linkPressed]}
    >
      <Text style={styles.linkLabel}>{label}</Text>
      <Text selectable style={styles.linkUrl}>
        {url}
      </Text>
      <Text accessibilityElementsHidden style={styles.linkArrow}>
        ↗
      </Text>
    </Pressable>
  );
}

export function LegalScreen({ onClose }: LegalScreenProps): React.JSX.Element {
  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left', 'right']}
      style={styles.safe}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>ROTORLENS</Text>
          <Text accessibilityRole="header" style={styles.title}>
            About & legal
          </Text>
        </View>
        <Pressable
          accessibilityHint="Return to the RotorLens home screen"
          accessibilityLabel="Close About and legal"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.closeButtonPressed,
          ]}
        >
          <Text style={styles.closeText}>CLOSE</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.callout}>
          <Text style={styles.calloutLabel}>UNOFFICIAL PROJECT</Text>
          <Text style={styles.calloutText}>
            RotorLens is an unofficial mobile viewer compatible with
            Rotorflight. It is not affiliated with or endorsed by the
            Rotorflight project.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Open-source foundation</Text>
          <Text style={styles.body}>
            RotorLens is based on Rotorflight Blackbox Explorer under the GNU
            General Public License, version 3 (GPLv3). Original copyrights
            remain with its contributors.
          </Text>
          <Text style={styles.body}>
            Mobile adaptation and additions © 2026 Michael Wallace.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Source code</Text>
          <Text style={styles.body}>
            The public distribution source and the original upstream project are
            available below. Each public binary release must identify its exact
            source tag or commit in the release notes.
          </Text>
          <View style={styles.links}>
            <SourceLink
              label="ROTORLENS DISTRIBUTION SOURCE"
              url={DISTRIBUTION_SOURCE_URL}
            />
            <SourceLink
              label="ORIGINAL UPSTREAM PROJECT"
              url={UPSTREAM_SOURCE_URL}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Licenses & notices</Text>
          <Text style={styles.body}>
            The complete GPLv3 license, modification notice, Apache 2.0 text,
            and third-party notices are bundled with this application as
            LICENSE, NOTICE.md, legal/APACHE-2.0.txt, and
            THIRD_PARTY_NOTICES.md.
          </Text>
        </View>

        <View style={[styles.section, styles.warrantySection]}>
          <Text style={styles.warrantyTitle}>NO WARRANTY</Text>
          <Text style={styles.body}>
            This software is provided without warranty, to the extent permitted
            by applicable law. Review flight data carefully and validate any
            configuration change safely before flight.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: palette.ink,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 82,
    paddingHorizontal: 22,
  },
  kicker: {
    color: palette.amber,
    fontFamily: type.data,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  title: {
    color: palette.mist,
    fontFamily: type.display,
    fontSize: 27,
    fontWeight: '800',
    marginTop: 3,
  },
  closeButton: {
    borderColor: palette.line,
    borderRadius: 4,
    borderWidth: 1,
    minHeight: 44,
    minWidth: 66,
    paddingHorizontal: 13,
    justifyContent: 'center',
  },
  closeButtonPressed: {
    backgroundColor: palette.panelRaised,
  },
  closeText: {
    color: palette.mist,
    fontFamily: type.data,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
    textAlign: 'center',
  },
  content: {
    alignSelf: 'center',
    maxWidth: 760,
    paddingBottom: 38,
    paddingHorizontal: 22,
    paddingTop: 26,
    width: '100%',
  },
  callout: {
    backgroundColor: palette.panel,
    borderLeftColor: palette.amber,
    borderLeftWidth: 4,
    borderRadius: 5,
    padding: 19,
  },
  calloutLabel: {
    color: palette.amber,
    fontFamily: type.data,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.45,
  },
  calloutText: {
    color: palette.mist,
    fontFamily: type.body,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
  },
  section: {
    borderBottomColor: palette.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 25,
  },
  sectionTitle: {
    color: palette.mist,
    fontFamily: type.display,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  body: {
    color: palette.muted,
    fontFamily: type.body,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 7,
  },
  links: {
    gap: 10,
    marginTop: 18,
  },
  linkCard: {
    backgroundColor: palette.panel,
    borderColor: palette.line,
    borderRadius: 5,
    borderWidth: 1,
    minHeight: 76,
    paddingHorizontal: 15,
    paddingRight: 47,
    paddingVertical: 13,
    position: 'relative',
  },
  linkPressed: {
    backgroundColor: palette.panelRaised,
    borderColor: palette.sky,
  },
  linkLabel: {
    color: palette.sky,
    fontFamily: type.data,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.05,
  },
  linkUrl: {
    color: palette.mist,
    fontFamily: type.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
  linkArrow: {
    color: palette.amber,
    fontFamily: type.data,
    fontSize: 19,
    position: 'absolute',
    right: 16,
    top: 27,
  },
  warrantySection: {
    borderBottomWidth: 0,
  },
  warrantyTitle: {
    color: palette.danger,
    fontFamily: type.data,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
