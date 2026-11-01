"use client";

import { useRef, useState } from "react";
import { generateReactHelpers } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

const { useUploadThing } = generateReactHelpers<OurFileRouter>();

type Props = {
  value: string;
  type: "image" | "video";
  online: boolean;
  onChange: (url: string, type: "image" | "video") => void;
  onUploadingChange: (uploading: boolean) => void;
};

export default function ServiceMediaPicker({ value, type, online, onChange, onUploadingChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [urlDraft, setUrlDraft] = useState(type === "video" ? value : "");
  const { startUpload, isUploading } = useUploadThing("fileUploader", {
    onUploadProgress: (progress) => setUploadProgress(Math.max(0, Math.min(100, Math.round(progress)))),
    onClientUploadComplete: (files) => {
      onUploadingChange(false);
      setUploadProgress(100);
      const file = files?.[0];
      const url = file?.ufsUrl || file?.url;
      if (!url) {
        setMessage("Upload finished but no media URL was returned. Your existing media has been kept.");
        return;
      }
      const mediaType = file.type.startsWith("video/") ? "video" : "image";
      onChange(url, mediaType);
      setUrlDraft(mediaType === "video" ? url : "");
      setMessage(mediaType === "video" ? "Video uploaded and ready to preview." : "Image uploaded and ready to preview.");
      window.setTimeout(() => setUploadProgress(0), 900);
      if (inputRef.current) inputRef.current.value = "";
    },
    onUploadError: (error) => {
      onUploadingChange(false);
      setUploadProgress(0);
      setMessage(error.message || "Upload failed. Your current media has been kept.");
    },
  });

  async function uploadSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files?.length) return;
    if (!online || !navigator.onLine) {
      setMessage("You can choose or take a photo offline, but uploading needs an internet connection. Nothing was changed.");
      event.target.value = "";
      return;
    }
    const file = files[0];
    const expected = type === "video" ? file.type.startsWith("video/") : file.type.startsWith("image/");
    const maxBytes = type === "video" ? 16 * 1024 * 1024 : 4 * 1024 * 1024;
    const maxLabel = type === "video" ? "16 MB" : "4 MB";
    if (!expected) {
      setMessage(type === "video" ? "Choose a video file." : "Choose an image file.");
      event.target.value = "";
      return;
    }
    if (file.size > maxBytes) {
      setMessage(`${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The maximum for ${type}s is ${maxLabel}. Compress the file or choose a smaller one.`);
      event.target.value = "";
      return;
    }
    onUploadingChange(true);
    setUploadProgress(0);
    setMessage("Uploading… keep this page open until the upload finishes.");
    try {
      await startUpload(Array.from(files));
    } catch {
      onUploadingChange(false);
      setUploadProgress(0);
      setMessage("Upload failed. Check your connection and try again. Your current media has been kept.");
    }
  }

  function applyVideoUrl() {
    const candidate = urlDraft.trim();
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Unsupported protocol");
      onChange(candidate, "video");
      setMessage("Video link applied. Check the preview before saving the service.");
    } catch {
      setMessage("Enter a complete video URL beginning with https:// or http://.");
    }
  }

  return (
    <fieldset className="sd-media-picker" disabled={isUploading}>
      <legend>Service media</legend>
      <p className="sd-media-help">Choose what customers will see. Image and video are handled separately.</p>
      <div className="sd-media-mode" role="group" aria-label="Media type">
        <button type="button" className={type === "image" ? "is-selected" : ""} onClick={() => { onChange("", "image"); setUrlDraft(""); setMessage("Media type changed to image. Select or upload an image."); }}>Image</button>
        <button type="button" className={type === "video" ? "is-selected" : ""} onClick={() => { onChange("", "video"); setUrlDraft(""); setMessage("Media type changed to video. Upload a video or add its URL."); }}>Video</button>
      </div>
      {type === "image" ? (
        <div className="sd-media-upload">
          <label className="sd-media-file-label" htmlFor="service-media-file">Upload an image from this device or camera · max 4 MB</label>
          <input ref={inputRef} id="service-media-file" type="file" accept="image/*" capture="environment" onChange={uploadSelected} disabled={isUploading} />
          <small>Images upload to UploadThing (maximum 4 MB). Internet is required to finish uploading; choosing a file alone does not publish it.</small>
          {!online && <p className="sd-media-offline">Offline: image upload is paused. Reconnect before uploading.</p>}
          <label className="sd-media-url-label" htmlFor="service-image-url">Or use an existing image URL</label>
          <input id="service-image-url" type="url" value={value} onChange={event => { onChange(event.target.value, "image"); setMessage(""); }} placeholder="https://…/image.jpg" />
        </div>
      ) : (
        <div className="sd-media-upload">
          <label className="sd-media-file-label" htmlFor="service-media-file">Upload a video from this device · max 16 MB</label>
          <input ref={inputRef} id="service-media-file" type="file" accept="video/*" capture="environment" onChange={uploadSelected} disabled={!online || isUploading} />
          <small>Video uploads use UploadThing (maximum 16 MB) and need internet. You can also paste a hosted video file URL below.</small>
          {!online && <p className="sd-media-offline">Offline: video upload is paused. Reconnect before uploading.</p>}
          <label className="sd-media-url-label" htmlFor="service-video-url">Video URL</label>
          <div className="sd-media-url-row"><input id="service-video-url" type="url" value={urlDraft} onChange={event => setUrlDraft(event.target.value)} placeholder="https://…/video.mp4" /><button type="button" onClick={applyVideoUrl}>Use URL</button></div>
        </div>
      )}
      {isUploading && <div className="sd-media-progress" role="status" aria-live="polite"><div className="sd-media-progress-copy"><strong>Uploading media</strong><span>{uploadProgress}%</span></div><div className="sd-media-progress-track" role="progressbar" aria-label="Media upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><span style={{ width: `${uploadProgress}%` }} /></div><small>Keep this page open until UploadThing confirms the upload.</small></div>}
      {message && <p className="sd-media-status" role="status">{message}</p>}
      {value && <div className="sd-media-preview"><span>PREVIEW · {type.toUpperCase()}</span>{type === "video" ? <video src={value} controls muted playsInline preload="metadata" /> : <img src={value} alt="Selected service media preview" onError={event => { event.currentTarget.style.display = "none"; }} />}<button type="button" onClick={() => { onChange("", type); setUrlDraft(""); setMessage("Media cleared. Save the service to remove it from the storefront."); }}>Remove media</button></div>}
    </fieldset>
  );
}
