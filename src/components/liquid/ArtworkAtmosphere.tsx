import React from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { THEME } from '../../constants/theme';

type Props = { artworkUrl?: string; intensity?: 'quiet' | 'hero' };

/** Cached artwork decode plus fixed dimming; controls never depend on image availability. */
export const ArtworkAtmosphere = React.memo(function ArtworkAtmosphere({
  artworkUrl,
  intensity = 'quiet',
}: Props) {
  const lowCostAndroid = Platform.OS === 'android' && Number(Platform.Version) < 31;
  const blurRadius = lowCostAndroid ? 0 : intensity === 'hero' ? 44 : 64;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {artworkUrl ? (
        <Image
          source={{ uri: artworkUrl }}
          style={[StyleSheet.absoluteFill, intensity === 'hero' ? styles.heroImage : styles.quietImage]}
          blurRadius={blurRadius}
          resizeMode="cover"
        />
      ) : null}
      <LinearGradient
        colors={['rgba(112, 0, 255, 0.16)', 'rgba(208, 0, 255, 0.07)', THEME.background.primary]}
        locations={[0, 0.38, 0.82]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, intensity === 'hero' ? styles.heroDim : styles.quietDim]} />
    </View>
  );
});

const styles = StyleSheet.create({
  heroImage: { opacity: 0.42, transform: [{ scale: 1.16 }] },
  quietImage: { opacity: 0.18, transform: [{ scale: 1.12 }] },
  heroDim: { backgroundColor: 'rgba(7, 7, 8, 0.46)' },
  quietDim: { backgroundColor: 'rgba(7, 7, 8, 0.68)' },
});
