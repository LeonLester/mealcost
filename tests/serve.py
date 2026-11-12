"""Tiny static server that applies the same headers as public/_headers (for local testing)."""
import http.server, os, sys, functools

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')

def read_headers():
    h, cur = [], None
    for line in open(os.path.join(ROOT, '_headers')):
        if line.startswith('/*'): cur = True; continue
        if line.startswith('/'): cur = False; continue
        if cur and ':' in line: k, v = line.strip().split(':', 1); h.append((k, v.strip()))
    return h

HEADERS = read_headers()

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for k, v in HEADERS: self.send_header(k, v)
        super().end_headers()
    def log_message(self, *a): pass

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=ROOT)).serve_forever()
