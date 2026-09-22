import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Heart, ListMusic, Plus, X, Ban } from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../../constants/theme';
import { Track } from '../../core/types';
import { useLibrary } from '../../hooks/useLibrary';
import { suppressTrack } from '../../core/lie';
import { LiquidSheet } from '../liquid/LiquidSheet';
import { confirmLocalMutation } from '../../core/confirmedMutation';
import { useSnackbar } from '../common/SnackbarContext';

type Props = {
  /** The track being filed. Null closes the sheet. */
  track: Track | null;
  onClose: () => void;
};

/**
 * "Add to playlist" for a single track.
 *
 * Deliberately a plain Modal rather than a new navigation route: it is opened
 * from track rows on several screens, and a route would force each of them to
 * know about it.
 */
export const AddToPlaylistSheet: React.FC<Props> = ({ track, onClose }) => {
  const { show } = useSnackbar();
  const {
    playlists,
    addToPlaylist,
    removeFromPlaylist,
    createPlaylist,
    toggleLike,
    isLiked,
  } = useLibrary();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  /**
   * Keyboard height, applied as bottom inset on the sheet.
   *
   * KeyboardAvoidingView is unreliable inside a Modal on Android, so the sheet
   * is lifted explicitly by however much the keyboard actually covers.
   */
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const liked = track ? isLiked(track.id) : false;

  /** Newest-first, matching how Library orders them. */
  const ordered = useMemo(
    () => [...playlists].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [playlists]
  );

  const close = useCallback(() => {
    Keyboard.dismiss();
    setCreating(false);
    setNewName('');
    onClose();
  }, [onClose]);

  /** Tapping a playlist toggles membership: add if absent, remove if present. */
  const toggleIn = useCallback(
    async (playlistId: string, alreadyIn: boolean) => {
      if (!track) return;
      const name = playlists.find((playlist) => playlist.id === playlistId)?.name;
      if (!name) return;
      try {
        const saved = await confirmLocalMutation(
          () => { if (alreadyIn) removeFromPlaylist(playlistId, track.id); else addToPlaylist(playlistId, track); },
          () => { close(); show(`${alreadyIn ? 'Removed from' : 'Added to'} ${name}`); }
        );
        if (!saved) show('Could not save playlist change');
      } catch {
        show('Could not save playlist change');
      }
    },
    [track, playlists, addToPlaylist, removeFromPlaylist, close, show]
  );

  const createAndAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name || !track) return;

    // Create it already containing the track, so this is one step not two.
    try {
      const saved = await confirmLocalMutation(
        () => { createPlaylist(name, [track]); },
        () => { close(); show(`Added to ${name}`); }
      );
      if (!saved) show('Could not save playlist');
    } catch {
      show('Could not save playlist');
    }
  }, [newName, track, createPlaylist, close, show]);

  const changeLike = useCallback(async () => {
    if (!track) return;
    const wasLiked = isLiked(track.id);
    try {
      const saved = await confirmLocalMutation(
        () => toggleLike(track),
        () => { close(); show(wasLiked ? 'Unliked' : 'Liked'); }
      );
      if (!saved) show('Could not save liked songs');
    } catch {
      show('Could not save liked songs');
    }
  }, [track, isLiked, toggleLike, close, show]);

  return (
    <LiquidSheet
      visible={track !== null}
      onClose={close}
      keyboardOffset={keyboardHeight}
      accessibilityLabel="Add to playlist"
    >
      <View
        style={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Add to playlist</Text>
            {!!track && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {track.title}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close add to playlist"
          >
            <X color={COLORS.text.secondary} size={22} />
          </TouchableOpacity>
        </View>

        {creating ? (
          <View style={styles.createRow}>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Playlist name"
              placeholderTextColor={COLORS.text.secondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createAndAdd}
              maxLength={60}
              accessibilityLabel="New playlist name"
            />
            <TouchableOpacity
              style={[styles.createButton, !newName.trim() && styles.disabled]}
              onPress={createAndAdd}
              disabled={!newName.trim()}
              accessibilityRole="button"
              accessibilityLabel="Create playlist and add track"
            >
              <Text style={styles.createButtonText}>Create</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => setCreating(true)}
            accessibilityRole="button"
            accessibilityLabel="Create new playlist"
          >
            <View style={styles.rowIcon}>
              <Plus color={COLORS.text.primary} size={20} />
            </View>
            <Text style={styles.rowLabel}>New playlist</Text>
          </TouchableOpacity>
        )}

        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {/* Liked Songs is synthetic, so it toggles the like instead. */}
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={changeLike}
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Remove from liked songs' : 'Add to liked songs'}
            accessibilityState={{ selected: liked }}
          >
            <View style={styles.rowIcon}>
              <Heart
                color={liked ? COLORS.accent.magenta : COLORS.text.primary}
                fill={liked ? COLORS.accent.magenta : 'transparent'}
                size={20}
              />
            </View>
            <Text style={styles.rowLabel}>Liked Songs</Text>
            {liked && <Check color={COLORS.accent.magenta} size={18} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => {
              if (track) {
                suppressTrack(track.id).catch(console.error);
                close();
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Do not play this track"
          >
            <View style={styles.rowIcon}>
              <Ban color={COLORS.text.primary} size={20} />
            </View>
            <Text style={styles.rowLabel}>Don't Play This</Text>
          </TouchableOpacity>

          {ordered.map((playlist) => {
            const alreadyIn = playlist.tracks.some((t) => t.id === track?.id);

            return (
              <TouchableOpacity
                key={playlist.id}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => toggleIn(playlist.id, alreadyIn)}
                accessibilityRole="button"
                accessibilityLabel={`${alreadyIn ? 'Remove from' : 'Add to'} ${playlist.name}`}
                accessibilityState={{ selected: alreadyIn }}
              >
                <View style={styles.rowIcon}>
                  <ListMusic color={COLORS.text.primary} size={20} />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {playlist.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {playlist.tracks.length}{' '}
                    {playlist.tracks.length === 1 ? 'track' : 'tracks'}
                  </Text>
                </View>
                {alreadyIn && <Check color={COLORS.accent.magenta} size={18} />}
              </TouchableOpacity>
            );
          })}

          {ordered.length === 0 && !creating && (
            <Text style={styles.empty}>
              No playlists yet. Create one above.
            </Text>
          )}
        </ScrollView>
      </View>
    </LiquidSheet>
  );
};

const styles = StyleSheet.create({
  content: {
    maxHeight: '75%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SIZES.md,
  },
  headerText: {
    flex: 1,
    marginRight: SIZES.md,
  },
  closeButton: {
    width: 48,
    height: 48,
    marginTop: -SIZES.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.text.primary,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.sm + 4,
    gap: SIZES.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: SIZES.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowLabel: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
  },
  rowMeta: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    marginBottom: SIZES.sm,
  },
  input: {
    flex: 1,
    minHeight: SIZES.touchTarget,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: COLORS.text.primary,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
  },
  createButton: {
    minHeight: SIZES.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm + 4,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.text.primary,
  },
  createButtonText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.background,
  },
  disabled: {
    opacity: 0.4,
  },
  empty: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    paddingVertical: SIZES.lg,
  },
});
