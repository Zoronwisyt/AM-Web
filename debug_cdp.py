import http.server
import json
import subprocess
import threading
import sys
import os
import time

PORT = 8095
logs = []

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

server = http.server.HTTPServer(('127.0.0.1', PORT), Handler)
t = threading.Thread(target=server.serve_forever)
t.daemon = True
t.start()

# Launch chrome with remote debugging port so we can inspect console logs via DevTools protocol
chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
args = [
    chrome_path,
    "--headless=new",
    "--remote-debugging-port=9222",
    f"http://127.0.0.1:{PORT}/index.html"
]

proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(3)

# Connect to CDP to read console logs and run JS
import urllib.request
try:
    tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read())
    print("CDP tabs:", tabs)
except Exception as e:
    print("CDP error:", e)

proc.kill()
server.shutdown()
