package main

import (
	"fmt"
	"forza/models"
	"forza/parser"
	"forza/recorder"
)

func main() {

	fmt.Println("Starting multi-car recorder")

	// Shared packet channel
	packetStream := make(chan recorder.RawPacket, 1000)

	// Launch recorders on ports 5030–5040
	ports := []string{"5030", "5031", "5032", "5033", "5034", "5035", "5036", "5037", "5038", "5039", "5040"}

	for _, port := range ports {
		err := recorder.Listen(port, packetStream)
		if err != nil {
			panic(err)
		}
	}

	// Car registry: port → car object
	cars := make(map[string]*models.Car)

	for pkt := range packetStream {

		// 1. If car doesn't exist yet, create one
		if _, exists := cars[pkt.CarID]; !exists {
			cars[pkt.CarID] = &models.Car{
				Name:   fmt.Sprintf("Car-%s", pkt.CarID),
				States: []models.Carstate{},
			}
			fmt.Println("Detected new car on port:", pkt.CarID)
		}

		car := cars[pkt.CarID]

		// 2. Parse packet
		state, err := parser.RawtoCarstate(pkt.Data)
		if err != nil {
			fmt.Println("Parse error:", err)
			continue
		}

		car.AddState(state)

		fmt.Printf("[%s] Speed: %.1f MPH | Gear %d\n",
			car.Name, state.SpeedMPH, state.Gear)

		// 3. Race end detection
		if allCarsFinished(cars) {
			fmt.Println("All cars finished the race!")
			break
		}
	}

	fmt.Println("Total cars:", len(cars))
	for id, c := range cars {
		fmt.Printf("-- %s has %d states\n", id, len(c.States))
	}

	fmt.Println("Exporting CSV files...")
	for id, car := range cars {
		err := car.ExportCSV()
		if err != nil {
			fmt.Printf("Failed to write CSV for %s: %v\n", id, err)
		}
	}

}

func allCarsFinished(cars map[string]*models.Car) bool {
	if len(cars) == 0 {
		return false
	}

	for _, c := range cars {
		if len(c.States) == 0 {
			return false
		}
		last := c.States[len(c.States)-1]
		if last.IsRaceOn {
			return false
		}
	}
	return true
}
