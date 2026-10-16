# Frame — Video Compressor

Static, client-side video compressor that can be hosted on GitHub Pages. Video files are processed locally in the browser with FFmpeg.wasm and are not uploaded to a server.

## Run locally

On Windows, double-click `เปิดเว็บในเครื่อง.bat`. It starts a local web server and opens the page in your browser. Keep the command window open while using the compressor. ES modules and WebAssembly do not work reliably when you open `index.html` directly as a `file://` URL.

Alternatively, from this directory run `python -m http.server 8000`, then open `http://localhost:8000`.

## Publish on GitHub Pages

1. Put the contents of this folder in a GitHub repository (or its `/docs` folder).
2. In the repository, open **Settings → Pages**.
3. Select the branch and folder containing `index.html`, then save.

No deployment script or automatic repository updates are included. GitHub Pages serves the static files after you choose to publish them.

## Notes and limits

- Uses FFmpeg.wasm from unpkg CDN. The browser downloads the encoder on first use; an internet connection is required.
- H.264/AAC MP4 output uses a quality/size tradeoff. Compression cannot guarantee identical visual quality; check the downloaded result.
- FFmpeg.wasm stores working data in browser memory. Input and output can each occupy substantial memory, so very large files may run out of RAM or exceed browser/WebAssembly limits. A desktop browser with plenty of free RAM is recommended. There is no fixed file-size promise because the limit depends on the device and browser.
- Most modern desktop browsers are recommended. Some source codecs/containers may not decode; MP4/H.264 input is the most compatible choice.
- GitHub Pages must be served over HTTPS for secure browser APIs; Pages sites do this by default.
