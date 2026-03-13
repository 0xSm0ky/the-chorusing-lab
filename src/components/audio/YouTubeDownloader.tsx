"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Youtube,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle,
  Music,
  Clock,
  Cookie,
  Upload,
  Trash2,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";

interface VideoInfo {
  title: string;
  duration: number;
  thumbnail: string;
  videoId: string;
  url: string;
}

interface YouTubeDownloaderProps {
  onAudioReady: (file: File, sourceUrl: string) => void;
}

export function YouTubeDownloader({ onAudioReady }: YouTubeDownloaderProps) {
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [needsCookies, setNeedsCookies] = useState(false);
  const [hasCookies, setHasCookies] = useState(false);
  const [cookieUploading, setCookieUploading] = useState(false);
  const [cookieMessage, setCookieMessage] = useState<string | null>(null);
  const cookieInputRef = useRef<HTMLInputElement>(null);

  // Check cookie status on mount
  useEffect(() => {
    fetch("/api/youtube-download?status=cookies")
      .then((r) => r.json())
      .then((data) => setHasCookies(data.hasCookies))
      .catch(() => {});
  }, []);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleFetchInfoDirect = async (directUrl: string) => {
    if (!directUrl) return;

    setFetchingInfo(true);
    setError(null);
    setVideoInfo(null);
    setNeedsCookies(false);

    try {
      const res = await fetch(`/api/youtube-download?url=${encodeURIComponent(directUrl)}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.needsCookies) {
          setNeedsCookies(true);
        }
        throw new Error(data.error || "Failed to fetch video info");
      }

      setVideoInfo(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch video info");
    } finally {
      setFetchingInfo(false);
    }
  };

  const handleFetchInfo = async () => {
    if (!url.trim()) return;
    await handleFetchInfoDirect(url.trim());
  };

  const handleDownload = async () => {
    if (!videoInfo) return;

    setDownloading(true);
    setError(null);
    setNeedsCookies(false);
    setProgress("Downloading and converting audio...");

    try {
      const res = await fetch("/api/youtube-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoInfo.url, title: videoInfo.title }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.needsCookies) {
          setNeedsCookies(true);
        }
        throw new Error(data.error || "Download failed");
      }

      setProgress("Processing audio file...");

      const blob = await res.blob();
      const titleHeader = res.headers.get("X-Audio-Title");
      const title = titleHeader ? decodeURIComponent(titleHeader) : videoInfo.title;
      const filename = `${title}.mp3`;

      const file = new File([blob], filename, { type: "audio/mpeg" });

      setProgress("Audio ready!");

      setTimeout(() => {
        onAudioReady(file, videoInfo.url);
      }, 500);
    } catch (err: any) {
      setError(err.message || "Download failed");
      setProgress("");
    } finally {
      setDownloading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !fetchingInfo && !downloading) {
      handleFetchInfo();
    }
  };

  const handlePasteAndFetch = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        if (/youtube\.com|youtu\.be/.test(text)) {
          setTimeout(() => {
            handleFetchInfoDirect(text.trim());
          }, 100);
        }
      }
    } catch {
      // Clipboard access denied
    }
  };

  const handleCookieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCookieUploading(true);
    setCookieMessage(null);
    setError(null);

    try {
      const text = await file.text();
      const res = await fetch("/api/youtube-download", {
        method: "PUT",
        body: text,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload cookies");
      }

      setHasCookies(true);
      setNeedsCookies(false);
      setCookieMessage(data.message || "Cookies saved!");

      // Auto-retry the last URL if we were blocked
      if (url.trim()) {
        setTimeout(() => {
          handleFetchInfoDirect(url.trim());
          setCookieMessage(null);
        }, 1000);
      }
    } catch (err: any) {
      setError(err.message || "Failed to upload cookies");
    } finally {
      setCookieUploading(false);
      if (cookieInputRef.current) cookieInputRef.current.value = "";
    }
  };

  const handleRemoveCookies = async () => {
    try {
      const res = await fetch("/api/youtube-download", { method: "DELETE" });
      if (res.ok) {
        setHasCookies(false);
        setCookieMessage("Cookies removed");
        setTimeout(() => setCookieMessage(null), 2000);
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      {/* URL Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          YouTube URL
        </label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              disabled={downloading}
            />
          </div>
          <button
            onClick={handlePasteAndFetch}
            disabled={fetchingInfo || downloading}
            className="px-3 py-3 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Paste from clipboard"
          >
            📋
          </button>
          <button
            onClick={handleFetchInfo}
            disabled={!url.trim() || fetchingInfo || downloading}
            className="px-5 py-3 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {fetchingInfo ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Fetching...
              </>
            ) : (
              "Fetch Info"
            )}
          </button>
        </div>
      </div>

      {/* Cookie Status Badge */}
      <div className="flex items-center gap-2 text-xs">
        {hasCookies ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full">
            <ShieldCheck className="w-3 h-3" />
            YouTube cookies active
            <button
              onClick={handleRemoveCookies}
              className="ml-1 p-0.5 hover:text-red-600 transition-colors"
              title="Remove cookies"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 text-gray-500 border border-gray-200 rounded-full">
            <Cookie className="w-3 h-3" />
            No cookies — some videos may be blocked
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Cookie Upload Section — shown when needed or on demand */}
      {needsCookies && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
          <div className="flex items-start gap-2">
            <Cookie className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-amber-800 text-sm">YouTube Cookies Required</h4>
              <p className="text-xs text-amber-700 mt-1">
                YouTube is blocking this request. You need to export cookies from your browser and upload them here.
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs text-amber-700">
            <p className="font-medium">How to get cookies:</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>
                Install{" "}
                <a
                  href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-800 underline hover:text-amber-900 inline-flex items-center gap-0.5"
                >
                  Get cookies.txt LOCALLY
                  <ExternalLink className="w-3 h-3" />
                </a>{" "}
                extension
              </li>
              <li>Go to <strong>youtube.com</strong> and make sure you&apos;re signed in</li>
              <li>Click the extension icon → <strong>Export</strong></li>
              <li>Upload the downloaded <code className="bg-amber-100 px-1 rounded">.txt</code> file below</li>
            </ol>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={cookieInputRef}
              type="file"
              accept=".txt"
              onChange={handleCookieUpload}
              className="hidden"
              id="cookie-file-input"
            />
            <label
              htmlFor="cookie-file-input"
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
                cookieUploading
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-amber-600 text-white hover:bg-amber-700"
              }`}
            >
              {cookieUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload cookies.txt
                </>
              )}
            </label>
          </div>
        </div>
      )}

      {/* Cookie success message */}
      {cookieMessage && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm">{cookieMessage}</span>
        </div>
      )}

      {/* Video Info Preview */}
      {videoInfo && (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
          <div className="flex gap-4 p-4">
            {videoInfo.thumbnail && (
              <div className="flex-shrink-0">
                <Image
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  width={160}
                  height={96}
                  className="rounded-md object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-gray-900 truncate">
                {videoInfo.title}
              </h4>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatDuration(videoInfo.duration)}
                </span>
                <span className="flex items-center gap-1">
                  <Music className="w-4 h-4" />
                  MP3 audio
                </span>
              </div>
              {videoInfo.duration > 3600 && (
                <p className="mt-2 text-xs text-amber-600">
                  ⚠️ Long video — download may take a while
                </p>
              )}
            </div>
          </div>

          <div className="px-4 pb-4">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full px-6 py-3 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {progress || "Downloading..."}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download Audio & Open in Editor
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Success indicator */}
      {progress === "Audio ready!" && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm">Audio downloaded! Opening editor...</span>
        </div>
      )}
    </div>
  );
}
