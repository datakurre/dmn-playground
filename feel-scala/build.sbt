scalaVersion := "2.13.16"

enablePlugins(ScalaJSPlugin)

name := "feel-engine"

// Scala.js compatible dependencies only (%%% = cross-compiled for Scala.js)
libraryDependencies += "org.scala-js" %%% "scalajs-dom" % "2.8.0"
libraryDependencies += "com.lihaoyi" %%% "fastparse" % "3.1.1"
libraryDependencies += "io.github.cquiroz" %%% "scala-java-time" % "2.5.0"

// Produce an ES module for easy integration with Vite/browser bundlers
// ES2018 is needed for lookbehind regex in the FEEL parser
scalaJSLinkerConfig ~= {
  _.withModuleKind(ModuleKind.ESModule)
   .withESFeatures(_.withESVersion(org.scalajs.linker.interface.ESVersion.ES2018))
}
