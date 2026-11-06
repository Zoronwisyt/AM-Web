import http.server
import json
import subprocess
import threading
import sys
import os
import time

PORT = 8089
report_data = None
server_instance = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

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
        # suppress request logs
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
    "--use-gl=angle",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    f"http://127.0.0.1:{PORT}/test_runner.html"
]

print("Launching Chrome...")
proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

server_thread.join(timeout=45)

if proc.poll() is None:
    proc.kill()

if report_data:
    if 'error' in report_data:
        print(f"Error: {report_data['error']}\n{report_data.get('stack', '')}")
        sys.exit(1)
    
    total = report_data.get('total', 0)
    passed = report_data.get('pass', 0)
    compile_fail = report_data.get('compileFail', 0)
    render_blank = report_data.get('renderBlank', 0)
    script_fail = report_data.get('scriptFail', 0)
    print(f"RESULTS: total={total}, pass={passed}, compileFail={compile_fail}, renderBlank={render_blank}, scriptFail={script_fail}")
    
    failures = [r for r in report_data.get('results', []) if not r.get('pass')]
    print(f"Failing count: {len(failures)}")
    for f in failures:
        print(f"[{f.get('id')}] ({f.get('name')} | {f.get('cat')}): {f.get('why')}")
else:
    print("Timed out waiting for test report.")
    sys.exit(1)
