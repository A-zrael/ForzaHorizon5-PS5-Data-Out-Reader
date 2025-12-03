package recorder

import (
	"fmt"
	"net"
)

type RawPacket struct {
	Data  []byte
	CarID string
}

func Listen(port string, out chan<- RawPacket) error {

	addr, err := net.ResolveUDPAddr("udp", ":"+port)
	if err != nil {
		return err
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return err
	}

	fmt.Println("Recording on port: ", port)

	go func() {
		defer conn.Close()

		buf := make([]byte, 1048)

		for {
			n, _, err := conn.ReadFromUDP(buf)
			if err != nil {
				fmt.Println("read error: ", err)
				continue
			}
			raw := make([]byte, n)
			copy(raw, buf[:n])

			out <- RawPacket{
				Data:  raw,
				CarID: port,
			}
		}
	}()

	return nil
}
