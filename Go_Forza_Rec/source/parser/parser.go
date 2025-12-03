package parser

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"forza/models"
	"math"
	"time"
)

type recievedcarstate struct {
	IsRaceOn         int32
	TimestampMS      uint32
	EngineMaxRPM     float32
	EngineIdleRPM    float32
	CurrentEngineRPM float32
	AccelX           float32
	AccelY           float32
	AccelZ           float32
	VelX             float32
	VelY             float32
	VelZ             float32
}

func RawtoCarstate(data []byte) (models.Carstate, error) {
	if len(data) < 320 {
		return models.Carstate{}, fmt.Errorf("packet too small")
	}

	var pkt recievedcarstate

	err := binary.Read(bytes.NewReader(data[:44]), binary.LittleEndian, &pkt)
	if err != nil {
		return models.Carstate{}, err
	}

	gear := data[319]

	speedMps := math.Sqrt(float64(
		pkt.VelX*pkt.VelX +
			pkt.VelY*pkt.VelY +
			pkt.VelZ*pkt.VelZ,
	))

	return models.Carstate{
		Timestamp:     time.Now().Format(time.RFC3339Nano),
		IsRaceOn:      pkt.IsRaceOn != 0,
		TimestampMS:   pkt.TimestampMS,
		SpeedMPS:      speedMps,
		SpeedKPH:      speedMps * 3.6,
		SpeedMPH:      speedMps * 2.23694,
		Gear:          int(gear),
		EngineMaxRPM:  float64(pkt.EngineMaxRPM),
		EngineIdleRPM: float64(pkt.EngineIdleRPM),
		EngineRPM:     float64(pkt.CurrentEngineRPM),
		AccelX:        float64(pkt.AccelX),
		AccelY:        float64(pkt.AccelY),
		AccelZ:        float64(pkt.AccelZ),
		VelX:          float64(pkt.VelX),
		VelY:          float64(pkt.VelY),
		VelZ:          float64(pkt.VelZ),
	}, nil
}
