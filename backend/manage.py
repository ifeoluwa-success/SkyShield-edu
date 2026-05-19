#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import subprocess
import sys
from pathlib import Path


def _reexec_with_project_venv():
    """Prefer backend/.venv so daphne, channels, and other deps are available."""
    if os.environ.get("DJANGO_SKIP_VENV_REEXEC"):
        return
    base = Path(__file__).resolve().parent
    if os.name == "nt":
        venv_python = base / ".venv" / "Scripts" / "python.exe"
    else:
        venv_python = base / ".venv" / "bin" / "python"
    if not venv_python.is_file():
        return
    try:
        if Path(sys.executable).resolve() == venv_python.resolve():
            return
    except OSError:
        return
    # subprocess handles paths with spaces; os.execv does not on Windows.
    raise SystemExit(subprocess.call([str(venv_python), *sys.argv]))


def main():
    """Run administrative tasks."""
    _reexec_with_project_venv()
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
