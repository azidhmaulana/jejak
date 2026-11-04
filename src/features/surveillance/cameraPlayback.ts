import type Hls from 'hls.js';

export function cameraPlaybackUrl(source: { id: string; streamUrl: string }) {
  if (!/^(bandung-atcs-|bandung-public-|garut-diskominfo-|jabar-public-)/.test(source.id))
    return source.streamUrl;
  const url = new URL(source.streamUrl);
  const resource = btoa(url.pathname.split('/').pop()! + url.search)
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `/api/osint/camera-media/${source.id}/~${resource}`;
}

type Callbacks = { status: (value: string) => void; frame: () => void };
export function startCameraPlayback(
  video: HTMLVideoElement,
  url: string,
  callbacks: Callbacks,
  loadHls = () => import('hls.js'),
) {
  let stopped = false;
  let hls: Hls | undefined;
  let restart: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let attempts = 0;
  let mediaRecoveries = 0;
  let hasFrame = false;
  let autoplayBlocked = false;
  let lastProgress = Date.now();
  let lastTime = -1;
  let stableSince = 0;
  const status = (value: string) => {
    if (!stopped) callbacks.status(value);
  };
  const play = () => {
    void video.play().catch((error: DOMException) => {
      if (stopped || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') {
        autoplayBlocked = true;
        status('TEKAN PLAY');
      } else reconnect();
    });
  };
  const reconnect = () => {
    if (stopped || restart !== undefined) return;
    stableSince = 0;
    if (attempts >= 6) {
      hls?.stopLoad();
      status('STREAM TIDAK TERSEDIA');
      return;
    }
    status('MENGHUBUNGKAN ULANG');
    hls?.stopLoad();
    const delay = Math.min(1000 * 2 ** attempts++, 30000);
    restart = setTimeout(() => {
      restart = undefined;
      void connect();
    }, delay);
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
      if (stopped || current !== generation) return;
      if (Player.isSupported()) {
        const player = new Player({
          maxBufferLength: 20,
          backBufferLength: 8,
          maxMaxBufferLength: 40,
          capLevelToPlayerSize: true,
          lowLatencyMode: false,
          liveSyncDurationCount: 4,
          liveMaxLatencyDurationCount: 10,
          maxLiveSyncPlaybackRate: 1.05,
        });
        hls = player;
        player.on(Player.Events.MANIFEST_PARSED, play);
        player.on(Player.Events.ERROR, (_, data) => {
          if (stopped || current !== generation || !data.fatal) return;
          if (data.type === Player.ErrorTypes.MEDIA_ERROR && mediaRecoveries++ < 2) {
            status('MENGHUBUNGKAN ULANG');
            lastProgress = Date.now();
            player.recoverMediaError();
          } else reconnect();
        });
        player.loadSource(url);
        player.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.load();
        play();
      } else status('HLS TIDAK DIDUKUNG');
    } catch {
      reconnect();
    }
  };
  const playing = () => {
    if (stopped) return;
    hasFrame = true;
    autoplayBlocked = false;
    lastProgress = Date.now();
    stableSince ||= lastProgress;
    callbacks.frame();
    status('LIVE');
  };
  const waiting = () => {
    if (!restart) status('BUFFERING');
    stableSince = 0;
  };
  const progress = () => {
    if (video.currentTime === lastTime) return;
    lastTime = video.currentTime;
    lastProgress = Date.now();
    if (video.readyState >= 2 && !video.paused && !restart) {
      hasFrame = true;
      stableSince ||= lastProgress;
      callbacks.frame();
      status('LIVE');
      if (lastProgress - stableSince >= 15000) {
        attempts = 0;
        mediaRecoveries = 0;
      }
    }
  };
  const online = () => {
    if (stopped) return;
    attempts = 0;
    clearTimeout(restart);
    restart = undefined;
    reconnect();
  };
  const mediaError = () => {
    if (!hls) reconnect();
  };
  video.addEventListener('playing', playing);
  video.addEventListener('waiting', waiting);
  video.addEventListener('stalled', waiting);
  video.addEventListener('timeupdate', progress);
  video.addEventListener('error', mediaError);
  window.addEventListener('online', online);
  const watchdog = setInterval(() => {
    if (stopped || autoplayBlocked || restart || attempts >= 6 || (hasFrame && video.paused))
      return;
    if (Date.now() - lastProgress > 20000) reconnect();
  }, 2000);
  status('MEMUAT');
  void connect();
  return () => {
    if (stopped) return;
    stopped = true;
    generation++;
    clearTimeout(restart);
    clearInterval(watchdog);
    window.removeEventListener('online', online);
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
