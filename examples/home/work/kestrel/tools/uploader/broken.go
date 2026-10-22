package main

import "fmt"

func parse(path string) (int, error) {
	if path == "" {
		return 0, fmt.Errorf("empty path")

	return len(path), nil
}
