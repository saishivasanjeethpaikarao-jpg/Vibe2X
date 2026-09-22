import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Check, ExternalLink, Link2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SIZES } from '../constants/theme';
import { messageFor } from '../core/errors';
import { useLibrary } from '../hooks/useLibrary';
import { playlistImportEngine } from '../features/playlistImport/runtime';
import { SpotifyAuthService } from '../features/playlistImport/spotifyAuth';
import {
  ImportProgress,
  PreparedImport,
  SourcePlaylist,
  SpotifyTrackMatch,
} from '../features/playlistImport/types';

type ImportRoute = RouteProp<{ ImportPlaylist: { url?: string } | undefined }, 'ImportPlaylist'>;
type ImportNavigation = NativeStackNavigationProp<{
  ImportPlaylist: { url?: string } | undefined;
  Playlist: { playlistId: string };
}>;
type Phase = 'idle' | 'fetching' | 'matching' | 'preview' | 'review' | 'saving' | 'success';
const SPOTIFY_LOGO = require('../../assets/spotify-full-logo-white.png');

export default function ImportPlaylistScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigation = useNavigation<ImportNavigation>();
  const route = useRoute<ImportRoute>();
  const { playlists, createImportedPlaylist } = useLibrary();
  const abortRef = useRef<AbortController | null>(null);

  const [url, setUrl] = useState(route.params?.url ?? '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [sourcePlaylist, setSourcePlaylist] = useState<SourcePlaylist | null>(null);
  const [matches, setMatches] = useState<SpotifyTrackMatch[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const parsed = useMemo(() => playlistImportEngine.detect(url), [url]);
  const collision = useMemo(
    () => (sourcePlaylist ? playlistImportEngine.collisionFor(sourcePlaylist, playlists) : null),
    [sourcePlaylist, playlists]
  );
  const nameTaken = useMemo(
    () =>
      playlists.some(
        (playlist) =>
          playlist.name.trim().toLocaleLowerCase() === playlistName.trim().toLocaleLowerCase()
      ),
    [playlistName, playlists]
  );
  const prepared = useMemo<PreparedImport | null>(() => {
    if (!sourcePlaylist) return null;
    return sourcePlaylist.source === 'spotify'
      ? playlistImportEngine.prepareSpotify(sourcePlaylist, matches)
      : playlistImportEngine.prepareYouTube(sourcePlaylist);
  }, [sourcePlaylist, matches]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const announcements: Partial<Record<Phase, string>> = {
      fetching: 'Loading playlist',
      matching: 'Matching playlist tracks',
      preview: 'Playlist import preview ready',
      review: 'Review playlist matches',
      saving: 'Saving playlist',
      success: 'Playlist imported',
    };
    const announcement = announcements[phase];
    if (announcement) AccessibilityInfo.announceForAccessibility(announcement);
  }, [phase]);

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('idle');
    setProgress(null);
    setSourcePlaylist(null);
    setMatches([]);
    setPlaylistName('');
    setError(null);
    setSavedId(null);
  };

  const startImport = async () => {
    if (!parsed || phase === 'fetching' || phase === 'matching') return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setSourcePlaylist(null);
    setMatches([]);
    setPhase('fetching');
    setProgress({ phase: 'fetching', loaded: 0 });

    try {
      const fetched = await playlistImportEngine.fetch(parsed, controller.signal, setProgress);
      if (controller.signal.aborted) return;
      setSourcePlaylist(fetched);
      const nextCollision = playlistImportEngine.collisionFor(fetched, playlists);
      setPlaylistName(nextCollision.suggestedName);

      if (fetched.source === 'spotify') {
        setPhase('matching');
        setProgress({ phase: 'matching', completed: 0, total: fetched.tracks.length });
        const resolved = await playlistImportEngine.matchSpotify(
          fetched,
          controller.signal,
          setProgress
        );
        if (controller.signal.aborted) return;
        setMatches(resolved);
      }

      setPhase('preview');
    } catch (cause) {
      if (!controller.signal.aborted) setError(messageFor(cause));
      else setError('Import cancelled. Nothing was saved.');
      setPhase('idle');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const cancelActive = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
    setSourcePlaylist(null);
    setMatches([]);
    setPlaylistName('');
    setError('Import cancelled. Nothing was saved.');
    setPhase('idle');
  };

  const setMatchChoice = (key: string, trackId: string | null) => {
    setMatches((current) =>
      current.map((match) => {
        if (match.source.key !== key) return match;
        const selected = trackId
          ? match.alternatives.find((candidate) => candidate.track.id === trackId)?.track ?? null
          : null;
        return { ...match, selectedTrack: selected, reviewed: true };
      })
    );
  };

  const save = () => {
    if (!sourcePlaylist || !prepared || !playlistName.trim() || nameTaken) return;
    if (prepared.needsReview > 0) {
      setPhase('review');
      return;
    }
    if (!prepared.tracks.length) {
      setError('No playable tracks are selected. Review matches before saving.');
      return;
    }

    setPhase('saving');
    try {
      const saved = createImportedPlaylist(
        playlistName,
        prepared.tracks,
        {
          provider: sourcePlaylist.source,
          browseId: sourcePlaylist.sourcePlaylistId,
          url: sourcePlaylist.sourcePlaylistUrl,
          importedAt: Date.now(),
        },
        {
          description: sourcePlaylist.description,
          creator:
            sourcePlaylist.source === 'spotify'
              ? `Spotify · ${sourcePlaylist.creator}`
              : sourcePlaylist.creator,
          // Spotify artwork is not copied or cropped. The resulting local
          // playlist uses artwork from its resolved playable Vibe2X track.
          coverImageUrl: prepared.tracks[0]?.albumImageUrl ?? '',
        },
        { allowSourceCopy: Boolean(collision?.sameSource) }
      );
      setSavedId(saved.id);
      setPhase('success');
    } catch (cause) {
      setError(messageFor(cause));
      setPhase('preview');
    }
  };

  const reviewItems = matches.filter((match) => match.confidence !== 'HIGH');
  const isWorking = phase === 'fetching' || phase === 'matching';
  const contentWidth = Math.min(Math.max(width - SIZES.lg * 2, 0), 680);

  const openSourceUrl = async () => {
    if (!sourcePlaylist) return;
    try {
      const canOpen = await Linking.canOpenURL(sourcePlaylist.sourcePlaylistUrl);
      if (!canOpen) throw new Error('Unsupported external URL');
      await Linking.openURL(sourcePlaylist.sourcePlaylistUrl);
    } catch {
      setError(`Couldn't open the original ${sourcePlaylist.source === 'spotify' ? 'Spotify' : 'YouTube'} playlist.`);
    }
  };

  const renderReviewItem = ({ item: match }: { item: SpotifyTrackMatch }) => (
    <View style={styles.reviewItem} accessibilityLabel={`${match.source.title} by ${match.source.artists.join(', ')}`}>
      <Text style={styles.reviewSourceTitle}>{match.source.title}</Text>
      <Text style={styles.reviewSourceArtist}>{match.source.artists.join(', ')}</Text>
      <Text style={styles.confidence}>{match.confidence.replace('_', ' ')}</Text>
      {match.alternatives.map((candidate) => {
        const selected = match.selectedTrack?.id === candidate.track.id && match.reviewed;
        return (
          <TouchableOpacity
            key={candidate.track.id}
            style={[styles.alternative, selected && styles.alternativeSelected]}
            onPress={() => setMatchChoice(match.source.key, candidate.track.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${candidate.track.title} by ${candidate.track.artist.name}, ${Math.round(candidate.score * 100)} percent match`}
          >
            <View style={styles.alternativeText}>
              <Text style={styles.alternativeTitle} numberOfLines={1}>
                {candidate.track.title}
              </Text>
              <Text style={styles.alternativeArtist} numberOfLines={1}>
                {candidate.track.artist.name} · {Math.round(candidate.score * 100)}%
              </Text>
            </View>
            {selected && <Check color={COLORS.accent.magenta} size={20} />}
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => setMatchChoice(match.source.key, null)}
        accessibilityRole="radio"
        accessibilityState={{ selected: match.reviewed && !match.selectedTrack }}
      >
        <Text style={styles.skipButtonText}>
          {match.reviewed && !match.selectedTrack ? 'Skipped' : 'Skip this track'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + SIZES.sm }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => (isWorking ? cancelActive() : navigation.goBack())}
          accessibilityLabel={isWorking ? 'Cancel import' : 'Go back'}
        >
          {isWorking ? (
            <X color={COLORS.text.primary} size={24} />
          ) : (
            <ChevronLeft color={COLORS.text.primary} size={26} />
          )}
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Import Playlist</Text>
        <View style={styles.iconButton} />
      </View>

      {phase === 'review' && sourcePlaylist ? (
        <FlatList
          data={reviewItems}
          keyExtractor={(match) => match.source.key}
          renderItem={renderReviewItem}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={8}
          windowSize={7}
          contentContainerStyle={[
            styles.content,
            styles.centeredContent,
            { paddingBottom: insets.bottom + SIZES.xxl, width: contentWidth },
          ]}
          ListHeaderComponent={
            <View>
              <Text style={styles.title}>Review matches</Text>
              <Text style={styles.body}>
                Choose a playable Vibe2X result or skip the track. Nothing is saved until you confirm.
              </Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity
              style={[styles.primaryButton, prepared?.needsReview ? styles.buttonDisabled : null]}
              onPress={() => setPhase('preview')}
              disabled={Boolean(prepared?.needsReview)}
            >
              <Text style={styles.primaryButtonText}>
                {prepared?.needsReview ? `Review ${prepared.needsReview} remaining` : 'Done reviewing'}
              </Text>
            </TouchableOpacity>
          }
        />
      ) : (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          styles.centeredContent,
          { paddingBottom: insets.bottom + SIZES.xxl, width: contentWidth },
        ]}
      >
        {phase === 'success' && prepared ? (
          <View style={styles.successBlock} accessibilityLiveRegion="polite">
            <View style={styles.successIcon}>
              <Check color={COLORS.background} size={28} strokeWidth={3} />
            </View>
            <Text style={styles.title}>Playlist imported</Text>
            <Text style={styles.body}>
              Imported {prepared.tracks.length} of{' '}
              {sourcePlaylist?.declaredTrackCount ?? sourcePlaylist?.tracks.length ?? 0} tracks.
            </Text>
            {sourcePlaylist?.source === 'spotify' && (
              <View style={styles.summaryList}>
                <Summary label="Matched automatically" value={prepared.automaticallyMatched} />
                <Summary label="Chosen during review" value={prepared.reviewedMatches} />
                <Summary label="Unavailable or unmatched" value={prepared.unavailableCount} />
              </View>
            )}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => savedId && navigation.replace('Playlist', { playlistId: savedId })}
            >
              <Text style={styles.primaryButtonText}>Open playlist</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.textButton} onPress={reset}>
              <Text style={styles.textButtonLabel}>Import another</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.title}>Bring a playlist to Vibe2X</Text>
            <Text style={styles.body}>
              Paste a YouTube, YouTube Music, or Spotify playlist link. Spotify supplies metadata only;
              every saved track is matched to Vibe2X playback.
            </Text>

            <Text style={styles.label}>Playlist URL</Text>
            <View style={[styles.inputWrap, error && !url ? styles.inputError : null]}>
              <Link2 color={COLORS.text.muted} size={20} />
              <TextInput
                style={styles.input}
                value={url}
                onChangeText={(value) => {
                  setUrl(value);
                  setError(null);
                  if (sourcePlaylist) reset();
                }}
                editable={!isWorking && phase !== 'saving'}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://open.spotify.com/playlist/…"
                placeholderTextColor={COLORS.text.secondary}
                returnKeyType="go"
                onSubmitEditing={startImport}
              />
            </View>
            <View style={styles.detectedRow}>
              <Text style={styles.detectedLabel}>Detected source</Text>
              <Text style={[styles.detectedValue, !parsed && url ? styles.invalidText : null]}>
                {parsed ? (parsed.source === 'spotify' ? 'Spotify playlist detected ✓' : 'YouTube playlist detected ✓') : url ? 'Unsupported link' : '—'}
              </Text>
            </View>

            {parsed?.source === 'spotify' && !SpotifyAuthService.isConfigured() && (
              <Text style={styles.notice}>
                Spotify import needs a public client ID configured by the app builder. No client secret is used or stored.
              </Text>
            )}
            {parsed?.source === 'spotify' && SpotifyAuthService.isConfigured() && !sourcePlaylist && (
              <Text style={styles.notice}>
                Spotify currently exposes playlist items only for playlists you own or collaborate on.
              </Text>
            )}

            {isWorking && progress ? (
              <View style={styles.progressBlock} accessibilityLiveRegion="polite">
                <ActivityIndicator color={COLORS.accent.magenta} />
                <Text style={styles.progressTitle}>
                  {progress.phase === 'matching'
                    ? `Matching ${progress.completed} / ${progress.total}…`
                    : parsed?.source === 'spotify'
                      ? 'Fetching Spotify playlist…'
                      : 'Loading YouTube playlist…'}
                </Text>
                {progress.phase === 'fetching' && progress.loaded > 0 && (
                  <Text style={styles.progressDetail}>
                    {progress.loaded}{progress.total ? ` / ${progress.total}` : ''} tracks
                  </Text>
                )}
                <TouchableOpacity style={styles.cancelButton} onPress={cancelActive}>
                  <Text style={styles.cancelButtonText}>Cancel import</Text>
                </TouchableOpacity>
              </View>
            ) : sourcePlaylist && prepared ? (
              <View style={styles.previewBlock}>
                <Text style={styles.previewName}>{sourcePlaylist.name}</Text>
                <Text style={styles.previewMeta}>
                  {sourcePlaylist.source === 'spotify' ? 'Spotify' : 'YouTube'} ·{' '}
                  {sourcePlaylist.declaredTrackCount ?? sourcePlaylist.tracks.length} tracks
                </Text>
                <TouchableOpacity
                  style={styles.sourceLink}
                  onPress={openSourceUrl}
                >
                  {sourcePlaylist.source === 'spotify' ? (
                    <Image source={SPOTIFY_LOGO} style={styles.spotifyLogo} resizeMode="contain" />
                  ) : (
                    <ExternalLink color={COLORS.text.secondary} size={16} />
                  )}
                  <Text style={styles.sourceLinkText}>
                    {sourcePlaylist.source === 'spotify' ? 'OPEN SPOTIFY' : 'Open original in YouTube'}
                  </Text>
                </TouchableOpacity>

                {sourcePlaylist.source === 'spotify' && (
                  <View style={styles.summaryList}>
                    <Summary label="Matched automatically" value={prepared.automaticallyMatched} />
                    <Summary label="Need review" value={prepared.needsReview} />
                    <Summary label="Unavailable or unmatched" value={prepared.unavailableCount} />
                  </View>
                )}
                {(sourcePlaylist.unavailableCount > 0 || prepared.duplicateCount > 0) && (
                  <Text style={styles.notice}>
                    {sourcePlaylist.unavailableCount > 0
                      ? `${sourcePlaylist.unavailableCount} unavailable item${sourcePlaylist.unavailableCount === 1 ? '' : 's'} will be skipped. `
                      : ''}
                    {prepared.duplicateCount > 0
                      ? `${prepared.duplicateCount} duplicate item${prepared.duplicateCount === 1 ? '' : 's'} will be skipped to match Vibe2X playlist behavior.`
                      : ''}
                  </Text>
                )}

                {(collision?.sameSource || collision?.sameName) && (
                  <Text style={styles.notice}>
                    {collision.sameSource
                      ? 'This source was imported before. A separate copy will be created; the existing playlist will not change.'
                      : 'That playlist name already exists. A copy name has been suggested.'}
                  </Text>
                )}

                <Text style={styles.label}>Vibe2X playlist name</Text>
                <TextInput
                  style={[styles.nameInput, nameTaken && styles.inputError]}
                  value={playlistName}
                  onChangeText={setPlaylistName}
                  maxLength={60}
                  placeholder="Playlist name"
                  placeholderTextColor={COLORS.text.secondary}
                />
                {nameTaken && (
                  <Text style={styles.inlineError}>Choose another name; playlists are never overwritten.</Text>
                )}

                {prepared.needsReview > 0 && (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setPhase('review')}>
                    <Text style={styles.secondaryButtonText}>Review {prepared.needsReview} matches</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (!playlistName.trim() || nameTaken || prepared.needsReview > 0 || !prepared.tracks.length) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={save}
                  disabled={!playlistName.trim() || nameTaken || prepared.needsReview > 0 || !prepared.tracks.length}
                >
                  <Text style={styles.primaryButtonText}>
                    {phase === 'saving' ? 'Saving…' : collision?.sameSource ? 'Create copy' : 'Save playlist'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.primaryButton, !parsed && styles.buttonDisabled]}
                onPress={startImport}
                disabled={!parsed}
              >
                <Text style={styles.primaryButtonText}>
                  {parsed?.source === 'spotify' ? 'Connect Spotify & import' : 'Import'}
                </Text>
              </TouchableOpacity>
            )}

            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        )}
      </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    minHeight: 64,
    paddingHorizontal: SIZES.sm,
    paddingBottom: SIZES.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.hairline,
  },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontFamily: FONTS.medium, fontSize: 18, color: COLORS.text.primary },
  content: { padding: SIZES.lg },
  centeredContent: { alignSelf: 'center' },
  title: { fontFamily: FONTS.bold, fontSize: 28, color: COLORS.text.primary, marginBottom: SIZES.sm },
  body: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: COLORS.text.secondary, marginBottom: SIZES.xl },
  label: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.text.secondary, marginBottom: SIZES.sm },
  inputWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radius.md,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  input: { flex: 1, minHeight: 50, color: COLORS.text.primary, fontFamily: FONTS.regular, fontSize: 15 },
  inputError: { borderColor: COLORS.accent.red },
  detectedRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SIZES.sm, marginBottom: SIZES.lg },
  detectedLabel: { color: COLORS.text.secondary, fontFamily: FONTS.regular, fontSize: 13 },
  detectedValue: { color: COLORS.text.primary, fontFamily: FONTS.medium, fontSize: 13 },
  invalidText: { color: COLORS.accent.red },
  notice: { color: COLORS.text.secondary, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, marginBottom: SIZES.md },
  progressBlock: { alignItems: 'center', paddingVertical: SIZES.xxl },
  progressTitle: { color: COLORS.text.primary, fontFamily: FONTS.medium, fontSize: 16, marginTop: SIZES.md },
  progressDetail: { color: COLORS.text.secondary, fontFamily: FONTS.regular, fontSize: 13, marginTop: SIZES.xs },
  cancelButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: SIZES.md, marginTop: SIZES.lg },
  cancelButtonText: { color: COLORS.accent.red, fontFamily: FONTS.medium, fontSize: 14 },
  previewBlock: { marginTop: SIZES.sm },
  previewName: { color: COLORS.text.primary, fontFamily: FONTS.bold, fontSize: 22, marginBottom: SIZES.xs },
  previewMeta: { color: COLORS.text.secondary, fontFamily: FONTS.regular, fontSize: 14, marginBottom: SIZES.sm },
  sourceLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, marginBottom: SIZES.md },
  sourceLinkText: { color: COLORS.text.secondary, fontFamily: FONTS.medium, fontSize: 14 },
  spotifyLogo: { width: 88, height: 24 },
  summaryList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.hairline, marginBottom: SIZES.lg },
  summaryRow: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.hairline },
  summaryLabel: { color: COLORS.text.secondary, fontFamily: FONTS.regular, fontSize: 14 },
  summaryValue: { color: COLORS.text.primary, fontFamily: FONTS.medium, fontSize: 14 },
  nameInput: { minHeight: 52, paddingHorizontal: SIZES.md, borderRadius: SIZES.radius.md, backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.glassBorder, color: COLORS.text.primary, fontFamily: FONTS.regular, fontSize: 15, marginBottom: SIZES.sm },
  inlineError: { color: COLORS.accent.red, fontFamily: FONTS.regular, fontSize: 12, marginBottom: SIZES.sm },
  primaryButton: { minHeight: 52, borderRadius: SIZES.radius.pill, backgroundColor: COLORS.text.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SIZES.lg, marginTop: SIZES.md },
  primaryButtonText: { color: COLORS.background, fontFamily: FONTS.medium, fontSize: 15 },
  secondaryButton: { minHeight: 52, borderRadius: SIZES.radius.pill, borderWidth: 1, borderColor: COLORS.glassBorder, backgroundColor: COLORS.surfaceRaised, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SIZES.lg, marginTop: SIZES.md },
  secondaryButtonText: { color: COLORS.text.primary, fontFamily: FONTS.medium, fontSize: 15 },
  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: SIZES.sm },
  textButtonLabel: { color: COLORS.text.secondary, fontFamily: FONTS.medium, fontSize: 14 },
  buttonDisabled: { opacity: 0.38 },
  error: { color: COLORS.accent.red, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, marginTop: SIZES.md },
  reviewItem: { paddingVertical: SIZES.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.hairline },
  reviewSourceTitle: { color: COLORS.text.primary, fontFamily: FONTS.medium, fontSize: 16 },
  reviewSourceArtist: { color: COLORS.text.secondary, fontFamily: FONTS.regular, fontSize: 13, marginTop: 2 },
  confidence: { color: COLORS.accent.magenta, fontFamily: FONTS.medium, fontSize: 11, marginTop: SIZES.sm, marginBottom: SIZES.sm },
  alternative: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.md, marginBottom: SIZES.sm, borderRadius: SIZES.radius.md, backgroundColor: COLORS.surfaceRaised, borderWidth: 1, borderColor: COLORS.glassBorder },
  alternativeSelected: { borderColor: COLORS.accent.magenta, backgroundColor: COLORS.accent.magentaGlow },
  alternativeText: { flex: 1, marginRight: SIZES.sm },
  alternativeTitle: { color: COLORS.text.primary, fontFamily: FONTS.medium, fontSize: 14 },
  alternativeArtist: { color: COLORS.text.secondary, fontFamily: FONTS.regular, fontSize: 12, marginTop: 2 },
  skipButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  skipButtonText: { color: COLORS.text.secondary, fontFamily: FONTS.medium, fontSize: 13 },
  successBlock: { alignItems: 'stretch', paddingTop: SIZES.xl },
  successIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.text.primary, alignItems: 'center', justifyContent: 'center', marginBottom: SIZES.lg },
});
