import { useMapTools, type FillStyle, type LineStyle } from './mapToolsStore';
import { objectLocked } from './drawingObjects';
export default function DrawingStyleFields() {
  const state = useMapTools();
  return (
    <fieldset
      className="map-style-fields"
      disabled={objectLocked(state.features.find((feature) => feature.id === state.selectedId))}
    >
      <label>
        WARNA
        <input
          aria-label="Drawing color"
          type="color"
          value={state.color}
          onChange={(event) => state.controller?.style({ color: event.target.value })}
        />
        <output>{state.color.toUpperCase()}</output>
      </label>
      <label>
        KETEBALAN
        <input
          aria-label="Drawing stroke width"
          type="range"
          min="1"
          max="10"
          value={state.width}
          onChange={(event) => state.controller?.style({ width: Number(event.target.value) })}
        />
        <output>{state.width} px</output>
      </label>
      <label>
        GARIS LUAR
        <select
          aria-label="Drawing line style"
          value={state.lineStyle}
          onChange={(event) =>
            state.controller?.style({ lineStyle: event.target.value as LineStyle })
          }
        >
          <option value="solid">Utuh</option>
          <option value="dashed">Putus-putus</option>
          <option value="dotted">Titik-titik</option>
          <option value="dash-dot">Putus-titik</option>
        </select>
      </label>
      <label>
        ISI BIDANG
        <select
          aria-label="Drawing fill style"
          value={state.fillStyle}
          onChange={(event) =>
            state.controller?.style({
              fillStyle: event.target.value as FillStyle,
              ...(event.target.value === 'none' ? {} : { fillOpacity: 100 }),
            })
          }
        >
          <option value="none">Tanpa isi</option>
          <option value="solid">Blok warna</option>
          <option value="hatch">Arsir diagonal</option>
          <option value="crosshatch">Arsir silang</option>
        </select>
      </label>
      <label>
        OPASITAS ISI
        <input
          aria-label="Drawing fill opacity"
          type="range"
          min="0"
          max="100"
          disabled={state.fillStyle === 'none'}
          value={state.fillOpacity}
          onChange={(event) => state.controller?.style({ fillOpacity: Number(event.target.value) })}
        />
        <output>{state.fillOpacity}%</output>
      </label>
      <div className="map-style-preview" aria-label="Drawing style preview">
        <span
          style={{
            borderColor: state.color,
            borderWidth: state.width,
            borderStyle:
              state.lineStyle === 'solid'
                ? 'solid'
                : state.lineStyle === 'dotted'
                  ? 'dotted'
                  : 'dashed',
          }}
        >
          <i
            style={{
              opacity: state.fillOpacity / 100,
              background:
                state.fillStyle === 'none'
                  ? 'transparent'
                  : state.fillStyle === 'solid'
                    ? state.color
                    : `${state.fillStyle === 'crosshatch' ? `repeating-linear-gradient(45deg, transparent 0 5px, ${state.color} 5px 6.5px),` : ''}repeating-linear-gradient(-45deg, transparent 0 5px, ${state.color} 5px 6.5px)`,
            }}
          />
        </span>
      </div>
    </fieldset>
  );
}
