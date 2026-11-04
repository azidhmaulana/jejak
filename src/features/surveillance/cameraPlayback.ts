import type Hls from 'hls.js';

export function cameraPlaybackUrl(source: { id: string; streamUrl: string }) {
  if (!/^(bandung-atcs-|bandung-public-|garut-diskominfo-|jabar-public-|public-camera-)/.test(source.id))
    return source.streamUrl;
  const url = new URL(source.streamUrl);
  const resource = btoa(url.pathname.split('/').pop()! + url.search)
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `/api/osint/camera-media/${source.id}/~${resource}`;
}

type Callbacks = { status: (value: string) => void; frame: (live?: boolean) => void };
export function startCameraPlayback(
  video: HTMLVideoElement,
  url: string,
  callbacks: Callbacks,
  loadHls = () => import('hls.js'),
) {
  let stopped = false;
  let hls: Hls | undefined;
  let generation = 0;
  let failed = false;
  let mediaRecoveries = 0;
  let hasFrame = false;
  let autoplayBlocked = false;
  let lastProgress = Date.now();
  let lastTime = -1;
  let liveFeed = true;
  const lowLatency = url.includes('jabar-public-diskominfo-indramayu-');
  const status = (value: string) => {
    if (!stopped) callbacks.status(value);
  };
  const play = () => {
    void video.play().catch((error: DOMException) => {
      if (stopped || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') {
        autoplayBlocked = true;
        status('TEKAN PLAY');
      } else stopUnavailable();
    });
  };
  const stopUnavailable = () => {
    if (stopped || failed) return;
    failed = true;
    clearInterval(watchdog);
    generation++;
    hls?.destroy();
    hls = undefined;
    video.pause();
    video.removeAttribute('src');
    video.load();
    status('STREAM TIDAK TERSEDIA');
  };
  const connect = async () => {
    const current = ++generation;
    hls?.destroy();
    hls = undefined;
    lastProgress = Date.now();
    lastTime = video.currentTime;
    autoplayBlocked = false;
    try {
      const { default: Player } = await loadHls();
      if (stopped || failed || current !== generation) return;
      if (Player.isSupported()) {
        const player = new Player({
          // MediaMTX fragmented MP4 feeds must remain on the main demux path.
          enableWorker: !lowLatency,
          maxBufferLength: 20,
          backBufferLength: 8,
          maxMaxBufferLength: 40,
          capLevelToPlayerSize: true,
          lowLatencyMode: lowLatency,
          // Let LL-HLS use the provider's PART-HOLD-BACK instead of forcing four full segments.
          ...(lowLatency ? {} : { liveSyncDurationCount: 4, liveMaxLatencyDurationCount: 10 }),
          maxLiveSyncPlaybackRate: 1.05,
        });
        hls = player;
        player.on(Player.Events.MANIFEST_PARSED, play);
        player.on(Player.Events.LEVEL_LOADED, (_, data) => {
          liveFeed = data.details.live;
        });
        player.on(Player.Events.ERROR, (_, data) => {
          if (stopped || failed || current !== generation || !data.fatal) return;
          if (data.type === Player.ErrorTypes.MEDIA_ERROR && mediaRecoveries++ < 2) {
            status('MENGHUBUNGKAN ULANG');
            lastProgress = Date.now();
            player.recoverMediaError();
          } else stopUnavailable();
        });
        player.loadSource(url);
        player.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.load();
        play();
      } else status('HLS TIDAK DIDUKUNG');
    } catch {
      stopUnavailable();
    }
  };
  const playing = () => {
    if (stopped || failed) return;
    hasFrame = true;
    autoplayBlocked = false;
    lastProgress = Date.now();
    callbacks.frame(liveFeed);
    status(liveFeed ? 'LIVE' : 'REKAMAN');
  };
  const waiting = () => {
    if (!failed) status('BUFFERING');
  };
  const progress = () => {
    if (failed || stopped || video.currentTime === lastTime) return;
    lastTime = video.currentTime;
    lastProgress = Date.now();
    if (video.readyState >= 2 && !video.paused && !failed) {
      hasFrame = true;
      callbacks.frame(liveFeed);
      status(liveFeed ? 'LIVE' : 'REKAMAN');
    }
  };
  const mediaError = () => {
    if (!hls) stopUnavailable();
  };
  video.addEventListener('playing', playing);
  video.addEventListener('waiting', waiting);
  video.addEventListener('stalled', waiting);
  video.addEventListener('timeupdate', progress);
  video.addEventListener('error', mediaError);
  const watchdog = setInterval(() => {
    if (stopped || failed || autoplayBlocked || (hasFrame && video.paused)) return;
    // On-demand feeds need time to build their initial segment buffer.
    if (Date.now() - lastProgress > (hasFrame ? 20000 : 45000)) stopUnavailable();
  }, 2000);
  status('MEMUAT');
  void connect();
  return () => {
    if (stopped) return;
    stopped = true;
    generation++;
    clearInterval(watchdog);
    video.removeEventListener('playing', playing);
    video.removeEventListener('waiting', waiting);
    video.removeEventListener('stalled', waiting);
    video.removeEventListener('timeupdate', progress);
    video.removeEventListener('error', mediaError);
    hls?.destroy();
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
}
