#!/usr/bin/env python3
"""Run a command on the Aetos One box via the Advanced SSH add-on.
usage: hassh.py "<command>"      run a shell command, print output
       hassh.py --put LOCAL REMOTE   copy a file (SFTP is off; streams via cat)
"""
import sys, paramiko
HOST, PORT, USER, PW = "192.168.29.72", 22, "aetosone", "krishna"

def client():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, PORT, USER, PW, timeout=15, look_for_keys=False, allow_agent=False)
    return c

def main():
    c = client()
    if sys.argv[1] == "--put":
        data = open(sys.argv[2], "rb").read()
        stdin, stdout, stderr = c.exec_command(f"cat > '{sys.argv[3]}'")
        stdin.write(data); stdin.channel.shutdown_write()
        print(stdout.read().decode(), stderr.read().decode(), f"[rc={stdout.channel.recv_exit_status()}] {len(data)} bytes")
    else:
        stdin, stdout, stderr = c.exec_command(sys.argv[1], timeout=900)
        out = stdout.read().decode(errors="replace"); err = stderr.read().decode(errors="replace")
        sys.stdout.write(out)
        if err: sys.stdout.write("[stderr] " + err)
        print(f"[rc={stdout.channel.recv_exit_status()}]")
    c.close()

if __name__ == "__main__":
    main()
