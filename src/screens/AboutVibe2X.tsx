import React from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react-native';
import { FONTS, SIZES, THEME } from '../constants/theme';
import { version as sourceVersion } from '../../package.json';

const REPO_URL = 'https://github.com/saishivasanjeethpaikarao-jpg/Vibe2X';

export default function AboutVibe2XScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? sourceVersion;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + SIZES.sm, paddingBottom: insets.bottom + SIZES.xl }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to settings">
          <ChevronLeft size={26} color={THEME.text.primary} />
        </TouchableOpacity>
        <View style={styles.hero}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} accessibilityLabel="Vibe2X logo" />
          <Text style={styles.title}>Vibe2X</Text>
          <Text style={styles.subtitle}>Find your vibe. Play it your way.</Text>
          <Text style={styles.version}>Version {version}</Text>
        </View>
        <Text style={styles.caption}>Open-source music for your own library and listening flow.</Text>
        <TouchableOpacity style={styles.row} onPress={() => void Linking.openURL(REPO_URL)} accessibilityRole="link" accessibilityLabel="Open Vibe2X source code">
          <Text style={styles.rowText}>Source code</Text>
          <ExternalLink size={18} color={THEME.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('LegalCredits' as never)} accessibilityRole="button" accessibilityLabel="Open Legal and Credits">
          <Text style={styles.rowText}>Legal & Credits</Text>
          <ChevronRight size={20} color={THEME.text.secondary} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.background.primary },
  content: { flexGrow: 1, paddingHorizontal: SIZES.md },
  back: { width: 48, height: 48, justifyContent: 'center' },
  hero: { alignItems: 'center', marginTop: SIZES.xl, marginBottom: SIZES.xxl },
  logo: { width: 100, height: 100, borderRadius: 22 },
  title: { fontFamily: FONTS.bold, fontSize: 32, color: THEME.text.primary, marginTop: SIZES.md },
  subtitle: { fontFamily: FONTS.regular, fontSize: 15, color: THEME.text.secondary, marginTop: SIZES.xs },
  version: { fontFamily: FONTS.medium, fontSize: 12, color: THEME.text.secondary, marginTop: SIZES.lg },
  caption: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: THEME.text.secondary, marginBottom: SIZES.lg },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME.border.glass },
  rowText: { fontFamily: FONTS.medium, fontSize: 16, color: THEME.text.primary },
});
