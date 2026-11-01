# UploadThing file size limits

Iteration 13's UploadThing router is configured for one file per upload:
- **Images:** up to 4 MB
- **Videos:** up to 16 MB
- **PDFs:** up to 4 MB

These are this repository's configured endpoint limits, not a guarantee about the connected UploadThing account's plan, environment configuration, or network throughput. The admin media picker validates image/video type and size before upload and reports progress when UploadThing provides progress events. Uploading requires a working internet connection; selecting or capturing a file offline does not upload or publish it.

If an upload stalls or is rejected despite meeting these configured limits, check the deployment's UploadThing credentials, endpoint logs, network connection, and current provider plan/settings. Do not increase the limits without confirming the provider accepts them.
