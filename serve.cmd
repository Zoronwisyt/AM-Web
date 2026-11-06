@echo off
rem Local server for Alight Motion Web — serves the site with no-store headers so edits show up on reload.
setlocal
set PORT=8932
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python not found. Install Python or serve this folder with any static server.
  pause
  exit /b 1
)
echo Serving %CD% at http://127.0.0.1:%PORT%/index.html
start "" "http://127.0.0.1:%PORT%/index.html"
python -c "import http.server,sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store, must-revalidate')
        self.send_header('Pragma','no-cache')
        super().end_headers()
http.server.HTTPServer(('127.0.0.1',%PORT%),H).serve_forever()"
