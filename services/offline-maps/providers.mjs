export const satelliteProvider='eox-satellite';
export const providers={
  'mbtiles-raster':{name:'MBTiles Raster',type:'raster',importOnly:true,attribution:''},
  gmdb:{name:'GMap.NET / GMDB',type:'raster',importOnly:true,attribution:'GMap.NET cache'},
  openmaptiles:{name:'OpenMapTiles / MBTiles',type:'vector',importOnly:true,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> &middot; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &middot; <a href="https://openmaptiles.org/">OpenMapTiles</a>'},
  protomaps:{name:'Protomaps',type:'vector',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> &middot; <a href="https://protomaps.com">Protomaps</a>'},
  [satelliteProvider]:{name:'EOX Sentinel-2 2016/2017',type:'raster',date:'2016/2017',attribution:'<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by <a href="https://eox.at">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016 &amp; 2017) &middot; <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>'},
};
export const providerOf=region=>region?.provider||'protomaps';
export function activeRegion(state,provider){
  const id=Object.hasOwn(state.activeByProvider||{},provider)?state.activeByProvider[provider]:state.activeId;
  return state.regions.find(region=>region.id===id&&region.file&&providerOf(region)===provider);
}
// Fixed public CC BY source; no arbitrary URLs or upstream credentials accepted.
export const satelliteUrl=(z,x,y)=>`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`;
export function tileRanges(bounds,maxzoom){
  const [west,south,east,north]=bounds;
  return Array.from({length:maxzoom+1},(_,z)=>{
    const n=2**z,clamp=v=>Math.max(0,Math.min(n-1,v));
    const row=lat=>(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n;
    return {z,left:clamp(Math.floor((west+180)/360*n)),right:clamp(Math.ceil((east+180)/360*n)-1),top:clamp(Math.floor(row(north))),bottom:clamp(Math.ceil(row(south))-1)};
  });
}
export const tileCount=(bounds,maxzoom)=>tileRanges(bounds,maxzoom).reduce((sum,r)=>sum+(r.right-r.left+1)*(r.bottom-r.top+1),0);
