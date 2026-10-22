# Included by the Makefile: the pieces that differ between laptops and CI.
ifeq ($(CI),true)
	CARGO_FLAGS := --locked --quiet
else
	CARGO_FLAGS :=
endif
