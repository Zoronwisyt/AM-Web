import zipfile, struct

apk_path = r'C:\Users\jeduc\Downloads\com.alightcreative.motion-5-0-273-1028425-arm64-v8a-android60.apk'
with zipfile.ZipFile(apk_path) as z:
    data = z.read('classes.dex')

string_ids_size, string_ids_off = struct.unpack_from('<II', data, 0x38)
type_ids_size, type_ids_off = struct.unpack_from('<II', data, 0x40)
proto_ids_size, proto_ids_off = struct.unpack_from('<II', data, 0x48)
field_ids_size, field_ids_off = struct.unpack_from('<II', data, 0x50)
method_ids_size, method_ids_off = struct.unpack_from('<II', data, 0x58)
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
    return data[pos:pos+length].decode('latin1', errors='replace')

def get_type(idx):
    descriptor_idx = struct.unpack_from('<I', data, type_ids_off + idx * 4)[0]
    return get_string(descriptor_idx)

def get_method(idx):
    class_idx, proto_idx, name_idx = struct.unpack_from('<HHI', data, method_ids_off + idx * 8)
    return get_type(class_idx), get_string(name_idx)

# Search for XmlPullParser methods used to read Transform
for i in range(method_ids_size):
    c, n = get_method(i)
    if 'Transform' in n or 'readTransform' in n:
        print('Method:', c, n)
