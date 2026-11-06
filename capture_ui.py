import http.server
import subprocess
import threading
import sys
import os
import time

PORT = 8099
BASE_DIR = r"C:\Users\jeduc\Downloads\Test2\alight-motion - Gpt luna - Gemini Edited"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

server = http.server.HTTPServer(('127.0.0.1', PORT), Handler)
t = threading.Thread(target=server.serve_forever)
t.daemon = True
t.start()

# Create a test harness page that opens editor with a project, and triggers screenshots
harness_html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<iframe id="app" src="http://127.0.0.1:{PORT}/index.html" style="position:fixed;inset:0;width:393px;height:852px;border:none;"></iframe>
<script>
window.onload = async () => {{
  await new Promise(r => setTimeout(r, 1200));
  const doc = document.getElementById('app').contentDocument;
  const win = document.getElementById('app').contentWindow;
  
  // Create sample project
  const p = win.createProject({{ name: 'Project Name 317 Copy', width: 1080, height: 1350, fps: 30, duration: 5 }});
  const l1 = win.createLayer(p, 'shape', {{ shape: 'roundrect', w: 420, h: 420, fill: {{ type: 'solid', color: '#00e676' }} }});
  l1.name = 'Shape 1'; l1.start = 0; l1.duration = 5;
  p.layers.push(l1);
  await win.Storage.put('projects', p);
  await win.Editor.open(p);
  await new Promise(r => setTimeout(r, 600));

  // Report ready
  fetch('/report', {{ method: 'POST', body: 'ready' }});
}};
</script>
</body>
</html>
"""

with open(os.path.join(BASE_DIR, "harness.html"), "w", encoding="utf-8") as f:
    f.write(harness_html)

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
screenshot_path = os.path.join(BASE_DIR, "iphone_screen.png")

args = [
    chrome_path,
    "--headless=new",
    "--window-size=393,852",
    f"--screenshot={screenshot_path}",
    "--virtual-time-budget=4000",
    f"http://127.0.0.1:{PORT}/harness.html"
]

subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
print("Screenshot generated at:", screenshot_path, "Exists:", os.path.exists(screenshot_path))
server.shutdown()
