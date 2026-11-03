import {providers,satelliteProvider,tileCount} from './providers.mjs';
export const initialRegion={id:'jabar-jakarta-banten',name:'Jawa Barat · Jakarta · Banten',bounds:[105,-8,109.1,-5.1],maxzoom:14};
export const invalid=(message,status=400)=>Object.assign(Error(message),{status});
export function validateRegion(input){
  if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.length>80)throw invalid('Isi nama wilayah (maksimal 80 karakter).');
  if(input.imported||providers[input.provider]?.importOnly)throw invalid('Paket impor dimuat melalui Browse, bukan diunduh ulang.');
  const b=input.bounds;
  if(!Array.isArray(b)||b.length!==4||!b.every(v=>typeof v==='number'&&Number.isFinite(v))||b[0]<-180||b[2]>180||b[1]<-85||b[3]>85||b[0]>=b[2]||b[1]>=b[3])throw invalid('Batas wilayah tidak valid. Gunakan barat, selatan, timur, utara.');
  // Bound a single download; larger deployments can use several regional packages.
  if((b[2]-b[0])*(b[3]-b[1])>100)throw invalid('Area terlalu luas. Bagi menjadi beberapa paket wilayah (maksimal 100 derajat persegi).');
  const provider=input.provider||'protomaps';
  if(!Object.hasOwn(providers,provider))throw invalid('Provider offline tidak valid.');
  const maxzoom=provider===satelliteProvider?18:15;
  if(!Number.isInteger(input.maxzoom)||input.maxzoom<8||input.maxzoom>maxzoom)throw invalid(`Detail zoom harus 8-${maxzoom}.`);
  if(provider===satelliteProvider&&tileCount(b,input.maxzoom)>100000)throw invalid('Paket satelit maksimal 100.000 tile. Kurangi area atau detail.');
  return {name:input.name.trim(),bounds:[...b],maxzoom:input.maxzoom,provider};
}
