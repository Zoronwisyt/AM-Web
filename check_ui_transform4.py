import zipfile, struct

apk_path = r'C:\Users\jeduc\Downloads\com.alightcreative.motion-5-0-273-1028425-arm64-v8a-android60.apk'
with zipfile.ZipFile(apk_path) as z:
    data = z.read('classes.dex')

string_ids_size, string_ids_off = struct.unpack_from('<II', data, 0x38)
type_ids_size, type_ids_off = struct.unpack_from('<II', data, 0x40)
class_defs_size, class_defs_off = struct.unpack_from('<II', data, 0x60)

def get_string(idx):
    off = struct.unpack_from('<I', data, string_ids_off + idx * 4)[0]
    pos = off
    length = 0
    shift = 0
    while True:
        b = data[pos]; pos += 1
        length |= (b & 0x7f) << shift
        if not (b & 0x80): break
        shift += 7
    return data[pos:pos+length].decode('ascii', errors='ignore')

def get_type(idx):
    descriptor_idx = struct.unpack_from('<I', data, type_ids_off + idx * 4)[0]
    return get_string(descriptor_idx)

for i in range(class_defs_size):
    class_idx = struct.unpack_from('<I', data, class_defs_off + i * 32)[0]
    cname = get_type(class_idx)
    if 'ControlPad' in cname or 'Transform' in cname or 'Move' in cname:
        if 'com/alightcreative' in cname:
            print(cname)
