#!/usr/bin/env python3
"""
Lightweight zero-dependency Linux/WSL2 PTY bridge for mdv.
Protocol:
  - stdin: newline-delimited JSON commands:
      {"type": "input", "data": "<base64>"}
      {"type": "resize", "cols": 100, "rows": 30}
  - stdout: raw binary PTY output stream
"""
import base64
import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios
import threading


def set_winsize(fd: int, rows: int, cols: int) -> None:
    rows = max(2, int(rows))
    cols = max(4, int(cols))
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)


def main() -> None:
    cwd = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    rows = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    shell = os.environ.get("SHELL") or "/bin/bash"
    if not os.path.exists(shell):
        shell = "/bin/bash"

    pid, master_fd = pty.fork()
    if pid == 0:
        # Child process: enter working directory and exec interactive shell
        try:
            if os.path.isdir(cwd):
                os.chdir(cwd)
        except Exception:
            pass
        env = os.environ.copy()
        env["TERM"] = "xterm-256color"
        env["COLORTERM"] = "truecolor"
        os.execvpe(shell, [shell, "-i"], env)

    # Parent process
    set_winsize(master_fd, rows, cols)

    def cleanup(*_args):
        try:
            os.kill(pid, signal.SIGHUP)
        except Exception:
            pass
        try:
            os.close(master_fd)
        except Exception:
            pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGHUP, cleanup)

    def stdin_reader():
        for raw_line in sys.stdin.buffer:
            line = raw_line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line.decode("utf-8", errors="ignore"))
                mtype = msg.get("type")
                if mtype == "input":
                    data = base64.b64decode(msg.get("data", ""))
                    if data:
                        os.write(master_fd, data)
                elif mtype == "resize":
                    r = int(msg.get("rows", 24))
                    c = int(msg.get("cols", 80))
                    set_winsize(master_fd, r, c)
                    try:
                        os.kill(pid, signal.SIGWINCH)
                    except Exception:
                        pass
            except Exception:
                pass
        cleanup()

    t = threading.Thread(target=stdin_reader, daemon=True)
    t.start()

    stdout_fd = sys.stdout.fileno()
    try:
        while True:
            rlist, _, _ = select.select([master_fd], [], [], 1.0)
            if master_fd in rlist:
                try:
                    chunk = os.read(master_fd, 16384)
                except OSError as e:
                    if e.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                os.write(stdout_fd, chunk)
    except Exception:
        pass
    finally:
        try:
            _, status = os.waitpid(pid, os.WNOHANG)
        except Exception:
            status = 0
        try:
            os.close(master_fd)
        except Exception:
            pass
        sys.exit(os.waitstatus_to_exitcode(status) if status else 0)


if __name__ == "__main__":
    main()
