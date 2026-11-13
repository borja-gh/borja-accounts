import json
import os
import platform
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:8001"
TIMEOUT = 300


def run_command(args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def print_environment():
    metadata = {
        "commit": run_command(["git", "rev-parse", "HEAD"]) if (ROOT / ".git").exists() else "source-archive",
        "os": platform.platform(),
        "architecture": platform.machine(),
        "python": platform.python_version(),
        "node": run_command(["node", "--version"]),
        "npm": run_command(["npm", "--version"]),
        "uv": run_command(["uv", "--version"]),
        "bash": run_command(["bash", "--version"]).splitlines()[0],
    }
    print(json.dumps(metadata, ensure_ascii=False, sort_keys=True), flush=True)


def assert_port_available():
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        listener.bind(("127.0.0.1", 8001))
    except OSError as error:
        raise RuntimeError("127.0.0.1:8001 ya está ocupado; no se iniciará ni detendrá ese proceso") from error
    finally:
        listener.close()


def request(path, method="GET", body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {} if data is None else {"Content-Type": "application/json"}
    req = urllib.request.Request(f"{URL}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as response:
        payload = response.read()
        content_type = response.headers.get("content-type", "")
    if "json" in content_type:
        return response.status, json.loads(payload)
    return response.status, payload


def process_group_members(group_id):
    output = subprocess.run(
        ["ps", "-axo", "pid=,pgid=,stat="],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    members = []
    for line in output.splitlines():
        fields = line.split()
        if len(fields) == 3 and fields[1] == str(group_id) and not fields[2].startswith("Z"):
            members.append(int(fields[0]))
    return members


def assert_port_free():
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        listener.bind(("127.0.0.1", 8001))
    except OSError as error:
        raise RuntimeError("127.0.0.1:8001 sigue ocupado tras detener el proceso de smoke") from error
    finally:
        listener.close()


def read_logs(stdout_path, stderr_path):
    stdout = stdout_path.read_text(errors="replace") if stdout_path.exists() else ""
    stderr = stderr_path.read_text(errors="replace") if stderr_path.exists() else ""
    return f"stdout:\n{stdout[-4000:]}\nstderr:\n{stderr[-4000:]}"


class LocalApp:
    def __init__(self, env, work_dir, label):
        self.env = env
        self.work_dir = work_dir
        self.label = label
        self.stdout_path = work_dir / f"{label}.stdout.log"
        self.stderr_path = work_dir / f"{label}.stderr.log"
        self.stdout = self.stdout_path.open("w")
        self.stderr = self.stderr_path.open("w")
        self.process = subprocess.Popen(
            ["bash", str(ROOT / "run.sh")],
            cwd=work_dir,
            env=env,
            stdout=self.stdout,
            stderr=self.stderr,
            start_new_session=True,
        )

    def wait_ready(self):
        deadline = time.monotonic() + TIMEOUT
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise RuntimeError(f"run.sh salió con {self.process.returncode}\n{read_logs(self.stdout_path, self.stderr_path)}")
            try:
                status, body = request("/")
                if status == 200 and b"<html" in body.lower():
                    return
            except (urllib.error.URLError, TimeoutError, OSError):
                time.sleep(0.25)
        raise RuntimeError(f"Timeout esperando {URL}\n{read_logs(self.stdout_path, self.stderr_path)}")

    def stop(self):
        if self.process.poll() is None:
            self.process.send_signal(signal.SIGINT)
        try:
            code = self.process.wait(timeout=15)
        except subprocess.TimeoutExpired as error:
            raise RuntimeError(f"Ctrl+C no detuvo run.sh\n{read_logs(self.stdout_path, self.stderr_path)}") from error
        self.stdout.close()
        self.stderr.close()
        if code != 130:
            raise RuntimeError(f"run.sh terminó con {code}, se esperaba 130 tras Ctrl+C")
        deadline = time.monotonic() + 5
        members = process_group_members(self.process.pid)
        while members and time.monotonic() < deadline:
            time.sleep(0.1)
            members = process_group_members(self.process.pid)
        if members:
            raise RuntimeError(f"Procesos del launcher siguen activos tras Ctrl+C: {members}")
        assert_port_free()

    def cleanup(self):
        if self.process.poll() is None:
            os.killpg(self.process.pid, signal.SIGTERM)
            try:
                self.process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(self.process.pid, signal.SIGKILL)
                self.process.wait(timeout=5)
        if not self.stdout.closed:
            self.stdout.close()
        if not self.stderr.closed:
            self.stderr.close()


def assert_account_data(account_id, movement_concept):
    status, accounts = request("/api/accounts")
    assert status == 200
    account = next((item for item in accounts if item["id"] == account_id), None)
    assert account is not None and account["currency"] == "EUR" and account["kind"] == "CASH"
    assert account["visiblePanels"] == ["overview", "expense_evolution"]
    status, movements = request(f"/api/data/{account_id}")
    assert status == 200
    movement = next((item for item in movements if item["Concepto"] == movement_concept), None)
    assert movement is not None and movement["Total"] == 12.34


def verify_empty_start():
    status, accounts = request("/api/accounts")
    assert status == 200 and accounts == [], f"DB nueva no está vacía: {accounts}"
    status, assistant = request("/api/assistant/status")
    assert status == 200 and assistant["enabled"] is False, assistant
    status, body = request("/")
    assert status == 200 and b"<html" in body.lower()


def create_synthetic_account():
    status, account = request(
        "/api/accounts",
        "POST",
        {"name": "QA Smoke Cash", "kind": "CASH", "currency": "EUR"},
    )
    assert status == 200 and account["ok"] is True
    account_id = account["id"]
    status, view = request(
        f"/api/accounts/{account_id}/view",
        "PUT",
        {"visiblePanels": ["overview", "expense_evolution"]},
    )
    assert status == 200
    status, movement = request(
        f"/api/movimiento/{account_id}",
        "POST",
        {
            "fecha": "2026-10-15 12:34:56",
            "tipo": "Ingreso",
            "concepto": "QA Smoke synthetic income",
            "total": 12.34,
        },
    )
    assert status == 200 and movement["ok"] is True
    assert_account_data(account_id, "QA Smoke synthetic income")
    return account_id


def backup_and_restore(source_path, backup_path, restored_path):
    with sqlite3.connect(source_path) as source, sqlite3.connect(backup_path) as backup:
        source.backup(backup)
        assert backup.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    with sqlite3.connect(backup_path) as backup, sqlite3.connect(restored_path) as restored:
        backup.backup(restored)
        assert restored.execute("PRAGMA integrity_check").fetchone() == ("ok",)


def main():
    print_environment()
    assert_port_available()
    with tempfile.TemporaryDirectory(prefix="borja accounts smoke ") as temporary:
        work_dir = Path(temporary)
        database_path = work_dir / "synthetic accounts.sqlite3"
        env = os.environ.copy()
        env.update(
            {
                "ACCOUNTS_ASSISTANT_ENABLED": "0",
                "ACCOUNTS_OPEN_BROWSER": "0",
                "BORJA_ACCOUNTS_DB": str(database_path),
                "UV_PROJECT_ENVIRONMENT": str(work_dir / "launcher-venv"),
                "UV_CACHE_DIR": os.environ.get("UV_CACHE_DIR", str(work_dir / "uv-cache")),
                "NPM_CONFIG_CACHE": os.environ.get("NPM_CONFIG_CACHE", str(work_dir / "npm-cache")),
            }
        )

        first = LocalApp(env, work_dir, "first-start")
        second = None
        try:
            first.wait_ready()
            verify_empty_start()
            account_id = create_synthetic_account()
            first.stop()
            print("PASS: instalación limpia y primer uso con cuenta/movimiento sintéticos", flush=True)
        finally:
            first.cleanup()

        second = LocalApp(env, work_dir, "restart")
        try:
            second.wait_ready()
            assert_account_data(account_id, "QA Smoke synthetic income")
            second.stop()
            print("PASS: reinicio conservó cuenta, movimiento y preferencias", flush=True)
        finally:
            second.cleanup()

        backup_path = work_dir / "backup.sqlite3"
        restored_path = work_dir / "restored.sqlite3"
        backup_and_restore(database_path, backup_path, restored_path)
        restore_env = env.copy()
        restore_env["BORJA_ACCOUNTS_DB"] = str(restored_path)
        restored = LocalApp(restore_env, work_dir, "restored-start")
        try:
            restored.wait_ready()
            assert_account_data(account_id, "QA Smoke synthetic income")
            restored.stop()
            print("PASS: copia y recuperación SQLite en rutas temporales", flush=True)
        finally:
            restored.cleanup()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1) from error
