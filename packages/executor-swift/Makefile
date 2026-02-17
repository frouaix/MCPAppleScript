.PHONY: build test clean install

BINARY_NAME=applescript-executor
BUILD_DIR=.build/release
INSTALL_PATH=/usr/local/bin

build:
	@echo "Building $(BINARY_NAME)..."
	@swift build -c release
	@echo "✓ Build complete: $(BUILD_DIR)/$(BINARY_NAME)"

test:
	@swift test

clean:
	@echo "Cleaning build artifacts..."
	@swift package clean
	@echo "✓ Clean complete"

install: build
	@echo "Installing $(BINARY_NAME) to $(INSTALL_PATH)..."
	@cp $(BUILD_DIR)/$(BINARY_NAME) $(INSTALL_PATH)/
	@chmod +x $(INSTALL_PATH)/$(BINARY_NAME)
	@echo "✓ Installed to $(INSTALL_PATH)/$(BINARY_NAME)"

uninstall:
	@echo "Uninstalling $(BINARY_NAME)..."
	@rm -f $(INSTALL_PATH)/$(BINARY_NAME)
	@echo "✓ Uninstalled"
