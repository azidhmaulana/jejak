import { cameraPlaybackUrl, startCameraPlayback } from './cameraPlayback';
import { useEffect, useRef, useState } from 'react';
import {
  reportCameraHealth,
  useSurveillance,
  type SurveillanceSource,
} from './osintSurveillanceStore';
export default function OsintCameraVideo({
  source,
  compact = false,
  requestToken,
  onStatus,
}: {
  source: SurveillanceSource;
  compact?: boolean;
  requestToken?: string;
  onStatus?: (status: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    [status, setStatus] = useState(
      source.streamUrl || source.previewUrl ? 'MEMUAT' : 'BELUM TERVERIFIKASI',
    ),
    [retry, setRetry] = useState(0);
  const [hasFrame, setHasFrame] = useState(false);
  const offline = useSurveillance((state) => state.health[source.id]?.status === 'offline');
  const manualAttempt = useRef(false);
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const blocked = useRef<string | null>(null);
  const retryManually = () => {
    manualAttempt.current = true;
    setRetry((value) => value + 1);
  };
  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);
  useEffect(() => {
    const element = video.current;
    setHasFrame(false);
    setStatus(source.streamUrl || source.previewUrl ? 'MEMUAT' : 'BELUM TERVERIFIKASI');
    const requested = manualAttempt.current || requestToken !== undefined;
    manualAttempt.current = false;
    if (requested) {
      blocked.current = null;
      if (
        /^(bandung-atcs-|bandung-public-|garut-diskominfo-|jabar-public-|public-camera-)/.test(
          source.id,
        )
      ) {
        void fetch(`/api/osint/camera-health?id=${encodeURIComponent(source.id)}`, {
          method: 'POST',
        }).catch(() => {});
      }
    }
    if ((offlineRef.current || blocked.current === source.id) && !requested) {
      blocked.current = source.id;
      setStatus('STREAM TIDAK TERSEDIA');
      return;
    }
    if (!element || !source.streamUrl) return;
    let reported = false;
    return startCameraPlayback(
      element,
      cameraPlaybackUrl({ id: source.id, streamUrl: source.streamUrl }),
      {
        status: (value) => {
          setStatus(value);
          if (value === 'STREAM TIDAK TERSEDIA') {
            blocked.current = source.id;
            reportCameraHealth(source.id, 'offline', 'Pemutaran gagal; menunggu percobaan manual');
          }
        },
        frame: (live) => {
          setHasFrame(true);
          if (!reported && live !== false) {
            reported = true;
            reportCameraHealth(source.id, 'online', 'Video berhasil diputar');
          }
        },
      },
    );
  }, [source.streamUrl, source.previewUrl, source.id, retry, requestToken]);
  const pending = status === 'MEMUAT' || status === 'BUFFERING' || status === 'MENGHUBUNGKAN ULANG';
  const unavailable = status === 'STREAM TIDAK TERSEDIA' || status === 'PREVIEW TIDAK TERSEDIA';
  const showPlaceholder = !hasFrame && status !== 'LIVE' && status !== 'SNAPSHOT';
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
      ) : source.previewUrl && (!offline || retry > 0 || requestToken !== undefined) ? (
        <img
          key={`${requestToken}-${retry}`}
          src={source.previewUrl}
          alt={source.name}
          onLoad={() => setStatus('SNAPSHOT')}
          onError={() => setStatus('PREVIEW TIDAK TERSEDIA')}
        />
      ) : null}
      {hasFrame && status !== 'LIVE' && status !== 'REKAMAN' && (
        <div className="osint-stream-recovery" role="status">
          <span>{status}</span>
          {!compact && <button onClick={retryManually}>Hubungkan ulang</button>}
        </div>
      )}
      {compact &&
        status === 'LIVE' &&
        !showPlaceholder &&
        (source.streamUrl || source.previewUrl) && (
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
              <button className="osint-placeholder-retry" onClick={retryManually}>
                {pending ? 'Hubungkan ulang' : 'Coba lagi'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
