import os
import sys


def main() -> None:
    """Delegate to the Node server entrypoint.

    Some platforms may default to invoking `python server.py` when a requirements file
    is present. This script replaces the current process with the Node runtime so the
    application starts consistently even under a Python start command.
    """

    node_cmd = ["node", "server.js"]
    os.execvp(node_cmd[0], node_cmd)


if __name__ == "__main__":
    try:
        main()
    except FileNotFoundError as exc:
        sys.stderr.write(
            "Node.js runtime not found; ensure your service uses the Node environment.\n"
        )
        raise exc
