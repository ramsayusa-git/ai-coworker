#!/usr/bin/env python3
"""Pull a directory from the Aetos One box as a tar stream: hapull.py REMOTE_DIR LOCAL_DIR"""
import sys, io, tarfile, paramiko
from hassh import client
remote, local = sys.argv[1], sys.argv[2]
c = client()
stdin, stdout, stderr = c.exec_command(f"sudo -n tar -C '{remote}' -cf - .")
buf = stdout.read()
err = stderr.read().decode()
tarfile.open(fileobj=io.BytesIO(buf)).extractall(local)
print(f"extracted {len(buf)} bytes into {local}", err)
c.close()
