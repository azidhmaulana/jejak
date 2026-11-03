const light={
  "background": "#f2efe9",
  "wood": "#add19e",
  "grass": "#cdebb0",
  "farmland": "#e6e8c3",
  "land": "#e8eadf",
  "residential": "#e0dfdf",
  "industrial": "#e6dce5",
  "commercial": "#f2dad9",
  "landuse": "#eee9de",
  "park": "#c8f0b7",
  "water": "#aad3df",
  "waterway": "#8bbbcf",
  "boundary": "#a38bb5",
  "building": "#d9d0c9",
  "buildingOutline": "#bcb2a8",
  "aeroway": "#bbc0c4",
  "roadCasing": "#b8b4aa",
  "motorway": "#e9acb7",
  "trunk": "#f7b391",
  "primary": "#f4c48c",
  "secondary": "#f7efb7",
  "minor": "#ffffff",
  "rail": "#777777",
  "waterLabel": "#35758c",
  "waterHalo": "#e7f3f7",
  "poi": "#5b6752",
  "text": "#38352f",
  "halo": "#ffffff"
};
const dark={
  "background": "#14252c",
  "wood": "#1b3432",
  "grass": "#203734",
  "farmland": "#2a3934",
  "land": "#223239",
  "residential": "#24333c",
  "industrial": "#30343b",
  "commercial": "#2c3941",
  "landuse": "#213239",
  "park": "#22443a",
  "water": "#0a374c",
  "waterway": "#235771",
  "boundary": "#72869c",
  "building": "#3b4b54",
  "buildingOutline": "#52626b",
  "aeroway": "#65727d",
  "roadCasing": "#102027",
  "motorway": "#b9975c",
  "trunk": "#b9975c",
  "primary": "#a99c7b",
  "secondary": "#819598",
  "minor": "#576c76",
  "rail": "#99a5ac",
  "waterLabel": "#7daec7",
  "waterHalo": "#0a374c",
  "poi": "#96b7b5",
  "text": "#cfdee5",
  "halo": "#14252c"
};
const grayscale=Object.fromEntries(Object.entries(light).map(([key,color])=>{
  const rgb=[1,3,5].map(index=>parseInt(color.slice(index,index+2),16));
  const value=Math.round(rgb[0]*.299+rgb[1]*.587+rgb[2]*.114).toString(16).padStart(2,'0');
  return [key,'#'+value.repeat(3)];
}));
// Local vector styles share the same tiles and bundled fonts.
export const openMapTilesStyles=['light','dark','grayscale'];
export function openMapTilesLayers(source='offline',style='light'){
  const colors=style==='dark'?dark:style==='grayscale'?grayscale:light;
  const layer=(id,type,sourceLayer,paint,extra={})=>({id,type,source,'source-layer':sourceLayer,paint,...extra});
  const roadWidth=['interpolate',['linear'],['zoom'],5,.4,10,1,14,3,18,12];
  const name=['coalesce',['get','name:latin'],['get','name'],['get','name:en'],''];
  const labelPaint={'text-color':colors.text,'text-halo-color':colors.halo,'text-halo-width':1.3};
  return [
    {id:'omt-background',type:'background',paint:{'background-color':colors.background}},
    layer('omt-landcover','fill','landcover',{'fill-color':['match',['get','class'],'wood',colors.wood,'grass',colors.grass,'farmland',colors.farmland,colors.land],'fill-opacity':.7}),
    layer('omt-landuse','fill','landuse',{'fill-color':['match',['get','class'],'residential',colors.residential,'industrial',colors.industrial,'commercial',colors.commercial,colors.landuse],'fill-opacity':.7}),
    layer('omt-park','fill','park',{'fill-color':colors.park,'fill-opacity':.6}),
    layer('omt-water','fill','water',{'fill-color':colors.water}),
    layer('omt-waterway','line','waterway',{'line-color':colors.waterway,'line-width':['interpolate',['linear'],['zoom'],8,.5,16,3]}),
    layer('omt-boundary','line','boundary',{'line-color':colors.boundary,'line-width':1,'line-dasharray':[3,2],'line-opacity':.65}),
    layer('omt-buildings','fill','building',{'fill-color':colors.building,'fill-outline-color':colors.buildingOutline,'fill-opacity':.8},{minzoom:13}),
    layer('omt-aeroway','line','aeroway',{'line-color':colors.aeroway,'line-width':['interpolate',['linear'],['zoom'],10,1,16,10]}),
    layer('omt-roads-casing','line','transportation',{'line-color':colors.roadCasing,'line-width':['interpolate',['linear'],['zoom'],5,1,10,2,14,5,18,15]}, {filter:['!=',['get','class'],'rail'],layout:{'line-cap':'round','line-join':'round'}}),
    layer('omt-roads','line','transportation',{'line-color':['match',['get','class'],'motorway',colors.motorway,'trunk',colors.trunk,'primary',colors.primary,'secondary',colors.secondary,'tertiary',colors.minor,colors.minor],'line-width':roadWidth}, {filter:['!=',['get','class'],'rail'],layout:{'line-cap':'round','line-join':'round'}}),
    layer('omt-rail','line','transportation',{'line-color':colors.rail,'line-width':1,'line-dasharray':[2,2]}, {filter:['==',['get','class'],'rail']}),
    layer('omt-water-labels','symbol','water_name',{'text-color':colors.waterLabel,'text-halo-color':colors.waterHalo,'text-halo-width':1},{layout:{'text-field':name,'text-font':['Noto Sans Italic'],'text-size':11}}),
    layer('omt-road-labels','symbol','transportation_name',labelPaint,{minzoom:12,layout:{'symbol-placement':'line','text-field':name,'text-font':['Noto Sans Regular'],'text-size':10}}),
    layer('omt-place-labels','symbol','place',labelPaint,{layout:{'text-field':name,'text-font':['Noto Sans Medium'],'text-size':['interpolate',['linear'],['zoom'],3,10,8,12,14,15],'text-max-width':9}}),
    layer('omt-poi-labels','symbol','poi',{'text-color':colors.poi,'text-halo-color':colors.background,'text-halo-width':1},{minzoom:15,layout:{'text-field':name,'text-font':['Noto Sans Regular'],'text-size':10}}),
  ];
}
