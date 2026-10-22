package main

import (
	"flag"
	"fmt"
	"os"
)

const (
	DefaultPort = 8090
	MaxBytes    = 50 << 20
)

type (
	ID    string
	Bytes int64
)

type Handler interface {
	Serve(path string) error
	Close() error
}

type Server struct {
	Port    int
	handler Handler
}

func (s *Server) Start() error {
	return s.handler.Serve(fmt.Sprintf(":%d", s.Port))
}

func (s Server) Describe() string {
	return fmt.Sprintf("uploader on %d", s.Port)
}

func Map[T, U any](xs []T, f func(T) U) []U {
	out := make([]U, 0, len(xs))
	for _, x := range xs {
		out = append(out, f(x))
	}
	return out
}

const usage = `uploader: send a GPX file to Kestrel
  usage: uploader [-port N] file.gpx
`

func main() {
	port := flag.Int("port", DefaultPort, "port")
	flag.Parse()
	if flag.NArg() == 0 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	s := &Server{Port: *port}
	fmt.Println(s.Describe())
}
