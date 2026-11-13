import importlib.util
from pathlib import Path
import subprocess
import sys

import pytest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "verify_git_history.py"
spec = importlib.util.spec_from_file_location("verify_git_history", SCRIPT)
verifier = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = verifier
spec.loader.exec_module(verifier)


def git(repo, *args):
    return subprocess.run(
        ["git", "-C", str(repo), *args], check=True, capture_output=True,
    ).stdout.decode().strip()


@pytest.fixture
def repo(tmp_path):
    path = tmp_path / "repository with spaces"
    path.mkdir()
    git(path, "init", "--initial-branch=main")
    git(path, "config", "user.name", "Synthetic Tester")
    git(path, "config", "user.email", "tester@example.invalid")
    commit(path, "README.md", "Synthetic repository\n")
    return path


def commit(repo, path, content, message="Synthetic change"):
    target = repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    git(repo, "add", "--", path)
    git(repo, "commit", "-m", message)
    return git(repo, "rev-parse", "HEAD")


def cli(repo, *args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--repo", str(repo), *args],
        capture_output=True, text=True,
    )


def test_clean_history_and_synthetic_fixtures_pass(repo):
    for path in ("cash.example.csv", "tests/fixtures/synthetic.csv", ".env.example"):
        commit(repo, path, "synthetic fixture\n")
    result = cli(repo)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "infracciones: 0" in result.stdout


def test_deleted_financial_data_still_fails(repo):
    marker = "SYNTHETIC_FINANCIAL_CANARY"
    commit(repo, "private-account.csv", marker)
    git(repo, "rm", "private-account.csv")
    git(repo, "commit", "-m", "Remove synthetic data")
    result = cli(repo)
    assert result.returncode == 1
    assert "financial-csv" in result.stdout
    assert "private-account.csv" in result.stdout
    assert marker not in result.stdout + result.stderr


@pytest.mark.parametrize("reference", ["branch", "tag"])
def test_old_refs_are_scanned_and_explicit_scope_is_respected(repo, reference):
    safe_commit = git(repo, "rev-parse", "HEAD")
    git(repo, "checkout", "-b", "old-development")
    commit(repo, ".env", "SYNTHETIC_CONFIG_CANARY")
    if reference == "tag":
        git(repo, "tag", "-a", "old-release", "-m", "Synthetic old release")
    git(repo, "checkout", "main")
    if reference == "tag":
        git(repo, "branch", "-D", "old-development")
    assert cli(repo).returncode == 1
    assert cli(repo, "--ref", safe_commit).returncode == 0


def test_bare_repository_is_supported(repo, tmp_path):
    commit(repo, "backups/synthetic.txt", "SYNTHETIC_BACKUP_CANARY")
    bare = tmp_path / "bare.git"
    git(repo, "clone", "--bare", str(repo), str(bare))
    result = cli(bare)
    assert result.returncode == 1
    assert "private-runtime-data" in result.stdout


@pytest.mark.parametrize("location", ["blob", "commit", "tag", "direct-blob-tag"])
def test_secret_canary_in_any_content_fails_without_disclosing_it(repo, location):
    canary = "gh" + "p_" + "Z" * 36
    if location == "blob":
        commit(repo, "notes.txt", canary)
    elif location == "commit":
        commit(repo, "notes.txt", "synthetic", "Synthetic message\n\n" + canary)
    elif location == "tag":
        git(repo, "tag", "-a", "synthetic-tag", "-m", canary)
    else:
        commit(repo, "notes.txt", canary)
        blob = git(repo, "rev-parse", "HEAD:notes.txt")
        git(repo, "tag", "synthetic-blob", blob)
        git(repo, "reset", "--hard", "HEAD~1")
    result = cli(repo)
    assert result.returncode == 1
    assert "github-token" in result.stdout
    assert canary not in result.stdout + result.stderr


@pytest.mark.parametrize("path", [
    "accounts.db", "nested/accounts.sqlite3-wal", ".codex/config.toml",
    ".claude/settings.json", ".openrig/state.json", ".mcp.json",
    "application_default_credentials.json", ".ssh/id_ed25519", ".env.local",
    "private.local.md", "clientportal.gw/root/vertx.jks",
])
def test_private_paths_are_detected(repo, path):
    commit(repo, path, "synthetic")
    assert cli(repo).returncode == 1


def test_secret_detection_applies_to_allowed_fixtures(repo):
    canary = "AK" + "IA" + "Z" * 16
    commit(repo, "tests/fixtures/synthetic.csv", canary)
    result = cli(repo)
    assert result.returncode == 1
    assert "aws-access-key" in result.stdout
    assert canary not in result.stdout


def test_legitimate_multiline_message_is_allowed(repo):
    commit(repo, "notes.txt", "synthetic", "Synthetic change\n\nImplementation details\n\nReviewed locally.")
    assert cli(repo).returncode == 0


def test_invalid_ref_fails_closed_without_printing_git_output(repo):
    result = cli(repo, "--ref", "missing-ref")
    assert result.returncode == 2
    assert "ERROR:" in result.stderr
    assert result.stdout == ""


def test_shallow_repository_fails_closed(repo, tmp_path):
    clone = tmp_path / "shallow"
    git(repo, "clone", "--depth=1", repo.as_uri(), str(clone))
    result = cli(clone)
    assert result.returncode == 2
    assert "shallow" in result.stderr


def test_detached_head_is_scanned(repo):
    git(repo, "checkout", "--detach")
    commit(repo, "private.csv", "SYNTHETIC_DETACHED_CANARY")
    assert cli(repo).returncode == 1


def test_renamed_blob_is_checked_at_every_historical_path(repo):
    commit(repo, "allowed.example.csv", "SYNTHETIC_RENAME_CANARY")
    git(repo, "mv", "allowed.example.csv", "private.csv")
    git(repo, "commit", "-m", "Synthetic rename")
    git(repo, "rm", "private.csv")
    git(repo, "commit", "-m", "Synthetic deletion")
    result = cli(repo)
    assert result.returncode == 1
    assert "private.csv" in result.stdout


def test_report_escapes_control_characters_in_paths(repo):
    commit(repo, "private\naccount.csv", "synthetic")
    result = cli(repo)
    assert result.returncode == 1
    assert '"private\\naccount.csv"' in result.stdout
    assert len(result.stdout.splitlines()) == 2


def test_known_message_hash_is_rejected_without_matching_secret_pattern(repo, monkeypatch):
    import hashlib

    message = "Synthetic private regression canary"
    commit(repo, "notes.txt", "synthetic", message)
    monkeypatch.setattr(verifier, "PRIVATE_MESSAGE_SHA256", {hashlib.sha256((message + "\n").encode()).hexdigest()})
    findings, _ = verifier.verify_history(repo)
    assert any(finding.category == "known-private-message" for finding in findings)
    assert message not in repr(findings)


@pytest.mark.parametrize("text, category", [
    ("Claude" + "-Session: synthetic-session", "private-session-link"),
    ("https://claude" + ".ai/code/session_synthetic", "private-session-link"),
    ("~" + "/Desktop/synthetic", "private-workspace-path"),
    ("SQLite format 3" + "\x00synthetic", "sqlite-content"),
    ("-----BEGIN " + "PRIVATE KEY-----", "private-key"),
    ("https://synthetic" + ":canary@example.invalid", "credential-url"),
    ('{"type": ' + '"service_account"}', "google-service-account"),
])
def test_high_signal_content_is_rejected(repo, text, category):
    commit(repo, "notes.txt", text)
    result = cli(repo)
    assert result.returncode == 1
    assert category in result.stdout
    assert text not in result.stdout + result.stderr


def test_verifier_and_its_regression_tests_do_not_flag_themselves(repo):
    commit(repo, "scripts/verify_git_history.py", SCRIPT.read_text())
    commit(repo, "tests/test_git_history.py", Path(__file__).read_text())
    result = cli(repo)
    assert result.returncode == 0, result.stdout + result.stderr


def test_known_blob_hash_is_rejected_under_an_unrelated_name(repo, monkeypatch):
    import hashlib

    content = "Synthetic private blob canary"
    commit(repo, "innocuous.txt", content)
    monkeypatch.setattr(verifier, "PRIVATE_BLOB_SHA256", {hashlib.sha256(content.encode()).hexdigest()})
    findings, _ = verifier.verify_history(repo)
    assert any(finding.category == "known-private-blob" for finding in findings)
    assert content not in repr(findings)


@pytest.mark.parametrize("annotated", [False, True])
def test_ref_pointing_at_a_tree_is_scanned(repo, annotated):
    commit(repo, ".env", "SYNTHETIC_TREE_CANARY")
    tree = git(repo, "rev-parse", "HEAD^{tree}")
    if annotated:
        git(repo, "tag", "-a", "synthetic-tree", tree, "-m", "Synthetic tree")
    else:
        git(repo, "tag", "synthetic-tree", tree)
    git(repo, "reset", "--hard", "HEAD~1")
    result = cli(repo)
    assert result.returncode == 1
    assert "private-config" in result.stdout


def test_replace_ref_does_not_hide_original_secret(repo):
    safe_commit = git(repo, "rev-parse", "HEAD")
    canary = "gh" + "p_" + "Q" * 36
    private_commit = commit(repo, "notes.txt", canary)
    git(repo, "replace", private_commit, safe_commit)
    result = cli(repo)
    assert result.returncode == 1
    assert "github-token" in result.stdout
    assert canary not in result.stdout + result.stderr


def test_empty_repository_passes(tmp_path):
    git(tmp_path, "init", "--initial-branch=main")
    result = cli(tmp_path)
    assert result.returncode == 0
    assert "Objetos verificados: 0" in result.stdout


def test_backlog_private_workspace_path_is_rejected_and_clean_text_passes(repo):
    private_path = "~" + "/Desktop/synthetic-private-project"
    commit(repo, "docs/info/BACKLOG.md", "Synthetic pending task: " + private_path)
    dirty = cli(repo)
    assert dirty.returncode == 1
    assert "private-workspace-path" in dirty.stdout
    assert "docs/info/BACKLOG.md" in dirty.stdout
    assert private_path not in dirty.stdout + dirty.stderr
    git(repo, "reset", "--hard", "HEAD~1")
    commit(repo, "docs/info/BACKLOG.md", "Synthetic pending task: inspect local checkout")
    assert cli(repo).returncode == 0
