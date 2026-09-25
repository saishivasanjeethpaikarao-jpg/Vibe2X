import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';
import { FavoriteArtistSelector, LanguageSelector } from '../components/TasteSelectors';
import { FavoriteArtist } from '../core/musicPreferences';
import { useLibrary } from '../hooks/useLibrary';
import { FONTS, SIZES, THEME } from '../constants/theme';

export default function TasteSetupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<{ ProfileSetup: undefined }>>();
  const insets = useSafeAreaInsets();
  const { saveMusicPreferences } = useLibrary();
  const [step, setStep] = useState<'languages' | 'artists'>('languages');
  const [languages, setLanguages] = useState<string[]>([]);
  const [artists, setArtists] = useState<FavoriteArtist[]>([]);
  const [saving, setSaving] = useState(false);

  const finish = async (selectedArtists = artists) => {
    if (saving) return;
    setSaving(true);
    try {
      await saveMusicPreferences({ languages, favoriteArtists: selectedArtists, onboardingCompleted: true });
      navigation.replace('ProfileSetup');
    } catch {
      Alert.alert('Could not save preferences', 'Please try again.');
    } finally { setSaving(false); }
  };

  return <View style={[styles.root, { paddingTop: insets.top + SIZES.xl, paddingBottom: insets.bottom + SIZES.lg }]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.kicker}>YOUR MUSIC · {step === 'languages' ? '1 OF 2' : '2 OF 2'}</Text>
      <Text style={styles.title}>{step === 'languages' ? 'What do you listen to?' : 'Pick some artists you love'}</Text>
      <Text style={styles.subtitle}>{step === 'languages'
        ? 'Choose the languages you enjoy. You can change this anytime.'
        : 'This helps Vibe2X understand your taste from day one. Choose a few, or skip.'}</Text>
      {step === 'languages' ? <LanguageSelector value={languages} onChange={setLanguages} />
        : <FavoriteArtistSelector value={artists} onChange={setArtists} languages={languages} />}
    </ScrollView>
    <View style={styles.actions}>
      <TouchableOpacity style={styles.skip} onPress={() => step === 'languages' ? setStep('artists') : void finish([])} disabled={saving}
        accessibilityRole="button" accessibilityLabel={`Skip ${step}`}><Text style={styles.skipText}>Skip</Text></TouchableOpacity>
      <TouchableOpacity style={styles.continue} onPress={() => step === 'languages' ? setStep('artists') : void finish()} disabled={saving}
        accessibilityRole="button" accessibilityLabel={step === 'languages' ? 'Continue to artists' : 'Finish music taste setup'}>
        <Text style={styles.continueText}>{saving ? 'Saving…' : 'Continue'}</Text><ArrowRight size={19} color={THEME.text.inverse} />
      </TouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.background.primary, paddingHorizontal: SIZES.lg },
  content: { paddingBottom: SIZES.lg }, kicker: { color: THEME.accent.secondary, fontFamily: FONTS.medium, letterSpacing: 2, fontSize: 11, marginBottom: SIZES.lg },
  title: { color: THEME.text.primary, fontFamily: FONTS.bold, fontSize: 33, lineHeight: 40 },
  subtitle: { color: THEME.text.secondary, fontFamily: FONTS.regular, fontSize: 16, lineHeight: 23, marginTop: SIZES.sm, marginBottom: SIZES.xl },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SIZES.md, paddingTop: SIZES.md },
  skip: { minWidth: 72, minHeight: 52, justifyContent: 'center', alignItems: 'center' }, skipText: { color: THEME.text.secondary, fontFamily: FONTS.medium, fontSize: 16 },
  continue: { flex: 1, minHeight: 54, borderRadius: SIZES.radius.pill, backgroundColor: THEME.text.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: SIZES.sm },
  continueText: { color: THEME.text.inverse, fontFamily: FONTS.medium, fontSize: 16 },
});
