import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "run.sh"


@pytest.fixture
def launcher_env(tmp_path):
    project = tmp_path / "checkout with spaces"
    caller = tmp_path / "caller with spaces"
    bin_dir = tmp_path / "tools"
    home = tmp_path / "home with spaces"
    frontend = project / "frontend"
    for directory in (caller, bin_dir, home, frontend):
        directory.mkdir(parents=True, exist_ok=True)

    shutil.copy2(LAUNCHER, project / "run.sh")
    log_path = tmp_path / "commands.jsonl"
    pid_path = tmp_path / "server.pid"
    worker_pid_path = tmp_path / "worker.pid"
    fake_command = f"#!{sys.executable}\n" + """
import json
import os
import signal
import subprocess
import sys
import time

name = os.path.basename(sys.argv[0])
args = sys.argv[1:]
entry = {
    "name": name,
    "args": args,
    "cwd": os.getcwd(),
    "assistant": os.environ.get("ACCOUNTS_ASSISTANT_ENABLED"),
    "database": os.environ.get("BORJA_ACCOUNTS_DB"),
    "uv_environment": os.environ.get("UV_PROJECT_ENVIRONMENT"),
}
with open(os.environ["FAKE_COMMAND_LOG"], "a", encoding="utf-8") as log:
    log.write(json.dumps(entry) + "\\n")

if name == "gcloud":
    sys.exit(int(os.environ.get("FAKE_GCLOUD_STATUS", "0")))

if name == "node":
    sys.exit(int(os.environ.get("FAKE_NODE_STATUS", "0")))

if name == "dirname":
    print(os.path.dirname(args[0]))
    sys.exit(0)

if name == "uname":
    print("Darwin")
    sys.exit(0)

if name == "uv" and args[:2] == ["run", "--frozen"]:
    if os.environ.get("FAKE_SERVER_MODE") == "block":
        with open(os.environ["FAKE_SERVER_PID"], "w", encoding="utf-8") as pid_file:
            pid_file.write(str(os.getpid()))
        server_code = "import subprocess,sys,time; child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(300)']); open(sys.argv[1],'w').write(str(child.pid)); time.sleep(300)"
        server = subprocess.Popen([sys.executable, "-c", server_code, os.environ["FAKE_WORKER_PID"]])
        try:
            server.wait()
        except KeyboardInterrupt:
            server.wait(timeout=3)
            sys.exit(130)

sys.exit(0)
"""
    for name in ("uv", "node", "npm", "gcloud", "open", "xdg-open", "curl", "dirname", "uname"):
        executable = bin_dir / name
        executable.write_text(fake_command, encoding="utf-8")
        executable.chmod(0o755)

    env = os.environ.copy()
    env.update(
        {
            "PATH": str(bin_dir),
            "HOME": str(home),
            "FAKE_COMMAND_LOG": str(log_path),
            "FAKE_SERVER_PID": str(pid_path),
            "FAKE_WORKER_PID": str(worker_pid_path),
            "UV_PROJECT_ENVIRONMENT": str(tmp_path / "venv outside repo"),
            "BORJA_ACCOUNTS_DB": str(tmp_path / "synthetic.sqlite3"),
            "ACCOUNTS_OPEN_BROWSER": "0",
        }
    )
    env.pop("ACCOUNTS_ASSISTANT_ENABLED", None)

    return {
        "env": env,
        "project": project,
        "caller": caller,
        "log": log_path,
        "pid": pid_path,
        "worker_pid": worker_pid_path,
        "tmp": tmp_path,
    }


def run_launcher(launcher_env, *, env=None, stdin=subprocess.DEVNULL, timeout=15):
    merged_env = launcher_env["env"].copy()
    if env:
        merged_env.update(env)
    return subprocess.run(
        ["/bin/bash", str(launcher_env["project"] / "run.sh")],
        cwd=launcher_env["caller"],
        env=merged_env,
        stdin=stdin,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def command_log(launcher_env):
    if not launcher_env["log"].exists():
        return []
    return [json.loads(line) for line in launcher_env["log"].read_text().splitlines()]


def process_is_running(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    state = subprocess.run(
        ["/bin/ps", "-o", "stat=", "-p", str(pid)],
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()
    return bool(state and not state.startswith("Z"))


def test_basic_startup_uses_lockfiles_and_keeps_state_outside_checkout(launcher_env):
    result = run_launcher(launcher_env)

    assert result.returncode == 0, result.stderr
    calls = command_log(launcher_env)
    tool_calls = [call for call in calls if call["name"] not in {"dirname", "node", "curl"}]
    assert [(call["name"], call["args"]) for call in tool_calls] == [
        ("uv", ["sync", "--frozen", "--python", "3.13"]),
        ("npm", ["ci"]),
        ("npm", ["run", "build"]),
        ("uv", ["run", "--frozen", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8001"]),
    ]
    assert [call["args"] for call in calls if call["name"] == "node"]
    assert all(call["assistant"] == "0" for call in calls if call["name"] not in {"dirname", "node", "curl"})
    assert all(call["database"] == str(launcher_env["tmp"] / "synthetic.sqlite3") for call in calls)
    assert tool_calls[0]["uv_environment"] == str(launcher_env["tmp"] / "venv outside repo")
    assert tool_calls[0]["cwd"] == str(launcher_env["project"])
    assert tool_calls[1]["cwd"] == str(launcher_env["project"] / "frontend")
    assert tool_calls[2]["cwd"] == str(launcher_env["project"] / "frontend")
    assert tool_calls[3]["cwd"] == str(launcher_env["project"])


def test_missing_gcloud_does_not_block_basic_startup(launcher_env):
    (launcher_env["tmp"] / "tools" / "gcloud").unlink()
    result = run_launcher(launcher_env)

    assert result.returncode == 0, result.stderr
    assert [call["name"] for call in command_log(launcher_env) if call["name"] not in {"dirname", "node", "curl"}] == ["uv", "npm", "npm", "uv"]


def test_opt_in_without_gcloud_falls_back_without_login(launcher_env):
    (launcher_env["tmp"] / "tools" / "gcloud").unlink()
    result = run_launcher(
        launcher_env,
        env={
            "ACCOUNTS_ASSISTANT_ENABLED": "1",
            "PATH": str(launcher_env["tmp"] / "tools"),
        },
    )

    assert result.returncode == 0, result.stderr
    assert "gcloud" in result.stderr.lower() or "auth" in result.stderr.lower() or "credencial" in result.stderr.lower()
    assert all(call["assistant"] == "0" for call in command_log(launcher_env) if call["name"] == "uv")


@pytest.mark.parametrize("gcloud_status", [1, 2])
def test_opt_in_without_valid_adc_falls_back_without_login(launcher_env, gcloud_status):
    result = run_launcher(
        launcher_env,
        env={"ACCOUNTS_ASSISTANT_ENABLED": "1", "FAKE_GCLOUD_STATUS": str(gcloud_status)},
    )

    assert result.returncode == 0, result.stderr
    assert "gcloud" in result.stderr.lower() or "auth" in result.stderr.lower() or "credencial" in result.stderr.lower()
    calls = command_log(launcher_env)
    gcloud_calls = [call["args"] for call in calls if call["name"] == "gcloud"]
    assert gcloud_calls == [["auth", "application-default", "print-access-token"]]
    assert all(call["assistant"] == "0" for call in calls if call["name"] == "uv")


def test_opt_in_with_adc_keeps_assistant_enabled(launcher_env):
    result = run_launcher(launcher_env, env={"ACCOUNTS_ASSISTANT_ENABLED": "1"})

    assert result.returncode == 0, result.stderr
    calls = command_log(launcher_env)
    assert [call["args"] for call in calls if call["name"] == "gcloud"] == [
        ["auth", "application-default", "print-access-token"]
    ]
    assert all(call["assistant"] == "1" for call in calls if call["name"] == "uv")


def test_noninteractive_opt_in_never_launches_interactive_login(launcher_env):
    result = run_launcher(
        launcher_env,
        env={"ACCOUNTS_ASSISTANT_ENABLED": "1", "FAKE_GCLOUD_STATUS": "1"},
        stdin=subprocess.DEVNULL,
    )

    assert result.returncode == 0, result.stderr
    gcloud_calls = [call["args"] for call in command_log(launcher_env) if call["name"] == "gcloud"]
    assert gcloud_calls == [["auth", "application-default", "print-access-token"]]


def test_unsupported_node_stops_before_installation(launcher_env):
    result = run_launcher(launcher_env, env={"FAKE_NODE_STATUS": "1"})

    assert result.returncode == 1
    assert "Node.js" in result.stderr
    assert [call["name"] for call in command_log(launcher_env) if call["name"] != "dirname"] == ["node"]


def test_browser_opt_out_does_not_invoke_openers(launcher_env):
    result = run_launcher(launcher_env, env={"ACCOUNTS_OPEN_BROWSER": "0"})

    assert result.returncode == 0, result.stderr
    assert not {"open", "xdg-open"}.intersection(call["name"] for call in command_log(launcher_env))


def test_headless_startup_without_browser_openers_is_nonfatal(launcher_env):
    for opener in ("open", "xdg-open"):
        (launcher_env["tmp"] / "tools" / opener).unlink()
    env = launcher_env["env"].copy()
    env["PATH"] = str(launcher_env["tmp"] / "tools")
    env["ACCOUNTS_OPEN_BROWSER"] = "1"
    result = run_launcher(launcher_env, env=env)

    assert result.returncode == 0, result.stderr


def test_occupied_loopback_port_fails_before_dependency_or_server_commands(launcher_env):
    listener = socket.socket()
    try:
        listener.bind(("127.0.0.1", 8001))
    except OSError:
        listener.close()
        pytest.skip("127.0.0.1:8001 ya está ocupado; no se modifica el listener existente")
    listener.listen()
    try:
        result = run_launcher(launcher_env)
        assert result.returncode == 1
        assert "8001" in result.stderr
        assert [call["name"] for call in command_log(launcher_env) if call["name"] != "dirname"] == ["node"]
        assert listener.fileno() >= 0
        listener.settimeout(0.1)
        connection, _ = listener.accept()
        connection.close()
    finally:
        listener.close()


def test_sigint_stops_and_waits_for_server_child(launcher_env):
    env = launcher_env["env"].copy()
    env["FAKE_SERVER_MODE"] = "block"
    process = subprocess.Popen(
        ["/bin/bash", str(launcher_env["project"] / "run.sh")],
        cwd=launcher_env["caller"],
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    deadline = time.monotonic() + 10
    while (not launcher_env["pid"].exists() or not launcher_env["worker_pid"].exists()) and time.monotonic() < deadline:
        if process.poll() is not None:
            break
        time.sleep(0.05)
    assert launcher_env["pid"].exists(), "fake server was not started"
    server_pid = int(launcher_env["pid"].read_text())
    worker_pid = int(launcher_env["worker_pid"].read_text())

    try:
        os.kill(process.pid, signal.SIGINT)
        stdout, stderr = process.communicate(timeout=10)
        assert process.returncode == 130, f"stdout={stdout} stderr={stderr}"
        deadline = time.monotonic() + 3
        while (process_is_running(server_pid) or process_is_running(worker_pid)) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not process_is_running(server_pid), "server process remains after Ctrl+C"
        assert not process_is_running(worker_pid), "server worker remains after Ctrl+C"
    finally:
        for pid in (server_pid, worker_pid):
            if process_is_running(pid):
                os.kill(pid, signal.SIGTERM)
        if process.poll() is None:
            process.kill()
            process.wait(timeout=3)
