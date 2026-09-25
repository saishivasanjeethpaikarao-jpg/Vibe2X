import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { TabNavigator } from './TabNavigator';
import { COLORS } from '../constants/theme';
import { useLibrary } from '../hooks/useLibrary';
import OnboardingScreen from '../screens/Onboarding';
import ProfileSetupScreen from '../screens/ProfileSetup';
import TasteSetupScreen from '../screens/TasteSetup';
import MusicPreferencesScreen from '../screens/MusicPreferences';
import PlaylistDetailScreen from '../screens/PlaylistDetail';
import SettingsScreen from '../screens/Settings';
import AboutVibe2XScreen from '../screens/AboutVibe2X';
import LegalCreditsScreen from '../screens/LegalCredits';
import NowPlayingScreen from '../screens/NowPlaying';
import QueueScreen from '../screens/QueueScreen';
import ImportPlaylistScreen from '../screens/ImportPlaylist';

const Stack = createNativeStackNavigator();

const VibeTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.background,
    text: COLORS.text.primary,
  },
};

export const RootNavigator = () => {
  const { profile, isLoaded } = useLibrary();

  // Wait for persistence before choosing a route, otherwise a returning
  // user is flashed the onboarding screen for a frame.
  if (!isLoaded) return null;

  const initialRoute = profile.completed ? 'Main' : 'Onboarding';

  return (
    <NavigationContainer
      theme={VibeTheme}
      linking={{
        prefixes: ['vibe2x://'],
        config: {
          screens: {
            ImportPlaylist: 'import',
          },
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="TasteSetup" component={TasteSetupScreen} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen name="Playlist" component={PlaylistDetailScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="MusicPreferences" component={MusicPreferencesScreen} />
        <Stack.Screen name="AboutVibe2X" component={AboutVibe2XScreen} />
        <Stack.Screen name="LegalCredits" component={LegalCreditsScreen} />
        <Stack.Screen
          name="ImportPlaylist"
          component={ImportPlaylistScreen}
          options={{ presentation: 'modal', animation: 'fade_from_bottom' }}
        />
        <Stack.Screen 
          name="NowPlaying" 
          component={NowPlayingScreen} 
          options={{ presentation: 'fullScreenModal', animation: 'fade_from_bottom' }}
        />
        <Stack.Screen 
          name="Queue" 
          component={QueueScreen} 
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
