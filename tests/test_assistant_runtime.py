import importlib.util
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from google.auth.exceptions import DefaultCredentialsError

from infrastructure.ai.assistant_runtime import AssistantRuntime, validate_vertex_credentials
from infrastructure.persistence.sqlite.repository import SQLiteMovementRepository


@pytest.fixture
def runtime(tmp_path, monkeypatch):
    monkeypatch.delenv("ACCOUNTS_ASSISTANT_ENABLED", raising=False)
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    path = str(tmp_path / "accounts.db")
    SQLiteMovementRepository(path)
    return AssistantRuntime(path)


def test_default_start_does_not_access_credentials(runtime, monkeypatch):
    validate = Mock(side_effect=AssertionError("Unexpected credential access"))
    monkeypatch.setattr("infrastructure.ai.assistant_runtime.validate_vertex_credentials", validate)
    assert runtime.status() == {
        "enabled": False, "activeProject": None, "startupMode": "disabled", "project": "", "promptOnStart": False, "error": None,
    }
    validate.assert_not_called()


@pytest.mark.parametrize("mode", ["enabled", "disabled", "ask"])
def test_saved_startup_preference_applies_on_next_process(runtime, monkeypatch, mode):
    validate = Mock()
    monkeypatch.setattr("infrastructure.ai.assistant_runtime.validate_vertex_credentials", validate)
    saved = runtime.save_preferences(mode, "synthetic-project")
    assert saved["enabled"] is False
    validate.assert_not_called()
    restarted = AssistantRuntime(runtime.db_path)
    status = restarted.status()
    assert status["startupMode"] == mode
    assert status["project"] == "synthetic-project"
    assert status["enabled"] is (mode == "enabled")
    assert status["promptOnStart"] is (mode == "ask")
    assert validate.call_count == (1 if mode == "enabled" else 0)
    restarted.status()
    assert validate.call_count == (1 if mode == "enabled" else 0)


def test_session_decision_does_not_change_saved_preference(runtime, monkeypatch):
    monkeypatch.setattr("infrastructure.ai.assistant_runtime.validate_vertex_credentials", Mock())
    runtime.save_preferences("ask", "synthetic-project")
    restarted = AssistantRuntime(runtime.db_path)
    assert restarted.status()["promptOnStart"] is True
    assert restarted.set_session(True)["enabled"] is True
    assert restarted.status()["promptOnStart"] is False
    assert restarted.set_session(False)["enabled"] is False
    assert restarted.preferences()["startupMode"] == "ask"
    assert AssistantRuntime(runtime.db_path).status()["promptOnStart"] is True


def test_failed_credentials_keep_basic_app_available_and_allow_retry(runtime, monkeypatch):
    validate = Mock(side_effect=[ValueError("Credenciales no disponibles"), None])
    monkeypatch.setattr("infrastructure.ai.assistant_runtime.validate_vertex_credentials", validate)
    runtime.save_preferences("enabled", "synthetic-project")
    restarted = AssistantRuntime(runtime.db_path)
    assert restarted.status()["enabled"] is False
    assert restarted.status()["error"] == "Credenciales no disponibles"
    assert restarted.set_session(True)["enabled"] is True
    assert restarted.status()["error"] is None


def test_environment_override_does_not_overwrite_preference(runtime, monkeypatch):
    runtime.save_preferences("ask", "synthetic-project")
    monkeypatch.setenv("ACCOUNTS_ASSISTANT_ENABLED", "0")
    assert AssistantRuntime(runtime.db_path).status()["promptOnStart"] is False
    assert runtime.preferences()["startupMode"] == "ask"


def test_saving_another_project_keeps_active_session_project(runtime, monkeypatch):
    monkeypatch.setattr("infrastructure.ai.assistant_runtime.validate_vertex_credentials", Mock())
    runtime.save_preferences("disabled", "first-project")
    runtime.set_session(True)
    saved = runtime.save_preferences("ask", "next-project")
    assert saved["enabled"] is True
    assert saved["activeProject"] == "first-project"
    assert saved["project"] == "next-project"


def test_missing_project_does_not_request_credentials(monkeypatch):
    default = Mock()
    monkeypatch.setattr("google.auth.default", default)
    with pytest.raises(ValueError, match="proyecto"):
        validate_vertex_credentials("")
    default.assert_not_called()


def test_adc_error_is_actionable_without_leaking_details(monkeypatch):
    monkeypatch.setattr("google.auth.default", Mock(side_effect=DefaultCredentialsError("private credential details")))
    with pytest.raises(ValueError, match="gcloud auth application-default login") as error:
        validate_vertex_credentials("synthetic-project")
    assert "private credential details" not in str(error.value)


def test_http_preferences_validation_and_session_round_trip(runtime, monkeypatch):
    monkeypatch.setenv("BORJA_ACCOUNTS_DB", runtime.db_path)
    monkeypatch.setattr("infrastructure.ai.assistant_runtime.validate_vertex_credentials", Mock())
    spec = importlib.util.spec_from_file_location("http_runtime_test", Path(__file__).parents[1] / "app/main.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    client = TestClient(module.app)
    saved = client.put("/api/assistant/preferences", json={"startupMode": "ask", "project": "synthetic-project"})
    assert saved.status_code == 200
    assert saved.json()["enabled"] is False
    assert client.put("/api/assistant/preferences", json={"startupMode": "unknown", "project": "x"}).status_code == 422
    assert client.put("/api/assistant/session", json={"enabled": "false"}).status_code == 422
    assert client.put("/api/assistant/session", json={"enabled": True}).json()["enabled"] is True
    assert client.put("/api/assistant/session", json={"enabled": False}).json()["enabled"] is False
    assert client.get("/api/assistant/status").json()["startupMode"] == "ask"
