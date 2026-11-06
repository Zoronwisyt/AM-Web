import zipfile, re

apk_path = r'C:\Users\jeduc\Downloads\com.alightcreative.motion-5-0-273-1028425-arm64-v8a-android60.apk'
with zipfile.ZipFile(apk_path) as z:
    for name in z.namelist():
        if name.startswith('res/layout') and name.endswith('.xml'):
            data = z.read(name)
            if b'buttonMoveAndTransform' in data or b'controlpad' in data or b'controlPad' in data:
                print('Layout:', name)
