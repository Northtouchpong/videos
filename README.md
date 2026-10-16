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
- The input file is mounted with FFmpeg.wasm's WORKERFS support, so the app can read it without first copying the entire source into WebAssembly memory. This helps with large inputs, but does not make file sizes unlimited: the encoded output is still held in memory, and FFmpeg needs additional working memory while encoding. WebAssembly's 32-bit memory has a theoretical ceiling around 4 GiB, while practical browser/device limits can be lower. There is no fixed file-size promise; the actual limit depends on the device, browser, video dimensions, duration, codec, and available RAM. A desktop browser with plenty of free RAM is recommended.
- The **Keep original audio** checkbox is enabled by default. Turn it off to omit the audio stream and reduce output size.
- You can select or drop any number of videos into the queue. Up to three videos are compressed at the same time; remaining files wait in the queue. Each video has individual progress and a download link. Browser memory and device performance still limit practical use; download results and clear the list periodically for large batches.
- Most modern desktop browsers are recommended. Some source codecs/containers may not decode; MP4/H.264 input is the most compatible choice.
- GitHub Pages must be served over HTTPS for secure browser APIs; Pages sites do this by default.
