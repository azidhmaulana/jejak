"""Build explicitly approximate display positions from public road geometry.

Usage: python scripts/locate-binamarga.py PATH_TO_PU_GEOJSON
Source: https://data.pu.go.id/sites/default/files/geojson/ast_bpjt_tol_operasi.geojson
No third-party synthetic camera coordinates are used. No random marker offsets.
"""
import json, math, re, sys
from pathlib import Path

SOURCE = 'https://data.pu.go.id/sites/default/files/geojson/ast_bpjt_tol_operasi.geojson'
# Reviewed catalogue road -> official PU feature IDs (not fuzzy name matching).
ROAD_IDS = {
 '6-tol-dalam-kota-kelapa-gading-pulo-gebang':[18,19], 'akses-tanjung-priok':[27,28],
 'bakaheuni-terbanggi-besar':[140,141], 'balikpapan-samarinda':[88,89],
 'bayung-lencir-tempino-jambi':[155,156], 'bekasi-cawang-kampung-melayu':[29,30],
 'belawan-medan-tanjung-morawa':[43,44], 'bengkulu-taba-penanjung':[51,52],
 'binjai-langsa':[40,148], 'borr-sentul-barat-simpang-yasmin':[34,35],
 'cawang-tj-priok-ancol-timur-jembatan-tigapluit':[16,17], 'ciawi-sukabumi-ciawi-cibadak':[65,66],
 'cibitung-cilincing':[31,134], 'cikampek-palimanan':[94,95], 'cileunyi-sumedang-dawuan':[71,72],
 'cimanggis-cibitung':[131,132], 'cinere-jagorawi':[22,23], 'cipularang':[63,64],
 'dalam-kota':[38,39], 'depok-antasari':[24,133], 'gempol-pandaan':[81,82],
 'gempol-pasuruan':[117,118], 'indralaya-prabumulih':[53,54], 'indrapura-kisaran':[145,146],
 'jakarta-bogor-ciawi':[32,33], 'jakarta-cikampek':[136,137], 'jakarta-tangerang':[1,139],
 'jalan-layang-mbz':[36,37], 'jogja-solo':[151,152], 'jorr-2-kunciran-cengkareng':[2,3],
 'jorr-2-serpong-cinere':[10,11], 'jorr-2-serpong-kunciran':[4,5], 'jorr-e-bambu-apus-rorotan':[25,26],
 'jorr-s':[20,21], 'jorr-w1':[12,13], 'jorr-w2-utara-kebon-jeruk-ulujami':[14,15],
 'jorr-w2s-pondok-ranji-ulujami-pondok-pinang':[8,9], 'jorr-w2u-ulujami-kembangan':[14,15],
 'kanci-pejagan':[98,130], 'kayuagung-palembang-betung-kayuagung-kramasan':[57,58],
 'kertosono-mojokerto':[111,112], 'krian-legundi-bunder-manyar-krian-legundi-bunder':[75,76],
 'kuala-tanjung-tebing-tinggi-parapat':[142,147,153,154], 'kualanamu-tebing-tinggi':[45,46],
 'kunciran-serpong':[4,5], 'makassar-seksi-4':[92,93], 'manado-bitung':[90,91],
 'medan-binjai':[41,42], 'mojokerto-surabaya':[113,114], 'ngawi-kertosono-kediri':[109,110],
 'padalarang-cileunyi':[69,70], 'padang-sicincin':[149,150], 'palembang-indralaya':[55,56],
 'palimanan-kanci':[96,97], 'pandaan-malang':[83,84], 'pasuruan-probolinggo':[121,122],
 'pejagan-pemalang':[128,129], 'pekanbaru-bangkinang':[49,50,144], 'pekanbaru-dumai':[47,48],
 'pemalang-batang':[99,100], 'pondok-aren-serpong':[6,7], 'sedyatmo':[135,138],
 'semarang-batang':[101,102], 'semarang-demak-seksi-2-sayung-demak':[73,74],
 'semarang-demak':[73,74], 'semarang-abc':[103,104], 'semarang-solo':[105,106],
 'serang-panimbang-seksi-1-serang-rangkasbitung':[61,62], 'serpong-balaraja-seksi-1':[119,120],
 'serpong-cinere':[10,11], 'sigli-banda-aceh':[124,125],
 'simpang-susun-waru-bandara-juanda':[79,80], 'solo-ngawi':[107,108],
 'soreang-pasirkoja':[67,68], 'soroja-integrasi':[67,68], 'surabaya-gempol':[115,116],
 'surabaya-gresik':[77,78], 'tangerang-merak':[126,127],
 'terbanggi-besar-pematang-panggang-kayu-agung':[59,60], 'ujung-pandang-seksi-1-3':[87,123],
}

def distance(a,b):
    lat1,lat2 = map(math.radians,[a[1],b[1]])
    h=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[0]-a[0])/2)**2
    return 6371000*2*math.asin(min(1,math.sqrt(h)))

def point_at(line, fraction):
    lengths=[distance(a,b) for a,b in zip(line,line[1:])]
    target=sum(lengths)*fraction
    for i,length in enumerate(lengths):
        if target <= length:
            t=target/length if length else 0
            return [line[i][j]+t*(line[i+1][j]-line[i][j]) for j in [0,1]]
        target-=length
    return line[-1]

def chainage(text):
    # Do not interpret camera numbers, GT numbers or arbitrary digits as KM.
    m=re.search(r'(?<!\d)(\d{1,3})\s*\+\s*(\d{3})(?!\d)',text)
    if m: return int(m[1])*1000+int(m[2])
    m=re.search(r'\bKM\s*(\d{1,3})(?:[.,](\d{1,3}))?\b',text,re.I)
    if m: return int(m[1])*1000+int((m[2] or '').ljust(3,'0'))
    return None

def station_range(text):
    nums=re.findall(r'(-?\d+)\+(\d{3})',text or '')
    if len(nums)!=2: return None
    return [(-1 if a.startswith('-') else 1)*(abs(int(a))*1000+int(b)) for a,b in nums]

def locate(camera, features):
    road=camera['road']; name=camera['name']
    if road not in ROAD_IDS:
        # Locality references from Photon / OpenStreetMap, NOT toll gate positions.
        place = 'Kutanegara' if road=='jakarta-cikampek-ii-selatan' else ('Kraksaan' if 'KRAKSAAN' in name else 'Paiton')
        assert road in ['jakarta-cikampek-ii-selatan','probolinggo-banyuwangi'], road
        positions={'Kutanegara':[107.3492972,-6.4136521], 'Kraksaan':[113.3989524,-7.7874845], 'Paiton':[113.5174503,-7.7195271]}
        return positions[place], 'locality-reference', {'place':place,'source':f'https://photon.komoot.io/api/?q={place}&limit=5'}
    choices=[features[i] for i in ROAD_IDS[road]]
    km=chainage(name)
    lane=re.search(r'\b([AB])\b',name.upper())
    for f in choices:
        p=f['properties']; g=f['geometry']; sta=station_range(p.get('sta'))
        if km is None or not sta or g['type']!='LineString': continue
        if lane and p['jalur']!=lane[1]: continue
        if not min(sta)<=km<=max(sta) or sta[0]==sta[1]: continue
        line=g['coordinates']
        length=sum(distance(a,b) for a,b in zip(line,line[1:]))
        if not .85 <= length/abs(sta[1]-sta[0]) <= 1.15: continue
        # Geometry follows x_star/y_star. Reject questionable orientation metadata.
        start=[p.get('x_star',0),p.get('y_star',0)]
        if distance(line[0],start)>500: continue
        return point_at(line,(km-sta[0])/(sta[1]-sta[0])), 'chainage-estimate', {'source':SOURCE,'featureId':p['objectid'],'road':p['nama_ruas'],'sta':p['sta'],'cameraKm':km/1000}
    # Shared reference, no arbitrary spreading and no claim that it matches camera KM.
    f=choices[0]; g=f['geometry']; p=f['properties']
    lines=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
    line=max(lines,key=lambda l:sum(distance(a,b) for a,b in zip(l,l[1:])))
    return point_at(line,.5), 'road-reference', {'source':SOURCE,'featureId':p['objectid'],'road':p['nama_ruas'],'sta':p.get('sta')}

if __name__=='__main__':
    features={f['properties']['objectid']:f for f in json.loads(Path(sys.argv[1]).read_text())['features']}
    candidate_path=Path('docs/binamarga-tol-coordinate-candidates-2026-11-05.json')
    catalogue_path=Path('src/features/surveillance/data/binamargaCameras.json')
    candidates=json.loads(candidate_path.read_text(encoding='utf-8')); catalogue=json.loads(catalogue_path.read_text(encoding='utf-8'))
    by_id={c['id']:c for c in candidates['cameras']}
    overrides=json.loads(Path('docs/binamarga-location-overrides.json').read_text(encoding='utf-8'))
    totals={}
    for c in candidates['cameras']:
        xy,kind,ref=locate(c,features)
        if c['id'] in overrides:
            o=overrides[c['id']]; xy=[o['longitude'],o['latitude']]; kind=o['kind']; ref=o['reference']
        c.update(latitude=round(xy[1],6),longitude=round(xy[0],6),coordinateAccuracy='approximate',coordinateConfidence='unverified',coordinateKind=kind,coordinateMethod=kind,coordinateReferences=[ref],cameraPositionVerified=False,eligibleForRouteMatching=False)
    for c in catalogue['cameras']:
        origin=by_id[c['sourceId']]
        for key in ['latitude','longitude','coordinateAccuracy','coordinateKind','coordinateReferences','cameraPositionVerified','eligibleForRouteMatching']:
            c[key]=origin[key]
        c['coordinateSource']=origin['coordinateMethod']
        totals[c['coordinateKind']]=totals.get(c['coordinateKind'],0)+1
    policy='Approximate display positions only: chainage interpolation where usable; otherwise shared road/locality reference, never a verified camera pole position. Excluded from precise route matching.'
    catalogue['coordinatePolicy']=policy; candidates['coordinatePolicy']=policy
    candidates['summary'].update(withApproximateCoordinates=len(candidates['cameras']),coordinatesPending=0)
    for p,d in [(candidate_path,candidates),(catalogue_path,catalogue)]: p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    Path('docs/binamarga-coordinate-coverage.json').write_text(json.dumps({'source':SOURCE,'checkedAt':'2026-11-05','cameraCount':len(catalogue['cameras']),'kinds':totals,'policy':policy},indent=2)+'\n',encoding='utf-8')
    print(totals)
