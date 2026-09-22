import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { appErrorWithMessage } from '../../core/errors';

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = 'vibe2x:spotify:oauth';
const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID?.trim() ?? '';

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'vibe2x-spotify',
  path: 'oauth/callback',
});

type StoredToken = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  issuedAt: number;
  scope?: string;
};

function configError(): never {
  throw appErrorWithMessage(
    'authorization_required',
    'Spotify import is not configured in this build. Set EXPO_PUBLIC_SPOTIFY_CLIENT_ID and register vibe2x-spotify://oauth/callback in the Spotify dashboard.'
  );
}

class SpotifyAuthServiceImpl {
  isConfigured(): boolean {
    return Boolean(CLIENT_ID);
  }

  getRedirectUri(): string {
    return REDIRECT_URI;
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!CLIENT_ID) configError();
    if (Platform.OS === 'web') {
      throw appErrorWithMessage(
        'authorization_required',
        'Spotify import currently requires the Vibe2X Android or iOS app.'
      );
    }

    const stored = await this.readToken();
    if (stored && !forceRefresh && this.isFresh(stored)) return stored.accessToken;

    if (stored?.refreshToken) {
      try {
        const refreshed = await AuthSession.refreshAsync(
          { clientId: CLIENT_ID, refreshToken: stored.refreshToken },
          DISCOVERY
        );
        const next = this.fromTokenResponse(refreshed, stored.refreshToken);
        await this.writeToken(next);
        return next.accessToken;
      } catch {
        await this.clear();
      }
    }

    return this.authorize();
  }

  async authorize(): Promise<string> {
    if (!CLIENT_ID) configError();

    const request = new AuthSession.AuthRequest({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      scopes: ['playlist-read-private', 'playlist-read-collaborative'],
      usePKCE: true,
    });

    const result = await request.promptAsync(DISCOVERY);
    if (result.type !== 'success' || !result.params.code || !request.codeVerifier) {
      throw appErrorWithMessage(
        'authorization_required',
        result.type === 'cancel' || result.type === 'dismiss'
          ? 'Spotify connection was cancelled.'
          : 'Spotify could not authorize this import.'
      );
    }

    const response = await AuthSession.exchangeCodeAsync(
      {
        clientId: CLIENT_ID,
        code: result.params.code,
        redirectUri: REDIRECT_URI,
        extraParams: { code_verifier: request.codeVerifier },
      },
      DISCOVERY
    );
    const stored = this.fromTokenResponse(response);
    await this.writeToken(stored);
    return stored.accessToken;
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }

  private isFresh(token: StoredToken): boolean {
    if (!token.expiresIn) return true;
    return Date.now() / 1000 < token.issuedAt + token.expiresIn - 60;
  }

  private async readToken(): Promise<StoredToken | null> {
    try {
      const raw = await SecureStore.getItemAsync(TOKEN_KEY);
      return raw ? (JSON.parse(raw) as StoredToken) : null;
    } catch {
      return null;
    }
  }

  private async writeToken(token: StoredToken): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(token), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  private fromTokenResponse(
    response: AuthSession.TokenResponse,
    fallbackRefreshToken?: string
  ): StoredToken {
    return {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken ?? fallbackRefreshToken,
      expiresIn: response.expiresIn,
      issuedAt: response.issuedAt,
      scope: response.scope,
    };
  }
}

export const SpotifyAuthService = new SpotifyAuthServiceImpl();
