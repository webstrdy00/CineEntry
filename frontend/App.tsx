import { StatusBar } from "expo-status-bar"
import { NavigationContainer } from "@react-navigation/native"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { Ionicons } from "@expo/vector-icons"
import { ActivityIndicator, View, StyleSheet } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"

import { AuthProvider, useAuth } from "./src/contexts/AuthContext"
import LoginScreen from "./src/screens/LoginScreen"
import EmailLoginScreen from "./src/screens/EmailLoginScreen"
import SignUpScreen from "./src/screens/SignUpScreen"
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen"

import HomeScreen from "./src/screens/HomeScreen"
import MoviesScreen from "./src/screens/MoviesScreen"
import StatsScreen from "./src/screens/StatsScreen"
import ProfileScreen from "./src/screens/ProfileScreen"
import MovieDetailScreen from "./src/screens/MovieDetailScreen"
import MovieSearchScreen from "./src/screens/MovieSearchScreen"
import CollectionsScreen from "./src/screens/CollectionsScreen"
import CollectionDetailScreen from "./src/screens/CollectionDetailScreen"
import EditProfileScreen from "./src/screens/EditProfileScreen"
import AboutScreen from "./src/screens/AboutScreen"
import HelpScreen from "./src/screens/HelpScreen"
import TermsScreen from "./src/screens/TermsScreen"
import PrivacyScreen from "./src/screens/PrivacyScreen"
import StreakDetailScreen from "./src/screens/StreakDetailScreen"
import StreakSettingsScreen from "./src/screens/StreakSettingsScreen"
import WatchCalendarScreen from "./src/screens/WatchCalendarScreen"
import WatchCalendarSettingsScreen from "./src/screens/WatchCalendarSettingsScreen"

import type { RootStackParamList, TabParamList } from "./src/types"
import { COLORS } from "./src/constants/colors"

const Tab = createBottomTabNavigator<TabParamList>()
const Stack = createNativeStackNavigator<RootStackParamList>()

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.deepGray,
          borderTopWidth: 0,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: COLORS.gold,
        tabBarInactiveTintColor: COLORS.lightGray,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "홈",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Movies"
        component={MoviesScreen}
        options={{
          tabBarLabel: "영화",
          tabBarIcon: ({ color, size }) => <Ionicons name="film" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={{
          tabBarLabel: "통계",
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: "프로필",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  )
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="EmailLogin" component={EmailLoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  )
}

function MainStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.darkNavy,
        },
        headerTintColor: COLORS.white,
        headerTitleStyle: {
          fontWeight: "bold",
        },
      }}
    >
      <Stack.Screen name="Main" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="MovieDetail" component={MovieDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="MovieSearch"
        component={MovieSearchScreen}
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="Collections"
        component={CollectionsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CollectionDetail"
        component={CollectionDetailScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Help"
        component={HelpScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Terms"
        component={TermsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Privacy"
        component={PrivacyScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StreakDetail"
        component={StreakDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StreakSettings"
        component={StreakSettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WatchCalendar"
        component={WatchCalendarScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WatchCalendarSettings"
        component={WatchCalendarSettingsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  )
}

function RootNavigator() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      {isAuthenticated ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.darkNavy,
  },
})
