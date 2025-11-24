import socket
import struct
import math
import csv
from datetime import datetime

# UDP settings
UDP_IP = "0.0.0.0"  # listen on all interfaces
UDP_PORT = 5030  # PS5 Dash telemetry port

# CSV setup
CSV_FILE = "forza_dash.csv"
write_header = True


# Function to parse a single Dash packet
def parse_dash_packet(data):
    if len(data) < 320:
        # Packet too small
        return None

    # Unpack floats and integers according to your layout
    isRaceOn, timestampMS = struct.unpack_from("<iI", data, 0)
    engineMaxRpm, engineIdleRpm, currentEngineRpm = struct.unpack_from(
        "<fff", data, 8)
    accelX, accelY, accelZ = struct.unpack_from("<fff", data, 20)
    velX, velY, velZ = struct.unpack_from("<fff", data, 32)
    gear = struct.unpack_from("<B", data, 319)[0]

    # Derived speed
    speed_mps = math.sqrt(velX**2 + velY**2 + velZ**2)
    speed_kph = speed_mps * 3.6
    speed_mph = speed_mps * 2.23694

    return {
        "timestamp": datetime.now().isoformat(),
        "isRaceOn": bool(isRaceOn),
        "timestampMS": timestampMS,
        "speed_mps": speed_mps,
        "speed_kph": speed_kph,
        "speed_mph": speed_mph,
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


# UDP socket setup
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind((UDP_IP, UDP_PORT))
print(f"Listening on UDP {UDP_IP}:{UDP_PORT}")

# CSV writer setup
csv_file = open(CSV_FILE, mode="w", newline="")
csv_writer = None
prev_data = []


while True:
    data, addr = sock.recvfrom(1024)  # buffer size
    packet = parse_dash_packet(data)
    if packet:
        # Print JSON
        print(prev_data[-1])
        # Write CSV
        if write_header:
            csv_writer = csv.DictWriter(csv_file, fieldnames=packet.keys())
            csv_writer.writeheader()
            write_header = False
        prev_data.append(packet)
        csv_writer.writerow(packet)
        csv_file.flush()
