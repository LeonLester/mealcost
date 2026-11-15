"""Stand-in for llama.cpp: python3 tests/mock_llama.py 9200. Answers /v1/chat/completions with a fixed receipt."""
import json, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

RECEIPT = {"store": "Test Market", "date": "2026-11-10", "currency": "EUR", "items": [
    {"name": "Quark", "qty": 500, "unit": "g", "total": 1.5},
    {"name": "Eggs 10 pack", "qty": 1, "unit": "item", "total": 3.2}]}

LABEL = {"name": "Skyr Natural", "brand": "Milko", "barcode": "8590000000017", "ingredients": "Skimmed milk, skyr cultures, rennet", "net_g": 140, "serving_g": 140,
    "per100": {"kcal": 63, "kj": 267, "protein": 11, "carbs": 4, "sugars": 4, "fat": 0.2, "satfat": 0.1, "fiber": None, "salt": 0.1, "sodium_mg": None},
    "perServing": None}

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get('content-length') or 0)).decode()
        out = LABEL if 'nutrition information' in raw else RECEIPT
        ok = self.headers.get('authorization') == 'Bearer test-key'
        body = json.dumps({"choices": [{"message": {"content": "<think>x</think>" + json.dumps(out)}}]} if ok else {"error": "key"}).encode()
        self.send_response(200 if ok else 401); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass

HTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
