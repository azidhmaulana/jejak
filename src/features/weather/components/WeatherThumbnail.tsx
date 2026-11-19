type Props = { kind: 'rain' | 'clouds' | 'wind' | 'cyclones'; variant?: string };
const images = { rain: 'radar', clouds: 'satellite', wind: 'wind', cyclones: 'storms' };

export default function WeatherThumbnail({ kind }: Props) {
  return <span className={`weather-thumbnail weather-thumbnail-${kind}`} aria-hidden="true">
    <img src={`/images/weather/${images[kind]}.png`} alt="" />
  </span>;
}
