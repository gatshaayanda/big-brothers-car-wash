"use client";

import { useCallback, useEffect, useState } from "react";

const weatherCacheKey = "big-brothers-car-wash:last-weather:v1";

type CurrentWeather = {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  weather_code: number;
  time: string;
};

const videos = [
  { src: "/videos/Left.mp4", title: "Approach from the left", detail: "See the entrance as you arrive from the left." },
  { src: "/videos/Right.mp4", title: "Approach from the right", detail: "Use this view if you approach from the right." },
  { src: "/videos/Bays.mp4", title: "Inside the wash bays", detail: "Preview the available wash-bay area." },
];

function condition(code: number) {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 95) return "Thunderstorms";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain or drizzle";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow or ice";
  return "Cloudy conditions";
}

export default function LocationWeather({ showLocationGuide = true }: { showLocationGuide?: boolean }) {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherState, setWeatherState] = useState<"loading" | "ready" | "stale" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [mediaStatus, setMediaStatus] = useState("");
  const [offlineReady, setOfflineReady] = useState(false);

  const loadWeather = useCallback(async () => {
    setWeatherState(current => current === "ready" || current === "stale" ? current : "loading");
    try {
      const params = new URLSearchParams({
        latitude: "-24.6282",
        longitude: "25.9231",
        current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
        timezone: "auto",
      });
      const response = await fetch("https://api.open-meteo.com/v1/forecast?" + params.toString(), { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Weather unavailable");
      const data = await response.json() as { current?: CurrentWeather };
      if (!data.current || typeof data.current.temperature_2m !== "number" || typeof data.current.time !== "string") throw new Error("Weather data missing");
      setWeather(data.current);
      setWeatherState("ready");
      try { localStorage.setItem(weatherCacheKey, JSON.stringify({ current: data.current, savedAt: Date.now() })); } catch { /* Weather stays usable if storage is blocked or full. */ }
    } catch {
      try {
        const cached = JSON.parse(localStorage.getItem(weatherCacheKey) || "null") as { current?: CurrentWeather } | null;
        if (cached?.current && typeof cached.current.temperature_2m === "number" && typeof cached.current.time === "string") {
          setWeather(cached.current);
          setWeatherState("stale");
          return;
        }
      } catch { /* Ignore invalid or unavailable local weather cache. */ }
      setWeatherState(current => current === "ready" || current === "stale" ? "stale" : "error");
    }
  }, []);

  const checkOfflineMedia = useCallback(async () => {
    try {
      const cache = await caches.open("big-brothers-media-v2");
      const cached = await Promise.all(videos.map(async video => {
        const response = await cache.match(new URL(video.src, window.location.origin).href);
        return Boolean(response && response.ok && (response.headers.get("content-type") || "").toLowerCase().includes("video"));
      }));
      setOfflineReady(cached.every(Boolean));
    } catch {
      setOfflineReady(false);
    }
  }, []);

  useEffect(() => {
    void loadWeather();
    if (showLocationGuide) void checkOfflineMedia();
  }, [loadWeather, checkOfflineMedia, showLocationGuide]);

  async function saveForOffline() {
    if (saving) return;
    setSaving(true);
    setOfflineReady(false);
    setMediaStatus("Preparing videos for offline playback. Keep this page open; the files total about 104 MB.");
    try {
      const cache = await caches.open("big-brothers-media-v2");
      let completed = 0;
      for (const video of videos) {
        const url = new URL(video.src, window.location.origin).href;
        let existing = await cache.match(url);
        const validExisting = existing && existing.ok && (existing.headers.get("content-type") || "").toLowerCase().includes("video");
        if (!validExisting) {
          if (existing) await cache.delete(url);
          const response = await fetch(url, { cache: "no-store" });
          const contentType = (response.headers.get("content-type") || "").toLowerCase();
          const contentLengthHeader = response.headers.get("content-length");
          const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
          if (!response.ok || !contentType.includes("video") || contentLength === 0) {
            throw new Error("A location video could not be downloaded completely. Check your connection and available device storage, then try again.");
          }
          await cache.put(url, response.clone());
          existing = await cache.match(url);
          if (!existing || !existing.ok || !(existing.headers.get("content-type") || "").toLowerCase().includes("video")) {
            await cache.delete(url);
            throw new Error("A saved video could not be verified in offline storage. Check device storage and try again.");
          }
        }
        completed += 1;
        setMediaStatus("Saved and verified " + completed + " of " + videos.length + " videos on this device.");
      }

      const verified = await Promise.all(videos.map(video => cache.match(new URL(video.src, window.location.origin).href)));
      if (!verified.every(response => response && response.ok && (response.headers.get("content-type") || "").toLowerCase().includes("video"))) {
        throw new Error("Not every video is available in offline storage yet. Keep this page open and try saving again.");
      }
      setOfflineReady(true);
      setMediaStatus("All three location videos are saved and verified for offline playback on this device.");
    } catch (error) {
      await checkOfflineMedia();
      setMediaStatus(error instanceof Error ? error.message : "Videos could not be saved for offline use. Try again while connected.");
    } finally {
      setSaving(false);
    }
  }

  const updated = weather?.time ? new Date(weather.time).toLocaleTimeString("en-BW", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Gaborone" }) : "";
  const localHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Africa/Gaborone" }).format(new Date()));
  const greeting = localHour < 11 ? "Dumela, G-West!" : localHour < 17 ? "Eita, G-West!" : "Good evening, G-West!";
  const weatherMood = !weather ? { emoji: "🤝", title: "Your Brothers have your back.", detail: "Live conditions are taking a break. You can still request a wash and the team will confirm availability." }
    : weather.weather_code >= 51 && weather.weather_code <= 82 ? { emoji: "🌧️", title: "A wet one out there.", detail: "Take your time. You can request a wash and check the best timing with the team." }
    : weather.weather_code >= 95 ? { emoji: "⛈️", title: "Stormy skies in Gaborone.", detail: "Put safety first. Check with the team before making the trip." }
    : weather.wind_speed_10m >= 25 ? { emoji: "💨", title: "Wind and dust on the move.", detail: "Been on dusty roads? Your ride deserves a little care." }
    : weather.temperature_2m >= 32 ? { emoji: "☀️", title: "Gaborone is bringing the heat!", detail: "Keep cool out there. When you're ready, bring your ride through." }
    : weather.weather_code === 0 ? { emoji: "☀️", title: "Looking like a bright day.", detail: "A good time to give your ride some attention. The Brothers are here to help." }
    : { emoji: "🌤️", title: "Whatever the weather, we've got your ride.", detail: "Make your next wash easy: join the queue or plan a return visit." };

  return <>
    <section className="big-brothers-section location-weather-section" aria-label="Gaborone weather">
      <div className="bb-weather-card">
        <div className="bb-weather-main">
          <p className="big-brothers-eyebrow">🚘 BIG BROTHERS DAILY DRIVE · G-WEST</p>
          <h3 className="bb-daily-greeting">{greeting}</h3>
          <p className="bb-daily-message"><span aria-hidden="true">{weatherMood.emoji}</span> <strong>{weatherMood.title}</strong> {weatherMood.detail}</p>
          <p className="bb-weather-condition-label">CURRENT CONDITIONS</p>
          {weather ? <div className="bb-weather-reading"><strong>{Math.round(weather.temperature_2m)}°C</strong><span>{condition(weather.weather_code)}</span></div> : <p role="status" className="bb-weather-state">{weatherState === "loading" ? "Checking current conditions…" : "Live weather is unavailable right now. You can still browse services and request a wash; the team confirms availability."}</p>}
          {weather && <p className="bb-weather-feels">Feels like {Math.round(weather.apparent_temperature)}°C</p>}
          <small>{weatherState === "stale" ? "Last available reading " + updated + " local time · saved on this device · may be out of date · " : updated ? "Updated " + updated + " local time · " : ""}Weather by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0)</small>
        </div>
        {weather && <div className="bb-weather-metrics"><span><small>Humidity</small><strong>{weather.relative_humidity_2m}%</strong></span><span><small>Wind</small><strong>{Math.round(weather.wind_speed_10m)} km/h</strong></span></div>}
        <div className="bb-weather-actions"><button type="button" className="bb-weather-refresh" onClick={() => void loadWeather()} disabled={weatherState === "loading"}>{weatherState === "loading" ? "Checking…" : "↻ Refresh"}</button><a href="#request">Join the queue ↗</a></div>
      </div>
    </section>
    {showLocationGuide && <section className="big-brothers-section bb-location-guide" id="find-us">
      <div className="section-title">
        <p className="big-brothers-eyebrow">YOUR FIRST VISIT</p>
        <h2>Find us. Pull in. Get clean.</h2>
        <p>Quick visual directions to the entrance and wash bays. Choose a video when you need it; nothing plays automatically.</p>
      </div>
      <div className="bb-location-videos">
        {videos.map(video => <article className="bb-location-video" key={video.src}>
          <video controls preload="none" playsInline aria-label={video.title} src={video.src} />
          <div><h3>{video.title}</h3><p>{video.detail}</p></div>
        </article>)}
      </div>
      <div className="bb-offline-media">
        <div><strong>{offlineReady ? "Location guide ready offline" : "Need the directions without data?"}</strong><p>{offlineReady ? "All three videos are cached on this device." : "Save the three videos on Wi-Fi or mobile data to watch them later without a connection (about 104 MB)."}</p></div>
        <button type="button" className="big-brothers-button secondary" disabled={saving || offlineReady} onClick={() => void saveForOffline()}>{saving ? "Saving videos…" : offlineReady ? "Saved on this device" : "Save videos for offline"}</button>
      </div>
      {mediaStatus && <p className="big-brothers-notice pending" role="status" aria-live="polite">{mediaStatus}</p>}
    </section>}
  </>;
}
