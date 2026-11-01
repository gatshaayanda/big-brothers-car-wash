"use client";

import {useEffect, useState} from "react";

type PlugLoadingStateProps = {
  message: string;
  onRetry?: () => void;
};

export default function PlugLoadingState({message, onRetry}: PlugLoadingStateProps) {
  const [takingLonger, setTakingLonger] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTakingLonger(true), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="plugLoadingState" role="status" aria-live="polite" aria-atomic="true">
      <div className="plugLoadingStateTop">
        <span className="plugLoadingStatePulse" aria-hidden="true" />
        <span>{takingLonger ? "Still connecting…" : message}</span>
        <span className="plugLoadingStateLive">SYNCING</span>
      </div>
      <div className="plugLoadingStateTrack" aria-hidden="true">
        <span />
      </div>
      <p>{takingLonger ? "The connection is taking longer than usual. The Plug is still checking." : "Checking for published updates…"}</p>
      {takingLonger && onRetry && (
        <button type="button" className="plugLoadingStateRetry" onClick={onRetry}>
          Try again ↻
        </button>
      )}
    </div>
  );
}
