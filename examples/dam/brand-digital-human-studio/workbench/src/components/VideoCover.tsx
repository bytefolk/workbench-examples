import { useEffect, useRef, useState } from "react";
import "./VideoCover.css";

// Display a paused frame directly, so remote results do not require canvas CORS.
export function VideoCover({ src, label }: { src: string; label: string }) {
  return <VideoFrame key={src} src={src} label={label} />;
}

function VideoFrame({ src, label }: { src: string; label: string }) {
  const container = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element || !src) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [src]);
  const unavailable = failed || !src;
  return (
    <span
      ref={container}
      className="video-cover-frame"
      role="img"
      aria-label={`${label} · ${unavailable ? "视频封面暂不可用" : "生成视频画面"}`}
      data-state={unavailable ? "unavailable" : ready ? "ready" : "loading"}
    >
      {src && !failed && (
        <video
          src={active ? src : undefined}
          preload="metadata"
          muted
          playsInline
          aria-hidden="true"
          tabIndex={-1}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration) && video.duration > 0)
              video.currentTime = Math.min(1, video.duration * 0.2);
          }}
          onLoadedData={(event) => {
            if (!event.currentTarget.seeking) setReady(true);
          }}
          onSeeked={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      )}
      {!ready || unavailable ? (
        <span className="video-cover-message">
          {unavailable ? "视频封面暂不可用" : "正在读取视频画面…"}
        </span>
      ) : null}
    </span>
  );
}
