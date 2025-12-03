package models

import (
	"encoding/csv"
	"fmt"
	"os"
	"strconv"
)

type Car struct {
	Name   string
	States []Carstate
}

func (c *Car) AddState(s Carstate) {
	c.States = append(c.States, s)
}

type Carstate struct {
	Timestamp     string
	IsRaceOn      bool
	TimestampMS   uint32
	SpeedMPS      float64
	SpeedKPH      float64
	SpeedMPH      float64
	Gear          int
	EngineMaxRPM  float64
	EngineIdleRPM float64
	EngineRPM     float64
	AccelX        float64
	AccelY        float64
	AccelZ        float64
	VelX          float64
	VelY          float64
	VelZ          float64
}

// ExportCSV writes a car's telemetry to a CSV file named <CarName>.csv
func (c *Car) ExportCSV() error {
	filename := fmt.Sprintf("%s.csv", c.Name)

	f, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	defer w.Flush()

	// Header row
	header := []string{
		"timestamp",
		"isRaceOn",
		"timestampMS",
		"speed_mps",
		"speed_kph",
		"speed_mph",
		"gear",
		"engine_rpm",
		"engine_max_rpm",
		"engine_idle_rpm",
		"accel_x",
		"accel_y",
		"accel_z",
		"vel_x",
		"vel_y",
		"vel_z",
	}
	if err := w.Write(header); err != nil {
		return err
	}

	// Data rows
	for _, s := range c.States {
		record := []string{
			s.Timestamp,
			boolToStr(s.IsRaceOn),
			u32(s.TimestampMS),
			f64(s.SpeedMPS),
			f64(s.SpeedKPH),
			f64(s.SpeedMPH),
			i(s.Gear),
			f64(s.EngineRPM),
			f64(s.EngineMaxRPM),
			f64(s.EngineIdleRPM),
			f64(s.AccelX),
			f64(s.AccelY),
			f64(s.AccelZ),
			f64(s.VelX),
			f64(s.VelY),
			f64(s.VelZ),
		}

		if err := w.Write(record); err != nil {
			return err
		}
	}

	fmt.Println("Wrote CSV:", filename)
	return nil
}

// Helpers
func f64(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
func u32(v uint32) string  { return strconv.FormatUint(uint64(v), 10) }
func i(v int) string       { return strconv.Itoa(v) }
func boolToStr(v bool) string {
	if v {
		return "true"
	}
	return "false"
}
