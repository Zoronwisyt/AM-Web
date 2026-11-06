import http.server
import json
import subprocess
import threading
import sys
import os
import time

PORT = 8092
report_data = None
server_instance = None

XML_PATH = r"c:\Users\jeduc\Downloads\wipe-layers-5x-1080x1350 (4).xml"
BASE_DIR = r"C:\Users\jeduc\Downloads\Test2\alight-motion - Gpt luna - Gemini Edited"

with open(XML_PATH, "r", encoding="utf-8") as f:
    xml_content = f.read()

# Create a test runner html file
test_html_path = os.path.join(BASE_DIR, "test_wipe_runner.html")
test_html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Wipe Layers Test</title>
</head>
<body>
  <div id="home-screen"></div>
  <div id="editor-screen"></div>
  <input id="ed-title" />
  <div class="preview-area"><canvas id="stage"></canvas></div>
  <div id="tl-rows"></div>
  <canvas id="tl-ruler"></canvas>
  <input id="t-end-input" />
  <div id="sel-box"></div>
  <span id="lb-zval"></span>
  <button id="lb-select"></button>
  <button id="lb-grid"></button>
  <button id="lb-timeline"></button>
  <button id="lb-camera"></button>
  <button id="lb-zin"></button>
  <button id="lb-zout"></button>
  <button id="lb-zfit"></button>
  <button id="lb-undo"></button>
  <button id="lb-redo"></button>
  <button id="lb-play"></button>
  <button id="t-jstart"></button>
  <button id="t-jend"></button>
  <button id="t-bookmark"></button>
  <button id="t-copy"></button>
  <button id="t-paste"></button>
  <div id="timeline"></div>

  <script src="js/effects-data.js"></script>
  <script src="js/effects-catalog.js"></script>
  <script src="js/model.js"></script>
  <script src="js/effects-engine.js"></script>
  <script src="js/render.js"></script>
  <script src="js/am-xml-export.js"></script>

  <script>
    (async () => {{
      try {{
        // Wait for FXCatalog initialization
        await new Promise(r => {{
          if (FXCatalog.ready) return r();
          const check = setInterval(() => {{
            if (FXCatalog.ready) {{ clearInterval(check); r(); }}
          }}, 50);
        }});

        const xml = {json.dumps(xml_content)};
        const {{ project, missingFonts }} = AMXML.import(xml);

        const info = {{
          title: project.name,
          width: project.width,
          height: project.height,
          exportWidth: project.exportWidth,
          exportHeight: project.exportHeight,
          fps: project.fps,
          duration: project.duration,
          bg: project.bg,
          retime: project.retime,
          precompose: project.precompose,
          bookmarks: project.bookmarks,
          layerCount: project.layers.length,
          missingFontsCount: (missingFonts || []).length
        }};

        const groups = project.layers.filter(l => l.type === 'group');
        info.groupCount = groups.length;
        info.groups = groups.map(g => ({{
          id: g.id,
          name: g.name,
          w: g.w,
          h: g.h,
          tf: g.tf,
          memberIds: g.memberIds,
          effects: (g.effects || []).map(e => ({{
            id: e.id,
            enabled: e.enabled,
            hasParamAnim: !!(e.paramAnim && e.paramAnim.angle),
            angleKfs: e.paramAnim ? e.paramAnim.angle : null
          }}))
        }}));

        const masks = project.layers.filter(l => l.maskMode === 'mask');
        info.maskCount = masks.length;
        info.masks = masks.map(m => ({{
          name: m.name,
          scaleX: m.tf.scaleX,
          scaleY: m.tf.scaleY,
          parentId: m.parentId
        }}));

        // Evaluate flip3 angle curve
        const g5 = groups.find(g => g.name === 'Rectangle 1 Copy 4');
        const eff = g5 && g5.effects && g5.effects.find(e => e.id.includes('flip3'));
        let testAngles = [];
        if (eff) {{
          for (let t = 0; t <= 0.801; t += 0.2) {{
            testAngles.push({{
              t: +t.toFixed(2),
              angle: effectParamAt(eff, 'angle', t)
            }});
          }}
        }}
        info.testAngles = testAngles;

        // Render at t=0.4
        const canvas = document.createElement('canvas');
        canvas.width = project.width;
        canvas.height = project.height;
        const ctx = canvas.getContext('2d');
        renderComp(ctx, project, 0.4);
        info.renderSuccess = true;

        // Export roundtrip
        const exportedXml = AMXML.export(project);
        info.exportedLength = exportedXml.length;
        info.hasEmbedScene = exportedXml.includes('<embedScene');
        info.hasFlip3 = exportedXml.includes('com.alightcreative.effects.flip3');

        await fetch('/report', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ success: true, info }})
        }});
      }} catch (err) {{
        await fetch('/report', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ success: false, error: err.stack || err.message }})
        }});
      }}
    }})();
  </script>
</body>
</html>
"""

with open(test_html_path, "w", encoding="utf-8") as f:
    f.write(test_html_content)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_POST(self):
        global report_data
        if self.path == '/report':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            report_data = json.loads(post_data.decode('utf-8'))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'OK')
            def shutdown():
                time.sleep(0.5)
                server_instance.shutdown()
            threading.Thread(target=shutdown).start()
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass

server_instance = http.server.HTTPServer(('127.0.0.1', PORT), Handler)

def run_server():
    server_instance.serve_forever()

server_thread = threading.Thread(target=run_server)
server_thread.daemon = True
server_thread.start()

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
args = [
    chrome_path,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    f"http://127.0.0.1:{PORT}/test_wipe_runner.html"
]

print("Launching Chrome for Wipe Layers Test...")
p = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

start = time.time()
while report_data is None and time.time() - start < 20:
    time.sleep(0.2)

p.terminate()
try:
    p.wait(timeout=2)
except Exception:
    pass

if not report_data:
    print("FAILED: Timeout waiting for test report")
    sys.exit(1)

if not report_data.get("success"):
    print("FAILED:", report_data.get("error"))
    sys.exit(1)

res = report_data["info"]
print("=== TEST RESULTS ===")
print(json.dumps(res, indent=2))

assert res["width"] == 1080, f"Width: {res['width']}"
assert res["height"] == 1350, f"Height: {res['height']}"
assert res["fps"] == 60, f"FPS: {res['fps']}"
assert abs(res["duration"] - 5.0) < 0.001, f"Duration: {res['duration']}"
assert res["bg"] == "#000000", f"BG: {res['bg']}"
assert res["bookmarks"] == [0, 5], f"Bookmarks: {res['bookmarks']}"
assert res["groupCount"] == 5, f"Expected 5 groups, got {res['groupCount']}"
assert res["maskCount"] == 5, f"Expected 5 masks, got {res['maskCount']}"
assert res["renderSuccess"] is True, "renderComp failed"
assert res["hasEmbedScene"] is True, "Export missing embedScene"
assert res["hasFlip3"] is True, "Export missing flip3"

angles = res["testAngles"]
assert len(angles) >= 5, f"Angles count: {len(angles)}"
assert abs(angles[0]["angle"] - 0.0) < 0.01, f"Angle at t=0: {angles[0]['angle']}"
assert abs(angles[-1]["angle"] - 90.0) < 0.01, f"Angle at t=0.8: {angles[-1]['angle']}"

mid_angle = [a for a in angles if abs(a["t"] - 0.4) < 0.05][0]["angle"]
print(f"Mid-point angle at t=0.4: {mid_angle:.2f} deg (linear would be 45.00)")
assert mid_angle < 40.0, f"Mid-angle expected nonlinear curve (<40), got {mid_angle}"

print("\nALL WIPE LAYERS XML COMPATIBILITY TESTS PASSED PERFECTLY!")
