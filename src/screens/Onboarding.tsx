import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FONTS, SIZES, THEME } from '../constants/theme';

type RootStackParamList = { Main: undefined; TasteSetup: undefined };

/** The real production mark is animated by the readiness overlay above this route. */
export default function OnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + SIZES.xl, paddingBottom: insets.bottom + SIZES.lg }]}>
      <View style={styles.markBlock}>
        <Image source={require('../../assets/icon.png')} style={styles.mark} accessibilityLabel="Vibe2X logo" />
        <Text style={styles.name}>Vibe2X</Text>
        <Text style={styles.message}>Find your vibe.{'\n'}Play it your way.</Text>
      </View>
      <View style={styles.actionBlock}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.replace('TasteSetup')}
          accessibilityRole="button"
          accessibilityLabel="Get started with Vibe2X"
        >
          <Text style={styles.buttonText}>Get Started</Text>
          <ArrowRight size={21} color={THEME.text.inverse} />
        </TouchableOpacity>
        <Text style={styles.note}>No account required.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.background.primary, paddingHorizontal: SIZES.lg, justifyContent: 'space-between' },
  markBlock: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 132, height: 132, borderRadius: 29 },
  name: { fontFamily: FONTS.bold, fontSize: 38, color: THEME.text.primary, marginTop: SIZES.lg, letterSpacing: -0.7 },
  message: { fontFamily: FONTS.regular, fontSize: 20, lineHeight: 29, color: THEME.text.secondary, textAlign: 'center', marginTop: SIZES.md },
  actionBlock: { alignItems: 'center' },
  button: { width: '100%', minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SIZES.sm, borderRadius: SIZES.radius.pill, backgroundColor: THEME.text.primary },
  buttonText: { fontFamily: FONTS.medium, fontSize: 17, color: THEME.text.inverse },
  note: { fontFamily: FONTS.regular, fontSize: 13, color: THEME.text.secondary, marginTop: SIZES.md },
});
