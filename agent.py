import socket
import time

from zeroconf import ServiceInfo, Zeroconf


SERVICE_TYPE = "_http._tcp.local."
SERVICE_NAME = "i.Tube._http._tcp.local."
PORT = 5900


def get_local_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        sock.close()

    return ip

def main():

    ip = get_local_ip()

    print("i.Tube network IP:", ip)

    address = socket.inet_aton(ip)

    info = ServiceInfo(
        SERVICE_TYPE,
        SERVICE_NAME,
        addresses=[address],
        port=PORT,
        properties={
            "path": "/",
            "version": "1.0",
            "name": "i.Tube"
        },
        server="itube.local."
    )

    zeroconf = Zeroconf()

    try:

        zeroconf.register_service(info)

        print(
            "i.Tube Zeroconf service started"
        )

        print(
            "Service: i.Tube"
        )

        print(
            "Address: http://itube.local:5900"
        )

        while True:
            time.sleep(60)

    except KeyboardInterrupt:

        print(
            "Stopping i.Tube Zeroconf..."
        )

    finally:

        zeroconf.unregister_service(info)
        zeroconf.close()


if __name__ == "__main__":
    main()
