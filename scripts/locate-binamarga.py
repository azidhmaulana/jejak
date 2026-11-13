"""Build explicitly approximate display positions from public road geometry.

Usage: python scripts/locate-binamarga.py PATH_TO_PU_GEOJSON
Source: https://data.pu.go.id/sites/default/files/geojson/ast_bpjt_tol_operasi.geojson
No third-party synthetic camera coordinates are used. No random marker offsets.
"""
import json, math, re, sys
from datetime import datetime, timezone, timedelta
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

def tangerang_merak_chainage(camera, features):
    # PU's STA describes Ciujung-Ciltim, but its geometry covers the full road.
    km = chainage(camera['name'])
    if km is None:
        return None
    lane = re.search(r'\b([AB])\b', camera['name'].upper())
    if not lane:
        return None
    feature_id, anchor_id = (127, 1) if lane[1] == 'A' else (126, 139)
    feature, anchor = features[feature_id], features[anchor_id]
    if feature['geometry']['type'] != 'LineString':
        return None
    line = feature['geometry']['coordinates']
    anchor_point = [anchor['properties']['x_end'], anchor['properties']['y_end']]
    if distance(line[-1], anchor_point) < distance(line[0], anchor_point):
        line = list(reversed(line))
    if distance(line[0], anchor_point) > 50:
        return None
    anchor_sta = station_range(anchor['properties']['sta'])
    if not anchor_sta:
        return None
    length = sum(distance(a,b) for a,b in zip(line,line[1:]))
    offset = km - anchor_sta[1]
    if not 0 <= offset <= length:
        return None
    return point_at(line, offset / length), 'chainage-estimate', {
        'source': SOURCE, 'featureId': feature_id, 'road': 'Tangerang - Merak',
        'cameraKm': km / 1000, 'anchorFeatureId': anchor_id,
        'anchorKm': anchor_sta[1] / 1000,
        'method': 'Distance along full-road geometry from adjoining Jakarta-Tangerang endpoint; reverse B geometry before measuring.',
        'note': 'Approximate chainage calibration, not a surveyed camera position. Original road STA covers a subsegment and is not used.'
    }

def cibitung_cilincing_chainage(camera, features):
    match = re.fullmatch(r'MR\s+STA\s+(\d{1,2})', camera['name'], re.I)
    if not match:
        return None
    feature = features[31]
    properties, geometry = feature['properties'], feature['geometry']
    if geometry['type'] != 'LineString':
        return None
    line = geometry['coordinates']
    if distance(line[0], [properties['x_star'], properties['y_star']]) > 50:
        return None
    # Only the initial STA applies: the metadata end describes section 1.
    start = station_range(properties.get('sta'))
    if not start or start[0] != -375:
        return None
    length = sum(distance(a,b) for a,b in zip(line,line[1:]))
    offset = int(match[1]) * 1000 - start[0]
    if not 33000 <= length <= 36000 or not 0 <= offset <= length:
        return None
    return point_at(line, offset / length), 'chainage-estimate', {
        'source': SOURCE, 'featureId': 31, 'road': 'Cibitung - Cilincing',
        'cameraKm': int(match[1]), 'anchorKm': -0.375,
        'method': 'Distance along full-road A geometry from Cibitung initial STA -0+375, toward Cilincing.',
        'note': 'MR STA integer interpreted as kilometre station. Approximate road position only; carriageway and camera pole unverified. Metadata end STA 2+650 is a section boundary, not the full geometry endpoint.'
    }

def sedyatmo_chainage(camera, features):
    km = chainage(camera['name'])
    if km is None:
        return None
    lane = re.search(r'\b([AB])\b', camera['name'].upper())
    feature_id = 138 if lane and lane[1] == 'B' else 135
    geometry = features[feature_id]['geometry']
    if geometry['type'] != 'MultiLineString':
        return None
    parts = geometry['coordinates']
    # Reviewed mainline pieces exclude the ring's return leg and duplicate ramp.
    if feature_id == 135 and len(parts) == 3:
        first, ring, airport = parts
        junction = min(range(len(ring)), key=lambda i: distance(ring[i], airport[-1]))
        if distance(first[-1], ring[0]) > 10 or distance(ring[junction], airport[-1]) > 10:
            return None
        line = first + ring[1:junction+1] + list(reversed(airport))[1:]
    elif feature_id == 138 and len(parts) == 2:
        first, airport = parts
        junction = min(range(len(airport)), key=lambda i: distance(airport[i], first[-1]))
        if distance(airport[junction], first[-1]) > 100:
            return None
        line = first + list(reversed(airport[:junction+1]))
    else:
        return None
    gate = [106.6977487, -6.1051556]
    best, travelled = None, 0
    scale = math.cos(math.radians(gate[1]))
    for a,b in zip(line,line[1:]):
        dx,dy = (b[0]-a[0])*scale, b[1]-a[1]
        t = max(0,min(1,(((gate[0]-a[0])*scale)*dx+(gate[1]-a[1])*dy)/(dx*dx+dy*dy))) if dx or dy else 0
        xy = [a[j]+t*(b[j]-a[j]) for j in (0,1)]
        length = distance(a,b)
        candidate = (distance(gate,xy), travelled+t*length)
        if best is None or candidate[0] < best[0]:
            best = candidate
        travelled += length
    if best is None or best[0] > 150 or not 12000 < travelled < 14000:
        return None
    offset = best[1] + km - 31000
    if not 0 <= offset <= travelled:
        return None
    return point_at(line, offset/travelled), 'chainage-estimate', {
        'source': SOURCE, 'featureId': feature_id, 'road': 'Prof. Dr. Ir. Soedijatmo',
        'cameraKm': km/1000, 'anchorKm': 31,
        'anchorLatitude': gate[1], 'anchorLongitude': gate[0],
        'anchorLocationSource': 'https://www.waze.com/live-map/directions/id/daerah-khusus-ibukota-jakarta/gerbang-tol-cengkareng-2?to=place.ChIJQbVOPecCai4RQuz78WWqO_s',
        'anchorKmSource': 'https://ekonomi.bisnis.com/read/20250620/45/1886706/penuhi-spm-jalan-tol-dalam-kota-jasa-marga-preservasi-gerbang-tol-cengkareng',
        'method': 'Mainline distance relative to Cengkareng 2 toll gate KM 31; joined reviewed PU geometry pieces, excluding return loops.',
        'note': 'Approximate road position, not surveyed camera coordinates. A geometry used where camera carriageway is unspecified. Legacy local STA 0-11 is not the CCTV kilometre system.'
    }

def jakarta_cikampek_chainage(camera, features):
    name = camera['name']
    if not name.upper().startswith('CIKAMPEK'):
        return None
    km = chainage(name.replace('CIKAMPEKKM', 'CIKAMPEK KM'))
    plaza = any(label in name.upper() for label in ['CIKATAMA', 'GT UTAMA', 'GT CIKAMPEK'])
    if km is None and plaza:
        km = 70000
    if km is None or not 2000 <= km <= 72000:
        return None
    lane = re.search(r'\b([AB])\b', name.upper())
    feature_id = 136 if lane and lane[1] == 'B' else 137
    geometry = features[feature_id]['geometry']
    if geometry['type'] != 'MultiLineString':
        return None
    parts = geometry['coordinates']
    if feature_id == 137 and len(parts) == 2:
        east, west = parts
        join = min(range(len(west)), key=lambda i: distance(west[i], east[0]))
        if distance(west[join], east[0]) > 10:
            return None
        line = west[:join+1] + east[1:]
    elif feature_id == 136 and len(parts) == 4:
        east, loop, _, west = parts
        join = min(range(len(loop)), key=lambda i: distance(loop[i], west[-1]))
        if distance(loop[join], west[-1]) > 10 or distance(loop[0], east[0]) > 10 or distance(loop[-1], east[0]) > 10:
            return None
        bridges = [loop[join:], list(reversed(loop[:join+1]))]
        bridge = min(bridges, key=lambda line: sum(distance(a,b) for a,b in zip(line,line[1:])))
        line = west + bridge[1:] + east[1:]
    else:
        return None
    length = sum(distance(a,b) for a,b in zip(line,line[1:]))
    if not 68000 < length < 72000:
        return None
    reference = {
        'source': SOURCE, 'featureId': feature_id, 'road': 'Jakarta - Cikampek',
        'sta': '2+000 - 72+000', 'cameraKm': km/1000,
        'method': 'Interpolate reviewed continuous mainline from STA 2 to 72; trim overlapping parts and exclude duplicate loop/ramp.',
        'note': 'Approximate road position, not surveyed camera coordinates. A geometry used when carriageway is unspecified.'
    }
    if plaza:
        reference['place'] = 'Gerbang Tol Cikampek Utama'
        reference['placeSource'] = 'https://bpjt.pu.go.id/ragam-ikon-khas-jalan-tol-trans-jawa-menemani-perjalanan-mudik/'
        reference['note'] = 'Shared plaza reference at KM 70; individual booths, tower and satellite camera positions are not verified.'
    return point_at(line, (km-2000)/70000), 'junction-reference' if plaza else 'chainage-estimate', reference

def semarang_demak_chainage(camera, features):
    km = chainage(camera['name'])
    if km is None or not 449000 <= km <= 465000:
        return None
    lane = re.search(r'\b([AB])\b', camera['name'].upper())
    feature_id = 73 if lane and lane[1] == 'B' else 74
    feature = features[feature_id]
    if feature['geometry']['type'] != 'LineString':
        return None
    line = feature['geometry']['coordinates']
    p = feature['properties']
    if distance(line[0], [p['x_star'],p['y_star']]) > 50 or line[0][0] >= line[-1][0]:
        return None
    length = sum(distance(a,b) for a,b in zip(line,line[1:]))
    if not 15500 < length < 16500:
        return None
    return point_at(line, (km-449000)/16000), 'chainage-estimate', {
        'source': SOURCE, 'featureId': feature_id, 'road': 'Semarang - Demak Seksi 2 (Sayung - Demak)',
        'cameraKm': km/1000, 'anchorKm': 449, 'endKm': 465,
        'chainageSource': 'https://www.idxchannel.com/economics/mulai-berbayar-segini-tarif-jalan-tol-semarang-demak-seksi-ii',
        'method': 'Interpolate along Sayung-Demak mainline using operational KM 449-465, not local construction STA 10+394-26+704.',
        'note': 'Approximate road position, not surveyed camera coordinates. Unspecified carriageway uses A as a road reference.'
    }

def semarang_abc_chainage(camera, features):
    name = camera['name'].upper()
    station = re.search(r'KM\s*(\d+)\s*[ABC]?\s*\+\s*(\d{3})', name)
    section_lane = re.search(r'-\s*([ABC])/(A|B|MED)\b', name)
    if not station or not section_lane:
        return None
    section, lane = section_lane.groups()
    km = int(station[1])*1000 + int(station[2])
    feature_id = 103 if lane == 'B' else 104
    # Each feature contains three different sections, not consecutive road pieces.
    parts = {104: {'A': 1, 'B': 0, 'C': 2}, 103: {'A': 1, 'B': 2, 'C': 0}}
    feature = features[feature_id]
    if feature['geometry']['type'] != 'MultiLineString':
        return None
    part = parts[feature_id][section]
    line = feature['geometry']['coordinates'][part]
    if feature_id == 103:
        line = list(reversed(line))
    length = sum(distance(a,b) for a,b in zip(line,line[1:]))
    limits = {'A': (8300, 8700), 'B': (4700, 4900), 'C': (9300, 9600)}
    if not limits[section][0] < length < limits[section][1]:
        return None
    anchor = 420400 if section == 'A' else 429600
    offset = km-anchor
    reference = {
        'source': SOURCE, 'featureId': feature_id, 'geometryPart': part,
        'road': 'Semarang Seksi A, B, C', 'section': section,
        'cameraKm': km/1000, 'anchorKm': anchor/1000,
        'method': 'Distance along the individual section; A starts at Krapyak, B/C at Jangli. B carriageway reversed.',
        'note': 'Approximate calibration from PU section STA; C shares the B junction anchor. Not surveyed camera coordinates. Med uses carriageway A.'
    }
    if section == 'B' and 'UJUNG SRONDOL' in name and abs(offset-length) < 100:
        reference['note'] = 'Srondol section endpoint reference; camera KM falls just outside geometry. No extrapolation.'
        return line[-1], 'junction-reference', reference
    if not 0 <= offset <= length:
        return None
    return point_at(line, offset/length), 'chainage-estimate', reference

def locate(camera, features):
    road=camera['road']; name=camera['name']
    if road == 'semarang-abc':
        calibrated = semarang_abc_chainage(camera, features)
        if calibrated:
            return calibrated
    if road in ['semarang-demak-seksi-2-sayung-demak', 'semarang-demak']:
        calibrated = semarang_demak_chainage(camera, features)
        if calibrated:
            return calibrated
    if road == 'jakarta-cikampek':
        calibrated = jakarta_cikampek_chainage(camera, features)
        if calibrated:
            return calibrated
    if road == 'sedyatmo':
        calibrated = sedyatmo_chainage(camera, features)
        if calibrated:
            return calibrated
    if road == 'cibitung-cilincing':
        calibrated = cibitung_cilincing_chainage(camera, features)
        if calibrated:
            return calibrated
    if road == 'tangerang-merak':
        calibrated = tangerang_merak_chainage(camera, features)
        if calibrated:
            return calibrated
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
    Path('docs/binamarga-coordinate-coverage.json').write_text(json.dumps({'source':SOURCE,'checkedAt':datetime.now(timezone(timedelta(hours=7))).date().isoformat(),'cameraCount':len(catalogue['cameras']),'kinds':totals,'policy':policy},indent=2)+'\n',encoding='utf-8')
    print(totals)
