import sys, urllib.request, struct

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

p = 0
while p < len(cd):
    if cd[p:p + 4] != b'PK\x01\x02':
        break
    fn_len, ef_len, fc_len = struct.unpack('<HHH', cd[p + 28:p + 34])
    name = cd[p + 46:p + 46 + fn_len].decode()
    if name.endswith('.json') or name.endswith('.txt') or 'manifest' in name or 'runtime_plan' in name or 'components' in name:
        print(name)
    p += 46 + fn_len + ef_len + fc_len
