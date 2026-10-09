import sys, urllib.request, struct, zlib

BASE = 'https://huggingface.co/Cactus-Compute/whisper-tiny/resolve/main/weights/whisper-tiny-int8.zip'

def ranged(start, end):
    req = urllib.request.Request(BASE, headers={'Range': f'bytes={start}-{end}'})
    return urllib.request.urlopen(req, timeout=60).read()

# total size
req = urllib.request.Request(BASE, method='HEAD')
size = int(urllib.request.urlopen(req, timeout=60).headers['Content-Length'])
print('ZIP SIZE', size)

tail = ranged(size - 70000, size - 1)
eocd = tail.rfind(b'PK\x05\x06')
print('EOCD at tail offset', eocd)
cd_size, cd_offset = struct.unpack('<II', tail[eocd + 12:eocd + 20])
print('CD size', cd_size, 'CD offset', cd_offset)
cd = ranged(cd_offset, cd_offset + cd_size - 1)

entries = []
p = 0
while p < len(cd):
    if cd[p:p + 4] != b'PK\x01\x02':
        break
    comp_method = struct.unpack('<H', cd[p + 10:p + 12])[0]
    comp_size = struct.unpack('<I', cd[p + 24:p + 28])[0]
    fn_len, ef_len, fc_len = struct.unpack('<HHH', cd[p + 28:p + 34])
    lh_offset = struct.unpack('<I', cd[p + 42:p + 46])[0]
    name = cd[p + 46:p + 46 + fn_len].decode()
    entries.append((name, comp_method, comp_size, lh_offset))
    p += 46 + fn_len + ef_len + fc_len

print('ENTRY COUNT', len(entries))
for name, method, csize, lh in entries:
    if name in ('config.txt', 'tokenizer.json', 'vocab.txt', 'special_tokens.json', 'tokenizer_config.txt'):
        print(f'-- {name} method={method} csize={csize} lh={lh}')

def get_entry(name):
    for n, method, csize, lh in entries:
        if n == name:
            # local header: 30 bytes + fn + extra
            raw = ranged(lh, lh + 200)
            fn_l, ef_l = struct.unpack('<HH', raw[26:30])
            data_start = lh + 30 + fn_l + ef_l
            blob = ranged(data_start, data_start + csize - 1)
            if method == 8:
                blob = zlib.decompress(blob, -15)
            return blob
    return None

cfg = get_entry('config.txt')
print('===== config.txt =====')
print(cfg.decode(errors='replace') if cfg else 'NOT FOUND')
open('C:/Andy projects/Asha/third-party/whisper-tiny-config.txt', 'wb').write(cfg or b'')
