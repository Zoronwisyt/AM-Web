import zipfile, struct

apk_path = r'C:\Users\jeduc\Downloads\com.alightcreative.motion-5-0-273-1028425-arm64-v8a-android60.apk'
with zipfile.ZipFile(apk_path) as z:
    data = z.read('classes.dex')

string_ids_size, string_ids_off = struct.unpack_from('<II', data, 0x38)
type_ids_size, type_ids_off = struct.unpack_from('<II', data, 0x40)
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
    return data[pos:pos+length].decode('ascii', errors='ignore')

def get_type(idx):
    descriptor_idx = struct.unpack_from('<I', data, type_ids_off + idx * 4)[0]
    return get_string(descriptor_idx)

def get_method(idx):
    class_idx, proto_idx, name_idx = struct.unpack_from('<HHI', data, method_ids_off + idx * 8)
    return get_type(class_idx), get_string(name_idx)

pos = 0
def read_uleb():
    global pos
    res, shift = 0, 0
    while True:
        b = data[pos]; pos += 1
        res |= (b & 0x7f) << shift
        if not (b & 0x80): break
        shift += 7
    return res

for i in range(class_defs_size):
    class_idx = struct.unpack_from('<I', data, class_defs_off + i * 32)[0]
    cname = get_type(class_idx)
    if 'TransformKt$getKeyablePropertyLenses' in cname:
        print('Lens class:', cname)
        # get methods
        class_data_off = struct.unpack_from('<I', data, class_defs_off + i * 32 + 24)[0]
        pos = class_data_off
        sf = read_uleb(); inf = read_uleb(); dm = read_uleb(); vm = read_uleb()
        for _ in range(sf): read_uleb(); read_uleb()
        for _ in range(inf): read_uleb(); read_uleb()
        mid = 0
        for _ in range(dm):
            mid += read_uleb(); read_uleb(); read_uleb()
        mid = 0
        for _ in range(vm):
            mid += read_uleb(); read_uleb()
            code_off = read_uleb()
            print('  method:', get_method(mid), 'code_off:', code_off)
            if code_off:
                # print const-strings or calls in code_off
                rs, ins_s, os, ts, deb, insns_s = struct.unpack_from('<HHHHII', data, code_off)
                insns = data[code_off+16:code_off+16+insns_s*2]
                idx = 0
                while idx < len(insns):
                    op = insns[idx]
                    if op in [0x1a, 0x1b]:
                        s_idx = struct.unpack_from('<H', insns, idx+2)[0] if op == 0x1a else struct.unpack_from('<I', insns, idx+2)[0]
                        print('    str:', get_string(s_idx))
                        idx += (4 if op == 0x1a else 6)
                    elif op in [0x6e, 0x6f, 0x70, 0x71, 0x72]:
                        m_idx = struct.unpack_from('<H', insns, idx+2)[0]
                        print('    call:', get_method(m_idx))
                        idx += 6
                    else:
                        idx += 2
