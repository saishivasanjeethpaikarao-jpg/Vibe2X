import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import { COLORS, FONTS, SIZES, THEME } from '../constants/theme';
import { useLibrary } from '../hooks/useLibrary';
import { useOfflineDownloads } from '../hooks/useOfflineDownloads';
import { downloadManager, offlineMediaService } from '../offline/runtime';
import { useSnackbar } from '../components/common/SnackbarContext';

const formatBytes = (bytes: number) => bytes >= 1024 * 1024 * 1024
  ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
  : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export default function DownloadsStorageScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { settings, updateSettings } = useLibrary();
  const { records, completed, storageUsed } = useOfflineDownloads();
  const { show } = useSnackbar();
  const [paused, setPaused] = useState(downloadManager.isPaused);
  const busy = records.some((record) => record.status === 'downloading' || record.status === 'queued');

  const clearDownloads = () => Alert.alert('Clear downloads?',
    'This removes offline copies only. Your playlists and Liked Songs stay intact.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear downloads', style: 'destructive', onPress: () => {
        void downloadManager.cancelAll().then(() => offlineMediaService.clear())
          .then(() => show('Offline copies removed'))
          .catch(() => show('Could not remove every offline copy'));
      } },
    ]);

  return <View style={[styles.container, { paddingTop: insets.top + SIZES.sm }]}>
    <View style={styles.header}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to Settings"><ChevronLeft color={COLORS.text.primary} size={26} /></TouchableOpacity>
      <Text style={styles.title}>Downloads & Storage</Text>
    </View>
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SIZES.xxl }}>
      <View style={styles.group}>
        <View style={styles.row}><View style={styles.copy}><Text style={styles.label}>Wi-Fi only</Text><Text style={styles.detail}>Future eligible downloads use Wi-Fi.</Text></View><Switch value={settings.wifiOnlyDownloads} onValueChange={(value) => updateSettings({ wifiOnlyDownloads: value })} accessibilityLabel="Wi-Fi only downloads" /></View>
        <View style={styles.row}><View style={styles.copy}><Text style={styles.label}>Offline mode</Text><Text style={styles.detail}>Play local and valid downloaded files only.</Text></View><Switch value={settings.offlineMode} onValueChange={(value) => updateSettings({ offlineMode: value })} accessibilityLabel="Offline mode" /></View>
      </View>
      <View style={styles.group}>
        <View style={styles.row}><Text style={styles.label}>Downloaded songs</Text><Text style={styles.value}>{completed.length}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Storage used</Text><Text style={styles.value}>{formatBytes(storageUsed)}</Text></View>
      </View>
      <Text style={styles.section}>Manage downloads</Text>
      {records.length === 0 && <Text style={styles.empty}>No app-managed downloads yet. Local files are already available offline. YouTube songs remain streaming only.</Text>}
      {records.map((record) => <View key={record.trackId} style={styles.record}>
        <View style={styles.copy}><Text style={styles.label} numberOfLines={1}>{record.title ?? record.trackId}</Text><Text style={styles.detail}>{record.status === 'completed' ? `${formatBytes(record.fileSize ?? 0)} • Available offline` : record.status === 'downloading' ? `${record.totalBytes ? Math.round((record.bytesWritten ?? 0) / record.totalBytes * 100) + '% • ' : ''}Downloading…` : record.status}</Text></View>
        {record.status === 'downloading' || record.status === 'queued'
          ? <TouchableOpacity onPress={() => downloadManager.cancel(record.trackId)} accessibilityRole="button" accessibilityLabel={`Cancel ${record.trackId} download`}><Text style={styles.action}>Cancel</Text></TouchableOpacity>
          : record.status === 'completed'
            ? <TouchableOpacity onPress={() => void offlineMediaService.remove(record.trackId).then(() => show('Offline copy removed'))} accessibilityRole="button" accessibilityLabel={`Remove ${record.trackId} offline copy`}><Trash2 color={COLORS.text.secondary} size={20} /></TouchableOpacity>
            : record.track && <TouchableOpacity onPress={() => void downloadManager.download([record.track!]).then((summary) => show(summary.failed ? 'Download failed' : summary.cancelled ? 'Download cancelled' : 'Available offline')).catch(() => show('Could not start download'))} accessibilityRole="button" accessibilityLabel={`Retry ${record.title ?? record.trackId} download`}><Text style={styles.action}>Retry</Text></TouchableOpacity>}
      </View>)}
      {busy && !paused && <TouchableOpacity style={styles.control} onPress={() => { downloadManager.pause(); setPaused(true); }} accessibilityRole="button"><Text style={styles.action}>Pause queued downloads</Text></TouchableOpacity>}
      {busy && paused && <TouchableOpacity style={styles.control} onPress={() => { downloadManager.resume(); setPaused(false); }} accessibilityRole="button"><Text style={styles.action}>Resume downloads</Text></TouchableOpacity>}
      {completed.length > 0 && <TouchableOpacity style={styles.control} onPress={clearDownloads} accessibilityRole="button"><Text style={styles.action}>Clear downloads</Text></TouchableOpacity>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background.primary, paddingHorizontal: SIZES.md },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SIZES.lg },
  back: { width: 48, height: 48, justifyContent: 'center' },
  title: { fontFamily: FONTS.bold, fontSize: 24, color: COLORS.text.primary },
  group: { backgroundColor: THEME.background.elevated, borderRadius: SIZES.radius.md, marginBottom: SIZES.lg, paddingHorizontal: SIZES.md },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME.border.glass },
  copy: { flex: 1 },
  label: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.text.primary },
  detail: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.text.secondary, marginTop: 3 },
  value: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.text.secondary },
  section: { fontFamily: FONTS.medium, fontSize: 16, color: COLORS.text.primary, marginBottom: SIZES.sm },
  empty: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: COLORS.text.secondary, marginBottom: SIZES.lg },
  record: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SIZES.md, paddingVertical: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME.border.glass },
  action: { fontFamily: FONTS.medium, fontSize: 14, color: THEME.accent.secondary },
  control: { minHeight: 48, justifyContent: 'center' },
});
