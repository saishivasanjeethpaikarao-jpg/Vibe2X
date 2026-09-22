import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Search, Library, Clock } from 'lucide-react-native';
import { COLORS, SIZES } from '../constants/theme';

import HomeScreen from '../screens/Home';
import SearchScreen from '../screens/Search';
import LibraryScreen from '../screens/Library';
import HistoryScreen from '../screens/History';
import { LiquidTabBarBackground, LiquidTabIcon } from '../components/liquid/LiquidTabBar';

const Tab = createBottomTabNavigator();

export const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, SIZES.sm);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          { height: 64 + bottomPadding, paddingBottom: bottomPadding },
        ],
        tabBarBackground: LiquidTabBarBackground,
        tabBarActiveTintColor: COLORS.accent.magenta,
        tabBarInactiveTintColor: COLORS.text.secondary,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tab.Screen 
        name="HomeTab" 
        component={HomeScreen} 
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <LiquidTabIcon Icon={Home} color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen 
        name="SearchTab" 
        component={SearchScreen} 
        options={{
          tabBarLabel: 'Search',
          tabBarIcon: ({ color, focused }) => (
            <LiquidTabIcon Icon={Search} color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="HistoryTab"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color, focused }) => (
            <LiquidTabIcon Icon={Clock} color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen 
        name="LibraryTab" 
        component={LibraryScreen} 
        options={{
          tabBarLabel: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <LiquidTabIcon Icon={Library} color={color} focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: 'transparent',
    paddingTop: 8,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  }
});
