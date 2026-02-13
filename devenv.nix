{ pkgs, ... }:
let
  shell =
    { pkgs, ... }:
    {
      dotenv.enable = false;
      dotenv.disableHint = true;

      languages.java.enable = true;
      languages.java.maven.enable = true;

      languages.javascript.enable = true;
      languages.javascript.npm.enable = true;

      packages = [
        pkgs.gnumake
        pkgs.nixfmt
        pkgs.sbt-with-scala-native
        pkgs.treefmt
      ];

      enterTest = ''
        npm test
      '';
    };

  devcontainer =
    { ... }:
    {
      devcontainer.enable = true;
    };
in
{
  profiles.shell.module = {
    imports = [ shell ];
  };

  profiles.devcontainer.module = {
    imports = [ devcontainer ];
  };
}