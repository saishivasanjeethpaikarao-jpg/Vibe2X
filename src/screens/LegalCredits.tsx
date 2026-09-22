import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ExternalLink } from 'lucide-react-native';
import { FONTS, SIZES, THEME } from '../constants/theme';

const GPL_URL = 'https://www.gnu.org/licenses/gpl-3.0.en.html';
const NEWPIPE_URL = 'https://github.com/TeamNewPipe/NewPipeExtractor';

export default function LegalCreditsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + SIZES.sm, paddingBottom: insets.bottom + SIZES.xl }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to About Vibe2X">
          <ChevronLeft size={26} color={THEME.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Legal & Credits</Text>
        <Text style={styles.heading}>Vibe2X and NØTE</Text>
        <Text style={styles.body}>
          Vibe2X is based in part on the original NØTE project by Sanyam Jain. Original copyright © 2026 Sanyam Jain. Vibe2X modifications copyright © 2026 saishivasanjeethpaikarao-jpg.
        </Text>
        <Text style={styles.heading}>GPL-3.0-or-later</Text>
        <Text style={styles.body}>
          This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
          {'\n\n'}This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the license for details.
        </Text>
        <LegalLink label="Read GPL-3.0 license" url={GPL_URL} />
        <Text style={styles.heading}>NewPipe Extractor</Text>
        <Text style={styles.body}>
          Copyright © Team NewPipe and contributors. NewPipe Extractor v0.26.5 is linked as an unmodified dependency under GPL-3.0-or-later. Its authors are not affiliated with Vibe2X.
        </Text>
        <LegalLink label="NewPipe Extractor source" url={NEWPIPE_URL} />
        <Text style={styles.body}>Full copyright details and third-party notices are included with the corresponding Vibe2X source repository.</Text>
      </ScrollView>
    </View>
  );
}

function LegalLink({ label, url }: { label: string; url: string }) {
  return (
    <TouchableOpacity style={styles.link} onPress={() => void Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={label}>
      <Text style={styles.linkText}>{label}</Text>
      <ExternalLink size={17} color={THEME.text.secondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.background.primary },
  content: { paddingHorizontal: SIZES.md },
  back: { width: 48, height: 48, justifyContent: 'center' },
  title: { fontFamily: FONTS.bold, fontSize: 29, color: THEME.text.primary, marginTop: SIZES.md, marginBottom: SIZES.lg },
  heading: { fontFamily: FONTS.medium, fontSize: 18, color: THEME.text.primary, marginTop: SIZES.xl, marginBottom: SIZES.sm },
  body: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: THEME.text.secondary },
  link: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: THEME.border.glass },
  linkText: { fontFamily: FONTS.medium, fontSize: 14, color: THEME.text.primary },
});
