# 🎓 Middleware Selection - Makefile

.PHONY: help install start dev test test-all docker-up docker-down clean

help:
	@echo "Available commands:"
	@echo "  make install     - Install dependencies"
	@echo "  make start       - Start server in production mode"
	@echo "  make dev         - Start server with nodemon (dev mode)"
	@echo "  make test        - Run unit tests"
	@echo "  make test-all    - Run all tests (unit + e2e + simulation)"
	@echo "  make docker-up   - Start application using Docker Compose"
	@echo "  make docker-down - Stop and remove Docker containers"
	@echo "  make clean       - Remove logs and lock files"

install:
	npm install

start:
	npm start

dev:
	npm run dev

test:
	npm test

test-all:
	npm run test:all

docker-up:
	docker-compose up --build -d

docker-down:
	docker-compose down

clean:
	rm -rf logs/*.log
	rm -f package-lock.json
