from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class AssistantToolCall:
    id: str | None
    name: str
    arguments: dict


@dataclass(frozen=True)
class AssistantTurn:
    text: str | None
    tool_calls: list[AssistantToolCall]


class AssistantConversation(Protocol):
    def next_turn(self, allow_tools: bool = True) -> AssistantTurn:
        ...

    def submit_tool_results(self, results: list[dict]) -> None:
        ...


class AssistantModel(Protocol):
    def start(self, prompt: str, mode: str, scope: dict) -> AssistantConversation:
        ...
