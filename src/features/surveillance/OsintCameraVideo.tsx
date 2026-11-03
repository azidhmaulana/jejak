import { useEffect, useRef, useState } from 'react';
import { reportCameraHealth, type SurveillanceSource } from './osintSurveillanceStore';
export default function OsintCameraVideo({
  source,
  compact = false,
  onStatus,
}: {
  source: SurveillanceSource;
  compact?: boolean;
  onStatus?: (status: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    [status, setStatus] = useState(
      source.streamUrl || source.previewUrl ? 'MEMUAT' : 'BELUM TERVERIFIKASI',
    ),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);
  useEffect(() => {
    const element = video.current;
    if (!element || !source.streamUrl) return;
    let disposed = false,
      cleanup = () => {};
    setStatus('MEMUAT');
    const url =
      source.id.startsWith('bandung-atcs-') || source.id.startsWith('bandung-public-')
        ? '/api/osint/camera-media/' +
          source.id +
          '/~' +
          btoa(
            new URL(source.streamUrl).pathname.split('/').pop()! + new URL(source.streamUrl).search,
          )
            .replace(/=+$/, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
        : source.streamUrl;
    const playing = () => {
        if (disposed) return;
        setStatus('LIVE');
        reportCameraHealth(source.id, 'online', 'Video berhasil diputar');
      },
      waiting = () => setStatus('BUFFERING'),
      failed = () => {
        if (!disposed) setStatus('STREAM TIDAK TERSEDIA');
      };
    const play = () => {
      void element.play().catch(() => {
        if (!disposed) setStatus('TEKAN PLAY');
      });
    };
    element.addEventListener('playing', playing);
    element.addEventListener('waiting', waiting);
    element.addEventListener('error', failed);
    void import('hls.js')
      .then(({ default: Hls }) => {
        if (disposed) return;
        if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 12,
            backBufferLength: 4,
            maxMaxBufferLength: 24,
            capLevelToPlayerSize: true,
            lowLatencyMode: true,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 6,
            maxLiveSyncPlaybackRate: 1.05,
          });
          cleanup = () => hls.destroy();
          hls.on(Hls.Events.MANIFEST_PARSED, play);
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              failed();
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !disposed)
                reportCameraHealth(
                  source.id,
                  data.response?.code === 503 ? 'unknown' : 'offline',
                  data.response?.code === 503
                    ? 'Proxy sedang sibuk; belum dapat memastikan status kamera'
                    : 'Stream gagal diakses dari aplikasi',
                );
              hls.destroy();
            }
          });
          hls.loadSource(url);
          hls.attachMedia(element);
        } else if (element.canPlayType('application/vnd.apple.mpegurl')) {
          element.src = url;
          play();
        } else setStatus('HLS TIDAK DIDUKUNG');
      })
      .catch(failed);
    return () => {
      disposed = true;
      cleanup();
      element.removeEventListener('playing', playing);
      element.removeEventListener('waiting', waiting);
      element.removeEventListener('error', failed);
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, [source.streamUrl, source.id, compact, retry]);
  const pending = status === 'MEMUAT' || status === 'BUFFERING';
  const unavailable = status === 'STREAM TIDAK TERSEDIA' || status === 'PREVIEW TIDAK TERSEDIA';
  const showPlaceholder = status !== 'LIVE' && status !== 'SNAPSHOT';
  return (
    <div className="osint-camera-video" data-compact={compact}>
      {source.streamUrl ? (
        <video
          ref={video}
          muted
          playsInline
          controls={!compact}
          controlsList="nodownload"
          aria-label={source.name}
        />
      ) : source.previewUrl ? (
        <img
          src={source.previewUrl}
          alt={source.name}
          onLoad={() => setStatus('SNAPSHOT')}
          onError={() => setStatus('PREVIEW TIDAK TERSEDIA')}
        />
      ) : null}
      {compact && !showPlaceholder && (source.streamUrl || source.previewUrl) && (
        <span className="osint-stream-status" data-live={status === 'LIVE'}>
          {status === 'LIVE' && <i className="osint-live-dot" aria-hidden="true" />}
          {status}
        </span>
      )}
      {showPlaceholder && (
        <div
          className="osint-stream-placeholder"
          data-pending={pending}
          data-offline={unavailable}
          role="status"
        >
          <div className="osint-placeholder-top">
            <span>
              <i />
              {pending
                ? status === 'BUFFERING'
                  ? 'BUFFERING'
                  : 'MENGHUBUNGKAN'
                : unavailable
                  ? 'STREAM TIDAK TERSEDIA'
                  : status}
            </span>
            <small>
              {source.provider || (source.id.startsWith('bandung-atcs-') ? 'ATCS BANDUNG' : 'CCTV')}
            </small>
          </div>
          <div className="osint-placeholder-center">
            <div className="osint-placeholder-signal">
              <i />
            </div>
            <strong>{source.name}</strong>
            <small>
              {unavailable
                ? 'Sumber belum dapat diakses'
                : pending
                  ? 'Menunggu gambar dari sumber'
                  : !source.streamUrl && !source.previewUrl
                    ? 'URL stream belum terverifikasi'
                    : 'Periksa dukungan pemutaran browser'}
            </small>
            {!compact && source.streamUrl && (
              <button
                className="osint-placeholder-retry"
                onClick={() => setRetry((value) => value + 1)}
              >
                {pending ? 'Hubungkan ulang' : 'Coba lagi'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
