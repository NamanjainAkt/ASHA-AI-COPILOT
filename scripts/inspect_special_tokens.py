import sys, urllib.request, struct, zlib, json

BASE = 'https://huggingface.co/Cactus-Compute/whisper-tiny/resolve/main/weights/whisper-tiny-int8.zip'

def ranged(start, end):
    req = urllib.request.Request(BASE, headers={'Range': f'bytes={start}-{end}'})
    return urllib.request.urlopen(req, timeout=60).read()

req = urllib.request.Request(BASE, method='HEAD')
size = int(urllib.request.urlopen(req, timeout=60).headers['Content-Length'])

tail = ranged(size - 70000, size - 1)
eocd = tail.rfind(b'PK\x05\x06')
cd_size, cd_offset = struct.unpack('<II', tail[eocd + 12:eocd + 20])
cd = ranged(cd_offset, cd_offset + cd_size - 1)

entries = {}
p = 0
while p < len(cd):
    if cd[p:p + 4] != b'PK\x01\x02':
        break
    comp_method = struct.unpack('<H', cd[p + 10:p + 12])[0]
    comp_size = struct.unpack('<I', cd[p + 24:p + 28])[0]
    fn_len, ef_len, fc_len = struct.unpack('<HHH', cd[p + 28:p + 34])
    lh_offset = struct.unpack('<I', cd[p + 42:p + 46])[0]
    name = cd[p + 46:p + 46 + fn_len].decode()
    entries[name] = (comp_method, comp_size, lh_offset)
    p += 46 + fn_len + ef_len + fc_len

def get_entry(name):
    method, csize, lh = entries[name]
    raw = ranged(lh, lh + 200)
    fn_l, ef_l = struct.unpack('<HH', raw[26:30])
    data_start = lh + 30 + fn_l + ef_l
    blob = ranged(data_start, data_start + csize - 1)
    if method == 8:
        blob = zlib.decompress(blob, -15)
    return blob

st = json.loads(get_entry('special_tokens.json'))
print('TYPE:', type(st))
print(json.dumps(st, indent=1)[:2000])
if isinstance(st, dict):
    keys = list(st.keys())
    print('NUM SPECIAL TOKENS:', len(keys))
    for probe in ['<|hi|>', '<|en|>', '<|startoftranscript|>', '<|transcribe|>', '<|notimestamps|>']:
        print(probe, '->', st.get(probe, 'MISSING'))
elif isinstance(st, list):
    print('NUM SPECIAL TOKENS:', len(st))
    print('HAS <|hi|>:', '<|hi|>' in st, '| HAS <|en|>:', '<|en|>' in st)
    print('FIRST 5:', st[:5])
