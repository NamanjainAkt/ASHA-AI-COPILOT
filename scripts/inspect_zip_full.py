import sys, urllib.request, struct
from collections import Counter

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

names = []
p = 0
while p < len(cd):
    if cd[p:p + 4] != b'PK\x01\x02':
        break
    fn_len, ef_len, fc_len = struct.unpack('<HHH', cd[p + 28:p + 34])
    csize = struct.unpack('<I', cd[p + 24:p + 28])[0]
    names.append((cd[p + 46:p + 46 + fn_len].decode(), csize))
    p += 46 + fn_len + ef_len + fc_len

print('TOTAL', len(names))
exts = Counter()
for n, s in names:
    exts[n.rsplit('.', 1)[-1] if '.' in n.rsplit('/', 1)[-1] else '(noext)'] += 1
print('EXTENSIONS:', dict(exts))
print('--- first 25 ---')
for n, s in names[:25]:
    print(f'{s:>12}  {n}')
print('--- dirs / nested ---')
seen = set()
for n, s in names:
    if '/' in n:
        seen.add(n.split('/')[0])
        if 'component' in n or 'manifest' in n or n.endswith('.cact'):
            print('INTERESTING:', n)
print('TOP DIRS:', seen if seen else 'NONE (flat)')
