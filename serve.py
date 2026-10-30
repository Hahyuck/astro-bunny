"""Local-only launcher. Serves the native WebGL2 build; does not load a NES ROM."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
import argparse, webbrowser
from urllib.request import urlopen

parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=8874)
parser.add_argument('--no-browser',action='store_true')
args=parser.parse_args()
directory=Path(__file__).resolve().parent/'dist'
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        super().end_headers()
    def log_message(self,fmt,*values):
        if values and str(values[0]).find('404')>=0:super().log_message(fmt,*values)
for port in range(args.port,args.port+20):
    try:
        server=ThreadingHTTPServer(('127.0.0.1',port),partial(Handler,directory=str(directory)))
        break
    except OSError:
        # Reuse this game's existing local server to keep the same storage origin.
        if not args.no_browser:
            try:
                with urlopen(f'http://127.0.0.1:{port}/',timeout=1) as response:
                    body=response.read(2048).decode('utf-8',errors='replace')
                titles = ('<title>ASTRO NINJA MAN · WebGL2</title>',
                          '<title>ASTRO BUNNY · WebGL2</title>')
                if any(title in body for title in titles):
                    webbrowser.open(f'http://127.0.0.1:{port}/')
                    raise SystemExit(0)
            except (OSError,ValueError):
                pass
        continue
else:
    raise SystemExit('No free local port found.')
url=f'http://127.0.0.1:{port}/'
print(f'ASTRO BUNNY WebGL2: {url}',flush=True)
print('Close this window or press Ctrl+C to stop.',flush=True)
if not args.no_browser:webbrowser.open(url)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:server.server_close()
