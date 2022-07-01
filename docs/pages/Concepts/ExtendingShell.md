# Extending webda executable

You can extend and add your own command to webda executable

For this just define a `webda.shell.json` in your package

## Change shell logo

You can add to your `package.json` this section:

```
"webda": {
    "logo": "../../logo.txt"
}
```

To generate the logo, here is the command:

You can use this (software)[https://golangexample.com/a-cross-platform-command-line-tool-to-convert-images-into-ascii-art-and-print-them-on-the-console/]

```
ascii-image-convert mylogo.png -C > logo.txt
```
