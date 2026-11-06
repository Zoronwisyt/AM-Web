import zipfile, struct, re

apk_path = r'C:\Users\jeduc\Downloads\com.alightcreative.motion-5-0-273-1028425-arm64-v8a-android60.apk'
with zipfile.ZipFile(apk_path) as z:
    data = z.read('classes.dex')

# Search for buttonMoveAndTransform in classes.dex
idx = data.find(b'view.buttonMoveAndTransform')
if idx != -1:
    print('Found view.buttonMoveAndTransform at', idx)
    # print surrounding strings
    strings = re.findall(rb'[\x20-\x7e]{3,}', data[idx-200:idx+1000])
    for s in strings:
        print(s)
