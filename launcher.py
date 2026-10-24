"""Reserve a free localhost port before starting the application."""
import argparse
import socket
import threading
import time
import webbrowser
from urllib.request import urlopen

import uvicorn


def reserve_socket(preferred_port: int = 8000) -> socket.socket:
    """Keep the socket open so another process cannot take the chosen port."""
    for port in [*range(preferred_port, min(preferred_port + 11, 65536)), 0]:
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            listener.bind(("127.0.0.1", port))
            listener.listen(128)
            listener.setblocking(False)
            return listener
        except OSError:
            listener.close()
    raise RuntimeError("Не удалось открыть локальный порт.")


def open_when_ready(url: str):
    for _ in range(100):
        try:
            with urlopen(f"{url}/api/health", timeout=0.5) as response:
                if response.status == 200:
                    webbrowser.open(url)
                    return
        except OSError:
            time.sleep(0.1)


def main():
    parser = argparse.ArgumentParser(description="Запуск Pitwall на свободном локальном порту")
    parser.add_argument("--no-browser", action="store_true", help="Не открывать браузер автоматически")
    args = parser.parse_args()
    with reserve_socket() as listener:
        port = listener.getsockname()[1]
        url = f"http://127.0.0.1:{port}"
        print(f"\nPitwall: {url}\nДля остановки сервера нажмите Ctrl+C.\n", flush=True)
        if port != 8000:
            print(f"Порт 8000 занят. Используем свободный порт {port}.\n", flush=True)
        if not args.no_browser:
            threading.Thread(target=open_when_ready, args=(url,), daemon=True).start()
        server = uvicorn.Server(uvicorn.Config("backend.main:app", host="127.0.0.1", port=port))
        server.run(sockets=[listener])


if __name__ == "__main__":
    main()
