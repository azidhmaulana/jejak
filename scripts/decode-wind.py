"""Decode the two selected NOAA GRIB messages; never download data from this worker."""
import json
import sys
import numpy as np
from eccodes import codes_new_from_message, codes_get, codes_get_values, codes_release

fields = {}
metadata = None
payload = sys.stdin.buffer.read(4 * 1024 * 1024)
offset = 0
while offset < len(payload):
    if payload[offset:offset+4] != b'GRIB':
        raise ValueError('Invalid GRIB message')
    length = int.from_bytes(payload[offset+8:offset+16], 'big')
    if length < 20 or offset + length > len(payload):
        raise ValueError('Invalid GRIB length')
    handle = codes_new_from_message(payload[offset:offset+length])
    offset += length
    try:
        name = codes_get(handle, 'shortName')
        if name not in ('10u', '10v'):
            raise ValueError('Expected 10 metre wind')
        grid = {key: codes_get(handle, key) for key in ('Ni', 'Nj', 'longitudeOfFirstGridPointInDegrees', 'latitudeOfFirstGridPointInDegrees', 'iDirectionIncrementInDegrees', 'jDirectionIncrementInDegrees', 'dataDate', 'dataTime', 'endStep', 'scanningMode')}
        if grid['Ni'] != 360 or grid['Nj'] != 181 or grid['scanningMode'] != 0:
            raise ValueError('Unsupported GFS grid')
        if metadata is not None and grid != metadata:
            raise ValueError('Inconsistent wind components')
        metadata = grid
        values = codes_get_values(handle)
        if len(values) != 65160 or not np.isfinite(values).all() or np.max(np.abs(values)) > 200:
            raise ValueError('Invalid wind values')
        fields['u' if name == '10u' else 'v'] = np.round(values, 2).tolist()
    finally:
        codes_release(handle)
if set(fields) != {'u', 'v'}:
    raise ValueError('Missing wind component')
print(json.dumps({'nx': 360, 'ny': 181, 'lon0': metadata['longitudeOfFirstGridPointInDegrees'], 'lat0': metadata['latitudeOfFirstGridPointInDegrees'], 'dx': metadata['iDirectionIncrementInDegrees'], 'dy': metadata['jDirectionIncrementInDegrees'], 'reference': str(metadata['dataDate']) + str(metadata['dataTime']).zfill(4), 'forecastHours': metadata['endStep'], **fields}, separators=(',', ':'), allow_nan=False))
