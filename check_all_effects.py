import http.server
import json
import subprocess
import threading
import sys
import os
import time

PORT = 8094
report_data = None
server_instance = None
BASE_DIR = r"C:\Users\jeduc\Downloads\Test2\alight-motion - Gpt luna - Gemini Edited"

runner_html = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>GLSL Test</title>
<script src="js/effects-data.js"></script>
<script src="js/effects-catalog.js"></script>
<script src="js/effects-engine.js"></script>
</head>
<body>
<h1 id="status">Running tests...</h1>
<script>
(async () => {
  try {
    await FXCatalog.load();
    if (!FXEngine.init()) throw new Error("FXEngine.init() failed");
    const total = FXCatalog.defs.length;
    let pass = 0, compileFail = 0, renderBlank = 0, scriptFail = 0;
    const failures = [];

    const size = 128;
    const src = FXEngine._testSource(size);
    const comp = FXEngine._testComp(size);

    for (let i = 0; i < total; i++) {
      const def = FXCatalog.defs[i];
      if (i % 25 === 0) {
        await fetch('/progress', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ current: i, total, name: def.name })
        });
      }

      const entry = FXEngine.makeEntry(def.id);
      if (!entry) {
        failures.push({ id: def.id, name: def.name, why: 'no-def' });
        continue;
      }

      try {
        if (!def.hasGL && def.hasScript) {
          FXEngine.resetChain();
          FXEngine._lastErr = null;
          const fake = { type: 'text', text: 'Count up 12345', start: 0, duration: 2 };
          const env = { time: 0.35, duration: 2, fps: 30, frame: 10, velocity: 120, scaleVelocity: 4, angularVelocity: 6 };
          entry._env = env;
          FXEngine.runScripts(fake, [entry]);
          pass++;
          continue;
        }
        if (!def.hasGL && !def.hasScript) {
          pass++;
          continue;
        }

        FXEngine.resetChain();
        FXEngine._lastErr = null;
        FXEngine.upload(src, FXEngine._srcTex, true);
        if (def.needsComp) FXEngine.upload(comp, FXEngine._compTex, true);
        const entry2 = FXEngine._entryWithEnv(entry, true, size);
        const out = FXEngine.runEffect(def, entry2, src, FXEngine._srcTex, {
          W: size, H: size, layerW: size, layerH: size, pad: 0, time: 0.5, compTexReady: !!def.needsComp
        });

        if (!out) {
          const firstErrLine = FXEngine._lastErr ? (String(FXEngine._lastErr.log || '').split('\\n').map(l => l.trim()).filter(Boolean)[0] || '') : '';
          const why = FXEngine._lastErr ? (FXEngine._lastErr.stage + ': ' + firstErrLine) : 'no output';
          failures.push({ id: def.id, name: def.name, why, log: FXEngine._lastErr ? FXEngine._lastErr.log : null });
          compileFail++;
        } else {
          const px = FXEngine._readPixels(out.tex, size);
          const stat = FXEngine._pxStats(px);
          if (!stat.hasContent) {
            failures.push({ id: def.id, name: def.name, why: 'render blank' });
            renderBlank++;
          } else {
            pass++;
          }
        }
      } catch (e) {
        failures.push({ id: def.id, name: def.name, why: String(e).slice(0, 150) });
        if (!def.hasGL && def.hasScript) scriptFail++; else compileFail++;
      }
    }

    const report = { total, pass, compileFail, renderBlank, scriptFail, failures };
    await fetch('/report', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(report)
    });
  } catch (err) {
    await fetch('/report', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ error: err.stack || err.message })
    });
  }
})();
</script>
</body>
</html>
"""

with open(os.path.join(BASE_DIR, "check_all_runner.html"), "w", encoding="utf-8") as f:
    f.write(runner_html)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_POST(self):
        global report_data
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8'))
        if self.path == '/progress':
            print(f"Testing [{data.get('current')}/{data.get('total')}]: {data.get('name')}", flush=True)
            self.send_response(200); self.end_headers(); self.wfile.write(b'OK')
        elif self.path == '/report':
            report_data = data
            self.send_response(200); self.end_headers(); self.wfile.write(b'OK')
            def shutdown():
                time.sleep(0.5)
                server_instance.shutdown()
            threading.Thread(target=shutdown).start()
        else:
            self.send_response(404); self.end_headers()

    def log_message(self, format, *args):
        pass

server_instance = http.server.HTTPServer(('127.0.0.1', PORT), Handler)
t = threading.Thread(target=server_instance.serve_forever, daemon=True)
t.start()

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
args = [
    chrome_path,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    f"http://127.0.0.1:{PORT}/check_all_runner.html"
]

print("Launching Chrome for Effect Sweep...")
p = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

start = time.time()
while report_data is None and time.time() - start < 120:
    time.sleep(0.5)

p.terminate()
try:
    p.wait(timeout=2)
except Exception:
    pass

if not report_data:
    print("FAILED: Timeout waiting for test report")
    sys.exit(1)

if "error" in report_data:
    print("FAILED:", report_data["error"])
    sys.exit(1)

print("\n=== SWEEP RESULTS ===")
print(f"Total: {report_data['total']}")
print(f"Pass: {report_data['pass']}")
print(f"Compile Fail: {report_data['compileFail']}")
print(f"Render Blank: {report_data['renderBlank']}")
print(f"Script Fail: {report_data['scriptFail']}")
print(f"\nFailures count: {len(report_data['failures'])}")
for f in report_data['failures']:
    print(f"[{f['id']}] {f['name']}: {f['why']}")
    if f.get('log'):
        print("   LOG:", f['log'][:200])
