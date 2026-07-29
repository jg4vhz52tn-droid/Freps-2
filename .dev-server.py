import http.server
import functools

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory="/Users/timlunau/Desktop/Freps-2-main")
    http.server.test(HandlerClass=handler, port=8743)
