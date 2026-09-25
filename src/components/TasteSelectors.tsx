import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Search } from 'lucide-react-native';
import { ArtistResult } from '../core/types';
import { FavoriteArtist, LANGUAGE_CHOICES, toggleFavoriteArtist, toggleLanguage } from '../core/musicPreferences';
import { MusicService } from '../services/MusicService';
import { FONTS, SIZES, THEME } from '../constants/theme';

export function LanguageSelector({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  return <View style={styles.chips}>{LANGUAGE_CHOICES.map((language) => {
    const selected = value.includes(language);
    return <TouchableOpacity key={language} style={[styles.chip, selected && styles.selected]} onPress={() => onChange(toggleLanguage(value, language))}
      accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={language}>
      <Text style={[styles.chipText, selected && styles.selectedText]}>{language}</Text>{selected && <Check size={15} color={THEME.text.primary} />}
    </TouchableOpacity>;
  })}</View>;
}

export function FavoriteArtistSelector({ value, onChange, languages }: {
  value: FavoriteArtist[]; onChange: (value: FavoriteArtist[]) => void; languages: string[];
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ArtistResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const term = query.trim() || (languages.length ? `${languages[0]} music artists` : 'music artists');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError(false);
      void MusicService.search(term, { filter: 'Artists', limit: 12, signal: controller.signal })
        .then((response) => setResults(response.artists))
        .catch(() => { if (!controller.signal.aborted) setError(true); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, query.trim() ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, languages.join('|')]);

  const chosen = (artist: ArtistResult): boolean => value.some((item) => item.artistId === artist.id && item.provider === artist.provider);
  return <View>
    <View style={styles.search}><Search size={19} color={THEME.text.secondary} /><TextInput style={styles.input} value={query} onChangeText={setQuery}
      placeholder="Search any artist" placeholderTextColor={THEME.text.secondary} accessibilityLabel="Search artists" autoCorrect={false} /></View>
    {!!value.length && <Text style={styles.helper}>{value.length} selected · tap to remove</Text>}
    {!!value.length && <View style={styles.chips}>{value.map((artist) => <TouchableOpacity key={`${artist.provider}:${artist.artistId}`} style={[styles.chip, styles.selected]}
      onPress={() => onChange(toggleFavoriteArtist(value, artist))} accessibilityRole="checkbox" accessibilityState={{ checked: true }} accessibilityLabel={artist.name}>
      <Text style={styles.selectedText}>{artist.name}</Text><Check size={15} color={THEME.text.primary} />
    </TouchableOpacity>)}</View>}
    {loading && <ActivityIndicator color={THEME.accent.secondary} style={styles.loader} />}
    {error && <Text style={styles.helper}>Artists couldn't load. You can skip and add them later.</Text>}
    <ScrollView keyboardShouldPersistTaps="handled" style={styles.results} nestedScrollEnabled>
      {results.map((artist) => <TouchableOpacity key={`${artist.provider}:${artist.id}`} style={styles.artistRow} onPress={() => onChange(toggleFavoriteArtist(value, {
        artistId: artist.id, name: artist.name, provider: artist.provider, artwork: artist.imageUrl || undefined,
      }))} accessibilityRole="checkbox" accessibilityState={{ checked: chosen(artist) }} accessibilityLabel={artist.name}>
        {artist.imageUrl ? <Image source={{ uri: artist.imageUrl }} style={styles.artwork} /> : <View style={styles.artwork} />}
        <Text style={styles.artistName} numberOfLines={1}>{artist.name}</Text>
        {chosen(artist) && <Check size={20} color={THEME.accent.secondary} />}
      </TouchableOpacity>)}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginTop: SIZES.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: SIZES.md, borderWidth: 1, borderColor: THEME.border.glass, borderRadius: SIZES.radius.pill, backgroundColor: THEME.surface.interactive },
  selected: { backgroundColor: THEME.surface.selected, borderColor: THEME.accent.primary },
  chipText: { color: THEME.text.secondary, fontFamily: FONTS.medium, fontSize: 14 },
  selectedText: { color: THEME.text.primary, fontFamily: FONTS.medium, fontSize: 14 },
  search: { minHeight: 52, flexDirection: 'row', gap: SIZES.sm, alignItems: 'center', borderRadius: SIZES.radius.md, paddingHorizontal: SIZES.md, backgroundColor: THEME.surface.interactive, borderWidth: 1, borderColor: THEME.border.glass },
  input: { flex: 1, color: THEME.text.primary, fontFamily: FONTS.regular, fontSize: 16 },
  helper: { color: THEME.text.secondary, fontFamily: FONTS.regular, fontSize: 13, marginTop: SIZES.sm },
  loader: { margin: SIZES.md }, results: { maxHeight: 330, marginTop: SIZES.md },
  artistRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: SIZES.md, borderBottomWidth: 1, borderBottomColor: THEME.border.subtle },
  artwork: { width: 42, height: 42, borderRadius: 21, backgroundColor: THEME.surface.interactive },
  artistName: { flex: 1, color: THEME.text.primary, fontFamily: FONTS.medium, fontSize: 16 },
});
