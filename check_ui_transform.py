import zipfile, re

apk_path = r'C:\Users\jeduc\Downloads\com.alightcreative.motion-5-0-273-1028425-arm64-v8a-android60.apk'
with zipfile.ZipFile(apk_path) as z:
    for dexname in ['classes.dex', 'classes2.dex', 'classes3.dex']:
        data = z.read(dexname)
        # Search for formatting of scale or position in UI
        for m in re.finditer(rb'px\b|[0-9]+[ ]*x[ ]*[0-9]+|Scale|Position', data):
            pass
        # Let's search for classes related to MoveTransform or Transform editor
        for m in re.finditer(rb'MoveAndTransform|TransformEditor|TransformView|ControlPad', data, re.IGNORECASE):
            idx = m.start()
            print(dexname, data[idx-20:idx+60])
