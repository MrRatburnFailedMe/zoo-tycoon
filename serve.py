# Dev server that never lets the browser cache game files.
import http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

http.server.ThreadingHTTPServer(('', int(sys.argv[1]) if len(sys.argv) > 1 else 5173), NoCache).serve_forever()
