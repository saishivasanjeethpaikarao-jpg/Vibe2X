import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { FavoriteArtistSelector, LanguageSelector } from '../components/TasteSelectors';
import { useLibrary } from '../hooks/useLibrary';
import { FONTS, SIZES, THEME } from '../constants/theme';

export default function MusicPreferencesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { settings, saveMusicPreferences } = useLibrary();
  const [languages, setLanguages] = useState(settings.musicPreferences.languages);
  const [artists, setArtists] = useState(settings.musicPreferences.favoriteArtists);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await saveMusicPreferences({ languages, favoriteArtists: artists, onboardingCompleted: true }); navigation.goBack(); }
    catch { Alert.alert('Could not save preferences', 'Please try again.'); }
    finally { setSaving(false); }
  };
  return <View style={[styles.root, { paddingTop: insets.top + SIZES.sm, paddingBottom: insets.bottom + SIZES.md }]}>
    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityLabel="Back to Settings"><ChevronLeft size={27} color={THEME.text.primary} /><Text style={styles.backText}>Music Preferences</Text></TouchableOpacity>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your languages</Text><Text style={styles.description}>Suggestions, not limits. Your current song still leads.</Text>
      <LanguageSelector value={languages} onChange={setLanguages} />
      <Text style={[styles.title, styles.artistHeading]}>Favorite artists</Text>
      <Text style={styles.description}>Search and select artists you enjoy.</Text>
      <FavoriteArtistSelector value={artists} onChange={setArtists} languages={languages} />
    </ScrollView>
    <TouchableOpacity style={styles.save} onPress={() => void save()} disabled={saving} accessibilityRole="button" accessibilityLabel="Save music preferences"><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save preferences'}</Text></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.background.primary, paddingHorizontal: SIZES.lg },
  back: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm }, backText: { color: THEME.text.primary, fontFamily: FONTS.bold, fontSize: 22 },
  content: { paddingTop: SIZES.lg, paddingBottom: SIZES.xl }, title: { color: THEME.text.primary, fontFamily: FONTS.bold, fontSize: 24 },
  artistHeading: { marginTop: SIZES.xxl }, description: { color: THEME.text.secondary, fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, marginTop: SIZES.sm },
  save: { minHeight: 54, borderRadius: SIZES.radius.pill, backgroundColor: THEME.text.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: THEME.text.inverse, fontFamily: FONTS.medium, fontSize: 16 },
});
