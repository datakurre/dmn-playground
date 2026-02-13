# feel-scala Scala.js build
#
# Downloads the feel-scala source release, applies Scala.js compatibility
# patches, and compiles to a JavaScript ES module bundle.
#
# The output is placed at ../src/engine/feel/feel-scala-bundle.js
#
# Requirements: Java 21+, sbt (provided by devenv)

FEEL_SCALA_VERSION := 1.19.3
FEEL_SCALA_REPO    := https://github.com/camunda/feel-scala
FEEL_SCALA_TARBALL := https://github.com/camunda/feel-scala/archive/refs/tags/$(FEEL_SCALA_VERSION).tar.gz

SOURCE_DIR  := source
STAMP_DIR   := .stamps
BUNDLE_OUT  := ../src/engine/feel/feel-scala-bundle.js

# The sbt fastOptJS output path (Scala.js convention)
SBT_OUTPUT  := $(SOURCE_DIR)/target/scala-2.13/feel-engine-fastopt/main.js

.PHONY: all clean distclean

all: $(BUNDLE_OUT)

# ── Download & extract source ────────────────────────────────────

$(STAMP_DIR)/downloaded:
	@mkdir -p $(STAMP_DIR) $(SOURCE_DIR)
	@echo "⬇  Downloading feel-scala $(FEEL_SCALA_VERSION)..."
	curl -fsSL "$(FEEL_SCALA_TARBALL)" | tar xz --strip-components=1 -C $(SOURCE_DIR)
	@touch $@

# ── Apply patches ────────────────────────────────────────────────

$(STAMP_DIR)/patched: $(STAMP_DIR)/downloaded
	@echo "🩹  Applying Scala.js compatibility patches..."
	cd $(SOURCE_DIR) && git init -q && git -c user.name=build -c user.email=build@local add -A && git -c user.name=build -c user.email=build@local commit -q -m "upstream $(FEEL_SCALA_VERSION)"
	cd $(SOURCE_DIR) && git apply ../scalajs.patch
	@# Replace upstream build files with our Scala.js build config
	cp build.sbt $(SOURCE_DIR)/build.sbt
	cp project/build.properties $(SOURCE_DIR)/project/build.properties
	cp project/plugins.sbt $(SOURCE_DIR)/project/plugins.sbt
	@touch $@

# ── Compile with sbt ─────────────────────────────────────────────

$(SBT_OUTPUT): $(STAMP_DIR)/patched
	@echo "🔨  Compiling feel-scala to Scala.js (this may take a few minutes)..."
	cd $(SOURCE_DIR) && sbt fastOptJS
	@test -f $(SBT_OUTPUT) || (echo "❌  Build failed: $(SBT_OUTPUT) not found" && exit 1)

# ── Copy bundle to engine ────────────────────────────────────────

$(BUNDLE_OUT): $(SBT_OUTPUT)
	@echo "📦  Copying bundle to $(BUNDLE_OUT)..."
	cp $(SBT_OUTPUT) $(BUNDLE_OUT)
	@# Copy source map if available (suppresses Vite warnings)
	@test -f $(SBT_OUTPUT).map && cp $(SBT_OUTPUT).map $(dir $(BUNDLE_OUT))main.js.map || true
	@echo "✅  feel-scala bundle ready ($(shell wc -c < $(SBT_OUTPUT)) bytes)"

# ── Cleanup ──────────────────────────────────────────────────────

clean:
	rm -rf $(SOURCE_DIR)/target

distclean:
	rm -rf $(SOURCE_DIR) $(STAMP_DIR)
