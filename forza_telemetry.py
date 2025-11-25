import socket
import struct
import math
import csv
import threading
from datetime import datetime


def parse_dash_packet(data):
    if len(data) < 320:
        return None

    isRaceOn, timestampMS = struct.unpack_from("<iI", data, 0)
    engineMaxRpm, engineIdleRpm, currentEngineRpm = struct.unpack_from(
        "<fff", data, 8)
    accelX, accelY, accelZ = struct.unpack_from("<fff", data, 20)
    velX, velY, velZ = struct.unpack_from("<fff", data, 32)
    gear = struct.unpack_from("<B", data, 319)[0]

    speed_mps = math.sqrt(velX**2 + velY**2 + velZ**2)

    return {
        "timestamp": datetime.now().isoformat(),
        "isRaceOn": bool(isRaceOn),
        "timestampMS": timestampMS,
        "speed_mps": speed_mps,
        "speed_kph": speed_mps * 3.6,
        "speed_mph": speed_mps * 2.23694,
        "gear": gear,
        "engine_rpm": currentEngineRpm,
        "engine_max_rpm": engineMaxRpm,
        "engine_idle_rpm": engineIdleRpm,
        "accel_x": accelX,
        "accel_y": accelY,
        "accel_z": accelZ,
        "vel_x": velX,
        "vel_y": velY,
        "vel_z": velZ,
    }


def waitrace(CSV_FILE, UDP_IP, UDP_PORT):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    print(f"Listening on UDP {UDP_IP}:{UDP_PORT}")
    RaceRunning = True
    FirstPacketRecv = False
    prev_data = []

    # open CSV file
    with open(CSV_FILE, mode="w", newline="") as csv_file:
        csv_writer = None
        header_written = False

        while RaceRunning:
            data, addr = sock.recvfrom(1024)
            packet = parse_dash_packet(data)
            if packet is None:
                continue

            if packet["isRaceOn"]:
                FirstPacketRecv = True
                prev_data.append(packet)

                # Create CSV writer & header once
                if not header_written:
                    csv_writer = csv.DictWriter(
                        csv_file, fieldnames=packet.keys())
                    csv_writer.writeheader()
                    header_written = True

                csv_writer.writerow(packet)
                csv_file.flush()

                print("\n" * 100)
                print(f"{int(packet['speed_mph'])} mph")
                print(f"Gear: {int(packet['gear'])}")
                print(f"Engine RPM: {int(packet['engine_rpm'])}")
                print(f"Engine Max RPM: {int(packet['engine_max_rpm'])}")
                print(
                    "Percent Max RPM:",
                    (packet["engine_rpm"] / packet["engine_max_rpm"]) * 100,
                )

            else:
                if FirstPacketRecv:
                    RaceRunning = False
                    print("End Of Race")
                    print("\nFinal Speed:", int(prev_data[-1]["speed_mph"]))

    return prev_data


Menu = True
threads = []
races = []
while Menu:
    menu_select = input(
        ">1 Add Race To Record\n>2 Start Record on Race Start\n")
    match menu_select:
        case "1":
            Filename = input("Enter File Name: ") + ".csv"
            IP = input("IP: ")
            PORT = input("PORT: ")
            races.append([Filename, IP, int(PORT)])
            print(races)
        case "2":
            for i in races:
                RaceRecorder = threading.Thread(
                    target=waitrace, args=(i[0], i[1], i[2])
                )
                RaceRecorder.start()
                threads.append(RaceRecorder)
            Menu = False
print("Threads:")
print(threads)
for i in threads:
    i.join()
print("All Threads Complete")
