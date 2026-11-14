"""Stand-in for llama.cpp: python3 tests/mock_llama.py 9200. Answers /v1/chat/completions with a fixed receipt."""
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

RECEIPT = {"store": "Test Market", "date": "2026-11-10", "currency": "EUR", "items": [
    {"name": "Quark", "qty": 500, "unit": "g", "total": 1.5},
    {"name": "Eggs 10 pack", "qty": 1, "unit": "item", "total": 3.2}]}

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        self.rfile.read(int(self.headers.get('content-length') or 0))
        ok = self.headers.get('authorization') == 'Bearer test-key'
        body = json.dumps({"choices": [{"message": {"content": "<think>x</think>" + json.dumps(RECEIPT)}}]} if ok else {"error": "key"}).encode()
        self.send_response(200 if ok else 401); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass

HTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
