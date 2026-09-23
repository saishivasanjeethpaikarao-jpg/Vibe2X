import React, { useCallback, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  Keyboard,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, ExternalLink, User } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { Gender } from '../services/LibraryService';
import { useLibrary } from '../hooks/useLibrary';
import { LibraryService } from '../services/LibraryService';

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

/** Product settings. Detailed attribution lives one tap away in Legal & Credits. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { profile, saveProfile, history, playlists, liked, settings, updateSettings } = useLibrary();

  const [name, setName] = useState(profile.name);

  const handleExport = async () => {
    try {
      const data = LibraryService.getBackup();
      const uri = FileSystem.documentDirectory + 'vibe2x_backup.json';
      await FileSystem.writeAsStringAsync(uri, data);
      await Sharing.shareAsync(uri, { mimeType: 'application/json' });
    } catch (e) {
      console.warn('Export failed', e);
    }
  };

  const commitName = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed !== profile.name) saveProfile({ name: trimmed });
    Keyboard.dismiss();
  }, [name, profile.name, saveProfile]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SIZES.sm }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft color={COLORS.text.primary} size={26} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + SIZES.xxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Profile ---- */}
        <Text style={styles.sectionLabel}>PROFILE</Text>

        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <User color={COLORS.text.secondary} size={28} />
            </View>
            <View style={styles.avatarText}>
              <Text style={styles.avatarName} numberOfLines={1}>
                {profile.name || 'No name set'}
              </Text>
              <Text style={styles.avatarMeta}>
                {GENDERS.find((g) => g.value === profile.gender)?.label}
              </Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            onBlur={commitName}
            onSubmitEditing={commitName}
            placeholder="Your name"
            placeholderTextColor={COLORS.text.secondary}
            returnKeyType="done"
            maxLength={40}
          />

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>GENDER</Text>
          <View style={styles.pillRow}>
            {GENDERS.map((option) => {
              const active = profile.gender === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.pill, active && styles.pillActive]}
                  activeOpacity={0.8}
                  onPress={() => saveProfile({ gender: option.value })}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ---- Library stats ---- */}
        <Text style={styles.sectionLabel}>YOUR LIBRARY</Text>
        <View style={styles.card}>
          <View style={styles.statsRow}>
            <Stat value={liked.length} label="Liked" />
            <Stat value={playlists.length} label="Playlists" />
            <Stat value={history.length} label="Listens" />
          </View>
        </View>

        {/* ---- Playback ---- */}
        <Text style={styles.sectionLabel}>PLAYBACK</Text>
        <View style={styles.card}>
          <View style={[styles.infoRow, styles.smartContinueRow]}>
            <View style={styles.smartContinueText}>
              <Text style={styles.rowValue}>Smart Continue</Text>
              <Text style={styles.infoDescription}>Prepare related tracks while music plays, after your Up Next songs</Text>
            </View>
            <Switch
              value={settings.autoplayRelated}
              onValueChange={(value) => updateSettings({ autoplayRelated: value })}
              accessibilityLabel="Smart Continue"
              accessibilityHint="Adds related songs after your manual Up Next and playlist tracks"
            />
          </View>
        </View>

        {/* ---- Data ---- */}
        <Text style={styles.sectionLabel}>DATA</Text>
        <View style={styles.card}>
          <LinkRow label="Export backup" onPress={handleExport} />
        </View>

        <Text style={styles.sectionLabel}>PRIVACY</Text>
        <View style={styles.card}>
          <Text style={styles.infoDescription}>
            Your library, listening history, and settings are stored on this device. No Vibe2X account is required.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <NavigationRow label="About Vibe2X" onPress={() => navigation.navigate('AboutVibe2X' as never)} />
        </View>

      </ScrollView>
    </View>
  );
}

const Stat: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const LinkRow: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={onPress}>
    <Text style={styles.rowLink}>{label}</Text>
    <ExternalLink color={COLORS.text.secondary} size={16} />
  </TouchableOpacity>
);

const NavigationRow: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={onPress} accessibilityRole="button">
    <Text style={styles.rowLink}>{label}</Text>
    <ChevronRight color={COLORS.text.secondary} size={19} />
  </TouchableOpacity>
);

const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.md,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 26,
    color: COLORS.text.primary,
  },
  sectionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 10,
    letterSpacing: 2.5,
    color: COLORS.text.secondary,
    marginTop: SIZES.lg,
    marginBottom: SIZES.sm,
    marginHorizontal: SIZES.md,
  },
  card: {
    marginHorizontal: SIZES.md,
    padding: SIZES.md,
    borderRadius: SIZES.radius.md,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.md,
    marginBottom: SIZES.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  avatarText: {
    flex: 1,
  },
  avatarName: {
    fontFamily: FONTS.medium,
    fontSize: 18,
    color: COLORS.text.primary,
  },
  avatarMeta: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  fieldLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.text.secondary,
    marginBottom: SIZES.sm,
  },
  fieldLabelSpaced: {
    marginTop: SIZES.lg,
  },
  input: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
  },
  pill: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radius.pill,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.surfaceLight,
  },
  pillActive: {
    backgroundColor: COLORS.text.primary,
    borderColor: COLORS.text.primary,
  },
  pillText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  pillTextActive: {
    color: COLORS.background,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.text.primary,
  },
  statLabel: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SIZES.sm + 2,
  },
  rowLabel: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.text.secondary,
  },
  rowValue: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
  },
  rowLink: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text.primary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.glassBorder,
  },
  legalTitle: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    marginBottom: SIZES.sm,
  },
  legalBody: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.text.secondary,
    marginBottom: SIZES.sm,
  },
  infoRow: {
    paddingVertical: SIZES.sm,
  },
  smartContinueRow: { flexDirection: 'row', alignItems: 'center' },
  smartContinueText: { flex: 1, paddingRight: SIZES.md },
  infoDescription: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 4,
  },
});
