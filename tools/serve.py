#!/usr/bin/env python3
"""Статика без кеша. http.server не шлёт Cache-Control, браузер кеширует
ES-модули эвристически и правки в игре не видны."""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '" 200' not in fmt % args:
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4180
    root = sys.argv[2] if len(sys.argv) > 2 else '.'
    ThreadingHTTPServer(('127.0.0.1', port), partial(NoCache, directory=root)).serve_forever()
