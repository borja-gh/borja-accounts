"""Verify reachable Git history without exposing detected secret values."""

import argparse
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys


PRIVATE_MESSAGE_SHA256 = frozenset({
    "bf1f3d06549ecb4bf0f7ecaa099f2dd39923c73498163abf696bb8367e477aaf",
    "189f7de7f60a5bcb270e1ca9d0ccf4b436f48da3e105a7120980b41a192a9a97",
    "b64205898bdda594f6da11115b6ba68ca7e2b16f51951ddbd505a75c296c617e",
    "2d863705c5b6c06918c9058b1ea056d0cde3d68094e47ccc3b18ac466101162c",
    "905d3b95341bc5190fcaf96b8088ef645481834dcd3a8c802fa49b3ee610d753",
    "17e0d2b8e928886763be25795e8ddb4fd1e19f1b1e51e48edf6fad45839b474a",
    "89e3493ac4febac3e48507bb562fe938ff621e8d6936ebef544bc5600f5e2da0",
    "86f0fe4ba11ac26ebaf47543066070090d06ca8390181daa54c0fa8d11dea7da",
    "0a3cbd58199c6fe101f4bfc681f444533580f7b611c6baab51df00fb20b94efd",
    "0aeb68c6f04ad4448152660428e3e803f3ee14688d3a80bdcbe90cf1c6fdee88",
    "03829657b2ea0080e64f6fdc4edfdb681b3c78e1bfb1c22dceee9ae88f07cd6e",
    "26a276ee8cee904439e14c79288730d7609700b0e87d8bd6393e8091155c667c",
    "4b422bb6ea6e8f83959170db081ab44d32cb0c81bc30904aeefad763c5ff041b",
    "18deaf9ed5ffd465a3fc07cf441de1aa3f6a2cca7c0509349700d0fc7af2b5a6",
    "64ed3a65f768663aecd498dc51cb7a7ed4d56a4d88036e5b2a9594bc56cc8753",
})


PRIVATE_BLOB_SHA256 = frozenset({
    "1d789164488b6e279b8dc7f4e05d47926a580571e710effcc756bb4e07febc03",
    "20a496225806dbeb11ae3bc17c8b5c3e4d1075e6e6a03b60b3a806273f808465",
    "254f4e7bc7d31bde86c2683dc3c4fbbfbdfcf04cf6b5c79526428dfad4520025",
    "2d278a7360d83051d541357c6996af1603fdfbb1272d6982b8d4e0961e13c805",
    "34d54bbc6f8620f30ef363eeea89eea6b7a51c1ac63f66ed7204911b548f44e6",
    "3ece11b36580af7eee5011385ef1cf6414b03f76044e3599ffc22234d84adc8f",
    "458ef9542b46ae19cb4c4f8e0b8555e6fb65a83fa7e6ce6512b810b36aa8ad91",
    "4c4f0cfb0e8a2858b7060bfa7b68af51d125ad7ebd83c40c7020d6864c93e865",
    "519fbfb185120db6c09635c3f5b32f651842e40fe7e0c3ecc8d6e0dbd3e3b98b",
    "6cee16bc77981eda29d9b4f9473668d32b2ef728beaf6a86b40421571246b47c",
    "7448634b3d5131c3ad3874cff39f64b395b86e5a670015ac11a12c7023b54d0f",
    "7b3554d28157e4dfa5893d6b6482034de421624867797528cd7cacfa4725a6d6",
    "830e7f129e8c53d1e622f67bd62294afc95d456e870d6ee92222ca9fb59eb85e",
    "90c366a80076ff9452667fd4a4cacd85e2c71be9b4d35a988f118ab88decfa77",
    "9f6672302361eaf5bde558069a8d627a90a06f5fff2b134aea2632012676b022",
    "ac2e2d18c816b7bdfd35b920fccda10a0108b4f6112eaba62929d32d5782a356",
    "d30601fe312ebb6b22e85167469712a2c99094e344a6e95b6e0b1829d2a96dcd",
    "ee3aef597b8482c4b437c02ef5c1182a2ddc58dc3003b826b3fb751fb2b7bdd4",
    "f50be9842d8fd0081fa512561f7e0e06683123c99a9a8dc1597b785684dcd941",
    "fe20589b6cbb0e810174a9f9239946d7becebde7a0e4602a8367304e8fa9dd97",
})


SECRET_PATTERNS = (
    ("private-session-link", re.compile(rb"Claude[-]Session:|claude[.]ai/code/session_", re.I)),
    ("private-workspace-path", re.compile(rb"~[/]Desktop|Desktop[/]Borja|Proyectos[/]carteras")),
    ("sqlite-content", re.compile(rb"\ASQLite format 3\x00")),
    ("private-key", re.compile(rb"-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----")),
    ("aws-access-key", re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("github-token", re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{40,255})\b")),
    ("google-api-key", re.compile(rb"\bAIza[A-Za-z0-9_-]{35}\b")),
    ("slack-token", re.compile(rb"\bxox[baprs]-[A-Za-z0-9-]{20,}\b")),
    ("credential-url", re.compile(rb"\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s/:@]+:[^\s/@]+@", re.I)),
    ("google-service-account", re.compile(rb'"type"\s*:\s*"service_account"')),
    ("google-refresh-token", re.compile(rb'"refresh_token"\s*:\s*"[^"\s]{20,}"')),
)


@dataclass(frozen=True, order=True)
class Finding:
    category: str
    path: str
    object_id: str


def path_category(path: str) -> str | None:
    parts = PurePosixPath(path.lower()).parts
    name = parts[-1]
    if any(part in {".aws", ".ssh", ".claude", ".codex", ".openrig"} for part in parts):
        return "private-config"
    if name in {".mcp.json", "application_default_credentials.json", "credentials.json", "id_rsa", "id_ed25519"}:
        return "credentials-or-private-config"
    if name == ".env" or (name.startswith(".env.") and not name.endswith((".example", ".sample", ".template"))):
        return "private-config"
    if name.endswith(".local.md"):
        return "private-config"
    if "backups" in parts or "clientportal.gw" in parts or name == "clientportal.gw.zip":
        return "private-runtime-data"
    if name.endswith((".db", ".db-wal", ".db-shm", ".sqlite", ".sqlite3", ".sqlite-wal", ".sqlite-shm", ".sqlite3-wal", ".sqlite3-shm")):
        return "database"
    if name.endswith(".csv") and not name.endswith(".example.csv"):
        if parts[:2] != ("tests", "fixtures"):
            return "financial-csv"
    return None


def git(repo: Path, *args: str, input_data: bytes | None = None) -> bytes:
    result = subprocess.run(
        ["git", "--no-replace-objects", "-C", str(repo), *args],
        input=input_data, capture_output=True,
    )
    if result.returncode:
        raise RuntimeError("No se pudo inspeccionar el repositorio Git; comprueba la ruta, las referencias y sus objetos.")
    return result.stdout


def verify_history(repo: Path, refs: list[str] | None = None) -> tuple[list[Finding], int]:
    if git(repo, "rev-parse", "--is-shallow-repository").strip() == b"true":
        raise RuntimeError("El repositorio es shallow; se necesita el historial completo para verificarlo.")
    if refs:
        tips = [git(repo, "rev-parse", "--verify", "--end-of-options", ref).strip() for ref in refs]
    else:
        tips = git(repo, "for-each-ref", "--format=%(objectname)").splitlines()
        head = subprocess.run(
            ["git", "--no-replace-objects", "-C", str(repo), "rev-parse", "--verify", "HEAD"],
            capture_output=True,
        )
        if head.returncode == 0:
            tips.append(head.stdout.strip())
    if not tips:
        return [], 0
    object_ids = sorted({line.split(b" ", 1)[0] for line in git(
        repo, "rev-list", "--objects", *[tip.decode("ascii") for tip in tips], "--",
    ).splitlines()})
    objects = git(repo, "cat-file", "--batch", input_data=b"\n".join(object_ids) + b"\n")
    roots = set()
    content_findings = {}
    offset = 0
    for object_id in object_ids:
        header_end = objects.index(b"\n", offset)
        returned_id, kind, size = objects[offset:header_end].split()
        if returned_id != object_id:
            raise RuntimeError("La lectura de objetos Git no es consistente.")
        start = header_end + 1
        content = objects[start:start + int(size)]
        offset = start + int(size) + 1
        if kind == b"commit":
            roots.add(content.split(b"\n", 1)[0].removeprefix(b"tree ").decode("ascii"))
        elif kind == b"tag" and b"\ntype tree\n" in content.split(b"\n\n", 1)[0] + b"\n":
            roots.add(content.split(b"\n", 1)[0].removeprefix(b"object ").decode("ascii"))
        if kind in {b"blob", b"commit", b"tag"}:
            categories = [category for category, pattern in SECRET_PATTERNS if pattern.search(content)]
            if kind == b"blob" and hashlib.sha256(content).hexdigest() in PRIVATE_BLOB_SHA256:
                categories.append("known-private-blob")
            if kind in {b"commit", b"tag"}:
                message = content.split(b"\n\n", 1)[1]
                if hashlib.sha256(message).hexdigest() in PRIVATE_MESSAGE_SHA256:
                    categories.append("known-private-message")
            if categories:
                content_findings[object_id.decode("ascii")] = categories
    # A ref may point directly at a tree, without an enclosing commit or tag.
    for tip in set(tips):
        if git(repo, "cat-file", "-t", tip.decode("ascii")).strip() == b"tree":
            roots.add(tip.decode("ascii"))
    findings = set()
    located = set()
    for root in sorted(roots):
        for entry in git(repo, "ls-tree", "-r", "-z", "--full-tree", root).split(b"\0"):
            if not entry:
                continue
            metadata, raw_path = entry.split(b"\t", 1)
            _, kind, object_id_bytes = metadata.split()
            if kind != b"blob":
                continue
            object_id = object_id_bytes.decode("ascii")
            path = raw_path.decode("utf-8", errors="surrogateescape")
            category = path_category(path)
            if category:
                findings.add(Finding(category, path, object_id))
            for category in content_findings.get(object_id, []):
                findings.add(Finding(category, path, object_id))
            located.add(object_id)
    for object_id, categories in content_findings.items():
        if object_id not in located:
            for category in categories:
                findings.add(Finding(category, "<object>", object_id))
    return sorted(findings), len(object_ids)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verifica rutas privadas y secretos de alta señal en todo el historial Git alcanzable.")
    parser.add_argument("--repo", type=Path, default=Path.cwd(), help="Repositorio normal o bare")
    parser.add_argument("--ref", action="append", dest="refs", help="Limitar el análisis a esta referencia (repetible); por defecto todas las refs y HEAD")
    args = parser.parse_args()
    try:
        findings, object_count = verify_history(args.repo, args.refs)
    except (RuntimeError, OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    for finding in findings:
        print(f"{finding.category}\t{json.dumps(finding.path, ensure_ascii=True)}\t{finding.object_id}")
    print(f"Objetos verificados: {object_count}; infracciones: {len(findings)}")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
