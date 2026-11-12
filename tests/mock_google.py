"""Tiny stand-in for Google's OAuth endpoints, used by the Worker tests."""
import base64, json, sys, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

EMAIL = {'v': 'tester@example.com', 'sub': 'sub-1'}

def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path == '/auth':
            who = q.get('login_hint', [None])[0]
            cb = q['redirect_uri'][0] + '?code=abc&state=' + q['state'][0]
            self.send_response(302); self.send_header('location', cb); self.end_headers()
        elif u.path == '/who':
            EMAIL['v'] = q['email'][0]; EMAIL['sub'] = q['sub'][0]
            self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
        else:
            self.send_response(404); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get('content-length', 0)); body = parse_qs(self.rfile.read(n).decode())
        if self.path == '/token' and body.get('code') == ['abc'] and body.get('code_verifier'):
            claims = {'iss': 'https://accounts.google.com', 'aud': body['client_id'][0], 'sub': EMAIL['sub'], 'email': EMAIL['v'], 'email_verified': True, 'exp': int(time.time()) + 3600}
            out = json.dumps({'id_token': f"{b64({'alg': 'none'})}.{b64(claims)}.sig"}).encode()
            self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(out)
        else:
            self.send_response(400); self.end_headers()

if __name__ == '__main__':
    HTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 9100), H).serve_forever()
