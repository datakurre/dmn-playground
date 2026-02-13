{ pkgs, ... }:
let
  shell =
    { pkgs, ... }:
    {
      packages = [
        pkgs.gnumake
        pkgs.nixfmt-rfc-style
        pkgs.prettier
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

      languages.javascript.enable = true;
      languages.javascript.npm.enable = true;
    };
in
{
  dotenv.enable = true;

  languages.javascript.enable = true;
  languages.javascript.npm.enable = true;

  profiles.shell.module = {
    imports = [ shell ];
  };

  profiles.devcontainer.module = {
    imports = [ devcontainer ];
  };
}
