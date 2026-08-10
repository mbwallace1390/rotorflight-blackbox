import React from 'react';
import { StyleSheet, View } from 'react-native';

import { palette } from '../theme';

export function RotorMark(): React.JSX.Element {
  return (
    <View accessibilityElementsHidden style={styles.mark}>
      <View style={styles.disc} />
      <View style={styles.primaryBlade} />
      <View style={styles.secondaryBlade} />
      <View style={styles.traceLeft} />
      <View style={styles.traceRise} />
      <View style={styles.traceFall} />
      <View style={styles.traceRight} />
      <View style={styles.hub} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    height: 46,
    justifyContent: 'center',
    width: 64,
  },
  disc: {
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    position: 'absolute',
    width: 40,
  },
  primaryBlade: {
    backgroundColor: palette.mist,
    borderRadius: 1,
    height: 2,
    position: 'absolute',
    transform: [{ rotate: '-18deg' }],
    width: 58,
  },
  secondaryBlade: {
    backgroundColor: palette.line,
    height: 2,
    position: 'absolute',
    transform: [{ rotate: '72deg' }],
    width: 32,
  },
  hub: {
    backgroundColor: palette.amber,
    borderColor: palette.ink,
    borderRadius: 4,
    borderWidth: 2,
    height: 8,
    width: 8,
  },
  traceLeft: {
    backgroundColor: palette.sky,
    height: 2,
    left: 4,
    position: 'absolute',
    top: 30,
    width: 20,
  },
  traceRise: {
    backgroundColor: palette.sky,
    height: 2,
    left: 21,
    position: 'absolute',
    top: 25,
    transform: [{ rotate: '-55deg' }],
    width: 13,
  },
  traceFall: {
    backgroundColor: palette.sky,
    height: 2,
    left: 29,
    position: 'absolute',
    top: 27,
    transform: [{ rotate: '45deg' }],
    width: 16,
  },
  traceRight: {
    backgroundColor: palette.sky,
    height: 2,
    left: 42,
    position: 'absolute',
    top: 30,
    width: 18,
  },
});
