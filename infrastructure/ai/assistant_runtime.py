import os
import sqlite3
from threading import RLock

import google.auth
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from requests.exceptions import RequestException


def validate_vertex_credentials(project: str) -> None:
    if not project:
        raise ValueError("Indica el proyecto de Google Cloud para activar el asistente.")
    try:
        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        request = Request()
        credentials.refresh(lambda **kwargs: request(**{**kwargs, "timeout": 10}))
    except (GoogleAuthError, RequestException) as exc:
        raise ValueError(
            "No se pudieron validar las credenciales de Google. Ejecuta "
            "gcloud auth application-default login en Terminal y vuelve a activar el asistente."
        ) from exc


class AssistantRuntime:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.lock = RLock()
        self.started = False
        self.enabled = False
        self.active_project = None
        self.prompt_on_start = False
        self.error = None

    def preferences(self) -> dict:
        with sqlite3.connect(self.db_path) as connection:
            row = connection.execute(
                "SELECT startup_mode, project FROM assistant_preferences WHERE id = 1"
            ).fetchone()
        return {
            "startupMode": row[0] if row else "disabled",
            "project": row[1] if row else os.environ.get("GOOGLE_CLOUD_PROJECT", ""),
        }

    def save_preferences(self, startup_mode: str, project: str) -> dict:
        with self.lock:
            self.status()
            with sqlite3.connect(self.db_path) as connection:
                connection.execute(
                    "INSERT INTO assistant_preferences (id, startup_mode, project) VALUES (1, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET startup_mode = excluded.startup_mode, project = excluded.project",
                    (startup_mode, project.strip()),
                )
            self.error = None
            return self.status()

    def status(self) -> dict:
        with self.lock:
            preferences = self.preferences()
            if not self.started:
                self.started = True
                override = os.environ.get("ACCOUNTS_ASSISTANT_ENABLED")
                mode = {"1": "enabled", "0": "disabled"}.get(override, preferences["startupMode"])
                self.prompt_on_start = mode == "ask"
                if mode == "enabled":
                    self._enable(preferences["project"])
            return {
                "enabled": self.enabled,
                "activeProject": self.active_project,
                **preferences,
                "promptOnStart": self.prompt_on_start,
                "error": self.error,
            }

    def set_session(self, enabled: bool) -> dict:
        with self.lock:
            self.status()
            self.prompt_on_start = False
            self.error = None
            if enabled:
                self._enable(self.preferences()["project"])
            else:
                self.enabled = False
                self.active_project = None
            return self.status()

    def _enable(self, project: str) -> None:
        try:
            validate_vertex_credentials(project)
        except ValueError as exc:
            self.enabled = False
            self.active_project = None
            self.error = str(exc)
        else:
            self.enabled = True
            self.active_project = project
            self.error = None
