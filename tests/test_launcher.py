import socket

import pytest

from launcher import reserve_socket


def test_launcher_skips_occupied_preferred_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
        occupied.bind(('127.0.0.1', 0))
        port = occupied.getsockname()[1]
        with reserve_socket(port) as listener:
            assert listener.getsockname()[0] == '127.0.0.1'
            assert listener.getsockname()[1] != port


def test_selected_port_remains_reserved_until_server_takes_over():
    with reserve_socket() as listener:
        host, port = listener.getsockname()
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as contender:
            with pytest.raises(OSError):
                contender.bind((host, port))
