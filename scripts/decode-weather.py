"""Decode bounded, server-selected GFS scalar messages on the native one-degree grid."""
import json
import sys
import numpy as np
from eccodes import codes_new_from_message, codes_get, codes_get_values, codes_release
payload = sys.stdin.buffer.read(4 * 1024 * 1024)
offset = 0
fields = []
metadata = None
while offset < len(payload):
    if payload[offset:offset+4] != b'GRIB':
        raise ValueError('Invalid GRIB')
    length = int.from_bytes(payload[offset+8:offset+16], 'big')
    if length < 20 or offset + length > len(payload):
        raise ValueError('Invalid length')
    handle = codes_new_from_message(payload[offset:offset+length])
    offset += length
    try:
        grid = {k: codes_get(handle, k) for k in ('Ni','Nj','longitudeOfFirstGridPointInDegrees','latitudeOfFirstGridPointInDegrees','iDirectionIncrementInDegrees','jDirectionIncrementInDegrees','dataDate','dataTime','endStep','scanningMode')}
        if grid['Ni'] != 360 or grid['Nj'] != 181 or grid['scanningMode'] != 0 or (metadata is not None and grid != metadata):
            raise ValueError('Inconsistent grid')
        metadata = grid
        values = codes_get_values(handle)
        if len(values) != 65160 or not np.isfinite(values).all() or np.max(np.abs(values)) > 200000:
            raise ValueError('Invalid values')
        fields.append(np.round(values, 2).tolist())
    finally:
        codes_release(handle)
if not fields or len(fields) > 3:
    raise ValueError('Unexpected field count')
print(json.dumps({'nx':360,'ny':181,'lon0':metadata['longitudeOfFirstGridPointInDegrees'],'lat0':metadata['latitudeOfFirstGridPointInDegrees'],'dx':metadata['iDirectionIncrementInDegrees'],'dy':metadata['jDirectionIncrementInDegrees'],'reference':str(metadata['dataDate'])+str(metadata['dataTime']).zfill(4),'forecastHours':metadata['endStep'],'fields':fields},separators=(',',':'),allow_nan=False))
