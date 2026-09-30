from types import SimpleNamespace

from google.genai import types

from infrastructure.ai.vertex_gemini import VertexGeminiModel


class FakeModels:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.requests = []

    def generate_content(self, **kwargs):
        self.requests.append(kwargs)
        return next(self.responses)


def test_vertex_function_call_feeds_tool_result_back_and_can_finish():
    function_call = types.FunctionCall(
        id="call-1",
        name="read_sql",
        args={"description": "Recuento", "sql": "SELECT COUNT(*) FROM accounts"},
    )
    call_content = types.Content(role="model", parts=[types.Part(function_call=function_call)])
    final_content = types.Content(role="model", parts=[types.Part.from_text(text="Resultado listo")])
    responses = [
        SimpleNamespace(candidates=[SimpleNamespace(content=call_content)], function_calls=[function_call], text=None),
        SimpleNamespace(candidates=[SimpleNamespace(content=final_content)], function_calls=None, text="Resultado listo"),
    ]
    model = VertexGeminiModel.__new__(VertexGeminiModel)
    model.model = "test-model"
    model.client = SimpleNamespace(models=FakeModels(responses))
    conversation = model.start("¿Cuántas cuentas?", "read", {"accountIds": ["cash"]})

    first_turn = conversation.next_turn()
    conversation.submit_tool_results([{
        "id": "call-1",
        "name": "read_sql",
        "response": {"ok": True, "result": {"rows": [{"total": 1}]}},
    }])
    final_turn = conversation.next_turn(allow_tools=False)

    assert first_turn.tool_calls[0].name == "read_sql"
    assert first_turn.tool_calls[0].arguments["description"] == "Recuento"
    assert final_turn.text == "Resultado listo"
    assert not final_turn.tool_calls
    calls = model.client.models.requests
    assert len(calls) == 2
    assert len(calls[0]["config"].tools[0].function_declarations) == 1
    assert calls[1]["contents"][-2].role == "tool"
    function_response = calls[1]["contents"][-2].parts[0].function_response
    assert function_response.id == "call-1"
    assert function_response.name == "read_sql"
    assert calls[1]["config"].tools is None


def test_write_mode_declares_read_and_write_tools():
    function_call = types.FunctionCall(name="write_sql", args={"description": "Cambiar", "sql": "UPDATE accounts SET theme='slate'"})
    content = types.Content(role="model", parts=[types.Part(function_call=function_call)])
    response = SimpleNamespace(candidates=[SimpleNamespace(content=content)], function_calls=[function_call], text=None)
    model = VertexGeminiModel.__new__(VertexGeminiModel)
    model.model = "test-model"
    model.client = SimpleNamespace(models=FakeModels([response]))
    conversation = model.start("Cambia el tema", "write", {"accountIds": ["cash"]})

    turn = conversation.next_turn()

    assert turn.tool_calls[0].name == "write_sql"
    declared_names = [
        declaration.name
        for declaration in model.client.models.requests[0]["config"].tools[0].function_declarations
    ]
    assert declared_names == ["read_sql", "write_sql"]
