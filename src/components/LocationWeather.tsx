"use client";

import { useCallback, useEffect, useState } from "react";

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

export default function LocationWeather() {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherState, setWeatherState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [mediaStatus, setMediaStatus] = useState("");
  const [offlineReady, setOfflineReady] = useState(false);

  const loadWeather = useCallback(async () => {
    setWeatherState("loading");
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
      if (!data.current || typeof data.current.temperature_2m !== "number") throw new Error("Weather data missing");
      setWeather(data.current);
      setWeatherState("ready");
    } catch {
      setWeatherState("error");
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
    void checkOfflineMedia();
  }, [loadWeather, checkOfflineMedia]);

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
          const contentLength = Number(response.headers.get("content-length") || 0);
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

  const updated = weather?.time ? new Date(weather.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  return <>
    <section className="big-brothers-section location-weather-section" aria-label="Gaborone weather">
      <div className="bb-weather-card">
        <div className="bb-weather-main">
          <p className="big-brothers-eyebrow">GABORONE · CURRENT CONDITIONS</p>
          {weather ? <div className="bb-weather-reading"><strong>{Math.round(weather.temperature_2m)}°C</strong><span>{condition(weather.weather_code)}</span></div> : <p role="status" className="bb-weather-state">{weatherState === "loading" ? "Checking current conditions…" : "Current weather is unavailable right now."}</p>}
          {weather && <p className="bb-weather-feels">Feels like {Math.round(weather.apparent_temperature)}°C</p>}
          <small>{updated ? "Updated " + updated + " local time · " : ""}Weather by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0)</small>
        </div>
        {weather && <div className="bb-weather-metrics"><span><small>Humidity</small><strong>{weather.relative_humidity_2m}%</strong></span><span><small>Wind</small><strong>{Math.round(weather.wind_speed_10m)} km/h</strong></span></div>}
        <button type="button" className="bb-weather-refresh" onClick={() => void loadWeather()} disabled={weatherState === "loading"}>{weatherState === "loading" ? "Loading…" : "Refresh weather"}</button>
      </div>
    </section>
    <section className="big-brothers-section bb-location-guide" id="find-us">
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
    </section>
  </>;
}
