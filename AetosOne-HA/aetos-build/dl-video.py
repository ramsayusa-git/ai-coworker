import urllib.request
urls = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://www.w3schools.com/html/mov_bbb.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
]
ok = False
for url in urls:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        d = urllib.request.urlopen(req, timeout=45).read()
        open("/config/www/sample.mp4", "wb").write(d)
        print("OK", url.split("/")[-1], len(d)); ok = True; break
    except Exception as e:
        print("ERR", url, repr(e))
print("done" if ok else "ALL FAILED")
