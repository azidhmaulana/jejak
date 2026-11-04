export const spaceStreams = [
  {
    id: 'sen-earth',
    videoId: 'fO9e9jnhYK8',
    label: '4K EARTH',
    provider: 'Sen',
    description: { en: '4K cameras aboard the ISS', id: 'Kamera 4K di ISS' },
    source: 'https://www.sen.com/',
  },
  {
    id: 'nasa-earth',
    videoId: 'ROboUHfPUrU',
    label: 'EARTH VIEW',
    provider: 'NASA',
    description: {
      en: 'High-definition Earth views from the ISS',
      id: 'Tampilan Bumi HD dari ISS',
    },
    source: 'https://www.nasa.gov/live/',
  },
  {
    id: 'nasa-iss',
    videoId: 'M3HKLzjvKPc',
    label: 'ISS CAMERA',
    provider: 'NASA',
    description: {
      en: 'Live video from the International Space Station',
      id: 'Video langsung dari Stasiun Antariksa Internasional',
    },
    source: 'https://www.nasa.gov/live/',
  },
] as const;

// Checked against the publishers' YouTube liveBroadcastDetails, not isLiveContent
// (which remains true for ended broadcasts). Links can change when streams restart.
export const spaceStreamsCheckedAt = '2026-11-04';

export function spaceEmbedUrl(videoId: string) {
  if (!spaceStreams.some((stream) => stream.videoId === videoId))
    throw new Error('Unknown space stream');
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0`;
}
