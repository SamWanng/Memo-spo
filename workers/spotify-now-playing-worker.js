/**
 * Cloudflare Worker: Spotify now-playing endpoint with CORS.
 *
 * Required env vars:
 * - SPOTIFY_CLIENT_ID
 * - SPOTIFY_CLIENT_SECRET
 * - SPOTIFY_REFRESH_TOKEN
 *
 * Optional env vars:
 * - ALLOWED_ORIGIN (default: "*")
 */

const RECENTLY_PLAYED_URL = "https://api.spotify.com/v1/me/player/recently-played?limit=1";
const CURRENTLY_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(env),
  });
}

function emptyTrack() {
  return {
    title: "",
    artist: "",
    url: "",
    album: "",
    albumImage: "",
  };
}

function normalizeTrack(item) {
  if (!item) return emptyTrack();
  const artists = (item.artists || []).map((a) => a?.name).filter(Boolean).join(", ");
  return {
    title: item.name || "",
    artist: artists || "",
    url: item.external_urls?.spotify || "",
    album: item.album?.name || "",
    albumImage: item.album?.images?.[0]?.url || "",
  };
}

async function fetchAccessToken(env) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: env.SPOTIFY_REFRESH_TOKEN,
  });

  const basic = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    throw new Error(`Token request failed: ${tokenResponse.status} ${text}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function fetchSpotify(accessToken, url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Spotify returns 204 when nothing is playing.
  if (response.status === 204) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify request failed: ${response.status} ${text}`);
  }

  return response.json();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env),
      });
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, env);
    }

    try {
      const accessToken = await fetchAccessToken(env);

      const current = await fetchSpotify(accessToken, CURRENTLY_PLAYING_URL);
      const isPlaying = Boolean(current?.is_playing && current?.item);
      const track = isPlaying ? normalizeTrack(current.item) : emptyTrack();

      const recent = await fetchSpotify(accessToken, RECENTLY_PLAYED_URL);
      const recentItem = recent?.items?.[0]?.track || null;
      const lastPlayed = normalizeTrack(recentItem);

      return json(
        {
          isPlaying,
          track,
          lastPlayed,
        },
        200,
        env
      );
    } catch (error) {
      return json(
        {
          isPlaying: false,
          track: emptyTrack(),
          lastPlayed: emptyTrack(),
          error: "now-playing unavailable",
          detail: String(error?.message || error),
        },
        200,
        env
      );
    }
  },
};
