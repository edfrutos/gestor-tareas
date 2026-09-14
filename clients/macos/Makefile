# Gestor de Tareas — cliente macOS. Requiere: Xcode 15+, xcodegen (brew install xcodegen).

PROJECT      = GestorTareas.xcodeproj
SCHEME_DEBUG = GestorTareas (Debug)
SCHEME_MAS   = GestorTareas (Mac App Store)
SCHEME_DEVID = GestorTareas (Developer ID)
BUILD_DIR    = build
DESTINATION  = platform=macOS,arch=arm64

.PHONY: help generate open build test archive-mas archive-devid export-mas notarize clean

help:
	@echo "generate       Genera $(PROJECT) desde project.yml"
	@echo "open           Genera y abre el proyecto en Xcode"
	@echo "build          Compila la app (Debug)"
	@echo "test           Ejecuta los tests unitarios (Debug)"
	@echo "archive-mas    Crea el .xcarchive para Mac App Store"
	@echo "archive-devid  Crea el .xcarchive para Developer ID"
	@echo "export-mas     Exporta el .pkg firmado desde el archive MAS (ver scripts/export_mas.sh)"
	@echo "notarize       Firma + notariza + staple el build Developer ID (ver scripts/notarize.sh)"
	@echo "clean          Borra $(BUILD_DIR), $(PROJECT) y DerivedData"

generate:
	xcodegen generate

open: generate
	open $(PROJECT)

build: generate
	xcodebuild -project "$(PROJECT)" -scheme "$(SCHEME_DEBUG)" -configuration Debug \
	  -destination "$(DESTINATION)" build

test: generate
	xcodebuild -project "$(PROJECT)" -scheme "$(SCHEME_DEBUG)" -configuration Debug \
	  -destination "$(DESTINATION)" test

archive-mas: generate
	xcodebuild -project "$(PROJECT)" -scheme "$(SCHEME_MAS)" -configuration Release-MAS \
	  -archivePath "$(BUILD_DIR)/GestorTareas-MAS.xcarchive" archive

archive-devid: generate
	xcodebuild -project "$(PROJECT)" -scheme "$(SCHEME_DEVID)" -configuration Release-DevID \
	  -archivePath "$(BUILD_DIR)/GestorTareas-DevID.xcarchive" archive

export-mas:
	./scripts/export_mas.sh

notarize:
	./scripts/notarize.sh

clean:
	rm -rf "$(BUILD_DIR)" "$(PROJECT)" DerivedData
