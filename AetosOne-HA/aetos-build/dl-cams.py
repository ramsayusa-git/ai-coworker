import urllib.request
for name, seed in [("cam_front","10"),("cam_garden","20"),("cam_garage","30"),("cam_living","40")]:
    try:
        d = urllib.request.urlopen(f"https://picsum.photos/seed/{seed}/640/360", timeout=30).read()
        open(f"/config/www/{name}.jpg","wb").write(d)
        print("OK", name, len(d))
    except Exception as e:
        print("ERR", name, repr(e))
